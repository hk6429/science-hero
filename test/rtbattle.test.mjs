import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const terms = JSON.parse(readFileSync(path.join(ROOT, 'data/biology.json'), 'utf8'));

function makeSandbox() {
  const raw = {};
  const localStorage = { getItem: (k) => raw[k] ?? null, setItem: (k, v) => { raw[k] = String(v); }, removeItem: (k) => { delete raw[k]; } };
  const context = vm.createContext({ localStorage, console, Date, Math, JSON, TypeError, Map, Set });
  const files = ['js/store.js', 'js/flashcard.js', 'js/quiz.js', 'js/weak.js', 'js/battle.js', 'js/shapi.js', 'js/rtbattle.js'];
  const source = files.map((file) => readFileSync(path.join(ROOT, file), 'utf8')).join('\n;\n');
  vm.runInContext(`${source}\nglobalThis.__exports = { SciQuiz, SciBattle, SciStore, SciRtBattle, SHAPI };`, context);
  return { ...context.__exports, __setRaw: (k, v) => { raw[k] = v; } };
}

const plain = (value) => value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;

test('mulberry32 確定性＋withSeededRandom 換掉/還原 Math.random（含 throw 走 finally）', () => {
  const { SciRtBattle } = makeSandbox();
  const seq = (rng) => Array.from({ length: 100 }, rng);
  const a = seq(SciRtBattle.mulberry32(42));
  assert.deepEqual(a, seq(SciRtBattle.mulberry32(42)));
  assert.notDeepEqual(a, seq(SciRtBattle.mulberry32(43)));
  for (const v of a) assert.ok(v >= 0 && v < 1);
  const orig = Math.random;
  assert.equal(SciRtBattle.withSeededRandom(() => 0.5, () => Math.random()), 0.5);
  assert.equal(Math.random, orig);
  assert.throws(() => SciRtBattle.withSeededRandom(() => 0.5, () => { throw new Error('boom'); }));
  assert.equal(Math.random, orig);
});

test('buildQuestions：同 seed 同 pool 逐位元組相同、不看傳入順序、正解在列且無副作用', () => {
  const { SciRtBattle } = makeSandbox();
  const orig = Math.random;
  const q1 = plain(SciRtBattle.buildQuestions(7, terms));
  assert.equal(Math.random, orig);
  assert.deepEqual(q1, plain(SciRtBattle.buildQuestions(7, terms)));
  assert.deepEqual(q1, plain(SciRtBattle.buildQuestions(7, [...terms].reverse())));
  assert.equal(q1.length, SciRtBattle.ROUNDS);
  assert.equal(new Set(q1.map((q) => q.answerId)).size, SciRtBattle.ROUNDS);
  for (const q of q1) {
    assert.equal(q.options.length, 4);
    assert.ok(q.options.some((o) => o.id === q.answerId));
    assert.ok(q.mode === 'term2def' || q.mode === 'def2term');
  }
  assert.notDeepEqual(plain(SciRtBattle.buildQuestions(1, terms)).map((q) => q.answerId), plain(SciRtBattle.buildQuestions(2, terms)).map((q) => q.answerId));
  assert.equal(SciRtBattle.buildQuestions(1, terms.slice(0, 6)).length, 6);
});

test('answerResult：沿用 SciBattle.calcDamage、boost 加乘、goggles 護連擊', () => {
  const { SciRtBattle, SciBattle } = makeSandbox();
  assert.deepEqual(plain(SciRtBattle.answerResult({ correct: true, combo: 2, myHp: 100, boost: {} })), { dmg: SciBattle.calcDamage(2, 100), nextCombo: 3 });
  assert.deepEqual(plain(SciRtBattle.answerResult({ correct: true, combo: 0, myHp: 20, boost: { double: true } })), { dmg: SciBattle.calcDamage(0, 20) * 2, nextCombo: 1 });
  assert.deepEqual(plain(SciRtBattle.answerResult({ correct: false, combo: 4, myHp: 100, boost: {} })), { dmg: 0, nextCombo: 0 });
  assert.deepEqual(plain(SciRtBattle.answerResult({ correct: false, combo: 4, myHp: 100, boost: { goggles: true } })), { dmg: 0, nextCombo: 4 });
});

