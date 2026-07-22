// 純邏輯測試：SRS 盒序推進、quiz 誘答生成、弱點聚合。
// 在 Node 直接 stub localStorage/window，不需要開瀏覽器。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { findMainlandTerms } from '../scripts/validate-all.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// 這幾支腳本是純瀏覽器 <script> 全域掛載（top-level const），const/let 頂層
// 綁定不會變成 global 物件的屬性，所以把所有檔案串成一支 script 一起跑，
// 最後在同一個字彙作用域裡把需要的名稱明確掛到 globalThis 上再取出。
function loadScripts(context, files) {
  const combined = files
    .map((file) => readFileSync(path.join(ROOT, file), 'utf8'))
    .join('\n;\n');
  const code = `${combined}\nglobalThis.__exports = { SciStore, SciFlashcard, SciQuiz, SciWeak, SciBattle, SciEconomy, SciDailyQuests, SciScienceRewards, SciFusionStore, SciBaseStore, SciBaseUI, __setRaw: (k, v) => localStorage.setItem(k, v) };`;
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
  return loadScripts(context, ['js/store.js', 'js/flashcard.js', 'js/quiz.js', 'js/weak.js', 'js/economy.js', 'js/daily-quests.js', 'js/science-rewards.js', 'js/battle.js', 'js/fusion-store.js', 'js/base-store.js', 'js/base-ui.js']);
}

const terms = JSON.parse(readFileSync(path.join(ROOT, 'data', 'biology.json'), 'utf8'));
const subjectFiles = ['elementary.json', 'biology.json', 'physics-chemistry.json', 'earth-science.json'];
const loreCards = JSON.parse(readFileSync(path.join(ROOT, 'data', 'science-lore.json'), 'utf8'));
const triviaFacts = JSON.parse(readFileSync(path.join(ROOT, 'data', 'science-trivia.json'), 'utf8'));

test('R1 b0003 細胞壁定義不再誤稱植物獨有，並明確對照動物細胞', () => {
  const entry = terms.find((term) => term.id === 'b0003');
  assert.equal(entry.def, '位於植物細胞膜外側、由纖維素構成的堅硬構造，能支撐並保護細胞；動物細胞沒有細胞壁。');
  assert.ok(!entry.def.includes('只存在於植物細胞'));
});

test('R2 b0006 葉綠體定義納入藻類並拿掉植物獨有說法', () => {
  const entry = terms.find((term) => term.id === 'b0006');
  assert.equal(entry.def, '含有葉綠素、能進行光合作用製造養分的胞器；動物細胞沒有葉綠體（多存在於植物與藻類細胞）。');
  assert.ok(!entry.def.includes('只存在於植物細胞'));
});

test('R3 d0210 半日潮分清一太陰日與相鄰滿潮間隔', () => {
  const earth = JSON.parse(readFileSync(path.join(ROOT, 'data', 'earth-science.json'), 'utf8'));
  const entry = earth.find((term) => term.id === 'd0210');
  assert.match(entry.def, /24 小時 50 分（一太陰日）內漲退兩次/);
  assert.match(entry.def, /相鄰兩次滿潮間隔約 12 小時 25 分/);
});

test('R8 單元全精通才解鎖科學史卡，同一張卡不重複且 JSON 欄位完整', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciScienceRewards.validateLore(loreCards), true);
  assert.ok(loreCards.every((card) => card.title && card.who && card.year));
  const state = lib.SciStore.load();
  const unitTerms = terms.filter((term) => term.unit === 'cell');
  unitTerms.forEach((term, index) => { state.cards[term.id] = { box: index === 0 ? 3 : 4 }; });
  assert.equal(lib.SciScienceRewards.unlockForMasteredUnit(state, loreCards, 'biology', 'cell', terms, 4), null);
  state.cards[unitTerms[0].id].box = 4;
  const card = lib.SciScienceRewards.unlockForMasteredUnit(state, loreCards, 'biology', 'cell', terms, 4);
  assert.equal(card.id, 'lore-hooke-1665');
  assert.equal(lib.SciScienceRewards.unlockForMasteredUnit(state, loreCards, 'biology', 'cell', terms, 4), null);
  assert.deepEqual(state.stats.scienceLore, ['lore-hooke-1665']);
  assert.match(lib.SciBaseUI.loreWallHtml(loreCards, state), /顯微鏡下的新世界/);
});

test('F8：科學史圖鑑為尚未解鎖卡保留剪影與問號位置', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  state.stats.scienceLore = [loreCards[0].id];
  const html = lib.SciBaseUI.loreWallHtml(loreCards.slice(0, 3), state);
  assert.equal((html.match(/sb-lore-card/g) || []).length, 3);
  assert.equal((html.match(/is-locked/g) || []).length, 2);
  assert.match(html, /尚未解鎖/);
});

test('R9 科學奇遇只在答對且命中時觸發，晶能紅利受每日上限限制', () => {
  const lib = makeSandbox();
  const seq = (...values) => { let index = 0; return () => values[index++]; };
  assert.deepEqual(lib.SciScienceRewards.triggerSurprise({ correct: false, rng: seq(0), facts: triviaFacts, economy: lib.SciEconomy }), { hit: false });
  assert.deepEqual(lib.SciScienceRewards.triggerSurprise({ correct: true, rng: seq(0.5), facts: triviaFacts, economy: lib.SciEconomy }), { hit: false });
  lib.SciEconomy.earnCrystals(99, 'answer');
  const reward = lib.SciScienceRewards.triggerSurprise({ correct: true, rng: seq(0.01, 0.1), facts: triviaFacts, economy: lib.SciEconomy });
  assert.deepEqual([reward.type, reward.earned, reward.balance, reward.capped], ['crystals', 1, 100, true]);
  const fact = lib.SciScienceRewards.triggerSurprise({ correct: true, rng: seq(0.01, 0.9, 0), facts: triviaFacts, economy: lib.SciEconomy });
  assert.deepEqual([fact.type, fact.fact.id], ['fact', 'trivia-venus-day']);
  assert.ok(triviaFacts.every((entry) => entry.text && entry.basis));
});

test('R10 三平台靜態快取：_headers 供 Cloudflare Pages/Netlify，vercel.json 供 Vercel', () => {
  const headers = readFileSync(path.join(ROOT, '_headers'), 'utf8');
  assert.match(headers, /\/assets\/\*[\s\S]*max-age=604800/);
  assert.match(headers, /\/js\/\*[\s\S]*max-age=300/);
  assert.match(headers, /\/data\/\*[\s\S]*max-age=300/);
  assert.match(headers, /\/index\.html[\s\S]*max-age=0, must-revalidate/);
  assert.ok(!headers.includes('immutable'));
  const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const bySource = Object.fromEntries(vercel.headers.map((rule) => [rule.source, rule.headers[0].value]));
  assert.equal(bySource['/assets/(.*)'], 'public, max-age=604800');
  assert.equal(bySource['/js/(.*)'], 'public, max-age=300');
  assert.equal(bySource['/data/(.*)'], 'public, max-age=300');
  assert.equal(bySource['/index.html'], 'public, max-age=0, must-revalidate');
  assert.ok(!JSON.stringify(vercel).includes('immutable'));
});

