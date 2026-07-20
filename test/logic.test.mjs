// 純邏輯測試：SRS 盒序推進、quiz 誘答生成、弱點聚合。
// 在 Node 直接 stub localStorage/window，不需要開瀏覽器。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// 這幾支腳本是純瀏覽器 <script> 全域掛載（top-level const），const/let 頂層
// 綁定不會變成 global 物件的屬性，所以把所有檔案串成一支 script 一起跑，
// 最後在同一個字彙作用域裡把需要的名稱明確掛到 globalThis 上再取出。
function loadScripts(context, files) {
  const combined = files
    .map((file) => readFileSync(path.join(ROOT, file), 'utf8'))
    .join('\n;\n');
  const code = `${combined}\nglobalThis.__exports = { SciStore, SciFlashcard, SciQuiz, SciWeak, SciBattle, SciEconomy, SciBaseStore, SciBaseUI };`;
  vm.runInContext(code, context, { filename: 'combined.js' });
  // node:assert/strict 會把 vm realm 的 Object/Array 原型視為不同；橋接回 host realm，
  // 讓 deepEqual 比較行為值與結構，同時保留原函式對傳入 state 的修改。
  const cloneValue = (value) => (
    value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value
  );
  const syncMutatedArg = (arg) => {
    if (!arg || typeof arg !== 'object') return;
    const cloned = cloneValue(arg);
    if (Array.isArray(arg)) arg.splice(0, arg.length, ...cloned);
    else {
      for (const key of Object.keys(arg)) delete arg[key];
      Object.assign(arg, cloned);
    }
  };
  return Object.fromEntries(Object.entries(context.__exports).map(([name, mod]) => [
    name,
    new Proxy(mod, {
      get(target, prop) {
        const value = target[prop];
        if (typeof value === 'function') return (...args) => {
          const result = value(...args);
          args.forEach(syncMutatedArg);
          return cloneValue(result);
        };
        return cloneValue(value);
      },
    }),
  ]));
}

function makeSandbox(seed = {}) {
  const store = { ...seed };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const sandbox = { localStorage, console, Date, Math, JSON };
  const context = vm.createContext(sandbox);
  return loadScripts(context, ['js/store.js', 'js/flashcard.js', 'js/quiz.js', 'js/economy.js', 'js/weak.js', 'js/battle.js', 'js/base-store.js', 'js/base-ui.js']);
}

const terms = JSON.parse(readFileSync(path.join(ROOT, 'data', 'biology.json'), 'utf8'));
const subjectFiles = ['elementary.json', 'biology.json', 'physics-chemistry.json', 'earth-science.json'];

test('SciStore.load 空狀態有預期結構', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  assert.equal(Object.keys(state.cards).length, 0);
  assert.equal(state.stats.totalReviews, 0);
});

test('SciFlashcard.markResult 答對推進盒序、答錯歸零', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  const id = terms[0].id;

  let card = lib.SciFlashcard.markResult(state, id, true);
  assert.equal(card.box, 1);
  card = lib.SciFlashcard.markResult(state, id, true);
  assert.equal(card.box, 2);
  card = lib.SciFlashcard.markResult(state, id, false);
  assert.equal(card.box, 0, '答錯應該歸零盒序');
  assert.equal(state.stats.totalReviews, 3);
});

test('SciFlashcard.getRoundQueue 逾期優先於未到期', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  const sample = terms.slice(0, 5);

  // 全部先標記為已看過、設一個很久以後才到期
  for (const t of sample) {
    lib.SciStore.setCard(state, t.id, { box: 1, due: Date.now() + 999999999, seen: 1, wrong: 0 });
  }
  // 其中一筆改成已逾期
  lib.SciStore.setCard(state, sample[2].id, { box: 1, due: Date.now() - 1000, seen: 1, wrong: 0 });

  const queue = lib.SciFlashcard.getRoundQueue(state, sample, 5);
  assert.equal(queue[0].id, sample[2].id, '逾期的詞條應該排最前面');
});

test('SciQuiz.buildQuestion 正解一定在選項中、選項不重複', () => {
  const lib = makeSandbox();
  for (const target of terms.slice(0, 30)) {
    const q = lib.SciQuiz.buildQuestion(target, terms);
    assert.ok(q.options.some((o) => o.id === q.answerId), `詞條 ${target.term} 的正解不在選項中`);
    const ids = q.options.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, `詞條 ${target.term} 的選項有重複`);
    assert.equal(q.options.length, 4);
  }
});

