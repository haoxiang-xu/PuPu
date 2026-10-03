const fs = require('fs');
const assert = require('assert');
const rollout = require('../../electron/main/services/unchain/memory_v2_rollout');
const rows = JSON.parse(fs.readFileSync(__dirname + '/migration-producer.json'));
const snapshot = rollout.createBuildFeatureSnapshot({enable_memory_v2:true}, {PUPU_FEATURE_MEMORY_V2:'all',PUPU_MEMORY_V2_MODE:'all'});
const config = rollout.resolveMemoryV2ReleaseConfig({app:{isPackaged:true,getAppPath:()=>'/app'},fs:{existsSync:()=>true,readFileSync:()=>JSON.stringify(snapshot)},path:require('path'),environment:{}});
const checks = rows.map(row => {
  const result = rollout.validateMemoryV2Status(row.payload,config);
  assert.strictEqual(result.ok,true,result.reason);
  assert.strictEqual(result.status.schemaVersion,row.stage==='before_open'?2:3);
  assert.strictEqual(row.preserved_events,1);
  return {stage:row.stage,schema:result.status.schemaVersion,ok:result.ok,reason:result.reason,preservedEvents:row.preserved_events};
});
for (const schema of [1,4,99,'3',null]) {
  const result=rollout.validateMemoryV2Status({...rows[1].payload,schema_version:schema},config);
  assert.strictEqual(result.ok,false);
  assert.strictEqual(result.reason,'context_v2_schema_incompatible');
}
fs.writeFileSync(__dirname + '/migration-consumer.json',JSON.stringify({checks,unsupportedSchemasRejected:[1,4,99,'3',null]},null,2)+'\n');
console.log(checks);