function fusionReadyState(lib) {
  const state = lib.SciStore.load();
  state.cards = {};
  for (let i = 1; i <= 100; i++) state.cards[`e${String(i).padStart(4, '0')}`] = { box: 4, due: 0, seen: 5, wrong: 0 };
  for (let i = 1; i <= 100; i++) state.cards[`b${String(i).padStart(4, '0')}`] = { box: 4, due: 0, seen: 5, wrong: 0 };
  state.weakLog = [];
  for (const prefix of ['e', 'b']) {
    for (let i = 0; i < 20; i++) {
      state.weakLog.push({ termId: `${prefix}0001`, unit: 'x', correct: i < 18, guessed: false, t: Date.now() + i });
    }
  }
  return state;
}

const okRng = () => 0.5;

test('validate-all 中國用語守門會回報題號與命中詞', () => {
  const hits = findMainlandTerms([{ id: 'pc-test', term: '聲音', def: '超聲波會顯示在屏幕上' }]);
  assert.deepEqual(hits, [{ id: 'pc-test', word: '超聲波' }, { id: 'pc-test', word: '屏幕' }]);
});

function metaWithForestdeer(lib) {
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const fstate = lib.SciFusionStore.load();
  lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { knowledgeCheckPassed: true, rng: okRng, today: '2026-07-20' });
  return fstate;
}

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

test('SciFlashcard.bumpBoxIfDue 同日連續答對不會刷到精通，僅到期後才推進', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  const id = terms[0].id;
  const now = Date.now();

  for (let i = 0; i < 4; i++) lib.SciFlashcard.bumpBoxIfDue(state, id, true, now);
  assert.equal(lib.SciStore.getCard(state, id).box, 1, '同一天重答只能推進第一次');

  for (let i = 0; i < 3; i++) {
    state.cards[id].due = now - 1;
    lib.SciFlashcard.bumpBoxIfDue(state, id, true, now);
  }
  assert.equal(lib.SciStore.getCard(state, id).box, 4, '每次等到到期後才能逐盒精通');
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

test('生物全標 G7，地科地質／天氣／海洋標 G9', () => {
  const biology = JSON.parse(readFileSync(path.join(ROOT, 'data', 'biology.json'), 'utf8'));
  const earth = JSON.parse(readFileSync(path.join(ROOT, 'data', 'earth-science.json'), 'utf8'));
  assert.ok(biology.every((term) => String(term.grade) === '7'));
  assert.ok(earth.filter((term) => ['geology', 'weather', 'ocean'].includes(term.unit))
    .every((term) => String(term.grade) === '9'));
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

test('SciWeak.recordAnswer 以近期表現判斷 luckyGuess，穩定答對後不再誤標', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  const t = terms[0];
  lib.SciWeak.recordAnswer(state, { termId: t.id, unit: t.unit, correct: true, elapsedMs: 500, seen: 0 });
  for (let i = 0; i < 3; i++) {
    lib.SciWeak.recordAnswer(state, { termId: t.id, unit: t.unit, correct: true, elapsedMs: 2000 });
  }
  lib.SciWeak.recordAnswer(state, { termId: t.id, unit: t.unit, correct: true, elapsedMs: 500, seen: 0 });
  assert.equal(state.weakLog[0].luckyGuess, true);
  assert.equal(state.weakLog.at(-1).luckyGuess, false);
  assert.ok(!lib.SciWeak.getWeakTerms(state).some((entry) => entry.termId === t.id));
});

test('弱點頁固定顯示本科近 30 題正確率', () => {
  const app = readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(app, /本科近 30 題正確率/);
  assert.match(app, /SciFusionStore\.accuracyBySubject\(subjectState, activeSubject\)/);
});

test('SciWeak.recordFlash 餵入閃卡診斷但不推進盒序', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  const t = terms[0];
  lib.SciWeak.recordFlash(state, { termId: t.id, unit: t.unit, correct: false });
  assert.equal(state.weakLog[0].source, 'flash');
  assert.equal(state.weakLog[0].correct, false);
  assert.equal(lib.SciStore.getCard(state, t.id).box, 0);
});

test('SciWeak.buildFamilySummary 彙整四科精通、近 30 題正確率與前十弱點詞', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  const subjects = [
    { key: 'nature', label: '國小自然' },
    { key: 'biology', label: '國中生物' },
    { key: 'chemphys', label: '國中理化' },
    { key: 'earth', label: '國中地科' },
  ];
  const termsBySubject = Object.fromEntries(subjectFiles.map((file, index) => [
    subjects[index].key,
    JSON.parse(readFileSync(path.join(ROOT, 'data', file), 'utf8')).slice(0, 3),
  ]));
  state.cards[termsBySubject.nature[0].id] = { box: 4, due: 0, seen: 5, wrong: 0 };
  state.cards[termsBySubject.biology[0].id] = { box: 4, due: 0, seen: 5, wrong: 0 };
  state.cards[termsBySubject.biology[1].id] = { box: 4, due: 0, seen: 5, wrong: 0 };
  state.weakLog = [
    { termId: termsBySubject.nature[1].id, unit: 'x', correct: false, guessed: true, t: 1 },
    { termId: termsBySubject.nature[1].id, unit: 'x', correct: false, guessed: false, t: 2 },
    { termId: termsBySubject.biology[2].id, unit: 'x', correct: true, guessed: false, t: 3 },
  ];

  const summary = lib.SciWeak.buildFamilySummary(state, subjects, termsBySubject, 4, lib.SciFusionStore.accuracyBySubject);
  assert.match(summary, /國小自然：精通 1 張｜近 30 題正確率 0%（2 題）/);
  assert.match(summary, /國中生物：精通 2 張｜近 30 題正確率 100%（1 題）/);
  assert.match(summary, new RegExp(`1\\. ${termsBySubject.nature[1].term}`));
  // 來源聲明（#25）：家長摘要必附未經雲端驗證聲明
  assert.match(summary, /未經雲端驗證/);
});

test('touchDailyStreak：累計單調不減，斷多天也不歸零（拿掉損失趨避黑帽鉤子）', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  state.stats.streakDays = 30;
  state.stats.lastActiveDate = '2020-01-01'; // 遠早於今天＝斷了很多天
  lib.SciStore.touchDailyStreak(state);
  assert.equal(state.stats.streakDays, 31, '斷天也只會 +1，不會砍回 1');
  const before = state.stats.streakDays;
  lib.SciStore.touchDailyStreak(state); // 同一天再呼叫不重複加
  assert.equal(state.stats.streakDays, before);
});

test('importState：夾住越界偽造（box 0..4、seen/wrong 非負）', () => {
  const lib = makeSandbox();
  const json = JSON.stringify({
    cards: { x1: { box: 99, seen: -3, wrong: 2.7, due: 5 }, x2: { box: -1, seen: 4 } },
    stats: { streakDays: 3 },
  });
  const parsed = lib.SciStore.importState(json);
  assert.equal(parsed.cards.x1.box, 4);
  assert.equal(parsed.cards.x1.seen, 0);
  assert.equal(parsed.cards.x1.wrong, 3);
  assert.equal(parsed.cards.x2.box, 0);
});

