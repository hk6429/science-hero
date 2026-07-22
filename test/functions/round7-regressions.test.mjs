import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = (file) => readFileSync(path.join(ROOT, file), 'utf8');

function loadAppHarness() {
  const storage = {};
  const loreUnlocks = [];
  const makeNode = () => ({
    className: '', innerHTML: '', textContent: '', hidden: false, style: {},
    classList: { add() {}, toggle() {} },
    setAttribute() {}, addEventListener() {}, appendChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0 }),
  });
  const document = {
    body: { appendChild() {} }, documentElement: {}, activeElement: null,
    addEventListener() {}, removeEventListener() {}, createElement: makeNode,
    querySelector: () => null, querySelectorAll: () => [],
  };
  const localStorage = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value); },
    removeItem: (key) => { delete storage[key]; },
  };
  const context = vm.createContext({
    console, Date, Math, JSON, Map, Set, Blob, URL, URLSearchParams,
    document, localStorage, alert() {}, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (fn) => fn(), setTimeout: () => 1, clearTimeout() {},
    setInterval: () => 1, clearInterval() {},
  });
  context.window = context;
  context.window.scrollY = 0;
  context.window.scrollBy = () => {};
  context.window.scrollTo = () => {};
  context.navigator = { clipboard: null };
  context.SciEconomy = { EARN_TABLE: { master: 5 }, onAnswer: () => ({ earned: 0 }), earnCrystals() {}, getBalance: () => 0 };
  context.SciScienceRewards = {
    hashSeed: () => 1, mulberry32: () => () => 1,
    triggerSurprise: () => ({ hit: false }), unlockedLore: () => [],
    unlockForMasteredUnit(state, cards, subject, unit, terms, maxBox) {
      const unitTerms = terms.filter((term) => term.unit === unit);
      if (!unitTerms.length || !unitTerms.every((term) => (state.cards?.[term.id]?.box || 0) >= maxBox)) return null;
      const card = cards.find((entry) => entry.subject === subject && entry.unit === unit);
      state.stats.scienceLore = state.stats.scienceLore || [];
      if (!card || state.stats.scienceLore.includes(card.id)) return null;
      state.stats.scienceLore.push(card.id);
      loreUnlocks.push(card.id);
      return card;
    },
  };
  context.SciBaseStore = { STAGES: [] };
  context.SciBattle = {
    masteredBySubject: () => ({}),
    subjectOfId(id) {
      const prefix = String(id).match(/^([a-z]+)/)?.[1];
      return ({ e: 'nature', b: 'biology', pc: 'chemphys', d: 'earth' })[prefix] || null;
    },
  };
  context.SciFusionStore = { CUBS: [], load: () => ({ collection: [] }) };

  const appSource = source('js/app.js').replace(
    'return { boot };',
    `return { boot, __round7: {
      recordAnswer, masteredCardCount,
      setState(value) { state = value; }, getState() { return state; },
      setLearningData(nextTerms, nextLore, subject = 'nature') {
        terms = nextTerms; scienceLore = nextLore; activeSubject = subject;
        subjectTerms.set(subject, nextTerms);
      },
      setSubjectTerms(subject, nextTerms) {
        subjectTerms.set(subject, nextTerms);
      }
    } };`,
  );
  vm.runInContext(
    `${['js/store.js', 'js/flashcard.js', 'js/weak.js', 'js/ui-logic.js', 'js/daily-quests.js'].map(source).join('\n;\n')}\n;\n${appSource}\nglobalThis.__app = SciApp.__round7;`,
    context,
  );
  return { app: context.__app, loreUnlocks };
}

