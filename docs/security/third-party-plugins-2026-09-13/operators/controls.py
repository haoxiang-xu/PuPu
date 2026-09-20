import json,pathlib,os,tempfile,socket,subprocess
s=json.load(open('/tmp/pupu-third-party-state.json'));w=pathlib.Path(s['work']);out=pathlib.Path(s['out']);env=json.loads((w/'environment.json').read_text());fd,denied=tempfile.mkstemp(prefix='.pupu-thirdparty-synthetic-',dir='/Users/red');os.write(fd,b'SYNTHETIC_ONLY');os.close(fd);tcp=socket.socket();tcp.bind(('127.0.0.1',0));tcp.listen();unix=socket.socket(socket.AF_UNIX);up=w/'sandbox/control.sock';unix.bind(str(up));unix.listen();env.update({'DENIED':denied,'WORK':str(w),'TCP_PORT':str(tcp.getsockname()[1]),'UNIX_SOCKET':str(up)})
code='''import os,pathlib,socket,json
w=pathlib.Path(os.environ['WORK']);r=[]
p=w/'sandbox/positive';p.write_text('synthetic');r.append({'id':'FS-POSITIVE','pass':p.read_text()=='synthetic'})
for id,path,mode in [('HOME-DENY',pathlib.Path(os.environ['DENIED']),'read'),('WRITE-DENY',w/'outside-write','write')]:
 try:
  path.read_text() if mode=='read' else path.write_text('synthetic');r.append({'id':id,'pass':False})
 except OSError as e:r.append({'id':id,'pass':e.errno==1,'errno':e.errno})
for id,af,addr in [('TCP-DENY',socket.AF_INET,('127.0.0.1',int(os.environ['TCP_PORT']))),('SOCKET-DENY',socket.AF_UNIX,os.environ['UNIX_SOCKET'])]:
 t=socket.socket(af);t.settimeout(1)
 try:t.connect(addr);r.append({'id':id,'pass':False})
 except OSError as e:r.append({'id':id,'pass':e.errno==1,'errno':e.errno})
 finally:t.close()
print(json.dumps(r))
assert all(c['pass'] for c in r)
'''
try:
 r=subprocess.run(['/usr/bin/sandbox-exec','-f',str(w/'sandbox.sb'),str(w/'scanner-venv/bin/python'),'-c',code],env=env,cwd=w/'sandbox',capture_output=True,text=True,timeout=10);(out/'sandbox-controls.json').write_text(r.stdout or '{}');print(r.returncode,r.stdout,r.stderr);assert r.returncode==0
finally:os.unlink(denied);tcp.close();unix.close();up.unlink()