test('buildFamilySummary：攤露疑似靠猜題數（#24 誠實訊號）＋ 0 題不寫 0%', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  const subjects = [{ key: 'nature', label: '國小自然' }, { key: 'biology', label: '國中生物' }];
  const terms = JSON.parse(readFileSync(path.join(ROOT, 'data', subjectFiles[0]), 'utf8')).slice(0, 3);
  const termsBySubject = { nature: terms, biology: [] };
  state.weakLog = [
    { termId: terms[0].id, unit: 'x', correct: true, luckyGuess: true, t: 1 },
    { termId: terms[1].id, unit: 'x', correct: true, luckyGuess: true, t: 2 },
  ];
  const summary = lib.SciWeak.buildFamilySummary(state, subjects, termsBySubject, 4, lib.SciFusionStore.accuracyBySubject);
  assert.match(summary, /疑似靠猜答對/);
  assert.match(summary, /2 題/);
  // biology 無詞、無紀錄 → 應寫「尚無作答紀錄」而非「0%」
  assert.match(summary, /國中生物：精通 0 張｜尚無作答紀錄/);
});

test('quizWeight：到期低盒序 > 新字 > 已精熟未到期；弱點加成有上限', () => {
  const lib = makeSandbox();
  const now = 1_000_000;
  const dueLow = lib.SciQuiz.quizWeight({ box: 0, seen: 3, due: now - 1 }, 0, now);
  const fresh = lib.SciQuiz.quizWeight({ box: 0, seen: 0, due: 0 }, 0, now);
  const masteredNotDue = lib.SciQuiz.quizWeight({ box: 4, seen: 9, due: now + 999999 }, 0, now);
  assert.ok(dueLow > fresh, '到期低盒序應最急');
  assert.ok(fresh > masteredNotDue, '新字應優先於已精熟未到期');
  // 弱點加成有上限（6），不會無限壟斷
  const capped = lib.SciQuiz.quizWeight({ box: 4, seen: 9, due: now + 1 }, 999, now);
  const cappedRef = lib.SciQuiz.quizWeight({ box: 4, seen: 9, due: now + 1 }, 6, now);
  assert.equal(capped, cappedRef);
});

test('weightedSample：不放回抽樣、高權重確定性下被抽中', () => {
  const lib = makeSandbox();
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const w = { a: 100, b: 1, c: 1 };
  const picked = lib.SciQuiz.weightedSample(items, (it) => w[it.id], 2, () => 0);
  assert.equal(picked.length, 2);
  assert.equal(picked[0].id, 'a', 'rng=0 應先抽到最前的高權項');
  assert.equal(new Set(picked.map((p) => p.id)).size, 2, '不放回');
});

test('pickDistractors：新學者(box低)先給不同單元誘答、熟手(box高)先給同池近義', () => {
  const lib = makeSandbox();
  const target = { id: 't', unit: 'u1', distractor_pool: 'p1' };
  const pool = [
    target,
    { id: 's1', unit: 'u1', distractor_pool: 'p1' }, // 同池
    { id: 's2', unit: 'u1', distractor_pool: 'p1' },
    { id: 's3', unit: 'u1', distractor_pool: 'p1' },
    { id: 'd1', unit: 'u2', distractor_pool: 'p9' }, // 不同單元
    { id: 'd2', unit: 'u3', distractor_pool: 'p9' },
    { id: 'd3', unit: 'u4', distractor_pool: 'p9' },
  ];
  const easy = lib.SciQuiz.pickDistractors(target, pool, 3, 0);
  assert.ok(easy.every((d) => d.unit !== 'u1'), 'box 低應全給不同單元的明顯誘答');
  const hard = lib.SciQuiz.pickDistractors(target, pool, 3, 4);
  assert.ok(hard.every((d) => d.distractor_pool === 'p1'), 'box 高應全給同池近義誘答');
});

test('buildQuestion cloze：挖空 example 中的 term、回傳自評用資料', () => {
  const lib = makeSandbox();
  const target = { id: 'x', term: '光合作用', def: '植物製造養分的過程', example: '葉子透過光合作用把陽光變成養分。' };
  const q = lib.SciQuiz.buildQuestion(target, [target], 'cloze');
  assert.equal(q.mode, 'cloze');
  assert.ok(!q.prompt.includes('光合作用'), '目標詞應被挖空');
  assert.ok(q.prompt.includes('＿'), '應有底線空格');
  assert.equal(q.answerId, 'x');
  assert.equal(q.hasBlank, true);
});

test('SciFlashcard.getRoundQueue：新字跨單元交錯（interleaving）不叢集', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  const terms = [
    { id: 'a1', unit: 'A' }, { id: 'a2', unit: 'A' }, { id: 'a3', unit: 'A' },
    { id: 'b1', unit: 'B' }, { id: 'b2', unit: 'B' }, { id: 'b3', unit: 'B' },
  ];
  const queue = lib.SciFlashcard.getRoundQueue(state, terms, 6);
  const units = queue.map((t) => t.unit);
  // 交錯後不應出現同單元連續三個
  let maxRun = 1, run = 1;
  for (let i = 1; i < units.length; i++) {
    run = units[i] === units[i - 1] ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
  }
  assert.ok(maxRun < 3, `新字應交錯，實得連續 ${maxRun}`);
});

test('getCalibrationMisses：自評記住→之後自測答錯才算落差；自測先於自評不算', () => {
  const lib = makeSandbox();
  const state = { weakLog: [
    { termId: 'x', unit: 'u', correct: true, source: 'flash', t: 100 },
    { termId: 'x', unit: 'u', correct: false, source: 'quiz', t: 200 }, // 落差
    { termId: 'y', unit: 'u', correct: false, source: 'quiz', t: 100 },
    { termId: 'y', unit: 'u', correct: true, source: 'flash', t: 200 }, // 自測先於自評，不算
    { termId: 'z', unit: 'u', correct: true, source: 'flash', t: 100 },
    { termId: 'z', unit: 'u', correct: true, source: 'quiz', t: 200 },  // 自測答對，不算
  ] };
  const misses = lib.SciWeak.getCalibrationMisses(state);
  assert.equal(misses.x, 1);
  assert.equal('y' in misses, false);
  assert.equal('z' in misses, false);
});

test('buildFamilySummary 攤露校準落差詞給家長', () => {
  const lib = makeSandbox();
  const subjects = [{ key: 'nature', label: '自然' }];
  const termsBySubject = { nature: [{ id: 'x', term: '光合作用', unit: 'u' }] };
  const state = { cards: {}, weakLog: [
    { termId: 'x', unit: 'u', correct: true, source: 'flash', t: 100 },
    { termId: 'x', unit: 'u', correct: false, source: 'quiz', t: 200 },
  ] };
  const summary = lib.SciWeak.buildFamilySummary(state, subjects, termsBySubject, 4, () => ({ total: 0, accuracy: 0 }));
  assert.ok(summary.includes('光合作用'), '應列出自認記住卻答錯的詞');
  assert.ok(summary.includes('自認'), '應有校準落差說明');
});

test('SciDailyQuests 只用今日答對、勝場、單元推進與指定科答對判定任務', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  const subject = lib.SciDailyQuests.subjectQuestForDate('2026-07-21').subject;
  for (let i = 0; i < 10; i++) lib.SciDailyQuests.record(state, 'correct', '2026-07-21', subject);
  lib.SciDailyQuests.record(state, 'battleWin', '2026-07-21');
  lib.SciDailyQuests.record(state, 'unitProgress', '2026-07-21');
  assert.deepEqual(lib.SciDailyQuests.list(state, '2026-07-21').map((quest) => quest.done), [true, true, true, true]);
  assert.deepEqual(lib.SciDailyQuests.list(state, '2026-07-22').map((quest) => quest.done), [false, false, false, false]);
});