test('SciQuiz.pickDistractors 優先取同 distractor_pool', () => {
  const lib = makeSandbox();
  const target = terms.find((t) => terms.filter((x) => x.distractor_pool === t.distractor_pool).length >= 4);
  assert.ok(target, '測試資料裡應該至少有一個誘答池筆數足夠的詞條');
  const distractors = lib.SciQuiz.pickDistractors(target, terms, 3);
  const allSamePool = distractors.every((d) => d.distractor_pool === target.distractor_pool);
  assert.ok(allSamePool, '誘答池筆數足夠時，誘答應該全部來自同一個 distractor_pool');
});

test('四科資料都能建立四選一題目，且 id 不跨科重複', () => {
  const lib = makeSandbox();
  const seenIds = new Set();
  for (const file of subjectFiles) {
    const subjectTerms = JSON.parse(readFileSync(path.join(ROOT, 'data', file), 'utf8'));
    assert.ok(subjectTerms.length >= 180, `${file} 至少應有 180 筆`);
    for (const term of subjectTerms) {
      assert.ok(!seenIds.has(term.id), `${file} 的 id ${term.id} 與其他科重複`);
      seenIds.add(term.id);
    }
    for (const target of subjectTerms.slice(0, 30)) {
      const q = lib.SciQuiz.buildQuestion(target, subjectTerms);
      assert.equal(q.options.length, 4, `${file} 的 ${target.term} 未產生四個選項`);
      assert.ok(q.options.some((option) => option.id === q.answerId));
    }
  }
});

test('SciWeak.getWeakUnits 依答錯次數＋猜測加權排序', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  const a = terms[0], b = terms[1];

  lib.SciWeak.recordAnswer(state, { termId: a.id, unit: a.unit, correct: false, elapsedMs: 3000 });
  lib.SciWeak.recordAnswer(state, { termId: a.id, unit: a.unit, correct: false, elapsedMs: 3000 });
  lib.SciWeak.recordAnswer(state, { termId: b.id, unit: b.unit, correct: false, elapsedMs: 500 }); // guessed

  const weak = lib.SciWeak.getWeakUnits(state, {});
  assert.ok(weak.length >= 1);
  // a 答錯兩次（score=2）應該 >= b 答錯一次但用猜的（score=1.5），除非同單元合併
  const totalScore = weak.reduce((s, w) => s + w.score, 0);
  assert.equal(totalScore, a.unit === b.unit ? 3.5 : 3.5);
});

test('SciWeak.recordAnswer 判定秒答錯誤為「用猜的」', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  const t = terms[0];
  lib.SciWeak.recordAnswer(state, { termId: t.id, unit: t.unit, correct: false, elapsedMs: 500 });
  lib.SciWeak.recordAnswer(state, { termId: t.id, unit: t.unit, correct: false, elapsedMs: 5000 });
  assert.equal(state.weakLog[0].guessed, true);
  assert.equal(state.weakLog[1].guessed, false);
});

test('SciBattle.calcDamage 連擊遞增、血量<30 背水一戰 1.5 倍', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciBattle.calcDamage(0, 100), 12);
  assert.equal(lib.SciBattle.calcDamage(2, 100), 18);
  assert.equal(lib.SciBattle.calcDamage(0, 20), 18, '血量<30時應該套用1.5倍背水一戰加成');
  assert.equal(lib.SciBattle.calcDamage(2, 20), 27);
});

test('SciBattle.isUnlocked 依累積答對數解鎖高手/宗師對手', () => {
  const lib = makeSandbox();
  const novice = lib.SciBattle.OPPONENTS.find((o) => o.tier === '入門');
  const expert = lib.SciBattle.OPPONENTS.find((o) => o.tier === '高手');
  const master = lib.SciBattle.OPPONENTS.find((o) => o.tier === '宗師');
  assert.equal(lib.SciBattle.isUnlocked(novice, 0), true, '入門對手一開始就該開放');
  assert.equal(lib.SciBattle.isUnlocked(expert, 10), false);
  assert.equal(lib.SciBattle.isUnlocked(expert, 30), true);
  assert.equal(lib.SciBattle.isUnlocked(master, 30), false);
  assert.equal(lib.SciBattle.isUnlocked(master, 80), true);
});

