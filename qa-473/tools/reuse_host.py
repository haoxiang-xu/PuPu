from pathlib import Path
import sys,json,hashlib
root,binary,proof,out=map(Path,sys.argv[1:]);p=json.loads(proof.read_text());assert hashlib.sha256(binary.read_bytes()).hexdigest()==p['sidecar_sha256']
actual={}
for name,expected in p['entries'].items():
 data=(root/name).read_bytes();oid=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest();assert oid==expected,name;actual[name]=hashlib.sha256(data).hexdigest()
out.write_text(json.dumps({'sidecar_sha256':p['sidecar_sha256'],'production_python_modules':len(actual),'sha256':actual},indent=2))
