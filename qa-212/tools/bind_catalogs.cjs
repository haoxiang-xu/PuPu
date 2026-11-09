/* Webpack's JSON generator emits RawSource/JSON.parse, so JSON modules have
   no sourcesContent entry. Compare every complete catalog in the actual
   compiled build without executing its JavaScript. The Python caller first
   binds every build file to the sealed App's asar bytes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),{createRequire}=require('node:module');
const repo=path.resolve(process.argv[2]),out=process.argv[3];
const {parse}=createRequire(path.join(repo,'package.json'))('@babel/parser');
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const expected=Object.fromEntries(fs.readdirSync(path.join(repo,'src/locales')).filter(n=>n.endsWith('.json')).map(name=>[name,sha(canonical(JSON.parse(fs.readFileSync(path.join(repo,'src/locales',name),'utf8'))))]));
const matches={};
function walkFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walkFiles(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walkFiles(path.join(repo,'build')).filter(n=>n.endsWith('.js'))){
  const ast=parse(fs.readFileSync(file,'utf8'),{sourceType:'unambiguous'}),pending=[ast];
  while(pending.length){
    const n=pending.pop();if(!n||typeof n!=='object')continue;
    if(n.type==='CallExpression'&&n.callee?.type==='MemberExpression'&&n.callee.object?.name==='JSON'&&n.callee.property?.name==='parse'&&n.arguments[0]?.type==='StringLiteral'){
      try{
        const value=JSON.parse(n.arguments[0].value);
        if(value&&typeof value==='object'&&!Array.isArray(value)&&value.agents){
          const digest=sha(canonical(value));
          for(const [locale,wanted]of Object.entries(expected))if(digest===wanted)(matches[locale]??=[]).push({file:path.relative(repo,file),catalog_canonical_sha256:digest});
        }
      }catch{/* Non-catalog JSON.parse literals are unrelated data. */}
    }
    for(const [key,value]of Object.entries(n)){if(['loc','start','end','extra'].includes(key))continue;if(Array.isArray(value))pending.push(...value);else if(value&&typeof value==='object')pending.push(value);}
  }
}
assert.equal(Object.keys(expected).length,11,'shipped catalog count');
assert.deepEqual(Object.keys(matches).sort(),Object.keys(expected).sort(),'a complete shipped catalog is absent or altered in compiled App bytes');
fs.writeFileSync(out,JSON.stringify({method:'AST extraction of literal JSON.parse data; no bundle evaluation',expected,matches,complete_catalogs:11},null,2)+'\n');
