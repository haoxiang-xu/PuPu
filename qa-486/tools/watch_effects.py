"""Linux close-write witness; reads only the explicitly authorized QA workspace."""
import ctypes,json,os,select,signal,struct,sys,time
from pathlib import Path
root=Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
out=Path(sys.argv[2]);rows=[];alive=True
lib=ctypes.CDLL(None,use_errno=True);fd=lib.inotify_init1(os.O_NONBLOCK)
assert fd>=0
assert lib.inotify_add_watch(fd,os.fsencode(root),0x8)>=0
out.with_suffix('.ready').write_text(str(os.getpid()))
def stop(*_):
    global alive
    alive=False
signal.signal(signal.SIGTERM,stop)
while alive:
    if not select.select([fd],[],[],.1)[0]:continue
    raw=os.read(fd,65536);offset=0
    while offset<len(raw):
        wd,mask,cookie,n=struct.unpack_from('iIII',raw,offset);offset+=16
        name=raw[offset:offset+n].split(b'\0')[0].decode();offset+=n
        rows.append({'at_ns':time.monotonic_ns(),'mask':mask,'name':name})
        out.write_text(json.dumps(rows,indent=2)+'\n')
out.write_text(json.dumps(rows,indent=2)+'\n');os.close(fd)
