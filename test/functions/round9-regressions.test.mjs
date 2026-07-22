import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = (file) => readFileSync(path.join(ROOT, file), 'utf8');

function loadAppHarness({ surpriseResult = { hit: false } } = {}) {
  const storage = {};
  const appended = [];
  const elements = new Map();
  const makeNode = () => ({
    className: '', innerHTML: '', textContent: '', hidden: false, open: false, value: '', style: {}, _listeners: {},
    classList: { add() {}, toggle() {} },
    setAttribute() {}, addEventListener(event, listener) { this._listeners[event] = listener; },
    appendChild() {}, insertBefore() {}, remove() {}, click() {},
    querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0 }),
  });
  const document = {
    body: { appendChild: (node) => appended.push(node) },
    documentElement: {}, activeElement: null,
    addEventListener() {}, execCommand() {}, createElement: makeNode,
    querySelector: (selector) => elements.get(selector) || null,
    querySelectorAll: () => [],
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
  context.SciEconomy = {
    EARN_TABLE: { master: 3 },
    onAnswer: () => ({ earned: 0 }), earnCrystals: () => ({ earned: 0 }), getBalance: () => 0,
  };
  context.SciScienceRewards = {
    hashSeed: () => 1, mulberry32: () => () => 1,
    triggerSurprise: () => surpriseResult, unlockedLore: () => [], unlockForMasteredUnit: () => null,
  };
  context.SciBaseStore = { STAGES: [] };
  context.SciBattle = { masteredBySubject: () => ({}) };
  context.SciFusionStore = { CUBS: [], load: () => ({ collection: [] }) };

  const appSource = source('js/app.js').replace(
    'return { boot };',
    `return { boot, __round9: {
      recordAnswer, wireIoButtons, renderOnboarding,
      setState(value) { state = value; }, getState() { return state; }
    } };`,
  );
  vm.runInContext(
    `${['js/store.js', 'js/flashcard.js', 'js/weak.js', 'js/ui-logic.js', 'js/daily-quests.js'].map(source).join('\n;\n')}\n;\n${appSource}\nglobalThis.__app = SciApp.__round9;`,
    context,
  );
  return { app: context.__app, storage, appended, elements, makeNode };
}

function loadProgressSandbox(seed = {}) {
  const storage = Object.fromEntries(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  const localStorage = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value); },
    removeItem: (key) => { delete storage[key]; },
  };
  const context = vm.createContext({ localStorage, console, Date, Math, JSON, Map, Set, window: {} });
  vm.runInContext(
    `${['js/store.js', 'js/flashcard.js', 'js/economy.js', 'js/fusion-store.js', 'js/base-store.js', 'js/market-store.js'].map(source).join('\n;\n')}\n` +
    'globalThis.__progress = { SciStore, SciEconomy, SciFusionStore, SciBaseStore, SciMarketStore };',
    context,
  );
  return { modules: context.__progress, storage };
}