test('A：連線對戰逾時不降精熟、只排早與低權記錄；真實選錯仍歸零', () => {
  const ui = source('js/rtbattle-ui.js');
  assert.match(ui, /answerSolo\(null,[\s\S]*?ctx\.recordAnswer\?\.\(target, correct, elapsedMs, SciQuiz\.questionContentLength\(q\), id === null \? 'timeout'/);
  assert.match(ui, /answer\(null,[\s\S]*?ctx\.recordAnswer\?\.\(target, correct, elapsedMs, SciQuiz\.questionContentLength\(q\), chosenId === null \? 'timeout'/);

  const { app: timeoutApp } = loadAppHarness();
  const future = Date.now() + 14 * 86400000;
  const timeoutState = {
    cards: { mastered: { box: 4, due: future, seen: 8, wrong: 0 } },
    stats: { streakDays: 0, lastActiveDate: null, totalReviews: 5 },
  };
  timeoutApp.setState(timeoutState);
  const masteredBefore = timeoutApp.masteredCardCount();
  timeoutApp.recordAnswer({ id: 'mastered', unit: 'life' }, false, 15000, 20, 'timeout');
  assert.equal(timeoutState.cards.mastered.box, 4, '逾時未作答不得讓 box4 歸零');
  assert.equal(timeoutApp.masteredCardCount(), masteredBefore, '逾時未作答不得讓精通數倒退');
  assert.ok(timeoutState.cards.mastered.due < future, '逾時未作答只應提早安排複習');
  assert.equal(timeoutState.weakLog.at(-1).source, 'timeout');
  assert.equal(timeoutState.weakLog.at(-1).guessed, false);
  assert.equal(timeoutState.weakLog.at(-1).correct, false);

  const weakApi = (() => {
    const context = vm.createContext({ console, Date, Math, JSON });
    vm.runInContext(`${source('js/weak.js')}\nglobalThis.__weak = SciWeak;`, context);
    return context.__weak;
  })();
  assert.equal(weakApi.getWeakTerms(timeoutState, 10)[0].score, 0.5, '逾時弱點增幅最多 0.5');

  const { app: wrongApp } = loadAppHarness();
  const wrongState = {
    cards: { mastered: { box: 4, due: future, seen: 8, wrong: 0 } },
    stats: { streakDays: 0, lastActiveDate: null, totalReviews: 5 },
  };
  wrongApp.setState(wrongState);
  wrongApp.recordAnswer({ id: 'mastered', unit: 'life' }, false, 3000, 20, 'pvp');
  assert.equal(wrongState.cards.mastered.box, 0, '學生真的選錯仍須依 Leitner 歸零');
});

test('B：對戰攻下單元最後一張時靜默解鎖科學史，且自測仍保留慶祝出口', () => {
  const { app, loreUnlocks } = loadAppHarness();
  const terms = [
    { id: 'life-mastered', unit: 'life' },
    { id: 'life-last', unit: 'life' },
  ];
  const lore = [{ id: 'lore-life', subject: 'nature', unit: 'life' }];
  const state = {
    cards: {
      'life-mastered': { box: 4, due: Date.now() + 86400000, seen: 8, wrong: 0 },
      'life-last': { box: 3, due: 0, seen: 4, wrong: 0 },
    },
    stats: { streakDays: 0, lastActiveDate: null, totalReviews: 9, scienceLore: [], celebratedUnits: [] },
  };
  app.setLearningData(terms, lore, 'nature');
  app.setState(state);

  const result = app.recordAnswer(terms[1], true, 2200, 20, 'battle');
  assert.equal(state.cards['life-last'].box, 4, 'PvE 客觀答對應攻下最後一張精通卡');
  assert.deepEqual(Array.from(state.stats.scienceLore), ['lore-life']);
  assert.deepEqual(Array.from(state.stats.celebratedUnits), ['nature:life']);
  assert.equal(result.milestoneUnit, 'life', 'recordAnswer 應回報本次新解鎖，供自測 UI 顯示慶祝');
  assert.equal(loreUnlocks.length, 1);

  app.recordAnswer(terms[1], true, 2200, 20, 'pvp');
  assert.equal(loreUnlocks.length, 1, '同一單元不得重複解鎖');
  assert.equal(state.stats.scienceLore.length, 1);

  const { app: rtApp } = loadAppHarness();
  const rtState = {
    cards: {
      'life-mastered': { box: 4, due: Date.now() + 86400000, seen: 8, wrong: 0 },
      'life-last': { box: 3, due: 0, seen: 4, wrong: 0 },
    },
    stats: { streakDays: 0, lastActiveDate: null, totalReviews: 9, scienceLore: [], celebratedUnits: [] },
  };
  rtApp.setLearningData(terms, lore, 'nature');
  rtApp.setState(rtState);
  rtApp.recordAnswer(terms[1], true, 2200, 20, 'quiz');
  assert.deepEqual(Array.from(rtState.stats.scienceLore), ['lore-life'], '連線對戰的客觀 quiz source 也須解鎖');
  assert.equal(rtState.stats.scienceLore.length, 1, '首頁已點亮計數應增加 1');

  const appSource = source('js/app.js');
  const settle = appSource.slice(appSource.indexOf('function settleAnswer'), appSource.indexOf('// ================= 弱點清單'));
  const flash = appSource.slice(appSource.indexOf('function answerFlash'), appSource.indexOf('// ================= 自測'));
  assert.match(settle, /const \{ milestoneUnit \} = recordAnswer\([\s\S]*if \(milestoneUnit\)[\s\S]*renderMilestone/);
  assert.match(flash, /checkUnitMilestone\(t\.unit,\s*SciBattle\.subjectOfId\?\.\(t\.id\)\s*\|\|\s*activeSubject\)[\s\S]*renderMilestone/, '閃卡既有慶祝路徑不可退化');
});

test('B2：融合坊跨科答對最後一張時依題目科別解鎖里程碑', () => {
  const { app, loreUnlocks } = loadAppHarness();
  const biologyTerms = [
    { id: 'b-life-mastered', unit: 'cell' },
    { id: 'b-life-last', unit: 'cell' },
  ];
  const earthTerms = [{ id: 'd-active', unit: 'geology' }];
  const lore = [{ id: 'lore-biology-cell', subject: 'biology', unit: 'cell' }];
  const today = new Date().toISOString().slice(0, 10);
  const state = {
    cards: {
      'b-life-mastered': { box: 4, due: Date.now() + 86400000, seen: 8, wrong: 0 },
      'b-life-last': { box: 3, due: 0, seen: 4, wrong: 0 },
    },
    stats: {
      streakDays: 0, lastActiveDate: null, totalReviews: 9, scienceLore: [], celebratedUnits: [],
      dailyQuests: { date: today, correct: 0, battleWin: 0, unitProgress: 0, subjectCorrect: 0, subject: 'nature', claimed: [] },
    },
  };
  app.setLearningData(earthTerms, lore, 'earth');
  app.setSubjectTerms('biology', biologyTerms);
  app.setState(state);

  const result = app.recordAnswer(biologyTerms[1], true, 2200, 20, 'fusion');

  assert.equal(result.milestoneUnit, 'cell');
  assert.deepEqual(Array.from(state.stats.celebratedUnits), ['biology:cell']);
  assert.deepEqual(Array.from(state.stats.scienceLore), ['lore-biology-cell']);
  assert.ok(state.stats.dailyQuests.unitProgress > 0, '跨科完成單元須即時送出 unitProgress');
  assert.deepEqual(loreUnlocks, ['lore-biology-cell']);
});

test('C：連線 PvP 戰後解說會渲染詞條 def，不留下空白定義', () => {
  const context = vm.createContext({ console, Date, Math, JSON, setTimeout, clearTimeout, setInterval, clearInterval });
  vm.runInContext(`${source('js/rtbattle-ui.js')}\nglobalThis.__rtui = SciRtBattleUI;`, context);
  const html = context.__rtui.feedbackHtml({ term: '細胞膜', def: '控制物質進出細胞的構造' }, false);
  assert.match(html, /細胞膜：控制物質進出細胞的構造/);
  assert.doesNotMatch(html, /細胞膜：<\/p>/);
});

test('D：連線對戰答對與答錯回饋 class 都有對應的中性綠紅卡片樣式', () => {
  const context = vm.createContext({ console, Date, Math, JSON, setTimeout, clearTimeout, setInterval, clearInterval });
  vm.runInContext(`${source('js/rtbattle-ui.js')}\nglobalThis.__rtui = SciRtBattleUI;`, context);
  assert.match(context.__rtui.feedbackHtml({ term: '蒸發', def: '液體變成氣體' }, true), /class="card correct"/);
  assert.match(context.__rtui.feedbackHtml({ term: '凝結', def: '氣體變成液體' }, false), /class="card wrong"/);

  const css = source('css/style.css');
  assert.match(css, /\.card\.correct\s*\{/);
  assert.match(css, /\.card\.wrong\s*\{/);
});

test('E：即時對戰以 code 報到後，班級市集可讀成 classCode 並放行', () => {
  const raw = {};
  const localStorage = {
    getItem: (key) => (key in raw ? raw[key] : null),
    setItem: (key, value) => { raw[key] = String(value); },
    removeItem: (key) => { delete raw[key]; },
  };
  const context = vm.createContext({ localStorage, console, Date, Math, JSON, window: {} });
  vm.runInContext(
    `${source('js/store.js')}\n;\n${source('js/economy.js')}\n;\n${source('js/rtbattle.js')}\n;\n${source('js/market-store.js')}\n` +
    'globalThis.__modules = { SciRtBattle, SciMarketStore };',
    context,
  );

  context.__modules.SciRtBattle.saveClass({ code: '701A', nick: '好奇的電子01' });
  const info = JSON.parse(JSON.stringify(context.__modules.SciMarketStore.classInfo()));
  assert.deepEqual(info, { classCode: '701A', nick: '好奇的電子01' });

  raw.sci_class = JSON.stringify({ classCode: '802B', nick: '沉穩的石英' });
  assert.deepEqual(JSON.parse(JSON.stringify(context.__modules.SciMarketStore.classInfo())), { classCode: '802B', nick: '沉穩的石英' }, '既有 classCode 格式仍須相容');
});
