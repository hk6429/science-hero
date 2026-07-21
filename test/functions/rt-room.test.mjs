import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from '../fake-d1.mjs';
import { onRequestPost } from '../../functions/api/rt-room.js';

const SNAP = { nick: '好奇的電子', compLv: 3, hp: 100, scope: { subject: 'biology', unit: 'cell', grade: null } };
const call = (env, body, ip = '1.2.3.4') => onRequestPost({
  request: new Request('http://x/api/rt-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, origin: 'https://science-hero.pages.dev' },
    body: JSON.stringify(body),
  }),
  env,
}).then((response) => response.json());
const env = () => ({ SCIENCE_HERO_DB: createFakeD1(), RT_SECRET: 'test-secret' });

test('create → join → push → poll 全流程', async () => {
  const e = env();
  const c = await call(e, { op: 'create', snap: SNAP });
  assert.equal(c.ok, 1);
  assert.match(c.code, /^\d{4}$/);
  assert.equal(typeof c.seed, 'number');
  const j = await call(e, { op: 'join', code: c.code, snap: { ...SNAP, nick: '熱血的火山' } }, '5.6.7.8');
  assert.equal(j.ok, 1);
  assert.equal(j.seed, c.seed);
  assert.deepEqual(j.scope, SNAP.scope);
  assert.equal(j.opp.nick, '好奇的電子');
  assert.equal((await call(e, { op: 'push', code: c.code, role: 'p2', state: { dmg: 30, heal: 0, round: 3, combo: 2, correct: 3, done: 0 } }, '5.6.7.8')).ok, 1);
  const q = await call(e, { op: 'poll', code: c.code, role: 'p1' });
  assert.equal(q.opp.state.dmg, 30);
  assert.equal(q.opp.snap.nick, '熱血的火山');
  assert.equal(typeof q.opp.state.hb, 'number');
  assert.equal(typeof q.now, 'number');
});

test('join：不存在的房/滿房都回 ok:0', async () => {
  const e = env();
  assert.equal((await call(e, { op: 'join', code: '0000', snap: SNAP })).ok, 0);
  const c = await call(e, { op: 'create', snap: SNAP });
  await call(e, { op: 'join', code: c.code, snap: { ...SNAP, nick: '冷靜的磁鐵' } }, '5.6.7.8');
  assert.equal((await call(e, { op: 'join', code: c.code, snap: { ...SNAP, nick: '機智的彗星' } }, '9.9.9.9')).ok, 0);
});

test('輸入驗證：暱稱白名單、壞 scope、壞 role、超界 state 全擋', async () => {
  const e = env();
  assert.equal((await call(e, { op: 'create', snap: { ...SNAP, nick: '小明' } })).error, 'bad snap');
  assert.equal((await call(e, { op: 'create', snap: { ...SNAP, nick: '好奇的量子' } })).error, 'bad snap');
  assert.equal((await call(e, { op: 'create', snap: { ...SNAP, nick: '好奇的電子07' } })).ok, 1);
  assert.equal((await call(e, { op: 'create', snap: { ...SNAP, scope: { subject: 'math', unit: null, grade: null } } })).error, 'bad snap');
  assert.equal((await call(e, { op: 'push', code: 'abcd', role: 'p1', state: { dmg: 1 } })).error, 'bad req');
  assert.equal((await call(e, { op: 'push', code: '1234', role: 'p3', state: { dmg: 1 } })).error, 'bad req');
  const c = await call(e, { op: 'create', snap: SNAP });
  await call(e, { op: 'push', code: c.code, role: 'p1', state: { dmg: 999999, heal: 5000, round: 99, combo: -5, correct: 3, done: 1 } });
  const q = await call(e, { op: 'poll', code: c.code, role: 'p2' });
  assert.equal(q.opp.state.dmg, 9999);
  assert.equal(q.opp.state.heal, 100);
  assert.equal(q.opp.state.round, 10);
  assert.equal(q.opp.state.combo, 0);
});

test('限流：同 IP create 超過 30 次回錯誤', async () => {
  const e = env();
  let last = null;
  for (let i = 0; i < 31; i += 1) last = await call(e, { op: 'create', snap: SNAP });
  assert.ok(last.error && last.error.includes('頻繁'));
});

test('挑戰書：challenge → accept → challengeResult 全流程，小寫碼也接受', async () => {
  const e = env();
  const scope = { subject: 'earth', unit: 'astronomy', grade: null };
  const score = { correct: 8, dmg: 152 };
  const c = await call(e, { op: 'challenge', seed: 123456, scope, nick: '沉穩的石英', score });
  assert.match(c.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const a = await call(e, { op: 'accept', code: c.code.toLowerCase() });
  assert.deepEqual([a.ok, a.seed, a.challenger], [1, 123456, '沉穩的石英']);
  assert.deepEqual(a.scope, scope);
  assert.deepEqual(a.score, score);
  const result = await call(e, { op: 'challengeResult', code: c.code, nick: '敏銳的光子', score: { correct: 9, dmg: 180 } });
  assert.deepEqual(result.challenger, { nick: '沉穩的石英', score });
  assert.deepEqual(result.accepter, { nick: '敏銳的光子', score: { correct: 9, dmg: 180 } });
});

test('挑戰書：壞碼/查無碼回 ok:0；成績超界 clamp；暱稱白名單照擋', async () => {
  const e = env();
  const scope = { subject: 'nature', unit: null, grade: null };
  assert.equal((await call(e, { op: 'accept', code: 'zz' })).ok, 0);
  assert.equal((await call(e, { op: 'accept', code: 'AAAAAA' })).ok, 0);
  assert.equal((await call(e, { op: 'challenge', seed: 1, scope, nick: '路人甲', score: { correct: 1, dmg: 1 } })).ok, 0);
  const c = await call(e, { op: 'challenge', seed: 1, scope, nick: '好奇的電子', score: { correct: 99, dmg: 999999 } });
  const a = await call(e, { op: 'accept', code: c.code });
  assert.deepEqual(a.score, { correct: 10, dmg: 9999 });
});

test('R7 seasonAdd/seasonTop：累積分數並回傳勝率與連勝', async () => {
  const e = env();
  await call(e, { op: 'seasonAdd', nick: '好奇的電子01', verdict: 'win' });
  const result = await call(e, { op: 'seasonAdd', nick: '好奇的電子01', verdict: 'win' });
  assert.equal(result.total, 40);
  assert.deepEqual([result.wins, result.battles, result.winRate, result.streak], [2, 2, 100, 2]);
  await call(e, { op: 'seasonAdd', nick: '好奇的電子01', verdict: 'lose' });
  await call(e, { op: 'seasonAdd', nick: '冷靜的磁鐵02', verdict: 'lose' });
  assert.equal((await call(e, { op: 'seasonAdd', nick: '王小明', verdict: 'lose' })).ok, 0);
  const top = await call(e, { op: 'seasonTop' });
  assert.equal(top.ok, 1);
  assert.match(top.season, /^\d{4}-\d{2}$/);
  assert.deepEqual(top.top, [
    { nick: '好奇的電子01', pts: 45, wins: 2, battles: 3, streak: 0, winRate: 67 },
    { nick: '冷靜的磁鐵02', pts: 5, wins: 0, battles: 1, streak: 0, winRate: 0 },
  ]);
});
