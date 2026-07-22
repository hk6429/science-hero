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
  const appended = [];
  const elements = new Map();
  const answerEnergyCalls = [];
  const baseRefreshCalls = [];
  const makeNode = () => ({
    className: '', innerHTML: '', textContent: '', hidden: false, open: false, value: '', _listeners: {},
    style: { setProperty(name, value) { this[name] = String(value); } },
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
    querySelectorAll: (selector) => appended.filter((node) => {
      const className = String(node.className || '');
      return selector.startsWith('.') && className.split(/\s+/).includes(selector.slice(1));
    }),
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
    onAnswer(...args) { answerEnergyCalls.push(args); return { earned: 1 }; },
    earnCrystals: () => ({ earned: 0 }), getBalance: () => 0,
  };
  context.SciScienceRewards = {
    hashSeed: () => 1, mulberry32: () => () => 1,
    triggerSurprise: () => ({ hit: false }), unlockedLore: () => [], unlockForMasteredUnit: () => null,
  };
  context.SciBaseStore = { STAGES: [] };
  context.SciBaseUI = { refresh: () => baseRefreshCalls.push('refresh') };
  context.SciBattle = { masteredBySubject: () => ({}) };
  context.SciFusionStore = { CUBS: [], load: () => ({ collection: [] }) };

  const appSource = source('js/app.js').replace(
    'return { boot };',
    `return { boot, __round10: {
      recordAnswer, selfTestUsesCloze, showEnergyGain, showDailyAllClear, showMasteryPromotion,
      wireIoButtons, renderOnboarding,
      setState(value) { state = value; }, getState() { return state; }
    } };`,
  );
  vm.runInContext(
    `${['js/store.js', 'js/flashcard.js', 'js/weak.js', 'js/ui-logic.js', 'js/daily-quests.js'].map(source).join('\n;\n')}\n;\n${appSource}\nglobalThis.__app = SciApp.__round10;`,
    context,
  );
  return { app: context.__app, storage, appended, elements, answerEnergyCalls, baseRefreshCalls, makeNode };
}

function loadWeak() {
  const context = vm.createContext({ console, Date, Math, JSON });
  vm.runInContext(`${source('js/weak.js')}\nglobalThis.__weak = SciWeak;`, context);
  return context.__weak;
}

test('A：box3 自測交替客觀選擇題與克漏字，客觀答對可升 box4 且 cloze 防火牆不退', () => {
  const harness = loadAppHarness();
  const modes = [0, 1, 2, 3].map((index) => harness.app.selfTestUsesCloze(3, index));
  assert.ok(modes.includes(false), 'box3 連續自測必須出現客觀選擇題');
  assert.ok(modes.includes(true), 'box3 仍須保留克漏字回想練習');
  assert.deepEqual(
    [0, 1, 2, 3].map((index) => harness.app.selfTestUsesCloze(4, index)),
    [false, true, false, true],
    'box4 也要交替出客觀選擇題，讓每個盒序都有可計入每日任務的答對路徑',
  );

  const appSource = source('js/app.js');
  const clozeFlow = appSource.slice(
    appSource.indexOf('function renderClozeQuestion'),
    appSource.indexOf('function settleAnswer'),
  );
  assert.match(clozeFlow, /回想練習[·・]不列入答對計數/, '克漏字 UI 要先說明不列入表頭答對數');
  assert.doesNotMatch(clozeFlow, /quizCorrect\s*\+=\s*1/, '克漏字自評答對不得增加表頭 quizCorrect');

  const today = new Date().toISOString().slice(0, 10);
  const objectiveState = {
    cards: { target: { box: 3, due: 0, seen: 4, wrong: 0 } },
    stats: { streakDays: 0, lastActiveDate: null, totalReviews: 4, dailyQuests: { date: today, correct: 0, battleWin: 0, unitProgress: 0, subjectCorrect: 0, subject: 'nature', claimed: [] } },
  };
  harness.app.setState(objectiveState);
  harness.app.recordAnswer({ id: 'target', unit: 'life' }, true, 2000, 20, 'quiz');
  assert.equal(objectiveState.cards.target.box, 4, '只做自測也能用客觀選擇題從 box3 升到 box4');
  assert.equal(objectiveState.stats.dailyQuests.correct, 1, '客觀自測答對須產生 correct 每日訊號');
  assert.equal(harness.answerEnergyCalls.length, 1, '客觀自測仍走既有晶能作答路徑');

  const subjectiveState = {
    cards: { target: { box: 3, due: 0, seen: 4, wrong: 0 } },
    stats: { streakDays: 0, lastActiveDate: null, totalReviews: 4, dailyQuests: { date: today, correct: 0, battleWin: 0, unitProgress: 0, subjectCorrect: 0, subject: 'nature', claimed: [] } },
  };
  harness.app.setState(subjectiveState);
  harness.app.recordAnswer({ id: 'target', unit: 'life' }, true, 2000, 20, 'cloze');
  assert.equal(subjectiveState.cards.target.box, 3, 'cloze 主觀自評仍封頂 box3');
  assert.equal(subjectiveState.stats.dailyQuests.correct, 0, 'cloze 不得產生客觀 correct 訊號');
  assert.equal(harness.answerEnergyCalls.length, 1, 'cloze 不得呼叫晶能作答獎勵');
});