function loadSoloHarness() {
  const storage = {};
  const localStorage = {
    getItem: (key) => storage[key] ?? null,
    setItem: (key, value) => { storage[key] = String(value); },
    removeItem: (key) => { delete storage[key]; },
  };
  const nodes = new Map();
  let optionNodes = [];
  const makeNode = (id = '') => ({
    id, dataset: {}, disabled: false, _listeners: {},
    addEventListener(event, fn) { this._listeners[event] = fn; },
  });
  const root = {
    isConnected: true,
    _html: '',
    set innerHTML(value) {
      this._html = value;
      nodes.clear();
      optionNodes = [];
      for (const id of value.matchAll(/id="([^"]+)"/g)) nodes.set(`#${id[1]}`, makeNode(id[1]));
      for (const match of value.matchAll(/class="quiz-option" data-id="([^"]+)"/g)) {
        const node = makeNode();
        node.dataset.id = match[1];
        optionNodes.push(node);
      }
    },
    get innerHTML() { return this._html; },
    querySelector: (selector) => nodes.get(selector) || null,
    querySelectorAll: (selector) => selector === '.quiz-option' ? optionNodes : [],
  };
  const fixedMath = Object.create(Math);
  fixedMath.random = () => 0;
  const context = vm.createContext({
    localStorage, console, Date, Math: fixedMath, JSON, Map, Set,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    navigator: { clipboard: null }, SHAPI: { call: async () => ({ ok: 0, error: 'offline' }) },
  });
  vm.runInContext(
    `${['js/store.js', 'js/quiz.js', 'js/economy.js', 'js/battle.js', 'js/rtbattle.js', 'js/rtbattle-ui.js'].map(source).join('\n;\n')}\n` +
    'globalThis.__solo = { SciRtBattle, SciRtBattleUI };',
    context,
  );
  const pool = [
    { id: 'a', term: '細胞膜', def: '控制物質進出細胞的構造', unit: 'cell', distractor_pool: 'cell' },
    { id: 'b', term: '細胞核', def: '含有遺傳物質的構造', unit: 'cell', distractor_pool: 'cell' },
    { id: 'c', term: '粒線體', def: '進行呼吸作用的構造', unit: 'cell', distractor_pool: 'cell' },
    { id: 'd', term: '葉綠體', def: '進行光合作用的構造', unit: 'cell', distractor_pool: 'cell' },
  ];
  const answers = [];
  context.__solo.SciRtBattleUI.mount(root, {
    pool, scope: { subject: 'biology' }, masteredCardCount: 0,
    recordAnswer(target, correct) { answers.push({ target, correct }); },
  });
  nodes.get('#rt-challenge-create')._listeners.click();
  const expected = context.__solo.SciRtBattle.buildQuestions(0, pool)[0];
  return { root, options: optionNodes, expected, pool, answers };
}

test('A：到期客觀複習可完成每日詞卡任務，精熟卡也不會卡死 ALL_CLEAR', () => {
  const today = new Date().toISOString().slice(0, 10);
  const daily = () => ({
    date: today, correct: 9, battleWin: 1, unitProgress: 0,
    subjectCorrect: 0, subject: 'nature', claimed: [],
  });

  const middle = loadAppHarness();
  const middleState = {
    cards: { middle: { box: 2, due: 0, seen: 3, wrong: 0 } },
    stats: { streakDays: 0, lastActiveDate: null, totalReviews: 3, dailyQuests: daily() },
  };
  middle.app.setState(middleState);
  middle.app.recordAnswer({ id: 'middle', unit: 'life' }, true, 2000, 20, 'quiz');
  assert.equal(middleState.cards.middle.box, 3);
  assert.equal(middleState.stats.dailyQuests.unitProgress, 1, '中期到期卡升盒仍應完成任務');

  const mastered = loadAppHarness();
  const masteredState = {
    cards: { mastered: { box: 4, due: 0, seen: 8, wrong: 0 } },
    stats: { streakDays: 0, lastActiveDate: null, totalReviews: 8, dailyQuests: daily() },
  };
  mastered.app.setState(masteredState);
  mastered.app.recordAnswer({ id: 'mastered', unit: 'life' }, true, 2000, 20, 'battle');
  assert.equal(masteredState.cards.mastered.box, 4);
  assert.equal(masteredState.stats.dailyQuests.unitProgress, 1, 'box4 到期客觀複習也應完成任務');
  assert.ok(masteredState.stats.dailyQuests.claimed.includes('allClear'), '三個核心任務完成後應可領 ALL_CLEAR');

  const waiting = loadAppHarness();
  const futureDue = Date.now() + 86400000;
  const waitingState = {
    cards: { waiting: { box: 4, due: futureDue, seen: 8, wrong: 0 } },
    stats: { streakDays: 0, lastActiveDate: null, totalReviews: 8, dailyQuests: daily() },
  };
  waiting.app.setState(waitingState);
  waiting.app.recordAnswer({ id: 'waiting', unit: 'life' }, true, 2000, 20, 'quiz');
  assert.equal(waitingState.cards.waiting.due, futureDue);
  assert.equal(waitingState.stats.dailyQuests.unitProgress, 0, '未到期精熟卡當日重答不得刷任務');
  assert.ok(!waitingState.stats.dailyQuests.claimed.includes('allClear'));
});

