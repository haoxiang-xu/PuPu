const cp = require('child_process');
const fs = require('fs');
const originalSpawnSync = cp.spawnSync;
cp.spawnSync = function (...args) {
  const start = Date.now();
  const result = originalSpawnSync.apply(this, args);
  if (Array.isArray(args[1]) && args[1].some(arg => /react-scripts[/\\]scripts[/\\]build\.js$/.test(String(arg)))) {
    const record = {cwd:process.cwd(),command:args[0],args:args[1],status:result.status,signal:result.signal,error:result.error ? String(result.error) : null,pid:result.pid,duration_ms:Date.now()-start,node_options:process.env.NODE_OPTIONS||'',generate_sourcemap:process.env.GENERATE_SOURCEMAP||null};
    fs.appendFileSync(process.env.PUPU_ACCEPTANCE_CHILD_LOG || '/tmp/pupu-383-final-build-child.jsonl',JSON.stringify(record)+'\n');
    process.stderr.write('[acceptance child exit] '+JSON.stringify(record)+'\n');
  }
  return result;
};