test('B：校準落差接受各客觀模式證偽，排除主觀 cloze 答錯並接受 cloze 自評宣告', () => {
  const weak = loadWeak();
  const misses = weak.getCalibrationMisses({ weakLog: [
    { termId: 'battle-term', source: 'flash', correct: true, t: 1 },
    { termId: 'battle-term', source: 'battle', correct: false, t: 2 },
    { termId: 'pvp-term', source: 'flash', correct: true, t: 3 },
    { termId: 'pvp-term', source: 'pvp', correct: false, t: 4 },
    { termId: 'subjective-wrong', source: 'flash', correct: true, t: 5 },
    { termId: 'subjective-wrong', source: 'cloze', correct: false, t: 6 },
    { termId: 'cloze-claim', source: 'cloze', correct: true, t: 7 },
    { termId: 'cloze-claim', source: 'quiz', correct: false, t: 8 },
  ] });
  assert.equal(misses['battle-term'], 1, 'battle 客觀答錯應證偽先前自評');
  assert.equal(misses['pvp-term'], 1, 'pvp 客觀答錯應證偽先前自評');
  assert.equal(misses['subjective-wrong'], undefined, 'cloze 主觀答錯不能證偽自評');
  assert.equal(misses['cloze-claim'], 1, 'cloze 的「我想出來了」也算一次自評宣告');
});

test('C：同時出現的晶能冒泡與頂部慶祝吐司會取得不同堆疊位移', () => {
  const harness = loadAppHarness();
  harness.app.showEnergyGain(5);
  harness.app.showEnergyGain(3);
  const energyPops = harness.appended.filter((node) => node.className === 'energy-gain-pop');
  assert.equal(energyPops.length, 2);
  assert.deepEqual(energyPops.map((node) => node.style['--stack-offset']), ['0px', '-40px']);

  harness.app.showDailyAllClear(20);
  harness.app.showMasteryPromotion({ rank: '科學行者', stage: '研究塔' });
  const topToasts = harness.appended.filter((node) => String(node.className).includes('first-success'));
  assert.deepEqual(topToasts.map((node) => node.style['--stack-offset']), ['0px', '76px']);

  const css = source('css/style.css');
  assert.match(css, /energy-gain-pop[^}]*--stack-offset|energy-float[\s\S]*--stack-offset/);
  assert.match(css, /first-success[^}]*--stack-offset/);
});

