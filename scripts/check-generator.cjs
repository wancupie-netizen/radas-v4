// Input validation for local Generator UI; no accounts, uploads or credit mutations.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const compiled = ts.transpileModule(readFileSync('src/lib/video/input.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', compiled)(mod.exports, mod);
const { validatePrompt, validateImageFile, VIDEO_INPUT } = mod.exports;
(async () => {
  for (const prompt of ['', ' \n\t ', 'x'.repeat(2001)]) assert.ok(validatePrompt(prompt));
  for (const prompt of ['Gerakkan kamera perlahan.', 'x'.repeat(2000), '  Subjek tersenyum.  ']) assert.equal(validatePrompt(prompt), null);
  console.log('PASS empty/whitespace prompt rejected; 2000-character boundary accepted');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64');
  assert.equal(await validateImageFile(new File([png], 'photo.png', { type: 'image/png' })), null);
  assert.ok(await validateImageFile(new File([png], 'photo.svg', { type: 'image/svg+xml' })));
  assert.ok(await validateImageFile(new File(['not a picture'], 'photo.png', { type: 'image/png' })));
  assert.ok(await validateImageFile(new File([png], 'photo.jpg', { type: 'image/jpeg' })));
  assert.ok(await validateImageFile(new File([], 'empty.png', { type: 'image/png' })));
  const maximum = Buffer.alloc(VIDEO_INPUT.maxImageBytes);png.copy(maximum);
  assert.equal(await validateImageFile(new File([maximum], 'maximum.png', { type: 'image/png' })), null);
  assert.ok(await validateImageFile(new File([maximum, Buffer.from([0])], 'too-big.png', { type: 'image/png' })));
  const webp = Buffer.from('524946460400000057454250', 'hex');
  assert.equal(await validateImageFile(new File([webp], 'header.webp', { type: 'image/webp' })), null);
  assert.ok(await validateImageFile(new File([webp], 'header.png', { type: 'image/png' })));
  console.log('PASS image MIME/signature match, empty file, unsupported format and 10 MB boundary checks');
  console.log('NOTE browser decoding also required; header validation alone does not prove a valid image.');
})().catch(error => { console.error(error); process.exitCode = 1; });