test('SciBattle.rankWin/rankLose 依勝負加減分，且每週首敗不扣分', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();

  assert.equal(lib.SciBattle.rankInfo(state).pts, 0);

  const w1 = lib.SciBattle.rankWin(state);
  assert.equal(w1.delta, 20);
  assert.equal(state.rank.pts, 20);

  const l1 = lib.SciBattle.rankLose(state);
  assert.equal(l1.shield, true, '本週第一次輸應該觸發首敗保護');
  assert.equal(l1.delta, 0);
  assert.equal(state.rank.pts, 20, '首敗保護不應扣分');

  const l2 = lib.SciBattle.rankLose(state);
  assert.equal(l2.shield, undefined);
  assert.equal(l2.delta, -10);
  assert.equal(state.rank.pts, 10, '本週第二次輸開始正常扣分');
});

test('SciBattle.rankInfo 依累積分數對應正確段位', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  assert.equal(lib.SciBattle.rankInfo(state).name, '銅牌探索者');
  state.rank = { pts: 250, peak: 250, shieldWk: null };
  assert.equal(lib.SciBattle.rankInfo(state).name, '金牌學者');
  state.rank.pts = 1000;
  const top = lib.SciBattle.rankInfo(state);
  assert.equal(top.name, '傳奇科學家');
  assert.equal(top.next, null, '最高段位不應該還有下一階');
});

test('SciBattle.companionFor 依精通詞卡數對應正確進化階段', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciBattle.companionFor(0).name, '神秘蛋');
  assert.equal(lib.SciBattle.companionFor(0).atk, 0);
  assert.equal(lib.SciBattle.companionFor(5).name, '科學雛靈');
  assert.equal(lib.SciBattle.companionFor(19).name, '科學雛靈');
  assert.equal(lib.SciBattle.companionFor(20).name, '智慧貓頭鷹');
  assert.equal(lib.SciBattle.companionFor(50).name, '智慧之龍');
  assert.equal(lib.SciBattle.companionFor(100).name, '星靈');
  assert.equal(lib.SciBattle.companionFor(100).next, null, '最高進化階段不應該還有下一階');
});

test('SciEconomy 收入表與每日上限 100（achievement 不吃上限）', () => {
  const lib = makeSandbox();
  assert.deepEqual(lib.SciEconomy.EARN_TABLE, { answer: 1, combo: 1, battleWin: 5, master: 3 });
  assert.equal(lib.SciEconomy.DAILY_CAP, 100);
  assert.equal(lib.SciEconomy.getBalance(), 0);

  const r1 = lib.SciEconomy.earnCrystals(60, 'battleWin');
  assert.deepEqual([r1.earned, r1.balance, r1.capped], [60, 60, false]);
  const r2 = lib.SciEconomy.earnCrystals(60, 'battleWin');
  assert.deepEqual([r2.earned, r2.balance, r2.capped], [40, 100, true], '撞上限只入 40');
  const r3 = lib.SciEconomy.earnCrystals(1, 'answer');
  assert.deepEqual([r3.earned, r3.capped], [0, true], '上限滿了之後一般收入歸零');
  const r4 = lib.SciEconomy.earnCrystals(50, 'achievement');
  assert.deepEqual([r4.earned, r4.balance, r4.capped], [50, 150, false], '成就不吃上限');
});

test('SciEconomy.spendCrystals 足額扣款、不足擋下', () => {
  const lib = makeSandbox();
  lib.SciEconomy.earnCrystals(30, 'battleWin');
  assert.deepEqual(lib.SciEconomy.spendCrystals(20, 'style:nature'), { ok: true, balance: 10 });
  const fail = lib.SciEconomy.spendCrystals(20, 'style:nature');
  assert.equal(fail.ok, false);
  assert.equal(fail.balance, 10, '扣款失敗不動餘額');
});

test('SciEconomy 跨日歸零每日入帳、壞資料退回預設', () => {
  const staleEcon = JSON.stringify({ v: 1, balance: 5, daily: { date: '2020-01-01', earned: 100 }, combo: 0, bestCombo: 0 });
  const lib = makeSandbox({ sci_econ: staleEcon });
  const r = lib.SciEconomy.earnCrystals(1, 'answer');
  assert.deepEqual([r.earned, r.balance], [1, 6], '換了一天，昨天的 earned=100 不該再擋今天');

  const bad = makeSandbox({ sci_econ: '{"balance"' });
  assert.equal(bad.SciEconomy.getBalance(), 0, '壞 JSON 退回預設不噴錯');
});

