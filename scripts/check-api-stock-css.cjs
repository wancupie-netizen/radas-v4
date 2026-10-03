// Verify the production build contains scoped stock card styling; no browser/live calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(p=>p.isDirectory()?walk(path.join(dir,p.name)):[path.join(dir,p.name)]);}
const css=walk('.next/static').filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(p,'utf8')).join('\n');
for(const name of ['panel','grid','customerCard','sufficient','buffer_low','insufficient','topUp','internal','details'])assert.ok(new RegExp('api-stock-panel-module[^{}]*'+name+'\\{').test(css),'Missing scoped stock CSS: '+name);
assert.match(css,/grid-template-columns:repeat\(2/);assert.match(css,/max-width:540px/);
console.log('STOCK_CSS_BUILD=PASS (scoped card/status styles present; desktop/mobile visual acceptance separate)');