test('R6 三項核心任務全清只發一次 +20，第四任務科目依日期決定且可重現', () => {
  const lib = makeSandbox();
  const Q = lib.SciDailyQuests;
  const state = lib.SciStore.load();
  const date = '2026-07-21';
  assert.deepEqual(Q.subjectQuestForDate(date), Q.subjectQuestForDate(date));
  assert.ok(Q.SUBJECTS.some((subject) => subject.key === Q.subjectQuestForDate(date).subject));
  for (let i = 0; i < 10; i++) Q.record(state, 'correct', date, 'not-the-daily-subject');
  Q.record(state, 'battleWin', date);
  Q.record(state, 'unitProgress', date);
  const firstClaims = Q.claimNewlyCompleted(state, date);
  assert.ok(firstClaims.includes(Q.ALL_CLEAR_ID));
  assert.equal(Q.rewardFor(Q.ALL_CLEAR_ID), 20);
  assert.deepEqual(Q.claimNewlyCompleted(state, date), [], '已領過的全清獎勵不得重複');
  assert.equal(Q.list(state, date)[3].done, false, '非指定科答對不算第四任務');
  Q.record(state, 'correct', date, Q.subjectQuestForDate(date).subject);
  assert.equal(Q.list(state, date)[3].done, true);
});

test('即時對戰 HUD 顯示對手答對數與連擊，答對時觸發我方受擊閃動', () => {
  const ui = readFileSync(path.join(ROOT, 'js', 'rtbattle-ui.js'), 'utf8');
  assert.match(ui, /oppCorrect/);
  assert.match(ui, /對手答對/);
  assert.match(ui, /rt-hit-flash/);
});

test('SciBattle.recordPlayerHit 累計最高連擊、總輸出與最高傷害', () => {
  const lib = makeSandbox();
  const summary = {};
  lib.SciBattle.recordPlayerHit(summary, 12, 1);
  lib.SciBattle.recordPlayerHit(summary, 21, 4);
  assert.deepEqual(summary, { bestCombo: 4, totalDamage: 33, maxDamage: 21 });
});

test('SciBattle.calcDamage 連擊遞增、血量<30 背水一戰 1.5 倍', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciBattle.calcDamage(0, 100), 12);
  assert.equal(lib.SciBattle.calcDamage(2, 100), 18);
  assert.equal(lib.SciBattle.calcDamage(0, 20), 18, '血量<30時應該套用1.5倍背水一戰加成');
  assert.equal(lib.SciBattle.calcDamage(2, 20), 27);
});

test('R4 PvE 流暢度曲線為 3 秒 1.3、5 秒中間值、8 秒 0.7，實戰慢答不減傷', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciBattle.speedMultiplier(3000), 1.3);
  assert.equal(lib.SciBattle.speedMultiplier(5000), 1.06);
  assert.equal(lib.SciBattle.speedMultiplier(8000), 0.7);
  assert.equal(lib.SciBattle.calcPveDamage(0, 100, 3000), 16, '快答得到正向傷害加成');
  assert.equal(lib.SciBattle.calcPveDamage(0, 100, 8000), 12, '慢答維持普通傷害，不受罰');
  const source = readFileSync(path.join(ROOT, 'js', 'battle.js'), 'utf8');
  assert.match(source, /calcPveDamage\(battleState\.combo, battleState\.pHp, elapsedMs\)/);
  assert.match(source, /const dmg = calcDamage\(pvpState\.combo\[me\], pvpState\.hp\[me\]\)/, '同機 PvP 不套速度倍率');
});

test('SciBattle.enemyDamage 隨回合與階級升高，宗師每 3 回合施放大招', () => {
  const lib = makeSandbox();
  const master = lib.SciBattle.OPPONENTS.find((opponent) => opponent.tier === '宗師');
  assert.ok(lib.SciBattle.enemyDamage(master, 9) > lib.SciBattle.enemyDamage(master, 1));
  assert.ok(lib.SciBattle.enemyDamage(master, 3) > lib.SciBattle.enemyDamage(master, 2));
});

test('PvE 節奏縮為 300/400/500ms 且血條與傷害跳字動畫就位', () => {
  const battle = readFileSync(path.join(ROOT, 'js', 'battle.js'), 'utf8');
  const css = readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  assert.match(battle, /correct \? 300 : 500/);
  assert.match(battle, /setTimeout\(nextRound, 400\)/);
  assert.match(battle, /bat-damage-pop/);
  assert.match(css, /\.bat-hp-fill[^}]*transition:\s*width \.3s/s);
  assert.match(css, /@keyframes\s+bat-damage-pop/);
});

test('首次進站有單線新手引導，進階工具預設收合且基地常駐', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const app = readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(html, /id="new-player-guide"/);
  assert.match(html, /今天從這裡開始/);
  assert.match(html, /id="more-tools"/);
  assert.ok(html.indexOf('id="btn-base"') < html.indexOf('id="more-tools"'), '科學基地應在摺疊區之外');
  assert.match(app, /state\.stats\.totalReviews === 0/);
  assert.match(app, /SciUiLogic\.moreToolsDefaultOpen/);
});

test('SciBattle.subjectOfId 依 id 前綴分流四科', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciBattle.subjectOfId('e0001'), 'nature');
  assert.equal(lib.SciBattle.subjectOfId('b0035'), 'biology');
  assert.equal(lib.SciBattle.subjectOfId('pc0107'), 'chemphys');
  assert.equal(lib.SciBattle.subjectOfId('d0233'), 'earth');
  assert.equal(lib.SciBattle.subjectOfId('zzz'), null);
});

test('SciBattle.masteredBySubject 依前綴計 box>=maxBox 的卡數', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  state.cards = {
    e0001: { box: 4 }, e0002: { box: 4 }, e0003: { box: 2 },
    b0001: { box: 4 }, pc0001: { box: 4 }, d0001: { box: 1 },
  };
  const m = lib.SciBattle.masteredBySubject(state, 4);
  assert.deepEqual(m, { nature: 2, biology: 1, chemphys: 1, earth: 0 });
});

test('SciBattle.companionForSubject 四科各自六階、200 張典藏態不增強數值', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciBattle.companionForSubject('nature', 0).name, '萌芽種子');
  assert.equal(lib.SciBattle.companionForSubject('nature', 100).name, '萬物之靈');
  assert.equal(lib.SciBattle.companionForSubject('biology', 20).name, '蝶翼精靈');
  assert.equal(lib.SciBattle.companionForSubject('chemphys', 50).name, '電光之靈');
  assert.equal(lib.SciBattle.companionForSubject('earth', 100).next.at, 200);
  assert.equal(lib.SciBattle.companionForSubject('earth', 200).next, null);
  assert.equal(lib.SciBattle.companionForSubject('earth', 200).atk, lib.SciBattle.companionFor(100).atk);
});

test('SciBattle.subjectCompanionArt 產生四科階級圖片並保留 emoji fallback', () => {
  const lib = makeSandbox();
  const companion = lib.SciBattle.companionForSubject('chemphys', 50);
  const html = lib.SciBattle.subjectCompanionArt('chemphys', companion, 'bat-companion-face');
  assert.match(html, /src="assets\/battle\/sprite-chemphys-s4\.png"/);
  assert.match(html, /textContent:'⚡'/);
  assert.match(html, /className:'bat-companion-face'/);
  const generic = lib.SciBattle.companionFor(50);
  assert.equal(generic.emoji, '🐉');
  assert.equal('src' in generic, false);
});