test('SciEconomy.onAnswer 答對+1、第3連對起每題再+1、精通+3、答錯歸零連對', () => {
  const lib = makeSandbox();
  const E = lib.SciEconomy;
  assert.deepEqual(E.onAnswer(true, 0, 1), { earned: 1, combo: 1 });
  assert.deepEqual(E.onAnswer(true, 1, 2), { earned: 1, combo: 2 });
  assert.deepEqual(E.onAnswer(true, 2, 3), { earned: 2, combo: 3 }, '第 3 連對起每題多 +1');
  assert.deepEqual(E.onAnswer(true, 3, 4), { earned: 5, combo: 4 }, '連擊 +2 疊加精通 +3');
  assert.deepEqual(E.onAnswer(false, 4, 0), { earned: 0, combo: 0 }, '答錯不入帳且連對歸零');
  assert.deepEqual(E.onAnswer(true, 4, 4), { earned: 1, combo: 1 }, '已精通的卡再答對不重複發精通獎勵');
  assert.equal(E.getBalance(), 10);
});

test('SciBaseStore 基座：預設形狀、save/load 讀回、key、壞資料退預設、缺欄位補齊', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  assert.equal(B.BASE_KEY, 'sci_base');
  const s = B.defaultBase();
  assert.deepEqual(s, { v: 1, placements: {}, styles: {}, plaques: {}, celebrated: [] });
  s.placements['d-bio_001'] = { x: 30, y: 60 };
  assert.equal(B.saveBase(s), true);
  assert.deepEqual(B.loadBase().placements, { 'd-bio_001': { x: 30, y: 60 } });

  const bad = makeSandbox({ sci_base: '{"placements"' });
  assert.deepEqual(bad.SciBaseStore.loadBase(), bad.SciBaseStore.defaultBase(), '壞 JSON 退回預設');
  const partial = makeSandbox({ sci_base: '{"styles":{"nature":{"owned":[0,1],"active":1}}}' }).SciBaseStore.loadBase();
  assert.deepEqual(partial.styles.nature, { owned: [0, 1], active: 1 });
  assert.deepEqual([partial.celebrated, partial.v], [[], 1], '缺欄位補齊');
});

// 造一個指定卡片精通狀態的 state：ids 內的卡全推到 box 4（wrong 可指定）
function stateWithMastered(lib, ids, wrong = 0) {
  const state = lib.SciStore.load();
  for (const id of ids) lib.SciStore.setCard(state, id, { box: 4, due: 0, seen: 5, wrong });
  return state;
}

test('SciBaseStore.STAGES 門檻釘死 0/1/10/30/80，mainStage 正確分階', () => {
  const B = makeSandbox().SciBaseStore;
  assert.deepEqual(B.STAGES.map((s) => s[0]), [0, 1, 10, 30, 80], '門檻必須對齊 app.js RANK_TIERS');
  assert.deepEqual(B.STAGES.map((s) => s[1]), ['見習營帳', '初階研究站', '進階實驗樓', '資深研究院', '領域總部']);
  assert.equal(B.mainStage(0).name, '見習營帳');
  assert.equal(B.mainStage(0).next.at, 1);
  assert.equal(B.mainStage(9).name, '初階研究站');
  assert.equal(B.mainStage(10).stage, 2);
  assert.equal(B.mainStage(80).name, '領域總部');
  assert.equal(B.mainStage(999).next, null, '最高階沒有下一階');
});

test('SciBaseStore.countMastered 與 box>=4 判準一致', () => {
  const lib = makeSandbox();
  const state = stateWithMastered(lib, ['a']);
  lib.SciStore.setCard(state, 'b', { box: 3, due: 0, seen: 5, wrong: 0 });
  assert.equal(lib.SciBaseStore.countMastered(state), 1);
});

