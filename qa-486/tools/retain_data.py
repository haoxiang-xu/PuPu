"""Retain only canonical QA databases/CAS, excluding profile vaults and keyrings."""
from pathlib import Path
import shutil,os,json
out=Path(os.environ['QA_OUT']);home=out/'home';target=out/'retained-data';target.mkdir(exist_ok=True);rows=[]
for name in ['context_v2.sqlite3','builder_tests.sqlite3']:
    for i,p in enumerate(home.rglob(name)):
        dest=target/(name+'-'+str(i));dest.mkdir(exist_ok=True)
        for suffix in ['', '-wal', '-shm']:
            f=p.with_name(p.name+suffix)
            if f.is_file():shutil.copy2(f,dest/f.name)
        objects=p.parent/'objects'
        if name=='context_v2.sqlite3' and objects.exists():shutil.copytree(objects,dest/'objects',symlinks=True,dirs_exist_ok=True)
        rows.append({'source':str(p.relative_to(home)),'copy':str(dest.relative_to(out))})
(target/'index.json').write_text(json.dumps(rows,indent=2)+'\n')
