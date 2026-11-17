// Translation boundary checks: no live services or data writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),ts=require('typescript');
// Ignore CRLF/LF differences only; actual content changes must still fail.
const hash=value=>crypto.createHash('sha256').update(value.toString().replace(/\r\n/g,'\n')).digest('hex');
// Translation baseline from 7aff46e; package prices and provider cost updated by the approved 2026-11-16 pricing change.
// Verified provider download origin updated on 2026-11-17; other protected content stays unchanged.
const protectedFiles={
  "src/components/landing-page.tsx": "159d6db74522b56aa9b5668c37c0511af998c7527b3d4bfde651bd6a499c6211",
  "src/app/page.tsx": "845f4678a69ba94e179d1e3c16247c012ff15e725e5d80d027ae952fd5504c09",
  "src/lib/affiliate/templates.ts": "2682914fdf3e0df1532935852c8071732864820a0a10027c81fe1426cf5e32ae",
  "src/lib/affiliate/types.ts": "19282d3e6b785374302364cbbae621d82f27c1a313a13261e036650ffce3557d",
  "src/lib/config.ts": "fc6cb3e4f8fd21fc6b9a7306560e4fac51a1154ca2555a91c16ce822e02a7c2f",
  "src/lib/payments/packages.ts": "b2f032af9ecd14845a1eb480c6dd54b17c1fef92cd9ddf65ea3b00d7ce04b916",
  "src/lib/payments/telegram.ts": "dfe306653d6de884eba872222483765ffa8eebeb31aa271dd753f963d65a5d7a",
  "src/lib/nexabot/client.ts": "e70376584c68eec4f70a966f5317dc0b81705103a04604b948c2ae3c4139919e",
  "src/lib/generations/flow.ts": "02d20fd5f637c9d36a579dc867c525b5fb98fbfe9d8884669a010f40828530c5",
  "src/lib/storage/video.ts": "ecfdf4b7f8d90991506d570aa80ac34463888dd226c78fae70c6b2199242ffc4"
};
for(const [file,expected] of Object.entries(protectedFiles))assert.equal(hash(fs.readFileSync(file)),expected,'Translation must preserve '+file);
const html=fs.readFileSync('src/lib/command-center/center.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new Function(script);
const sf=ts.createSourceFile('center.js',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),seeds=[],tokens=[];let loader='';
function visit(node){
 if(ts.isVariableDeclaration(node)&&/^(DEFAULT|RADAS_PRODUCTS|PRODUCT_NAME_FIXES)/.test(node.name.getText(sf)))seeds.push(node.getText(sf));
 if(ts.isFunctionDeclaration(node)&&node.name?.text==='loadState')loader=node.getText(sf);
 if(ts.isIdentifier(node)||ts.isRegularExpressionLiteral(node)||ts.isNumericLiteral(node))tokens.push(node.getText(sf));
 ts.forEachChild(node,visit);
}visit(sf);
const expectedCenter={"seeds":"7ee27deb6ec03f7a4d377f2c852dea28db2fd5e7d430be9302e471085de269fc","loader":"459884fe537802666621b54a77ce774b731a9ab72ac3583de2da51fcb0992713","tokens":"88ff63072a7ce69072e10cf54240e48f6bc201ede8aafdf94023737f1eec7535"};
assert.equal(hash(seeds.join('\n')),expectedCenter.seeds,'All Command Center seeds and source notes must remain unchanged');
assert.equal(hash(loader),expectedCenter.loader,'Loading/normalizing existing account data must remain unchanged');
assert.equal(hash(tokens.join('\n')),expectedCenter.tokens,'Translation must not change Command Center identifiers, patterns or numeric settings');
assert.match(html,/<html lang="en">/);
assert.match(html,/Saving to your account/);assert.match(html,/Do not close this page/);
assert.match(fs.readFileSync('src/app/layout.tsx','utf8'),/<html lang="ms"/);
assert.match(fs.readFileSync('src/components/video-workspace.tsx','utf8'),/className="app-shell" lang="en"/);
assert.match(fs.readFileSync('src/components/auth-form.tsx','utf8'),/<main lang="en"/);
for(const name of ['products','payments','updates'])assert.match(fs.readFileSync('src/app/admin/'+name+'/page.tsx','utf8'),/<main lang="en"/);
console.log('PASS English UI boundaries: Malay landing and shared Brand default preserved; authored templates, content types, approved package/provider settings preserved');
console.log('PASS Command Center: all seed data/notes and state loader preserved; identifiers, regex and numeric settings unchanged; English language and sync warnings present');