test('B1：version 2 匯出檔可完整還原核心與四個養成 store', () => {
  const cubId = 'cub_forestdeer';
  const original = {
    sci_econ: { v: 1, balance: 80, daily: { date: '2026-07-22', earned: 20 }, combo: 2, bestCombo: 5 },
    sci_fusion: { v: 1, hatched: [cubId], nicknames: { [cubId]: '小寶' }, revealed: ['nature+biology'], failStreak: 0, lastFuseDate: '2026-07-22', fuseCount: 1, activeCub: cubId, grandBorn: false },
    sci_base: { v: 1, placements: { 'd-card-1': { x: 20, y: 30 } }, styles: {}, plaques: {}, celebrated: ['stage-1'], researchDonations: 2 },
    sci_market: { inv: { energy: 2 }, claims: [], buys: { date: '2026-07-22', n: 1 }, ever: [], carry: 'energy' },
  };
  const { modules: m } = loadProgressSandbox(original);
  const core = { cards: { term: { box: 3, due: 10, seen: 4, wrong: 1 } }, stats: { totalReviews: 4 } };
  const exported = m.SciStore.exportState(core);
  const container = JSON.parse(exported);
  assert.equal(container.version, 2);
  assert.equal(container.core.cards.term.box, 3);
  assert.equal(container.econ.balance, 80);
  assert.deepEqual(Array.from(container.fusion.hatched), [cubId]);
  assert.equal(container.base.placements['d-card-1'].x, 20);
  assert.equal(container.market.inv.energy, 2);

  m.SciEconomy.spendCrystals(30, 'test');
  m.SciFusionStore.save(m.SciFusionStore.defaults());
  m.SciBaseStore.saveBase(m.SciBaseStore.defaultBase());
  m.SciMarketStore.removeItem('energy');
  const restoredCore = m.SciStore.importState(exported);

  assert.equal(restoredCore.cards.term.box, 3);
  assert.equal(m.SciEconomy.getBalance(), 80);
  assert.deepEqual(Array.from(m.SciFusionStore.load().hatched), [cubId]);
  assert.equal(m.SciBaseStore.loadBase().placements['d-card-1'].x, 20);
  assert.equal(m.SciMarketStore.getInv().energy, 2);
});

