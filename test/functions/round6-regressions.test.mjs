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
  const makeNode = () => {
    const node = {
      className: '', innerHTML: '', textContent: '', hidden: false, open: false, value: '', style: {}, _listeners: {},
      classList: { add() {}, toggle() {} },
      setAttribute() {}, addEventListener(event, listener) { this._listeners[event] = listener; },
      appendChild() {}, insertBefore() {}, remove() {}, click() {},
      querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0 }),
    };
    return node;
  };
  const document = {
    body: { appendChild: (node) => appended.push(node) },
    documentElement: {}, activeElement: null,
    addEventListener() {}, execCommand() {},
    createElement: () => makeNode(),
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
    EARN_TABLE: { master: 5 },
    onAnswer: () => ({ earned: 0 }), earnCrystals() {}, getBalance: () => 0,
  };
  context.SciScienceRewards = {
    hashSeed: () => 1, mulberry32: () => () => 1,
    triggerSurprise: () => ({ hit: false }), unlockedLore: () => [], unlockForMasteredUnit: () => null,
  };
  context.SciBaseStore = { STAGES: [] };
  context.SciBattle = { masteredBySubject: () => ({}) };
  context.SciFusionStore = { CUBS: [], load: () => ({ collection: [] }) };

  const appSource = source('js/app.js').replace(
    'return { boot };',
    `return { boot, __round6: {
      recordAnswer, answerFlash, wireIoButtons, renderOnboarding,
      setState(value) { state = value; }, getState() { return state; },
      setFlashTerm(value) { flashQueue = [value]; flashIdx = 0; flashAnswering = false; }
    } };`,
  );
  vm.runInContext(
    `${['js/store.js', 'js/flashcard.js', 'js/weak.js', 'js/ui-logic.js', 'js/daily-quests.js'].map(source).join('\n;\n')}\n;\n${appSource}\nglobalThis.__app = SciApp.__round6;`,
    context,
  );
  return { app: context.__app, storage, appended, elements, makeNode };
}

test('A：第一次答錯不會錯過首次成功，兩個入口在首度答對時觸發且只播一次', () => {
  const quiz = loadAppHarness();
  const state = { cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 0 } };
  quiz.app.setState(state);
  quiz.app.recordAnswer({ id: 'quiz-first-wrong', unit: 'life' }, false, 2000, 20, 'quiz');
  assert.equal(state.stats.totalReviews, 1);
  assert.equal(quiz.storage.sci_first_success_seen, undefined, '第一次答錯不得提前寫入成功旗標');
  assert.equal(quiz.appended.filter((node) => node.className.includes('first-success')).length, 0);

  quiz.app.recordAnswer({ id: 'quiz-first-correct', unit: 'life' }, true, 2000, 20, 'quiz');
  assert.equal(state.stats.totalReviews, 2);
  assert.equal(quiz.storage.sci_first_success_seen, '1', '首度答對應寫入一次性旗標');
  assert.equal(quiz.appended.filter((node) => node.className.includes('first-success')).length, 1);

  quiz.app.recordAnswer({ id: 'quiz-third', unit: 'life' }, true, 2000, 20, 'quiz');
  assert.equal(quiz.appended.filter((node) => node.className.includes('first-success')).length, 1, '第二次答對不得重播');

  const flash = loadAppHarness();
  const flashState = { cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 0 } };
  flash.app.setState(flashState);
  const feedbackCard = flash.makeNode();
  const body = flash.makeNode();
  body.querySelector = (selector) => selector === '.card' ? feedbackCard : null;

  flash.app.setFlashTerm({ id: 'flash-first-wrong', unit: 'life' });
  flash.app.answerFlash(body, false);
  assert.equal(flashState.stats.totalReviews, 1);
  assert.equal(flash.storage.sci_first_success_seen, undefined);

  flash.app.setFlashTerm({ id: 'flash-first-correct', unit: 'life' });
  flash.app.answerFlash(body, true);
  assert.equal(flashState.stats.totalReviews, 2);
  assert.equal(flash.storage.sci_first_success_seen, '1', '閃卡首度答對也應寫入一次性旗標');
  assert.equal(flash.appended.filter((node) => node.className.includes('first-success')).length, 1);

  flash.app.setFlashTerm({ id: 'flash-third', unit: 'life' });
  flash.app.answerFlash(body, true);
  assert.equal(flash.appended.filter((node) => node.className.includes('first-success')).length, 1, '閃卡後續答對不得重播');

  assert.doesNotMatch(source('js/app.js'), /wasFirstEver/, '不得遺留首次作答快照孤兒變數');
  assert.doesNotMatch(source('js/ui-logic.js'), /shouldShowFirstSuccess/, '不得保留未接線的首次成功判斷');
});