test('hpOf 扣傷加療並 clamp；judge 處理歸零、完賽、斷線與未定', () => {
  const { SciRtBattle } = makeSandbox();
  assert.equal(SciRtBattle.hpOf(100, 30, 10), 80);
  assert.equal(SciRtBattle.hpOf(100, 0, 50), 100);
  assert.equal(SciRtBattle.hpOf(100, 999, 10), 0);
  const base = { myHp: 100, oppHp: 100, myDone: false, oppDone: false, oppHbAgeMs: 0 };
  assert.equal(SciRtBattle.judge({ ...base, myHp: 0 }), 'lose');
  assert.equal(SciRtBattle.judge({ ...base, oppHp: 0 }), 'win');
  assert.equal(SciRtBattle.judge({ ...base, myHp: 0, oppHp: 0 }), 'draw');
  assert.equal(SciRtBattle.judge({ ...base, myDone: true, oppDone: true, myHp: 80, oppHp: 60 }), 'win');
  assert.equal(SciRtBattle.judge({ ...base, myDone: true, oppDone: true, myHp: 60, oppHp: 60 }), 'draw');
  assert.equal(SciRtBattle.judge({ ...base, oppHbAgeMs: SciRtBattle.DEAD_MS + 1 }), 'win');
  assert.equal(SciRtBattle.judge(base), null);
});

test('暱稱詞庫：前端清單與後端逐字一致', async () => {
  const { SciRtBattle } = makeSandbox();
  const backend = await import('../functions/lib/_nick.js');
  assert.deepEqual(plain(SciRtBattle.NICK_ADJ), backend.NICK_ADJ);
  assert.deepEqual(plain(SciRtBattle.NICK_NOUN), backend.NICK_NOUN);
  assert.ok(backend.isValidNick(SciRtBattle.genNick(SciRtBattle.mulberry32(9))));
});

test('buildAdventureScript：只落在 5/10、同 seed 同 role 同序列、事件皆出自 ADVENTURES', () => {
  const { SciRtBattle } = makeSandbox();
  const entries = (map) => plain([...map.entries()]);
  const s1 = SciRtBattle.buildAdventureScript(99, 'p1');
  assert.deepEqual(entries(s1), entries(SciRtBattle.buildAdventureScript(99, 'p1')));
  const okIds = new Set(plain(SciRtBattle.ADVENTURES).map((event) => event.id));
  for (const [at, event] of s1) {
    assert.ok(at === 5 || at === 10);
    assert.ok(okIds.has(event.id));
  }
});

test('buildAdventureScript：p1/p2 各自序列、保底至少一事件、相鄰不重複', () => {
  const { SciRtBattle } = makeSandbox();
  const ids = (map) => [...map.entries()].map(([at, event]) => `${at}:${event.id}`).join(',');
  let diffRole = 0;
  let diffSeed = 0;
  for (let seed = 0; seed < 200; seed += 1) {
    if (ids(SciRtBattle.buildAdventureScript(seed, 'p1')) !== ids(SciRtBattle.buildAdventureScript(seed, 'p2'))) diffRole += 1;
    if (ids(SciRtBattle.buildAdventureScript(seed, 'p1')) !== ids(SciRtBattle.buildAdventureScript(seed + 1, 'p1'))) diffSeed += 1;
    for (const role of ['p1', 'p2']) {
      const seq = [...SciRtBattle.buildAdventureScript(seed, role).values()].map((event) => event.id);
      assert.ok(seq.length >= 1);
      for (let i = 1; i < seq.length; i += 1) assert.notEqual(seq[i], seq[i - 1]);
    }
  }
  assert.ok(diffRole >= 100 && diffSeed >= 100);
});