test('SciBaseStore.getPavilions 各科精通%換繁茂度五級（門檻 0/10/30/60/100）', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  assert.deepEqual([0, 9, 10, 30, 60, 99, 100].map(B.flourishTier), [0, 0, 1, 2, 3, 3, 4], '99% 還不到鼎盛');

  const mk = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, term: `${p}${i}`, def: 'x', unit: 'u' }));
  const termsBySubject = { nature: mk('n', 10), biology: mk('b', 10), chemphys: mk('c', 10), earth: mk('e', 10) };
  const state = stateWithMastered(lib, ['n0', ...termsBySubject.biology.map((t) => t.id)]);

  const ps = B.getPavilions(state, termsBySubject);
  assert.deepEqual(ps.map((p) => p.name), ['自然園圃', '生物標本館', '理化實驗室', '地科天文台']);
  assert.deepEqual([ps[0].pct, ps[0].tierName], [10, '初萌']);
  assert.deepEqual([ps[1].pct, ps[1].tierName], [100, '鼎盛']);
  assert.equal(ps[2].tierName, '荒蕪');
  assert.equal(ps[3].done, 0);
});

test('SciBaseStore.gradeOf 零錯=金、錯1次=銀、其餘=銅', () => {
  const B = makeSandbox().SciBaseStore;
  assert.deepEqual([0, 1, 2, 9].map((wrong) => B.gradeOf({ box: 4, wrong })), ['gold', 'silver', 'bronze', 'bronze']);
});

