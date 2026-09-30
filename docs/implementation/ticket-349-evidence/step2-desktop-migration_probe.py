from pathlib import Path
import sys,os,json,tempfile,sqlite3
root=Path.cwd();base=root/'.local/ticket-349-background-checkpoint-r7';out=root/'.local/ticket-349-desktop-checkpoint';wheel=root/'.local/ticket-349-live-timing/installed-wheel'
sys.path[:0]=list(map(str,[base/'server',wheel,root/'.local/ticket-349-cache-checkpoint/extra312']))
os.environ.update(UNCHAIN_SOURCE_PATH=str(wheel),PUPU_CONTEXT_V2_STORE_OWNER='unchain',PUPU_FEATURE_MEMORY_V2='all',PUPU_MEMORY_V2_MODE='all',UNCHAIN_AUTH_TOKEN='')
from flask import Flask
from route_memory_v2 import context_v2_status
from memory_v2_unchain_read_adapter import read_pupu_unchain_memory_v2_store_status
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.journal import AttemptRef, GenerationRef, SemanticEventDraft
records=[]
with tempfile.TemporaryDirectory(prefix='pupu349-migrate-') as temporary:
 data=Path(temporary);os.environ['UNCHAIN_DATA_DIR']=str(data);storage=data/'memory_v2'
 read_pupu_unchain_memory_v2_store_status(root_dir=storage)
 db=storage/'context_v2.sqlite3'
 original=SQLiteContextV2Store(database_path=db,object_directory=storage/'objects').bind_execution('migration-history')
 original.append(request=SemanticEventDraft(event_id='preserved-event',event_type='run_started',attempt=AttemptRef(GenerationRef('migration-history','generation'),'attempt'),operation_id='preserved-operation',payload={'run_id':'attempt','status':'started'}).to_append_request())
 expected=original.capture_snapshot().to_dict()
 with sqlite3.connect(db) as c:
  names=[row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'context_v2_%integrity_%'")]
  for name in names:c.execute('DROP TRIGGER "'+name.replace('"','""')+'"')
  c.execute('ALTER TABLE executions DROP COLUMN integrity_revision')
  c.execute('DELETE FROM context_v2_schema WHERE version=3')
 app=Flask(__name__)
 for stage in ['before_open','after_migration','reopen']:
  if stage!='before_open':SQLiteContextV2Store(database_path=db,object_directory=storage/'objects')
  with app.test_request_context('/context/v2/status'):
   response=context_v2_status(); payload=response.get_json()
  assert payload['available'] is True,payload
  assert payload['schema_version']==(2 if stage=='before_open' else 3),payload
  with sqlite3.connect(db) as c:versions=[r[0] for r in c.execute('SELECT version FROM context_v2_schema ORDER BY version')]
  assert original.capture_snapshot().to_dict()==expected
  records.append({'preserved_events':original.capture_snapshot().event_count,'stage':stage,'payload':payload,'versions':versions})
(out/'migration-producer.json').write_text(json.dumps(records,indent=2)+'\n')
print([(r['stage'],r['payload']['schema_version'],r['versions']) for r in records])
