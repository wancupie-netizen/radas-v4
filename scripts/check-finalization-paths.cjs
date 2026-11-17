// Exercise the actual loader conditions with Windows and POSIX paths, on either host.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const source=fs.readFileSync('scripts/check-finalization.cjs','utf8');
const tree=ts.createSourceFile('check-finalization.cjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const conditions=new Map();
function visit(node){
 if(ts.isIfStatement(node)){
  const expression=node.expression.getText(tree);
  for(const suffix of ['/nexabot/client.ts','/supabase/server.ts'])if(expression.includes('endsWith')&&expression.includes(suffix))conditions.set(suffix,expression);
 }
 ts.forEachChild(node,visit);
}
visit(tree);assert.equal(conditions.size,2,'Both module mocks must have a guarded path condition');
for(const [suffix,expression]of conditions){
 const matches=new Function('resolved','path','return '+expression);
 for(const platform of [path.posix,path.win32]){
  const root=platform===path.win32?'C:\\Users\\Fixture\\RADAS project':'/tmp/RADAS project';
  const target=platform.join(root,'src','lib',...suffix.slice(1).split('/'));
  assert.equal(matches(target,platform),true,'Required fixture mock must match: '+target);
  assert.equal(Boolean(matches(undefined,platform)),false);
  assert.equal(Boolean(matches(target+'.bak',platform)),false);
  const other=platform.join(root,'src','lib','unrelated','server.ts');assert.equal(Boolean(matches(other,platform)),false);
 }
}
console.log('PASS actual auth/provider mock conditions select Windows and POSIX paths; missing, backup and unrelated modules are excluded');
