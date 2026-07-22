import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = (file) => readFileSync(path.join(ROOT, file), 'utf8');

function loadClient(files, names) {
  const context = vm.createContext({ console, Date, Math, JSON });
  vm.runInContext(`${files.map(source).join('\n;\n')}\nglobalThis.__round8 = { ${names.join(', ')} };`, context);
  return context.__round8;
}

function loadDailySignalHarness() {
  const storage = {};
  const appended = [];
  const earnedCalls = [];
  const makeNode = () => ({
    className: '', innerHTML: '', textContent: '', hidden: false, style: {},
    classList: { add() {}, toggle() {} },
    setAttribute() {}, addEventListener() {}, appendChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0 }),
  });
  const document = {
    body: { appendChild: (node) => appended.push(node) }, documentElement: {}, activeElement: null,
    addEventListener() {}, removeEventListener() {}, createElement: makeNode,
    querySelector: () => null, querySelectorAll: () => [],
  };
  const localStorage = {
    getItem: (key) => storage[key] ?? null,
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
    earnCrystals(amount, reason) {
      earnedCalls.push({ amount, reason });
      return { earned: amount };
    },
    onAnswer: () => ({ earned: 0 }), getBalance: () => 0,
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
    `return { boot, __round8: {
      recordDailySignal,
      setState(value) { state = value; }
    } };`,
  );
  vm.runInContext(
    `${['js/store.js', 'js/flashcard.js', 'js/weak.js', 'js/ui-logic.js', 'js/daily-quests.js'].map(source).join('\n;\n')}\n;\n${appSource}\nglobalThis.__app = SciApp.__round8;`,
    context,
  );
  return { app: context.__app, appended, earnedCalls };
}

test('B：每日答對與詞卡升級任務明示須從自測或對戰完成', () => {
  const { SciDailyQuests } = loadClient(['js/daily-quests.js'], ['SciDailyQuests']);
  const labels = Object.fromEntries(Array.from(SciDailyQuests.QUESTS, (quest) => [quest.id, quest.label]));
  assert.match(labels.correct, /自測或對戰/);
  assert.match(labels.unitProgress, /自測或對戰/);
});

test('C：PvE 敵人自損只顯示實際 4 點傷害並清除我方殘影', () => {
  const { SciBattle } = loadClient(['js/battle.js'], ['SciBattle']);
  const battleState = { oHp: 60, foeDamage: 15, meDamage: 8 };
  SciBattle.applyEnemyMiss(battleState, 4);
  assert.deepEqual(
    { oHp: battleState.oHp, foeDamage: battleState.foeDamage, meDamage: battleState.meDamage },
    { oHp: 56, foeDamage: 4, meDamage: 0 },
  );
});

test('D：每日任務晶能有跳字，全清另有正向慶祝', () => {
  const today = new Date().toISOString().slice(0, 10);
  const single = loadDailySignalHarness();
  single.app.setState({
    cards: {},
    stats: { dailyQuests: { date: today, correct: 9, battleWin: 0, unitProgress: 0, subjectCorrect: 0, subject: 'biology', claimed: [] } },
  });
  single.app.recordDailySignal('correct', false);
  const singlePops = single.appended.filter((node) => node.className === 'energy-gain-pop');
  assert.deepEqual(single.earnedCalls, [{ amount: 3, reason: 'dailyQuest' }]);
  assert.equal(singlePops.length, 1);
  assert.equal(singlePops[0].textContent, '+3💎');

  const allClear = loadDailySignalHarness();
  allClear.app.setState({
    cards: {},
    stats: { dailyQuests: { date: today, correct: 9, battleWin: 1, unitProgress: 1, subjectCorrect: 0, subject: 'biology', claimed: ['battleWin', 'unitProgress'] } },
  });
  allClear.app.recordDailySignal('correct', false);
  assert.deepEqual(allClear.earnedCalls, [
    { amount: 3, reason: 'dailyQuest' },
    { amount: 20, reason: 'dailyQuestBonus' },
  ]);
  assert.equal(allClear.appended.filter((node) => node.className === 'energy-gain-pop').length, 2);
  const celebration = allClear.appended.find((node) => node.className.includes('daily-all-clear-toast'));
  assert.match(celebration?.textContent || '', /今日任務全清！\+20💎/);
});

test('E：主觀來源不判定僥倖答對，也不污染家長誠實度摘要', () => {
  const { SciWeak } = loadClient(['js/weak.js'], ['SciWeak']);
  for (const sourceName of ['cloze', 'flash', 'timeout']) {
    const state = { weakLog: [] };
    SciWeak.recordAnswer(state, {
      termId: `subjective-${sourceName}`, unit: 'life', correct: true,
      elapsedMs: 100, contentLength: 0, source: sourceName,
    });
    assert.equal(state.weakLog[0].luckyGuess, false, `${sourceName} 不得標成疑似靠猜`);
  }

  for (const sourceName of ['quiz', 'battle']) {
    const state = { weakLog: [] };
    SciWeak.recordAnswer(state, {
      termId: `objective-${sourceName}`, unit: 'life', correct: true,
      elapsedMs: 100, contentLength: 0, source: sourceName,
    });
    assert.equal(state.weakLog[0].luckyGuess, true, `${sourceName} 應維持既有僥倖答對判定`);
  }

  const summary = SciWeak.buildFamilySummary({
    cards: {},
    weakLog: [
      { termId: 'c', unit: 'life', correct: true, luckyGuess: true, source: 'cloze' },
      { termId: 'f', unit: 'life', correct: true, luckyGuess: true, source: 'flash' },
      { termId: 't', unit: 'life', correct: true, luckyGuess: true, source: 'timeout' },
      { termId: 'q', unit: 'life', correct: true, luckyGuess: true, source: 'quiz' },
      { termId: 'b', unit: 'life', correct: true, luckyGuess: true, source: 'battle' },
    ],
  }, [], {}, 4, () => ({ total: 0, accuracy: 0 }));
  assert.match(summary, /最近有 2 題疑似靠猜答對/);
  assert.doesNotMatch(summary, /最近有 5 題疑似靠猜答對/);
});
