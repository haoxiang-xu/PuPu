import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const runner = fileURLToPath(new URL('./run-python-tests.py', import.meta.url));
const python = process.env.PYTHON || 'python3';

async function descendantAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); }
  catch (error) { if (error.code === 'ESRCH') return false; return true; }
  if (process.platform === 'linux') {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
      return !stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z ');
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ESRCH') return false;
      return true;
    }
  }
  return true;
}

// Exercise real pytest and its hooks in isolated directories, never a pytest stub.
async function fixture(source, options = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'pupu-python-diagnostics-'));
  let child;
  const killFamily = () => {
    if (!child?.pid) return;
    try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  try {
    await writeFile(path.join(cwd, 'test_fixture.py'), source);
    await writeFile(path.join(cwd, 'local_fixture_dependency.py'), 'VALUE = 356\n');
    const args = [runner, 'test_fixture.py', '-vv', '--tb=short',
      '--junitxml=result.xml', '-o', `faulthandler_timeout=${options.interval ?? 60}`];
    const started = performance.now();
    child = spawn(python, args, {
      cwd, detached: process.platform !== 'win32',
      env: { ...process.env, PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1', TMPDIR: cwd, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        killFamily();
        reject(new Error(`Runner exceeded fixture budget; output:\n${output}`));
      }, options.budget ?? 15000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, output, elapsed: performance.now() - started });
      });
    });
    result.xml = await readFile(path.join(cwd, 'result.xml'), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    result.descendantPid = await readFile(path.join(cwd, 'descendant.pid'), 'utf8').then(Number).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    result.descendantAliveAtRunnerExit = await descendantAlive(result.descendantPid);
    return result;
  } finally {
    killFamily();
    const descendantPid = await readFile(path.join(cwd, 'descendant.pid'), 'utf8').then(Number).catch(() => null);
    if (Number.isInteger(descendantPid) && descendantPid > 0 && process.platform !== 'win32') {
      try { process.kill(descendantPid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await rm(cwd, { recursive: true, force: true });
  }
}

function event(output, name) {
  return output.split('\n').some((line) => {
    const start = line.indexOf('{');
    if (start < 0) return false;
    try { return JSON.parse(line.slice(start)).event === name; } catch { return false; }
  });
}

// Keep these sequential: exactly one case waits for the real production 60 s threshold.
test('Python diagnostic runner black-box contract', { timeout: 110000 }, async (t) => {
  await t.test('short success retains cwd imports, fatal handlers and JUnit without a dump', async () => {
    const result = await fixture(`import faulthandler\nfrom local_fixture_dependency import VALUE\ndef test_short():\n    assert VALUE == 356\n    assert faulthandler.is_enabled()\n`);
    assert.equal(result.code, 0, result.output);
    assert.match(result.xml, /tests="1"/);
    assert.match(result.xml, /failures="0"/);
    assert.equal(event(result.output, 'dump_start'), false, result.output);
    assert.equal(event(result.output, 'dump_complete'), false, result.output);
    assert.match(result.output, /gil_safe/);
  });

  await t.test('assertion failure retains real pytest exit and failed JUnit testcase', async () => {
    const result = await fixture('def test_failure():\n    assert 1 == 2\n');
    assert.equal(result.code, 1, result.output);
    assert.match(result.xml, /failures="1"/);
    assert.match(result.xml, /<failure\b/);
    assert.match(result.output, /1 failed/);
  });

  await t.test('real 60 second diagnostic completes and the slow test still passes', async () => {
    const result = await fixture(`import time\nimport faulthandler\ndef test_slow():\n    assert faulthandler.is_enabled()\n    time.sleep(61.5)\n    assert faulthandler.is_enabled()\n`, { budget: 75000 });
    assert.equal(result.code, 0, result.output);
    assert.ok(result.elapsed >= 60000, `actual elapsed ${result.elapsed}`);
    assert.ok(event(result.output, 'dump_start'), result.output);
    assert.ok(event(result.output, 'dump_complete'), result.output);
    assert.ok(result.output.indexOf('dump_start') < result.output.indexOf('dump_complete'), result.output);
    assert.match(result.output, /test_fixture\.py/);
    assert.match(result.xml, /failures="0"/);
  });

  await t.test('cancel and rearm leave only the current test diagnostic', async () => {
    const result = await fixture(`import time\nimport faulthandler\ndef test_a_cancel():\n    time.sleep(0.01)\ndef test_b_rearm():\n    time.sleep(0.4)\n`, { interval: 0.2 });
    assert.equal(result.code, 0, result.output);
    assert.equal(result.output.split('\n').filter((line) => event(line, 'dump_start')).length, 1, result.output);
    assert.equal(result.output.split('\n').filter((line) => event(line, 'dump_complete')).length, 1, result.output);
    assert.doesNotMatch(result.output, /Bad file descriptor|closed file|Exception in thread/);
    assert.match(result.xml, /tests="2"/);
  });

  await t.test('GIL-held native sleep produces an external witness and bounded failure', async () => {
    const result = await fixture(`import ctypes\ndef test_gil_blocked():\n    libc = ctypes.PyDLL(None)\n    libc.sleep.argtypes = [ctypes.c_uint]\n    libc.sleep.restype = ctypes.c_uint\n    libc.sleep(5)\n`, {
      interval: 0.1, budget: 10000,
      env: { PUPU_PYTEST_SELFTEST: '1', PUPU_PYTEST_SELFTEST_TIMEOUT_SECONDS: '1' },
    });
    assert.notEqual(result.code, 0, result.output);
    assert.ok(result.elapsed < 5000, `hard deadline did not interrupt native sleep: ${result.elapsed}`);
    assert.ok(event(result.output, 'deadline_witness'), result.output);
    assert.equal(event(result.output, 'dump_complete'), false, result.output);
  });

  await t.test('actual SIGTERM is forwarded as a failing signal exit', async () => {
    const result = await fixture('import os, signal\ndef test_signal():\n    os.kill(os.getpid(), signal.SIGTERM)\n');
    assert.equal(result.code, 143, result.output);
  });

  if (process.platform !== 'win32') {
    await t.test('worker group drains a TERM-ignoring descendant after pytest exits', async () => {
      const source = `import os, pathlib, signal, subprocess, sys, time
def test_spawn_owned_descendant():
    ready = pathlib.Path('descendant.ready')
    code = "import os,signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); open('descendant.ready','w').write(str(os.getpid())); time.sleep(300)"
    child = subprocess.Popen([sys.executable, '-c', code], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    limit = time.monotonic() + 5
    while not ready.exists() and time.monotonic() < limit:
        time.sleep(0.01)
    assert ready.exists()
    pathlib.Path('descendant.pid').write_text(str(child.pid))
`;
      const result = await fixture(source, { budget: 10000 });
      const pid = Number(result.descendantPid);
      try {
        assert.equal(result.code, 0, result.output);
        assert.ok(Number.isInteger(pid) && pid > 0, result.output);
        assert.equal(result.descendantAliveAtRunnerExit, false, `owned descendant ${pid} was live when runner exited`);
        const deadline = Date.now() + 3000;
        let running = true;
        while (running && Date.now() < deadline) {
          try {
            process.kill(pid, 0);
            if (process.platform === 'linux') {
              const stat = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '');
              if (!stat || stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z ')) running = false;
            }
          } catch (error) { if (error.code === 'ESRCH') running = false; else throw error; }
          if (running) await new Promise((resolve) => setTimeout(resolve, 25));
        }
        assert.equal(running, false, `owned descendant ${pid} survived runner cleanup`);
      } finally {
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        }
      }
    });
  }

  await t.test('parent SIGINT forwards cancellation and drains an ignoring descendant', async () => {
    const result = await fixture(`import os, pathlib, signal, subprocess, sys, time
def test_parent_interrupt():
    child = subprocess.Popen([sys.executable, '-c', "import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); open('descendant.ready','w').close(); time.sleep(300)"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pathlib.Path('descendant.pid').write_text(str(child.pid))
    deadline = time.monotonic() + 5
    while not pathlib.Path('descendant.ready').exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    assert pathlib.Path('descendant.ready').exists()
    os.kill(os.getppid(), signal.SIGINT)
    time.sleep(10)
`, { budget: 10000 });
    assert.equal(result.code, 130, result.output);
    assert.ok(event(result.output, 'parent-signal-forward'), result.output);
    assert.equal(result.descendantAliveAtRunnerExit, false, 'descendant was live when interrupted runner exited');
  });

  await t.test('numeric exit 139 is retained without generating a macOS crash report', async () => {
    const result = await fixture('import os\ndef test_exit():\n    os._exit(139)\n');
    assert.equal(result.code, 139, result.output);
  });

  // Only Linux CI exercises the native fatal handler; macOS must not launch CrashReporter.
  if (process.platform === 'linux') {
    await t.test('Linux actual SIGSEGV retains fatal handler and signal exit 139', async () => {
      const result = await fixture('import os, signal, resource\ndef test_fatal():\n    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))\n    os.kill(os.getpid(), signal.SIGSEGV)\n');
      assert.equal(result.code, 139, result.output);
      assert.match(result.output, /Fatal Python error: Segmentation fault/);
    });
  }
});