test('B：實際作答流程只在客觀答對且盒序上升時完成每日單元進度與全清', () => {
  const today = new Date().toISOString().slice(0, 10);
  const objective = loadAppHarness();
  const objectiveState = {
    cards: {},
    stats: {
      streakDays: 0, lastActiveDate: null, totalReviews: 3,
      dailyQuests: { date: today, correct: 9, battleWin: 1, unitProgress: 0, subjectCorrect: 0, subject: 'nature', claimed: [] },
    },
  };
  objective.app.setState(objectiveState);
  objective.app.recordAnswer({ id: 'objective-up', unit: 'life' }, true, 2000, 20, 'quiz');
  assert.equal(objectiveState.cards['objective-up'].box, 1);
  assert.equal(objectiveState.stats.dailyQuests.unitProgress, 1, '客觀答對且升盒應完成每日熟練度進度');
  assert.ok(objectiveState.stats.dailyQuests.claimed.includes('allClear'), '三個核心任務達標後應可領 ALL_CLEAR');

  const subjective = loadAppHarness();
  const subjectiveState = { cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 3 } };
  subjective.app.setState(subjectiveState);
  subjective.app.recordAnswer({ id: 'cloze-up', unit: 'life' }, true, 2000, 20, 'cloze');
  assert.equal(subjectiveState.cards['cloze-up'].box, 1, '確認主觀自評確實有升盒，避免測試假陽性');
  assert.equal(subjectiveState.stats.dailyQuests?.unitProgress || 0, 0, '主觀自評不得完成每日熟練度進度');

  const notDue = loadAppHarness();
  const notDueState = {
    cards: { waiting: { box: 1, due: Date.now() + 86400000, seen: 1, wrong: 0 } },
    stats: { streakDays: 0, lastActiveDate: null, totalReviews: 3 },
  };
  notDue.app.setState(notDueState);
  notDue.app.recordAnswer({ id: 'waiting', unit: 'life' }, true, 2000, 20, 'quiz');
  assert.equal(notDueState.cards.waiting.box, 1);
  assert.equal(notDueState.stats.dailyQuests.unitProgress, 0, '盒序未上升不得完成每日熟練度進度');
});

test('C：匯入老手進度的實際 change 流程會立即隱藏新手引導', async () => {
  const harness = loadAppHarness();
  const exportBtn = harness.makeNode();
  const importBtn = harness.makeNode();
  const importFile = harness.makeNode();
  const guide = harness.makeNode();
  const body = harness.makeNode();
  const panel = harness.makeNode();
  panel.querySelector = (selector) => selector === '.subject-body' ? body : null;
  harness.elements.set('#export-btn', exportBtn);
  harness.elements.set('#import-btn', importBtn);
  harness.elements.set('#import-file', importFile);
  harness.elements.set('#new-player-guide', guide);
  harness.elements.set('.panel[data-key="nature"]', panel);
  harness.app.setState({ cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 0 } });
  harness.app.renderOnboarding();
  assert.equal(guide.hidden, false, '空機啟動時先顯示新手引導');

  harness.app.wireIoButtons();
  const imported = {
    cards: { veteran: { box: 4, due: 0, seen: 8, wrong: 0 } },
    stats: { streakDays: 20, lastActiveDate: null, totalReviews: 500 },
  };
  await importFile._listeners.change({ target: { files: [{ text: async () => JSON.stringify(imported) }] } });
  assert.equal(guide.hidden, true, '匯入老手進度後不得殘留新手引導');
});

test('D：即時對戰三條作答路徑都傳題長，長題 1000ms 與 PvE 一樣會標記僥倖答對', () => {
  const ui = source('js/rtbattle-ui.js');
  const wiredCalls = ui.match(/ctx\.recordAnswer\?\.\(target, correct, [^;\n]+, SciQuiz\.questionContentLength\(q\)(?:, [^;\n]+)?\)/g) || [];
  assert.equal(wiredCalls.length, 3, '房間對戰、挑戰書、隨堂戰況三條路徑都必須傳 contentLength');

  const context = vm.createContext({ console, Date, Math, JSON });
  vm.runInContext(
    `${source('js/quiz.js')}\n;\n${source('js/weak.js')}\nglobalThis.__d = { SciQuiz, SciWeak };`,
    context,
  );
  const q = {
    prompt: '請根據題幹中的完整科學情境，判斷哪一個選項最能解釋觀察到的現象？',
    options: [
      { label: '甲選項提供較完整的因果解釋' }, { label: '乙選項只描述表面現象' },
      { label: '丙選項混淆了變因與結果' }, { label: '丁選項與題幹條件不符' },
    ],
  };
  const contentLength = context.__d.SciQuiz.questionContentLength(q);
  assert.ok(context.__d.SciWeak.readingThresholdMs(contentLength) > 1000);
  const withLength = { weakLog: [] };
  const withoutLength = { weakLog: [] };
  context.__d.SciWeak.recordAnswer(withLength, { termId: 'long-q', unit: 'life', correct: true, elapsedMs: 1000, contentLength });
  context.__d.SciWeak.recordAnswer(withoutLength, { termId: 'long-q', unit: 'life', correct: true, elapsedMs: 1000 });
  assert.equal(withLength.weakLog[0].luckyGuess, true);
  assert.equal(withoutLength.weakLog[0].luckyGuess, false, '缺題長時會退化到 800ms 地板，正是本回歸');
});
