// Translation boundary checks: no live services or data writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),ts=require('typescript');
// Ignore CRLF/LF differences only; actual content changes must still fail.
const hash=value=>crypto.createHash('sha256').update(value.toString().replace(/\r\n/g,'\n')).digest('hex');
// Captured from 7aff46e: landing, authored prompts and financial/provider settings remain untouched.
const protectedFiles={
  "src/components/landing-page.tsx": "159d6db74522b56aa9b5668c37c0511af998c7527b3d4bfde651bd6a499c6211",
  "src/app/page.tsx": "d3ee4974399a4c164aa7f0bbf18ae8c74faa2e83932ed7f3f15d6d96ecf026ee",
  "src/lib/affiliate/templates.ts": "2682914fdf3e0df1532935852c8071732864820a0a10027c81fe1426cf5e32ae",
  "src/lib/affiliate/types.ts": "19282d3e6b785374302364cbbae621d82f27c1a313a13261e036650ffce3557d",
  "src/lib/config.ts": "50606c7e58e3d2c3445b5c9eaa5d38f4ee542a98e9c4c50829db5c0a75baddcd",
  "src/lib/payments/packages.ts": "f6f374bdd9c1da1ce8e3e226f9cb251221d412fa92e294a305fea3bc8d8b4c02",
  "src/lib/payments/telegram.ts": "dfe306653d6de884eba872222483765ffa8eebeb31aa271dd753f963d65a5d7a",
  "src/lib/nexabot/client.ts": "c811af08abc220b47845128d721a289e25cd77fa99756c63e97a30f076259590",
  "src/lib/generations/flow.ts": "7276c935e2fd393ccb839d86d4dc4d31140654fa4ccb167bf39a7cb1f1f338a9",
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
console.log('PASS English UI boundaries: Malay landing and shared Brand default preserved; authored templates, content types, packages, credit/provider settings unchanged');
console.log('PASS Command Center: all seed data/notes and state loader preserved; identifiers, regex and numeric settings unchanged; English language and sync warnings present');