test('B2：version 2 匯入沿用各養成 store 的白名單與數量 clamp', () => {
  const { modules: m } = loadProgressSandbox();
  const cubIds = Array.from(m.SciFusionStore.CUBS, (cub) => cub.id);
  const malicious = {
    version: 2,
    core: { cards: { forged: { box: 99, due: 5, seen: -2, wrong: -1 } }, stats: { totalReviews: 1 } },
    econ: { balance: Number.MAX_SAFE_INTEGER, daily: { date: '2026-07-22', earned: 9999 }, combo: -4, bestCombo: -1 },
    fusion: {
      hatched: [...cubIds, cubIds[0], 'cub_unknown'],
      nicknames: { [cubIds[0]]: '任意暱稱', cub_unknown: '小寶' },
      revealed: ['nature+biology', 'unknown+pair'], failStreak: -5,
      lastFuseDate: 123, fuseCount: 99, activeCub: 'cub_unknown', grandBorn: 'yes',
    },
    base: {
      placements: { 'd-card-1': { x: -500, y: 900 }, invalid: { x: 40, y: 40 } },
      styles: { nature: { owned: [0, 1, 99], active: 99 }, unknown: { owned: [0, 1], active: 1 } },
      plaques: { main: ['not-in-bank'], motto: ['not-a-motto'] },
      celebrated: 'not-an-array', researchDonations: -8,
    },
    market: {
      inv: { energy: 9999, magnifier: -4, unknown: 50 },
      claims: [{ id: 'ok', itemId: 'energy' }, { id: 3, itemId: 'unknown' }],
      buys: { date: '2026-07-22', n: 99 },
      ever: [{ itemId: 'unknown', dir: 'sold' }], carry: 'unknown',
    },
  };

  const core = m.SciStore.importState(JSON.stringify(malicious));
  assert.deepEqual([core.cards.forged.box, core.cards.forged.seen, core.cards.forged.wrong], [4, 0, 0]);

  const econ = m.SciEconomy.exportState();
  assert.equal(econ.balance, m.SciEconomy.MAX_BALANCE);
  assert.equal(econ.daily.earned, m.SciEconomy.DAILY_CAP);
  assert.deepEqual([econ.combo, econ.bestCombo], [0, 0]);

  const fusion = m.SciFusionStore.load();
  assert.deepEqual(Array.from(fusion.hatched), cubIds);
  assert.deepEqual(Object.keys(fusion.nicknames), []);
  assert.deepEqual(Array.from(fusion.revealed), ['nature+biology']);
  assert.deepEqual([fusion.failStreak, fusion.fuseCount, fusion.activeCub, fusion.grandBorn], [0, m.SciFusionStore.MAX_FUSE_PER_DAY, '', false]);

  const base = m.SciBaseStore.loadBase();
  assert.deepEqual(JSON.parse(JSON.stringify(base.placements)), { 'd-card-1': { x: 2, y: 98 } });
  assert.deepEqual(JSON.parse(JSON.stringify(base.styles)), { nature: { owned: [0, 1], active: 0 } });
  assert.deepEqual(JSON.parse(JSON.stringify(base.plaques)), {});
  assert.deepEqual([base.researchDonations, base.celebrated.length], [0, 0]);

  const market = m.SciMarketStore.exportState();
  assert.deepEqual(JSON.parse(JSON.stringify(market.inv)), { energy: m.SciMarketStore.MAX_ITEM_COUNT });
  assert.equal(market.claims.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(market.buys)), { date: '2026-07-22', n: m.SciMarketStore.DAILY_BUY_CAP });
  assert.deepEqual([market.ever.length, market.carry], [0, null]);
});

test('B3：無 version 的舊格式仍可匯入核心，且不覆蓋現有養成狀態', () => {
  const { modules: m } = loadProgressSandbox({
    sci_econ: { v: 1, balance: 35, daily: { date: null, earned: 0 }, combo: 0, bestCombo: 0 },
  });
  const legacy = {
    cards: { legacy: { box: 99, due: 8, seen: 3, wrong: 1 } },
    stats: { streakDays: 7, totalReviews: 12 },
  };
  const imported = m.SciStore.importState(JSON.stringify(legacy));
  assert.equal(imported.cards.legacy.box, 4);
  assert.equal(imported.stats.totalReviews, 12);
  assert.equal(m.SciEconomy.getBalance(), 35, 'core-only 舊檔不得意外清空新格式養成資料');
});

test('B4：匯入成功後刷新晶能列、融合坊、基地與已開啟的市集', () => {
  const app = source('js/app.js');
  const importFlow = app.slice(app.indexOf("importFile.addEventListener('change'"), app.indexOf("alert('匯入失敗"));
  assert.match(importFlow, /renderHeroStats\(\)/);
  assert.match(importFlow, /renderFusionLab\(\)/);
  assert.match(importFlow, /SciBase\.refresh\?\.\(\)/);
  assert.match(importFlow, /SciMarketUI\.refresh\?\.\(\)/);
  assert.match(source('js/base-ui.js'), /return \{[^}]*refresh/s);
  assert.match(source('js/market-ui.js'), /return \{[^}]*refresh/s);
});

