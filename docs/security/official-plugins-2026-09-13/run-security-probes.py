from pathlib import Path
import os,json,subprocess,socket,tempfile,shutil
st=json.loads(Path('/tmp/pupu-official-verify-state.json').read_text());w=Path(st['work']);out=Path(st['out']);env=json.loads((w/'environment.json').read_text())
fd,denied=tempfile.mkstemp(prefix='.pupu-verifier-canary-',dir='/Users/red');os.write(fd,b'SYNTHETIC_DENIED_CONTROL');os.close(fd)
tcp=socket.socket();tcp.bind(('127.0.0.1',0));tcp.listen();unix=socket.socket(socket.AF_UNIX);unixpath=w/'sandbox/control.sock';unix.bind(str(unixpath));unix.listen()
env.update({'VERIFY_DENIED_FILE':denied,'VERIFY_PORT':str(tcp.getsockname()[1]),'VERIFY_SOCKET':str(unixpath)})
shutil.copy2('/tmp/pupu-security-probes.py',w/'security-probes.py');shutil.copy2('/tmp/pupu-security-probes.py',out/'security-probes.py');(out/'sandbox-profile.sb').write_text((w/'sandbox.sb').read_text())
try:
 r=subprocess.run(['/usr/bin/sandbox-exec','-f',str(w/'sandbox.sb'),'/Users/red/Desktop/GITRepo/unchain/.venv/bin/python',str(w/'security-probes.py')],env=env,cwd=w/'sandbox',capture_output=True,text=True,timeout=45)
 (out/'security-probes-output.json').write_text(r.stdout or '{}');(out/'security-probes-stderr.txt').write_text(r.stderr)
 print('Exit',r.returncode)
 if r.returncode==0:
  result=json.loads(r.stdout);print('\n'.join(c['id']+': '+c['status'] for c in result['checks']))
 else:print(r.stderr[-4000:],r.stdout[-1200:])
finally:
 os.unlink(denied);tcp.close();unix.close();unixpath.unlink()