test('C2：頂部慶祝吐司使用保留置中與堆疊位移的專屬進場動畫', () => {
  const css = source('css/style.css');
  assert.match(css, /\.first-success\.celebrate-in\s*\{[^}]*animation:\s*firstSuccessIn\s+0\.35s\s+ease-out/s);
  const keyframes = css.slice(css.indexOf('@keyframes firstSuccessIn'), css.indexOf('}', css.indexOf('100%', css.indexOf('@keyframes firstSuccessIn'))) + 1);
  assert.match(keyframes, /0%\s*\{[^}]*transform:\s*translate\(-50%,\s*var\(--stack-offset,\s*0px\)\)\s*scale\(0\.97\)/s);
  assert.match(keyframes, /100%\s*\{[^}]*transform:\s*translate\(-50%,\s*var\(--stack-offset,\s*0px\)\)\s*scale\(1\)/s);
  assert.match(css, /\.science-surprise\.celebrate-in\s*\{[^}]*animation:\s*celebrateIn\s+0\.35s\s+ease-out/s);
});

test('D：巡禮與連線勝場各記一次每日 battleWin，晶能仍只給標準 PvE', () => {
  const battle = source('js/battle.js');
  const battleFinish = battle.slice(battle.indexOf('function finish(win)'), battle.indexOf('const endlessStatus', battle.indexOf('function finish(win)')));
  assert.match(battleFinish, /if \(win\) ctx\.onBattleWin\?\.\(\)/, '無盡巡禮勝場也須通知每日任務');
  assert.match(battleFinish, /if \(win && !endlessMode\)[\s\S]*SciEconomy\.earnCrystals/, '晶能勝場獎勵仍限標準 PvE');
  assert.equal((battleFinish.match(/onBattleWin/g) || []).length, 1, '每場勝利只通知一次');

  const realtime = source('js/rtbattle-ui.js');
  const rtFinish = realtime.slice(realtime.indexOf('function finish(verdict)'), realtime.indexOf('function offlineCard', realtime.indexOf('function finish(verdict)')));
  assert.match(rtFinish, /if \(verdict === 'win'\) ctx\.onBattleWin\?\.\(\)/, '連線 verdict=win 須通知每日任務');
  assert.doesNotMatch(rtFinish, /SciEconomy|earnCrystals/, '連線勝場不得發晶能');
  assert.equal((rtFinish.match(/onBattleWin/g) || []).length, 1, '連線勝場只通知一次');

  const app = source('js/app.js');
  const rtMount = app.slice(app.indexOf('SciRtBattleUI.mount'), app.indexOf('});', app.indexOf('SciRtBattleUI.mount')) + 3);
  assert.match(rtMount, /onBattleWin:\s*\(\) => recordDailySignal\('battleWin'\)/, '連線 UI 回呼須接到每日訊號');
});

test('E：匯入純閃卡老手會補完成 onboarding，全新空機仍顯示引導', async () => {
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
    cards: { flashOnly: { box: 3, due: 0, seen: 30, wrong: 0 } },
    stats: { streakDays: 8, lastActiveDate: null, totalReviews: 30 },
  };
  await importFile._listeners.change({ target: { files: [{ text: async () => JSON.stringify(imported) }] } });
  assert.equal(guide.hidden, true, '有練習量但尚未 box4 的匯入者也不應被當成新手');
  assert.deepEqual(veteran.baseRefreshCalls, ['refresh'], '匯入後要呼叫真實基地模組 SciBaseUI.refresh');
  assert.deepEqual(JSON.parse(veteran.storage.sci_onboarding_checklist), { flashcard: true, quiz: true, battle: true });

  const fresh = loadAppHarness();
  const freshGuide = fresh.makeNode();
  fresh.elements.set('#new-player-guide', freshGuide);
  fresh.app.setState({ cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 0 } });
  fresh.app.renderOnboarding();
  assert.equal(freshGuide.hidden, false, '未匯入且 totalReviews=0 的全新裝置仍須顯示引導');
});