test('奇遇效果與 answerResult/hpOf 咬合', () => {
  const { SciRtBattle, SciBattle } = makeSandbox();
  const effects = Object.fromEntries(plain(SciRtBattle.ADVENTURES).map((event) => [event.id, event]));
  assert.equal(effects.insight.effect, 'double');
  assert.equal(effects.goggles.effect, 'goggles');
  assert.equal(effects.breakthrough.effect, 'eliminate');
  assert.equal(effects.energy.amount, 10);
  assert.equal(SciRtBattle.answerResult({ correct: true, combo: 1, myHp: 100, boost: { double: true } }).dmg, SciBattle.calcDamage(1, 100) * 2);
  assert.equal(SciRtBattle.hpOf(100, 30, 10), 80);
});

const boardRows = [
  { nick: '好奇的電子01', score: 9 }, { nick: '冷靜的磁鐵02', score: 8 }, { nick: '閃亮的火山03', score: 7 },
  { nick: '勇敢的彗星04', score: 6 }, { nick: '機智的光子05', score: 5 }, { nick: '沉穩的石英06', score: 4 },
  { nick: '熱血的恐龍07', score: 1 },
];

test('safeBoard：只露前 5＋自己的名次', () => {
  const { SciRtBattle } = makeSandbox();
  const board = plain(SciRtBattle.safeBoard(boardRows, '熱血的恐龍07'));
  assert.deepEqual(board.top.map((row) => row.nick), boardRows.slice(0, 5).map((row) => row.nick));
  assert.deepEqual(board.me, { rank: 7, nick: '熱血的恐龍07', score: 1 });
  assert.equal(board.total, 7);
  assert.ok(!('rows' in board) && !('list' in board));
  assert.equal(SciRtBattle.safeBoard(boardRows, '好奇的電子01').me, null);
  assert.equal(SciRtBattle.safeBoard(boardRows, '路人').me, null);
});

test('loadClass/saveClass：sci_class 讀寫、壞 JSON 不炸', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciRtBattle.loadClass(), null);
  lib.SciRtBattle.saveClass({ code: '803', nick: '好奇的電子01' });
  assert.deepEqual(plain(lib.SciRtBattle.loadClass()), { code: '803', nick: '好奇的電子01' });
  lib.__setRaw('sci_class', '{oops');
  assert.equal(lib.SciRtBattle.loadClass(), null);
});

test('seasonKey/titleFor：月賽季切齊、門檻邊界', () => {
  const { SciRtBattle } = makeSandbox();
  assert.equal(SciRtBattle.seasonKey('2026-07-20'), '2026-07');
  assert.equal(SciRtBattle.seasonKey('2026-12-01'), '2026-12');
  assert.equal(SciRtBattle.titleFor(0), '見習觀測員');
  assert.equal(SciRtBattle.titleFor(59), '見習觀測員');
  assert.equal(SciRtBattle.titleFor(60), '正式研究員');
  assert.equal(SciRtBattle.titleFor(880), '星際科學家');
  assert.equal(SciRtBattle.titleFor(99999), '星際科學家');
});

test('recordSeasonResult：勝 +20、敗/平 +5；跨季歸零＋上季稱號入收藏', () => {
  const { SciRtBattle, SciStore } = makeSandbox();
  const state = SciStore.load();
  let result = plain(SciRtBattle.recordSeasonResult(state, '2026-07-20', 'win'));
  assert.deepEqual([result.key, result.pts, result.wins, result.battles], ['2026-07', 20, 1, 1]);
  result = plain(SciRtBattle.recordSeasonResult(state, '2026-07-21', 'lose'));
  assert.deepEqual([result.pts, result.wins, result.battles], [25, 1, 2]);
  result = plain(SciRtBattle.recordSeasonResult(state, '2026-08-01', 'draw'));
  assert.deepEqual([result.key, result.pts, result.battles], ['2026-08', 5, 1]);
  assert.equal(state.rtSeason.titles['2026-07'], '見習觀測員');
  assert.equal(state.stats.totalReviews, 0);
  assert.equal(state.rank, undefined);
});