test('C：單機挑戰卷答錯揭示正解，答對維持成功回饋', () => {
  const wrong = loadSoloHarness();
  const wrongButton = wrong.options.find((button) => button.dataset.id !== wrong.expected.answerId);
  wrongButton._listeners.click();
  const target = wrong.pool.find((term) => term.id === wrong.expected.answerId);
  assert.equal(wrong.answers[0].correct, false);
  assert.match(wrong.root.innerHTML, new RegExp(`${target.term}：${target.def}`));
  assert.match(wrong.root.innerHTML, /class="card wrong"/);

  const correct = loadSoloHarness();
  const correctButton = correct.options.find((button) => button.dataset.id === correct.expected.answerId);
  correctButton._listeners.click();
  assert.equal(correct.answers[0].correct, true);
  assert.match(correct.root.innerHTML, /class="card correct"/);
  assert.match(correct.root.innerHTML, /✅ 答對了！/);
});

test('D：晶能奇遇達每日上限不顯示 +0，正常晶能與知識奇遇不受影響', () => {
  const answer = (harness, id) => {
    harness.app.setState({ cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 0 } });
    harness.app.recordAnswer({ id, unit: 'life' }, true, 2000, 20, 'quiz');
    return harness.appended.filter((node) => node.className.includes('science-surprise'));
  };

  const capped = loadAppHarness({ surpriseResult: { hit: true, type: 'crystals', earned: 0, capped: true } });
  const cappedToasts = answer(capped, 'capped');
  assert.equal(cappedToasts.length, 0);
  assert.doesNotMatch(capped.appended.map((node) => node.textContent).join(' '), /\+0/);

  const rewarded = loadAppHarness({ surpriseResult: { hit: true, type: 'crystals', earned: 2 } });
  assert.match(answer(rewarded, 'rewarded')[0].textContent, /\+2 晶能/);

  const fact = loadAppHarness({ surpriseResult: { hit: true, type: 'fact', fact: { text: '金星的一天比一年長。' } } });
  assert.match(answer(fact, 'fact')[0].textContent, /金星的一天比一年長/);
});

test('E：匯入老手補種首次成功旗標；空機答錯後首度答對仍有儀式', async () => {
  const veteran = loadAppHarness();
  const exportBtn = veteran.makeNode();
  const importBtn = veteran.makeNode();
  const importFile = veteran.makeNode();
  const guide = veteran.makeNode();
  const body = veteran.makeNode();
  const panel = veteran.makeNode();
  panel.querySelector = (selector) => selector === '.subject-body' ? body : null;
  veteran.elements.set('#export-btn', exportBtn);
  veteran.elements.set('#import-btn', importBtn);
  veteran.elements.set('#import-file', importFile);
  veteran.elements.set('#new-player-guide', guide);
  veteran.elements.set('.panel[data-key="nature"]', panel);
  veteran.app.setState({ cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 0 } });
  veteran.app.wireIoButtons();
  const imported = {
    cards: { veteran: { box: 4, due: 0, seen: 8, wrong: 0 } },
    stats: { streakDays: 20, lastActiveDate: null, totalReviews: 500 },
  };
  await importFile._listeners.change({ target: { files: [{ text: async () => JSON.stringify(imported) }] } });
  assert.equal(veteran.storage.sci_first_success_seen, '1');
  veteran.app.recordAnswer({ id: 'after-import', unit: 'life' }, true, 2000, 20, 'quiz');
  assert.equal(veteran.appended.filter((node) => node.className.includes('first-success')).length, 0, '老手匯入後下一題答對不得重播新手儀式');

  const fresh = loadAppHarness();
  const freshState = { cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 0 } };
  fresh.app.setState(freshState);
  fresh.app.recordAnswer({ id: 'first-wrong', unit: 'life' }, false, 2000, 20, 'quiz');
  assert.equal(fresh.storage.sci_first_success_seen, undefined);
  fresh.app.recordAnswer({ id: 'first-correct', unit: 'life' }, true, 2000, 20, 'quiz');
  assert.equal(fresh.storage.sci_first_success_seen, '1');
  assert.equal(fresh.appended.filter((node) => node.className.includes('first-success')).length, 1);
});