test('SciBattle.SUBJECT_LINES 四科各六階、門檻對齊 COMPANION_TIERS', () => {
  const lib = makeSandbox();
  const ats = lib.SciBattle.COMPANION_TIERS.map((t) => t.at);
  for (const key of ['nature', 'biology', 'chemphys', 'earth']) {
    const line = lib.SciBattle.SUBJECT_LINES[key];
    assert.equal(line.length, 6);
    assert.deepEqual(line.map((t) => t.at), ats);
    for (const tier of line) assert.ok(tier.name && tier.emoji);
  }
});

test('SciFusionStore.load 空狀態有預期骨架、save/load round-trip', () => {
  const lib = makeSandbox();
  const state = lib.SciFusionStore.load();
  assert.deepEqual(state.hatched, []);
  assert.deepEqual(state.revealed, []);
  assert.equal(state.v, 1);
  assert.equal(state.fuseCount, 0);
  assert.equal(state.activeCub, '');
  state.hatched.push('cub_forestdeer');
  lib.SciFusionStore.save(state);
  assert.deepEqual(lib.SciFusionStore.load().hatched, ['cub_forestdeer']);
});

test('SciFusionStore.load 壞 JSON 回全新預設、缺欄位補齊', () => {
  const lib = makeSandbox();
  lib.__setRaw('sci_fusion', '{ this is not json');
  assert.deepEqual(lib.SciFusionStore.load().hatched, []);
  lib.__setRaw('sci_fusion', JSON.stringify({ v: 1, hatched: ['x'] }));
  const state = lib.SciFusionStore.load();
  assert.deepEqual(state.hatched, ['x']);
  assert.equal(state.fuseCount, 0);
  assert.equal(state.activeCub, '');
  assert.deepEqual(state.revealed, []);
});

test('SciFusionStore 晶能：spent 足額才扣、refund 入帳', () => {
  const lib = makeSandbox();
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30, earnedToday: 0, earnedDate: '' }));
  assert.equal(lib.SciFusionStore.crystalBalance(), 30);
  assert.equal(lib.SciFusionStore.spendCrystals(30).ok, true);
  assert.equal(lib.SciFusionStore.crystalBalance(), 0);
  assert.equal(lib.SciFusionStore.spendCrystals(1).ok, false);
  lib.SciFusionStore.refundCrystals(15);
  assert.equal(lib.SciFusionStore.crystalBalance(), 15);
});

test('canFuse：兩科滿階＋近期正確率達標 → ok', () => {
  const lib = makeSandbox();
  const result = lib.SciFusionStore.canFuse({ maxBox: 4 }, fusionReadyState(lib), 'nature', 'biology');
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});

test('canFuse：同一科 → same-subject', () => {
  const lib = makeSandbox();
  const result = lib.SciFusionStore.canFuse({ maxBox: 4 }, fusionReadyState(lib), 'nature', 'nature');
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('same-subject'));
});

test('canFuse：某科精通不足 100 → master:<subj>', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  delete state.cards.b0100;
  const result = lib.SciFusionStore.canFuse({ maxBox: 4 }, state, 'nature', 'biology');
  assert.ok(result.reasons.includes('master:biology'));
});

test('canFuse：某科近期正確率 < 80% → accuracy:<subj>', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  state.weakLog = state.weakLog.map((entry) => entry.termId.startsWith('b') ? { ...entry, correct: false } : entry);
  const result = lib.SciFusionStore.canFuse({ maxBox: 4 }, state, 'nature', 'biology');
  assert.ok(result.reasons.includes('accuracy:biology'));
});

test('canFuse：樣本數 < ACC_MIN_SAMPLE 視為未達標', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  state.weakLog = state.weakLog.filter((entry) => entry.termId.startsWith('e'));
  const result = lib.SciFusionStore.canFuse({ maxBox: 4 }, state, 'nature', 'biology');
  assert.ok(result.reasons.includes('accuracy:biology'));
});

test('accuracyBySubject：只取最近 ACC_WINDOW 筆', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  state.weakLog = [];
  for (let i = 0; i < 40; i++) {
    state.weakLog.push({ termId: 'e0001', unit: 'x', correct: i >= 10, guessed: false, t: i });
  }
  const result = lib.SciFusionStore.accuracyBySubject(state, 'nature');
  assert.equal(result.total, 30);
  assert.ok(Math.abs(result.accuracy - 1) < 1e-9);
});

test('CUBS：全庫 6 隻、pairKey 兩兩不重複、台詞非空殼', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciFusionStore.CUBS.length, 6);
  const keys = lib.SciFusionStore.CUBS.map((cub) => lib.SciFusionStore.pairKey(cub.pair[0], cub.pair[1]));
  assert.equal(new Set(keys).size, 6);
  for (const cub of lib.SciFusionStore.CUBS) {
    assert.ok(cub.emoji && cub.name.length >= 2);
    assert.ok(cub.bornLine.length >= 12, `${cub.id} 設定文案過短`);
  }
});

test('fuse 成功：扣 30 晶能、稚靈入庫、雙親 state.cards 前後一致', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const cardsBefore = JSON.stringify(state.cards);
  const fstate = lib.SciFusionStore.load();
  const result = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { knowledgeCheckPassed: true, rng: okRng, today: '2026-07-20' });
  assert.equal(result.ok, true);
  assert.equal(result.result, 'success');
  assert.equal(result.cub.id, 'cub_forestdeer');
  assert.equal(lib.SciFusionStore.crystalBalance(), 0);
  assert.equal(JSON.stringify(state.cards), cardsBefore, '雙親不可被消耗');
  assert.deepEqual(fstate.hatched, ['cub_forestdeer']);
});

test('fuse：晶能不足回 crystals、不出稚靈', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 29 }));
  const fstate = lib.SciFusionStore.load();
  const result = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { knowledgeCheckPassed: true, rng: okRng, today: '2026-07-20' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'crystals');
  assert.deepEqual(fstate.hatched, []);
});

test('fuse：資格不符直接擋 ineligible', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  delete state.cards.b0100;
  const result = lib.SciFusionStore.fuse(lib.SciFusionStore.load(), state, 'nature', 'biology', { knowledgeCheckPassed: true, rng: okRng, today: '2026-07-20' });
  assert.equal(result.reason, 'ineligible');
});

test('fuse：同配對已孵化 → 資格判定 already-hatched → ineligible', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 60 }));
  const fstate = lib.SciFusionStore.load();
  lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { knowledgeCheckPassed: true, rng: okRng, today: '2026-07-20' });
  lib.SciFusionStore.save(fstate);
  const result = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { knowledgeCheckPassed: true, rng: okRng, today: '2026-07-20' });
  assert.equal(result.reason, 'ineligible');
  assert.ok(result.reasons.includes('already-hatched'));
});

test('listCubs：回擁有稚靈的 view model、displayName 落回本名', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const fstate = lib.SciFusionStore.load();
  lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { knowledgeCheckPassed: true, rng: okRng, today: '2026-07-20' });
  const list = lib.SciFusionStore.listCubs(fstate);
  assert.equal(list.length, 1);
  assert.equal(list[0].displayName, '森靈鹿');
  assert.equal(list[0].isActive, false);
});