test('SciBaseStore.getDecorations 只收精通卡、掛各科主題、金銀銅排序、每館上限 12', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const mk = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${String(i).padStart(2, '0')}`, term: `詞${p}${i}`, def: 'x', unit: 'u' }));
  const termsBySubject = { nature: mk('n', 20), biology: mk('b', 5), chemphys: mk('c', 5), earth: mk('e', 5) };
  const state = lib.SciStore.load();
  termsBySubject.nature.slice(0, 15).forEach((t, i) => {
    lib.SciStore.setCard(state, t.id, { box: 4, due: 0, seen: 5, wrong: i < 3 ? 0 : (i < 5 ? 1 : 2) });
  });
  lib.SciStore.setCard(state, 'b00', { box: 4, due: 0, seen: 5, wrong: 0 });
  lib.SciStore.setCard(state, 'c00', { box: 3, due: 0, seen: 5, wrong: 0 });

  const ds = B.getDecorations(state, termsBySubject, B.defaultBase());
  const nature = ds.filter((d) => d.subject === 'nature');
  assert.equal(nature.length, 12, '每館上限 12 件');
  assert.deepEqual(nature.slice(0, 5).map((d) => d.grade), ['gold', 'gold', 'gold', 'silver', 'silver'], '金→銀→銅排序');
  assert.equal(nature[0].theme, '植栽昆蟲箱');
  assert.equal(nature[0].id, `d-${nature[0].termId}`);
  assert.equal(ds.filter((d) => d.subject === 'biology')[0].theme, '標本罐顯微鏡');
  assert.equal(ds.filter((d) => d.subject === 'chemphys').length, 0, '未精通的卡不實體化');

  const sum = B.decorSummary(state, termsBySubject);
  assert.deepEqual(sum.nature, { gold: 3, silver: 2, bronze: 10, total: 15, shown: 12, hidden: 3 });
  assert.deepEqual(sum.earth, { gold: 0, silver: 0, bronze: 0, total: 0, shown: 0, hidden: 0 });
});

test('SciBaseStore.defaultPos 確定性、依科別分帶、座標在 2–98', () => {
  const B = makeSandbox().SciBaseStore;
  assert.deepEqual(B.defaultPos('nature', 'd-n01'), B.defaultPos('nature', 'd-n01'), '同輸入必同輸出');
  assert.notDeepEqual(B.defaultPos('nature', 'd-n01'), B.defaultPos('nature', 'd-n02'), '不同 id 要錯落');
  const bands = { nature: [6, 40, 8, 38], biology: [60, 94, 8, 38], chemphys: [6, 40, 62, 92], earth: [60, 94, 62, 92] };
  for (const [key, [x0, x1, y0, y1]] of Object.entries(bands)) {
    for (let i = 0; i < 20; i++) {
      const p = B.defaultPos(key, `d-${key}${i}`);
      assert.ok(p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1, `${key} 落點超出分帶 ${JSON.stringify(p)}`);
    }
  }
});

test('SciBaseStore.placeDecor 寫入並夾界；無效值擋下；reset 清空', () => {
  const B = makeSandbox().SciBaseStore;
  const base = B.defaultBase();
  assert.equal(B.placeDecor(base, 'd-n01', 120, -5).ok, true);
  assert.deepEqual(base.placements['d-n01'], { x: 98, y: 2 }, '座標夾到 2–98');
  assert.equal(B.placeDecor(base, 'ghost', 10, 10).ok, false, '非 d- 開頭擋下');
  assert.equal(B.placeDecor(base, 'd-n02', NaN, 10).ok, false, 'NaN 擋下');
  B.resetPlacements(base);
  assert.deepEqual(base.placements, {});
});

test('SciBaseStore.getDecorations 未擺放用 defaultPos、擺過用自訂座標', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const termsBySubject = { nature: [{ id: 'n01', term: '光合作用', def: 'x', unit: 'u' }], biology: [], chemphys: [], earth: [] };
  const state = stateWithMastered(lib, ['n01']);
  const base = B.defaultBase();

  let d = B.getDecorations(state, termsBySubject, base)[0];
  assert.deepEqual({ x: d.x, y: d.y }, B.defaultPos('nature', 'd-n01'));
  assert.equal(d.custom, false);

  B.placeDecor(base, 'd-n01', 33, 44);
  d = B.getDecorations(state, termsBySubject, base)[0];
  assert.deepEqual({ x: d.x, y: d.y, custom: d.custom }, { x: 33, y: 44, custom: true });
});

test('SciBaseStore 門牌詞庫命名：1–2 詞、只能選詞庫、非法對象擋下、預設名', () => {
  const B = makeSandbox().SciBaseStore;
  assert.ok(B.PLAQUE_BANK.length >= 24);
  assert.equal(new Set(B.PLAQUE_BANK.map((w) => w.id)).size, B.PLAQUE_BANK.length, '詞庫 id 不重複');
  const base = B.defaultBase();
  const [a, b] = B.PLAQUE_BANK;
  assert.equal(B.setPlaque(base, 'main', [a.id, b.id]).ok, true);
  assert.equal(B.getPlaqueText(base, 'main'), `${a.w}${b.w}`);
  assert.equal(B.setPlaque(base, 'nature', [a.id]).ok, true, '單一詞也可');
  assert.equal(B.setPlaque(base, 'main', []).ok, false, '空選擋下');
  assert.equal(B.setPlaque(base, 'main', [a.id, b.id, a.id]).ok, false, '超過 2 詞擋下');
  assert.equal(B.setPlaque(base, 'main', ['自由輸入']).ok, false, '不在詞庫擋下');
  assert.equal(B.setPlaque(base, 'roof', [a.id]).ok, false, '非法對象擋下');
  assert.equal(B.getPlaqueText(base, 'biology'), '生物標本館', '未題字回預設名');
  assert.equal(B.getPlaqueText(B.defaultBase(), 'main'), '科學研究基地');
});

test('SciBaseStore 銘言：詞庫掛上／取下、非法 id 擋下', () => {
  const B = makeSandbox().SciBaseStore;
  const base = B.defaultBase();
  assert.equal(B.getMotto(base), null);
  assert.equal(B.setMotto(base, B.MOTTO_BANK[2].id).ok, true);
  assert.equal(B.getMotto(base).text, B.MOTTO_BANK[2].text);
  assert.equal(B.setMotto(base, 'nope').ok, false);
  assert.equal(B.setMotto(base, null).ok, true);
  assert.equal(B.getMotto(base), null);
});

test('SciBaseStore.buyStyle 晶能換購：夠錢入手＋生效、不夠擋下、已擁有免費切換', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const base = B.defaultBase();
  assert.equal(B.styleOf(base, 'nature'), 0, '預設 0 號樣式');
  assert.equal(B.buyStyle(base, 'nature', 1).ok, false, '餘額 0 買不起 30 晶能樣式');
  assert.equal(B.styleOf(base, 'nature'), 0, '失敗不動狀態');

  lib.SciEconomy.earnCrystals(50, 'battleWin');
  const buy = B.buyStyle(base, 'nature', 1);
  assert.deepEqual([buy.ok, buy.balance], [true, 20], '扣掉 30');
  assert.equal(B.styleOf(base, 'nature'), 1);
  assert.deepEqual(base.styles.nature.owned.sort(), [0, 1]);

  assert.equal(B.buyStyle(base, 'nature', 0).ok, true, '切回已擁有樣式不扣款');
  assert.equal(lib.SciEconomy.getBalance(), 20);
  assert.equal(B.buyStyle(base, 'nature', 9).ok, false, '沒有這個樣式');
});

test('SciEconomy.getBestCombo 唯讀回報歷史最高連對', () => {
  const E = makeSandbox().SciEconomy;
  E.onAnswer(true, 0, 1);
  E.onAnswer(true, 1, 2);
  E.onAnswer(false, 2, 0);
  E.onAnswer(true, 0, 1);
  assert.equal(E.getBestCombo(), 2);
});

test('SciBaseStore.pendingCelebrations 列升階/升級/金級；mark 去重；seed 防洪水', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const mk = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, term: `${p}${i}`, def: 'x', unit: 'u' }));
  const termsBySubject = { nature: mk('n', 10), biology: mk('b', 10), chemphys: mk('c', 10), earth: mk('e', 10) };
  const state = stateWithMastered(lib, ['n0']);
  lib.SciStore.setCard(state, 'n1', { box: 4, due: 0, seen: 5, wrong: 1 });

  const base = B.defaultBase();
  let pend = B.pendingCelebrations(state, termsBySubject, base);
  assert.deepEqual(pend.map((p) => p.id).sort(), ['gold-n0', 'pav-nature-t1', 'stage-1']);
  assert.ok(pend.find((p) => p.id === 'stage-1').title.includes('初階研究站'));

  B.markCelebrated(base, 'stage-1');
  B.markCelebrated(base, 'stage-1');
  assert.equal(base.celebrated.filter((x) => x === 'stage-1').length, 1, '重複標記不重複塞');
  assert.ok(!B.pendingCelebrations(state, termsBySubject, base).some((p) => p.id === 'stage-1'));

  const fresh = B.defaultBase();
  assert.equal(B.isSeeded(fresh), false);
  B.seedCelebrated(state, termsBySubject, fresh);
  assert.equal(B.isSeeded(fresh), true);
  assert.deepEqual(B.pendingCelebrations(state, termsBySubject, fresh), []);
  lib.SciStore.setCard(state, 'n2', { box: 4, due: 0, seen: 5, wrong: 0 });
  assert.deepEqual(B.pendingCelebrations(state, termsBySubject, fresh).map((p) => p.id).sort(), ['gold-n2', 'pav-nature-t2']);
});

test('SciBaseStore.getWall 三面榮譽，無紀錄不催促', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const state = lib.SciStore.load();
  let wall = B.getWall(state);
  assert.equal(wall.length, 3);
  assert.equal(wall[0].value, '尚未出戰');

  state.rank = { pts: 80, peak: 260, shieldWk: null };
  state.stats.streakDays = 7;
  lib.SciEconomy.onAnswer(true, 0, 1);
  wall = B.getWall(state);
  assert.ok(wall[0].value.includes('金牌學者') && wall[0].value.includes('260'), 'peak 260 依 SciBattle.RANKS 應為金牌學者');
  assert.equal(wall[1].value, '1 題');
  assert.equal(wall[2].value, '7 天');
});

test('SciBaseStore.getBaseView 一次拿齊整包視圖', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const v = B.getBaseView(lib.SciStore.load(), { nature: [], biology: [], chemphys: [], earth: [] }, B.defaultBase());
  assert.deepEqual([v.main.name, v.main.masteredCount], ['見習營帳', 0]);
  assert.equal(v.pavilions.length, 4);
  assert.ok(Array.isArray(v.decorations));
  assert.equal(v.plaques.main, '科學研究基地');
  assert.deepEqual([v.motto, v.balance, v.wall.length], [null, 0, 3]);
});

test('SciBaseUI.sceneHtml 含主樓（階段圖＋門牌）＋四展館（繁茂度圖）＋onerror 佔位', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const mk = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, term: `詞${p}${i}`, def: 'x', unit: 'u' }));
  const termsBySubject = { nature: mk('n', 10), biology: mk('b', 10), chemphys: mk('c', 10), earth: mk('e', 10) };
  const state = stateWithMastered(lib, ['n0']);
  const html = lib.SciBaseUI.sceneHtml(B.getBaseView(state, termsBySubject, B.defaultBase()));

  for (const [needle, why] of [
    ['main-s2.png', 'stage 1 → 第 2 階主樓圖'], ['初階研究站', ''], ['科學研究基地', '主樓預設門牌'],
    ['pav-nature-t2.png', '園圃 tier 1 → 第 2 級圖'], ['pav-earth-t1.png', '地科 0% → 荒蕪第 1 級圖'],
    ['data-target="main"', '門牌點擊掛鉤'], ['data-decor="d-n0"', '裝飾元素'], ['grade-gold', ''],
    ['onerror', '缺圖佔位防線'], ['💠', '晶能餘額顯示'],
  ]) assert.ok(html.includes(needle), `${needle} ${why}`);
});

test('SciBaseUI.sceneHtml 裝飾用百分比座標定位、自訂座標優先', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const termsBySubject = { nature: [{ id: 'n0', term: '光合作用', def: 'x', unit: 'u' }], biology: [], chemphys: [], earth: [] };
  const state = stateWithMastered(lib, ['n0']);
  const base = B.defaultBase();
  B.placeDecor(base, 'd-n0', 25, 75);
  const html = lib.SciBaseUI.sceneHtml(B.getBaseView(state, termsBySubject, base));
  assert.ok(html.includes('left:25%') && html.includes('top:75%'));
});

test('SciBaseUI.wallHtml 陳列三面榮譽；不含催促字眼', () => {
  const html = makeSandbox().SciBaseUI.wallHtml([
    { icon: '🏆', label: '段位巔峰', value: '🥇 金牌學者（260 分）' },
    { icon: '🔥', label: '最高連對', value: '9 題' },
    { icon: '📅', label: '守繼天數', value: '7 天' },
  ]);
  assert.ok(html.includes('金牌學者') && html.includes('9 題') && html.includes('成就牆'));
  assert.ok(!html.includes('還差'), '成就牆只陳列不催促（白帽）');
});

test('SciBaseUI.stylePanelHtml 列 3 樣式、標記生效與價格', () => {
  const lib = makeSandbox();
  const html = lib.SciBaseUI.stylePanelHtml('nature', lib.SciBaseStore.defaultBase(), 45);
  for (const s of lib.SciBaseStore.STYLE_SHOP.nature) assert.ok(html.includes(s.name));
  assert.equal((html.match(/data-style=/g) || []).length, 3);
  assert.ok(html.includes('is-active'), '生效樣式有標記');
  assert.ok(html.includes('30'), '未擁有樣式顯示價格');
  assert.ok(html.includes('45'), '顯示目前餘額');
});

test('SciBaseUI.plaquePanelHtml 有 24 顆選詞鈕；main 才有銘言區', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const html = lib.SciBaseUI.plaquePanelHtml('main', '科學研究基地');
  assert.equal((html.match(/data-word=/g) || []).length, B.PLAQUE_BANK.length);
  assert.ok(html.includes(B.MOTTO_BANK[0].text));
  assert.ok(!lib.SciBaseUI.plaquePanelHtml('nature', '自然園圃').includes(B.MOTTO_BANK[0].text), '展館門牌面板不含銘言區');
});

test('SciBaseUI.celebrationHtml 慶典卡含標題/內文/繼續鈕', () => {
  const html = makeSandbox().SciBaseUI.celebrationHtml({ id: 'stage-2', type: 'stage', title: '基地升階・進階實驗樓', text: '精通突破 10 張！' });
  assert.ok(html.includes('進階實驗樓') && html.includes('sb-epic-close'));
});

test('SciRtBattleUI.mount 渲染連線對戰入口，不需啟動瀏覽器', () => {
  const sandbox = { console, Date, Math, JSON, TypeError, Map, Set, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {} };
  sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const files = ['js/store.js', 'js/flashcard.js', 'js/quiz.js', 'js/weak.js', 'js/battle.js', 'js/shapi.js', 'js/rtbattle.js', 'js/rtbattle-ui.js'];
  const source = files.map((file) => readFileSync(path.join(ROOT, file), 'utf8')).join('\n;\n');
  vm.runInContext(`${source}\nglobalThis.__rtui = SciRtBattleUI;`, context);
  const node = { innerHTML: '', isConnected: true, querySelector: () => ({ addEventListener() {}, value: '' }) };
  context.__rtui.mount(node, { pool: terms, scope: { subject: 'biology', unit: null, grade: null }, masteredCardCount: 0 });
  assert.match(node.innerHTML, /id="rt-create"/);
  assert.match(node.innerHTML, /id="rt-join"/);
  assert.match(node.innerHTML, /id="rt-challenge-create"/);
  assert.match(node.innerHTML, /id="rt-challenge-accept"/);
  assert.match(node.innerHTML, /id="rt-live-student"/);
  assert.match(node.innerHTML, /id="rt-live-host"/);
  assert.match(node.innerHTML, /id="rt-season-board"/);
});
