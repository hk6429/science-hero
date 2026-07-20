import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeSandbox() {
  const context = vm.createContext({ console, Date, Math, JSON, TypeError });
  const source = readFileSync(path.join(ROOT, 'js/shapi.js'), 'utf8');
  vm.runInContext(`${source}\nglobalThis.__exports = { SHAPI };`, context);
  return context.__exports;
}

test('apiBase：同源/本機回空字串、鏡像站回絕對網址（vocab-duel 地雷修正）', () => {
  const { SHAPI } = makeSandbox();
  for (const h of ['science-hero.pages.dev', 'localhost', '127.0.0.1']) assert.equal(SHAPI.apiBase(h), '');
  for (const h of ['science-hero-hk6429.vercel.app', 'science-hero.netlify.app', 'example.com'])
    assert.equal(SHAPI.apiBase(h), SHAPI.API_ORIGIN);
});

test('call：鏡像站打絕對網址、localhost 打相對路徑、一律 POST JSON', async () => {
  const { SHAPI } = makeSandbox();
  let seen = null;
  const mk = (hostname) => SHAPI.createApi({
    hostname,
    fetchFn: async (url, opts) => { seen = { url, opts }; return { json: async () => ({ ok: 1 }) }; },
  });
  const r = await mk('science-hero-hk6429.vercel.app').call('/api/rt-room', { op: 'poll' });
  assert.equal(seen.url, `${SHAPI.API_ORIGIN}/api/rt-room`);
  assert.equal(seen.opts.method, 'POST');
  assert.equal(seen.opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(seen.opts.body), { op: 'poll' });
  assert.deepEqual(r, { ok: 1 });
  await mk('localhost').call('/api/rt-room', { op: 'poll' });
  assert.equal(seen.url, '/api/rt-room');
});

test('call：網路失敗/非 JSON 回 {ok:0,error:"offline"}、body 省略送空物件、壞路徑 throw TypeError', async () => {
  const { SHAPI } = makeSandbox();
  const dead = SHAPI.createApi({ hostname: 'localhost', fetchFn: async () => { throw new Error('offline'); } });
  assert.deepEqual(JSON.parse(JSON.stringify(await dead.call('/api/rt-room', { op: 'poll' }))), { ok: 0, error: 'offline' });
  const badJson = SHAPI.createApi({ hostname: 'localhost', fetchFn: async () => ({ json: async () => { throw new Error('x'); } }) });
  assert.deepEqual(JSON.parse(JSON.stringify(await badJson.call('/api/rt-room', { op: 'poll' }))), { ok: 0, error: 'offline' });
  let seenBody = null;
  const api = SHAPI.createApi({ hostname: 'localhost', fetchFn: async (url, opts) => { seenBody = opts.body; return { json: async () => ({}) }; } });
  await api.call('/api/rt-room');
  assert.deepEqual(JSON.parse(seenBody), {});
  await assert.rejects(() => api.call('rt-room'), TypeError);
  await assert.rejects(() => api.call('api/rt-room'), TypeError);
});