test('fuse 知識檢核未通過：不扣晶能、不出稚靈、雙親與進度不動', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const cardsBefore = JSON.stringify(state.cards);
  const fstate = lib.SciFusionStore.load();
  const result = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { knowledgeCheckPassed: false, today: '2026-07-20' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'knowledge-check');
  assert.equal(lib.SciFusionStore.crystalBalance(), 30);
  assert.deepEqual(fstate.hatched, []);
  assert.equal(JSON.stringify(state.cards), cardsBefore);
  assert.equal(fstate.fuseCount, 0);
});

test('fuse 答對科學題後保證成功，不受 rng 數值左右', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  const today = new Date().toISOString().slice(0, 10);
  lib.__setRaw('sci_econ', JSON.stringify({
    v: 1, balance: 30, daily: { date: today, earned: 100 }, combo: 0, bestCombo: 0,
  }));
  const result = lib.SciFusionStore.fuse(lib.SciFusionStore.load(), state, 'nature', 'biology', { knowledgeCheckPassed: true, rng: () => 0, today });
  assert.equal(result.result, 'success');
  assert.equal(lib.SciFusionStore.crystalBalance(), 0);
});

test('fuse 每日上限：超過 MAX_FUSE_PER_DAY 回 daily-limit 且不扣晶能', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 999 }));
  const fstate = lib.SciFusionStore.load();
  fstate.lastFuseDate = '2026-07-20';
  fstate.fuseCount = lib.SciFusionStore.MAX_FUSE_PER_DAY;
  const balanceBefore = lib.SciFusionStore.crystalBalance();
  const result = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { knowledgeCheckPassed: true, today: '2026-07-20' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'daily-limit');
  assert.equal(lib.SciFusionStore.crystalBalance(), balanceBefore);
});

test('fuse 每日上限跨日重置', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 999 }));
  const fstate = lib.SciFusionStore.load();
  fstate.lastFuseDate = '2026-07-20';
  fstate.fuseCount = lib.SciFusionStore.MAX_FUSE_PER_DAY;
  const result = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { knowledgeCheckPassed: true, today: '2026-07-21' });
  assert.notEqual(result.reason, 'daily-limit');
});

// ===== 終局融合：元靈聖獸 + prestige 巡禮 =====
function allCubsHatched(lib) {
  return lib.SciFusionStore.CUBS.map((cub) => cub.id);
}

test('GRAND 元靈：設定完整、bornLine 非空殼、emoji 存在', () => {
  const lib = makeSandbox();
  const g = lib.SciFusionStore.GRAND;
  assert.equal(g.id, 'cub_primordial');
  assert.ok(g.name.length >= 2 && g.emoji);
  assert.ok(g.bornLine.length >= 12);
  assert.ok(Number.isFinite(lib.SciFusionStore.GRAND_COST) && lib.SciFusionStore.GRAND_COST > 0);
});

test('canFuseGrand：六隻稚靈未集滿 → 不可、回報缺幾隻', () => {
  const lib = makeSandbox();
  const fstate = lib.SciFusionStore.load();
  fstate.hatched = allCubsHatched(lib).slice(0, 5);
  const gate = lib.SciFusionStore.canFuseGrand(fstate);
  assert.equal(gate.ok, false);
  assert.equal(gate.missing, 1);
  assert.ok(gate.reasons.includes('cubs:1'));
});

test('canFuseGrand：六隻集滿且未誕生 → ok', () => {
  const lib = makeSandbox();
  const fstate = lib.SciFusionStore.load();
  fstate.hatched = allCubsHatched(lib);
  const gate = lib.SciFusionStore.canFuseGrand(fstate);
  assert.equal(gate.ok, true);
  assert.deepEqual(gate.reasons, []);
});

test('fuseGrand：集滿後扣 GRAND_COST 晶能、保證成功、標記 grandBorn', () => {
  const lib = makeSandbox();
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 100 }));
  const fstate = lib.SciFusionStore.load();
  fstate.hatched = allCubsHatched(lib);
  const result = lib.SciFusionStore.fuseGrand(fstate);
  assert.equal(result.ok, true);
  assert.equal(result.result, 'success');
  assert.equal(result.grand.id, 'cub_primordial');
  assert.equal(fstate.grandBorn, true);
  assert.equal(lib.SciFusionStore.crystalBalance(), 0);
});

test('fuseGrand：晶能不足 → crystals，不標記', () => {
  const lib = makeSandbox();
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 99 }));
  const fstate = lib.SciFusionStore.load();
  fstate.hatched = allCubsHatched(lib);
  const result = lib.SciFusionStore.fuseGrand(fstate);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'crystals');
  assert.notEqual(fstate.grandBorn, true);
});

test('fuseGrand：已誕生不可重複、already-grand', () => {
  const lib = makeSandbox();
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 999 }));
  const fstate = lib.SciFusionStore.load();
  fstate.hatched = allCubsHatched(lib);
  fstate.grandBorn = true;
  const gate = lib.SciFusionStore.canFuseGrand(fstate);
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.includes('already-grand'));
  const result = lib.SciFusionStore.fuseGrand(fstate);
  assert.equal(result.ok, false);
  assert.equal(lib.SciFusionStore.crystalBalance(), 999, '不可重複扣費');
});

test('grandBorn 欄位 save/load round-trip、壞資料回退 false', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciFusionStore.load().grandBorn, false);
  const fstate = lib.SciFusionStore.load();
  fstate.grandBorn = true;
  lib.SciFusionStore.save(fstate);
  assert.equal(lib.SciFusionStore.load().grandBorn, true);
  lib.__setRaw('sci_fusion', JSON.stringify({ v: 1, grandBorn: 'yes' }));
  assert.equal(lib.SciFusionStore.load().grandBorn, false);
});

test('buildPrestigeData：四科精靈＋六稚靈誕生語＋總精通量，純正向不含 reset', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  const fstate = lib.SciFusionStore.load();
  fstate.hatched = allCubsHatched(lib);
  fstate.grandBorn = true;
  const data = lib.SciFusionStore.buildPrestigeData(fstate, state, { maxBox: 4 });
  assert.equal(data.grandBorn, true);
  assert.equal(data.spirits.length, 4);
  assert.equal(data.cubs.length, 6);
  assert.equal(data.cubCount, 6);
  for (const cub of data.cubs) assert.ok(cub.bornLine.length >= 12);
  // fusionReadyState 讓 nature/biology 各精通 100 → 總量至少 200
  assert.ok(data.totalMastered >= 200);
  assert.equal(data.grand.id, 'cub_primordial');
});

test('未揭曉前 preview 未知；revealPair 後看得見稚靈真身', () => {
  const lib = makeSandbox();
  const fstate = lib.SciFusionStore.load();
  assert.equal(lib.SciFusionStore.getFusionPreview(fstate, 'nature', 'biology').known, false);
  lib.SciFusionStore.revealPair(fstate, 'nature', 'biology');
  const preview = lib.SciFusionStore.getFusionPreview(fstate, 'biology', 'nature');
  assert.equal(preview.known, true);
  assert.equal(preview.cub.id, 'cub_forestdeer');
});

