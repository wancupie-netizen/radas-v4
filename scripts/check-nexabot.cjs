const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
function load(file) {
  const module = new Module(file); module.filename = file;
  const native = Module.createRequire(file);
  module.require = name => name === 'server-only' ? {} : name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : native(name);
  module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return module.exports;
}
const { createNexabotClient, NexabotError } = load(path.resolve('src/lib/nexabot/client.ts'));
const key = 'nxb_TEST_SECRET';
const input = { mode: 'text', prompt: ' hello ', orientation: 'landscape', resolution: '1080' };
const accepted = { ok: true, job_id: 'abc_123', status: 'queued', credit_cost: .15, credit_balance: 1, est_seconds: 60 };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
let calls = [];
function client(handler) { return createNexabotClient({ apiKey: key, fetcher: async (url, init) => { calls.push({ url, init }); return handler(url, init); } }); }
async function failure(fn, code, outcome) { await assert.rejects(fn, e => e instanceof NexabotError && e.code === code && (!outcome || e.outcome === outcome) && !e.message.includes(key)); }
(async () => {
  assert.throws(() => createNexabotClient({ apiKey: '' }), /MISSING_OR_INVALID_KEY/);
  let c = client(() => reply(accepted, 202));
  assert.equal((await c.submitVideo(input)).jobId, 'abc_123');
  assert.equal(calls[0].url, 'https://nexabot.id/api/v1/api');
  assert.equal(calls[0].init.headers['x-api-key'], key);
  assert.equal(calls[0].init.redirect, 'manual'); assert.equal(calls[0].init.cache, 'no-store');
  assert.deepEqual(JSON.parse(calls[0].init.body), { mode: 't2v', prompt: 'hello', ratio: 1, resolution: 1080 });
  const imageDataUri = 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
  await c.submitVideo({ ...input, mode: 'image', imageDataUri, orientation: 'portrait', resolution: '720' });
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { mode: 'i2v', prompt: 'hello', ratio: 2, resolution: 720, media: [imageDataUri] });
  c = client(() => reply({ ...accepted, status: 'processing' }, 202));
  const processingCalls = calls.length;
  assert.deepEqual(await c.submitVideo(input), { jobId: 'abc_123', status: 'queued', creditCost: .15, creditBalance: 1, estimatedSeconds: 60 });
  assert.equal(calls.length, processingCalls + 1);
  console.log('PASS accepted processing response preserves job ID without another paid POST');
  const before = calls.length;
  for (const bad of [{ prompt: ' ' }, { resolution: '480' }, { orientation: 'square' }, { mode: 'wrong' }, { imageDataUri }, { mode: 'image', imageDataUri: 'data:image/png;base64,YQ==' }, { mode: 'image', imageDataUri: 'data:image/png;base64,' + 'A'.repeat(14*1024*1024) }]) await failure(() => c.submitVideo({ ...input, ...bad }), 'INVALID_INPUT', 'rejected');
  assert.equal(calls.length, before);
  console.log('PASS exact reseller endpoint, secret header, t2v/i2v mapping, numeric settings and invalid inputs');
  for (const status of [400,401,402,403,404,429,500,503]) {
    const count = calls.length; c = client(() => reply({ error: key }, status));
    await failure(() => c.submitVideo(input), `HTTP_${status}`, status < 500 ? 'rejected' : 'unknown'); assert.equal(calls.length, count + 1);
  }
  c = client(() => { throw new Error(key); }); await failure(() => c.submitVideo(input), 'INVALID_OR_UNAVAILABLE_RESPONSE', 'unknown');
  for (const data of [{ ...accepted, job_id: '../secret' }, { ...accepted, status: 'done' }, { ...accepted, credit_balance: -1 }, { ok: false }]) {
    c = client(() => reply(data, 202)); await failure(() => c.submitVideo(input), 'INVALID_OR_UNAVAILABLE_RESPONSE', 'unknown');
  }
  const timed = createNexabotClient({ apiKey: key, timeoutMs: 5, fetcher: async (_, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error(key)))) });
  await failure(() => timed.submitVideo(input), 'TIMEOUT', 'unknown');
  console.log('PASS rejected versus unknown outcomes; no paid POST retry; timeout and error sanitization');
  for (const status of ['queued','processing','done','failed']) {
    c = client(() => reply({ ok: true, job: { id: 'abc', status, mode: 'i2v', progress: key, error: key, prompt: key } }));
    assert.deepEqual(await c.getJob('abc'), { jobId: 'abc', status, mode: 'i2v' });
  }
  await failure(() => c.getJob('../abc'), 'INVALID_INPUT');
  c = client(() => reply({ ok: true, job: { id: 'abc', status: 'completed', mode: 't2v' } }));
  await failure(() => c.getJob('abc'), 'INVALID_OR_UNAVAILABLE_RESPONSE');
  c = client(() => reply({ ok: true, registered: true, credit: 0, credit_cost: .15, telegram_id: key }));
  assert.deepEqual(await c.getCredit(), { credit: 0, creditCost: .15 });
  c = client(() => new Response(new Uint8Array([0,1]), { headers: { 'content-type': 'video/mp4' } }));
  assert.equal((await (await c.downloadVideo('abc')).arrayBuffer()).byteLength, 2);
  c = client(() => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }));
  await failure(() => c.downloadVideo('abc'), 'UNSAFE_DOWNLOAD_REDIRECT');
  let hops = 0; c = client(() => ++hops === 1 ? new Response(null, { status: 302, headers: { location: '/safe.mp4' } }) : new Response('mp4', { headers: { 'content-type': 'video/mp4' } }));
  await (await c.downloadVideo('abc')).body.cancel(); assert.equal(hops, 2);
  c = client(() => new Response('not video', { headers: { 'content-type': 'text/html' } }));
  await failure(() => c.downloadVideo('abc'), 'INVALID_OR_UNAVAILABLE_RESPONSE');
  console.log('PASS job states and identity; private provider fields removed; zero credit; MP4 stream; redirects denied');
})().catch(error => { console.error(error); process.exitCode = 1; });
