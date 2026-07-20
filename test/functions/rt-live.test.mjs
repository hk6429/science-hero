import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from '../fake-d1.mjs';
import { onRequestPost } from '../../functions/api/rt-live.js';

const SCOPE = { subject: 'chemphys', unit: null, grade: null };
const env = () => ({ SCIENCE_HERO_DB: createFakeD1(), RT_SECRET: 'test-secret' });
const call = (envValue, body, ip = '1.2.3.4') => onRequestPost({
  request: new Request('http://x/api/rt-live', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, origin: 'https://science-hero.pages.dev' }, body: JSON.stringify(body) }),
  env: envValue,
}).then((response) => response.json());

test('start → state → next → answer → roster → end 全流程', async () => {
  const e = env();
  const start = await call(e, { op: 'start', code: '803', qn: 10, scope: SCOPE });
  assert.equal(start.live.phase, 'lobby');
  assert.equal(typeof start.live.seed, 'number');
  assert.match(start.token, /^[0-9a-f]{32}$/);
  assert.equal((await call(e, { op: 'state', code: '803' })).live.startTs, undefined);
  const next = await call(e, { op: 'next', code: '803', token: start.token });
  assert.deepEqual([next.live.phase, next.live.qNo], ['q', 1]);
  assert.equal((await call(e, { op: 'next', code: '803', token: 'deadbeef'.repeat(4) })).ok, 0);
  await call(e, { op: 'answer', code: '803', nick: '好奇的電子01', qNo: 1, correct: true });
  await call(e, { op: 'answer', code: '803', nick: '冷靜的磁鐵02', qNo: 1, correct: false });
  const roster = await call(e, { op: 'roster', code: '803' });
  assert.deepEqual(roster.list[0], { nick: '好奇的電子01', score: 1, qNo: 1 });
  assert.deepEqual(roster.list[1], { nick: '冷靜的磁鐵02', score: 0, qNo: 1 });
  assert.equal((await call(e, { op: 'end', code: '803', token: start.token })).live.phase, 'end');
});

test('防灌分與輸入驗證：重送不計分、lobby 不收答案、詞庫外暱稱擋、進行中不可重開', async () => {
  const e = env();
  assert.equal((await call(e, { op: 'start', code: '有空格 x', qn: 5, scope: SCOPE })).ok, 0);
  const start = await call(e, { op: 'start', code: 'c1', qn: 5, scope: SCOPE });
  assert.equal((await call(e, { op: 'start', code: 'c1', qn: 5, scope: SCOPE })).ok, 0);
  assert.equal((await call(e, { op: 'answer', code: 'c1', nick: '好奇的電子01', qNo: 1, correct: true })).ok, 0);
  await call(e, { op: 'next', code: 'c1', token: start.token });
  await call(e, { op: 'answer', code: 'c1', nick: '好奇的電子01', qNo: 1, correct: true });
  await call(e, { op: 'answer', code: 'c1', nick: '好奇的電子01', qNo: 1, correct: true });
  assert.equal((await call(e, { op: 'roster', code: 'c1' })).list[0].score, 1);
  assert.equal((await call(e, { op: 'answer', code: 'c1', nick: '王小明', qNo: 1, correct: true })).ok, 0);
  await call(e, { op: 'end', code: 'c1', token: start.token });
  assert.equal((await call(e, { op: 'start', code: 'c1', qn: 5, scope: SCOPE })).ok, 1);
});

test('戰況牆開場限流：同 IP 60 秒超過 30 次擋下', async () => {
  const e = env();
  let last;
  for (let i = 0; i < 31; i += 1) last = await call(e, { op: 'start', code: `c${i}`, qn: 5, scope: SCOPE });
  assert.equal(last.ok, 0);
  assert.match(last.error, /頻繁/);
});