test('isRevealed：pairKey 順序無關、冪等', () => {
  const lib = makeSandbox();
  const fstate = lib.SciFusionStore.load();
  assert.equal(lib.SciFusionStore.isRevealed(fstate, 'nature', 'earth'), false);
  lib.SciFusionStore.revealPair(fstate, 'earth', 'nature');
  lib.SciFusionStore.revealPair(fstate, 'nature', 'earth');
  assert.equal(fstate.revealed.filter((key) => key === 'nature+earth').length, 1);
  assert.equal(lib.SciFusionStore.isRevealed(fstate, 'nature', 'earth'), true);
});

test('buildRevealQuestion：回合法四選一題；biology 可走 advanced、nature 走 fallback', () => {
  const lib = makeSandbox();
  const biology = JSON.parse(readFileSync(path.join(ROOT, 'data', 'biology.json'), 'utf8'));
  const nature = JSON.parse(readFileSync(path.join(ROOT, 'data', 'elementary.json'), 'utf8'));
  assert.equal(nature.filter((term) => term.advanced).length, 0);
  assert.ok(biology.some((term) => term.advanced));
  const result = lib.SciFusionStore.buildRevealQuestion('nature', 'biology', { nature, biology }, () => 0);
  assert.equal(result.subject, 'nature');
  assert.equal(result.question.options.length, 4);
  assert.ok(result.question.options.some((option) => option.id === result.question.answerId));
});

test('setActiveCub / clearActiveCub：只有擁有的稚靈能隨行', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const fstate = lib.SciFusionStore.load();
  lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { knowledgeCheckPassed: true, rng: okRng, today: '2026-07-20' });
  assert.equal(lib.SciFusionStore.setActiveCub(fstate, 'cub_starcore').reason, 'not-owned');
  assert.equal(lib.SciFusionStore.setActiveCub(fstate, 'cub_forestdeer').ok, true);
  assert.equal(fstate.activeCub, 'cub_forestdeer');
  lib.SciFusionStore.clearActiveCub(fstate);
  assert.equal(fstate.activeCub, '');
});

test('cubBattleMods：無隨行＝全 0；隨行＝溫和固定值且 atk 不超過 5', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const fstate = lib.SciFusionStore.load();
  lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { knowledgeCheckPassed: true, rng: okRng, today: '2026-07-20' });
  assert.deepEqual(lib.SciFusionStore.cubBattleMods(fstate), { atk: 0, leech: 0, leechChance: 0 });
  lib.SciFusionStore.setActiveCub(fstate, 'cub_forestdeer');
  const mods = lib.SciFusionStore.cubBattleMods(fstate);
  assert.ok(mods.atk > 0 && mods.atk <= 5);
  assert.ok(mods.leech >= 0 && mods.leechChance >= 0);
});

test('composeNickname / setNickname：只收預設詞庫組合、空字串清除、擋自由輸入', () => {
  const lib = makeSandbox();
  const fstate = metaWithForestdeer(lib);
  const nickname = lib.SciFusionStore.composeNickname(0, 0);
  assert.ok(nickname.length >= 2);
  assert.equal(lib.SciFusionStore.setNickname(fstate, 'cub_forestdeer', nickname).ok, true);
  assert.equal(lib.SciFusionStore.listCubs(fstate)[0].displayName, nickname);
  assert.equal(lib.SciFusionStore.setNickname(fstate, 'cub_forestdeer', '任意自由字').reason, 'not-allowed');
  assert.equal(lib.SciFusionStore.setNickname(fstate, 'cub_forestdeer', '').ok, true);
  assert.equal(lib.SciFusionStore.listCubs(fstate)[0].displayName, '森靈鹿');
  assert.equal(lib.SciFusionStore.setNickname(fstate, 'cub_starcore', nickname).reason, 'not-owned');
});

test('buildCubCardData：含雙親科目中文名、稚靈計數、段位稱號', () => {
  const lib = makeSandbox();
  const fstate = metaWithForestdeer(lib);
  const data = lib.SciFusionStore.buildCubCardData(fstate, 'cub_forestdeer', { rankLabel: '進階英雄' });
  assert.equal(data.name, '森靈鹿');
  assert.deepEqual(data.parents.map((parent) => parent.key), ['nature', 'biology']);
  assert.equal(data.parents[0].label, '國小自然');
  assert.equal(data.cubCount, 1);
  assert.equal(data.rankLabel, '進階英雄');
  assert.equal(lib.SciFusionStore.buildCubCardData(fstate, 'cub_starcore', {}), null);
});

