import socket,json,sys,urllib.request
from pathlib import Path
out=Path(sys.argv[1]);token=sys.argv[2]
assert socket.gethostbyname('api.openai.com')=='127.0.0.1'
with urllib.request.urlopen('http://127.0.0.1:18990/'+token,timeout=2) as reply:assert reply.read().decode()==token
controls=[]
for host,port in [('127.0.0.1',11434),('127.0.0.1',18992),('203.0.113.9',443),('::1',11434)]:
 try:
  with socket.create_connection((host,port),timeout=.7):raise AssertionError('unapproved connection succeeded')
 except OSError as error:controls.append({'host':host,'port':port,'refused':True,'errno':error.errno,'type':type(error).__name__})
(out/'isolation-probe.json').write_text(json.dumps({'positive_nonce':True,'controls':controls},indent=2)+'\n')
print('ISOLATION_CONTROLS_ACCEPTED')