test('融合坊靜態接線：入口、overlay、六格 class 與模組腳本順序齊全', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const appSource = readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const css = readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  assert.match(html, /id="fusion-lab-btn"/);
  assert.match(html, /id="fusion-overlay"[^>]*hidden/);
  assert.match(html, /id="fusion-crystal-balance"/);
  assert.ok(html.indexOf('js/battle.js') < html.indexOf('js/fusion-store.js'));
  assert.ok(html.indexOf('js/fusion-store.js') < html.indexOf('js/app.js'));
  assert.match(appSource, /function openFusionLab\(/);
  assert.match(appSource, /function renderFusionLab\(/);
  assert.match(appSource, /fusion-pair-card/);
  assert.match(css, /\.fusion-overlay/);
  assert.match(css, /\.fusion-pair-grid/);
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

test('E2：段位條採歷史最高進度，只升不降且不顯示落後懲罰', () => {
  const lib = makeSandbox();
  const state = { rank: { pts: 230, peak: 260, shieldWk: null } };
  const info = lib.SciBattle.rankInfo(state);
  assert.equal(info.pts, 260);
  assert.equal(info.name, '金牌學者');
  assert.equal(info.next.at - info.pts, 190);
});

test('G13：PvE 傳奇科學家段位分封頂，不再無限累加', () => {
  const lib = makeSandbox();
  const state = { rank: { pts: 995, peak: 995, shieldWk: null } };
  const result = lib.SciBattle.rankWin(state);
  assert.equal(result.pts, 1000);
  assert.equal(result.peak, 1000);
  assert.equal(result.next, null);
  assert.equal(lib.SciBattle.rankWin(state).pts, 1000);
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
  assert.equal(lib.SciBattle.companionFor(100).next.at, 200);
  assert.equal(lib.SciBattle.companionFor(200).name, '星靈・典藏');
  assert.equal(lib.SciBattle.companionFor(200).next, null, '典藏態不應該還有下一階');
  assert.equal(lib.SciBattle.companionFor(200).atk, lib.SciBattle.companionFor(100).atk);
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
  assert.deepEqual(s, { v: 1, placements: {}, styles: {}, plaques: {}, celebrated: [], researchDonations: 0 });
  s.placements['d-bio_001'] = { x: 30, y: 60 };
  assert.equal(B.saveBase(s), true);
  assert.deepEqual(B.loadBase().placements, { 'd-bio_001': { x: 30, y: 60 } });

  const bad = makeSandbox({ sci_base: '{"placements"' });
  assert.deepEqual(bad.SciBaseStore.loadBase(), bad.SciBaseStore.defaultBase(), '壞 JSON 退回預設');
  const partial = makeSandbox({ sci_base: '{"styles":{"nature":{"owned":[0,1],"active":1}}}' }).SciBaseStore.loadBase();
  assert.deepEqual(partial.styles.nature, { owned: [0, 1], active: 1 });
  assert.deepEqual([partial.celebrated, partial.v], [[], 1], '缺欄位補齊');
});

test('R5 研究捐獻可重複累加且每次正確扣除 50 晶能', () => {
  const lib = makeSandbox();
  const base = lib.SciBaseStore.defaultBase();
  lib.SciEconomy.earnCrystals(100, 'battleWin');
  assert.deepEqual(lib.SciBaseStore.donateResearch(base), { ok: true, balance: 50, donations: 1, spent: 50 });
  assert.deepEqual(lib.SciBaseStore.donateResearch(base), { ok: true, balance: 0, donations: 2, spent: 50 });
  const failed = lib.SciBaseStore.donateResearch(base);
  assert.equal(failed.ok, false);
  assert.equal(base.researchDonations, 2, '扣款失敗不得增加捐獻');
  assert.equal(lib.SciEconomy.getBalance(), 0);
  assert.match(readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8'), /\['🔭 研究捐獻', `\$\{researchDonations\} 次`\]/);
});

// 造一個指定卡片精通狀態的 state：ids 內的卡全推到 box 4（wrong 可指定）
function stateWithMastered(lib, ids, wrong = 0) {
  const state = lib.SciStore.load();
  for (const id of ids) lib.SciStore.setCard(state, id, { box: 4, due: 0, seen: 5, wrong });
  return state;
}

test('SciBaseStore.STAGES 門檻延伸至 400，mainStage 正確分階', () => {
  const B = makeSandbox().SciBaseStore;
  assert.deepEqual(B.STAGES.map((s) => s[0]), [0, 1, 10, 30, 80, 120, 200, 300, 400], '門檻必須對齊 app.js RANK_TIERS');
  assert.deepEqual(B.STAGES.map((s) => s[1]), ['見習營帳', '初階研究站', '進階實驗樓', '資深研究院', '領域總部', '學者研究院', '科學殿堂', '宗師天文臺', '科學典藏館']);
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
    { icon: '📅', label: '累計天數', value: '7 天' },
  ]);
  assert.ok(html.includes('金牌學者') && html.includes('9 題') && html.includes('成就牆'));
  assert.ok(!html.includes('還差'), '成就牆只陳列不催促（白帽）');
});

test('SciBaseUI.rankWallHtml 依歷史最高段位點亮徽章並列出賽季稱號', () => {
  const lib = makeSandbox();
  const html = lib.SciBaseUI.rankWallHtml({ rank: { pts: 120, peak: 260 }, rtSeason: { titles: { '2026-06': '銀河研究員' } } });
  assert.match(html, /銅牌探索者/);
  assert.match(html, /金牌學者/);
  assert.match(html, /is-lit/);
  assert.match(html, /銀河研究員/);
});

test('守護者、四科精靈與稚靈美術槽都使用指定路徑並具 emoji onerror fallback', () => {
  const battle = readFileSync(path.join(ROOT, 'js', 'battle.js'), 'utf8');
  const app = readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(battle, /assets\/battle\/foe-\$\{opponent\.id\}\.png/);
  assert.match(battle, /onerror="this\.replaceWith/);
  assert.match(app, /assets\/fusion\/cub-\$\{assetId\}\.png/);
  assert.match(app, /onerror="this\.replaceWith/);
  assert.match(battle, /assets\/battle\/sprite-\$\{subjectKey\}-s\$\{artLevel\}\.png/);
  assert.match(battle, /Math\.min\(companion\.level, 5\)/);
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

test('科學市集瀏覽 UI 靜態接線：overlay、透明規則、六卡與 SHAPI 單一出口', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ui = readFileSync(path.join(ROOT, 'js/market-ui.js'), 'utf8');
  assert.match(html, /id="btn-market"/);
  assert.match(html, /id="mkt-overlay"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="mkt-rules"/);
  assert.match(ui, /不可兌換現實金錢或禮物/);
  assert.match(ui, /精靈與稚靈是夥伴，不是商品/);
  assert.match(ui, /SHAPI\.call\('\/api\/mkt'/);
  assert.doesNotMatch(ui, /\bfetch\s*\(/);
  assert.ok(html.indexOf('js/market-store.js') < html.indexOf('js/market-ui.js'));
  assert.ok(html.indexOf('js/market-ui.js') < html.indexOf('js/app.js'));
});

test('SciBattle.applyWrongAnswer：護目鏡保留一次連擊，扣血照常', () => {
  const lib = makeSandbox();
  const state = { pHp: 100, oHp: 100, combo: 3, shieldLeft: 1, log: '' };
  lib.SciBattle.applyWrongAnswer(state);
  assert.deepEqual({ combo: state.combo, shieldLeft: state.shieldLeft, pHp: state.pHp }, { combo: 3, shieldLeft: 0, pHp: 92 });
  lib.SciBattle.applyWrongAnswer(state);
  assert.equal(state.combo, 0);
});

test('科學市集交易 UI 靜態接線：上架全下拉、小卡、錢包、claims 與 PvE 攜帶', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ui = readFileSync(path.join(ROOT, 'js/market-ui.js'), 'utf8');
  const battle = readFileSync(path.join(ROOT, 'js/battle.js'), 'utf8');
  assert.match(html, /id="mkt-sell"/);
  assert.match(html, /id="mkt-sell-item"[^>]*select|<select id="mkt-sell-item"/);
  assert.doesNotMatch(html, /id="mkt-sell-price"[^>]*type="(?:text|number)"/);
  assert.match(html, /id="mkt-card-choice"/);
  assert.match(html, /id="mkt-wallet-actions"/);
  assert.match(html, /id="mkt-claims"/);
  assert.match(ui, /payLocal[\s\S]*callMkt\(\{ op: 'deposit'/);
  assert.match(ui, /refundLocal/);
  assert.match(battle, /bat-carry/);
  assert.match(battle, /takeCarry/);
});

test('科學市集社交收藏：達人榜只取前五、曾經持有分頁保留售予／購自', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ui = readFileSync(path.join(ROOT, 'js/market-ui.js'), 'utf8');
  assert.match(html, /id="mkt-tab-stars"/);
  assert.match(html, /id="mkt-tab-ever"/);
  assert.match(html, /id="mkt-stars-pane"/);
  assert.match(html, /id="mkt-ever-pane"/);
  assert.match(ui, /op: 'stars'/);
  assert.match(ui, /\.slice\(0, 5\)/);
  assert.match(ui, /getEver\(\)/);
  assert.match(ui, /售予/);
  assert.match(ui, /購自/);
});

test('D-H 收尾 UI 靜態接線：可見晶能、使命、主攻、里程碑、新手、旅程、博物館與休息提醒', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const app = readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const battle = readFileSync(path.join(ROOT, 'js', 'battle.js'), 'utf8');
  const board = readFileSync(path.join(ROOT, 'js', 'leaderboard.js'), 'utf8');
  const css = readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  assert.match(app, /energy-gain-pop/);
  assert.match(battle, /守護科學的知識之火/);
  assert.match(app, /本週想主攻/);
  assert.match(board, /classboard-milestone/);
  assert.match(html, /data-onboard-check="flashcard"/);
  assert.match(html, /id="return-review-hint"/);
  assert.match(html, /id="journey-btn"/);
  assert.match(app, /融合博物館/);
  assert.match(app, /休息一下、看看遠方，保護眼睛/);
  assert.match(css, /@keyframes fusion-hatch/);
  assert.ok(html.indexOf('js/ui-logic.js') < html.indexOf('js/leaderboard.js'));
});
