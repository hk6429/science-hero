import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = (file) => readFileSync(path.join(ROOT, file), 'utf8');

function loadClient(files, names) {
  const storage = {};
  const localStorage = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value); },
    removeItem: (key) => { delete storage[key]; },
  };
  const context = vm.createContext({ localStorage, console, Date, Math, JSON, setTimeout, clearTimeout });
  vm.runInContext(
    `${files.map(source).join('\n;\n')}\nglobalThis.__round5 = { ${names.join(', ')} };`,
    context,
  );
  return context.__round5;
}

test('A：主觀答錯保留原 box 並把 due 提前，客觀答錯仍歸零', () => {
  const { SciStore, SciFlashcard } = loadClient(
    ['js/store.js', 'js/flashcard.js'],
    ['SciStore', 'SciFlashcard'],
  );
  const state = SciStore.load();
  const now = Date.now();

  SciStore.setCard(state, 'flash-mastered', { box: 4, due: now + 14 * 86400000, seen: 8, wrong: 0 });
  const flash = SciFlashcard.markResult(state, 'flash-mastered', false);
  assert.equal(flash.box, 4, '閃卡「還沒抓到」不得降低已精熟卡的 box');
  assert.ok(flash.due <= now + 1000, '閃卡主觀答錯應立即排回複習');

  SciStore.setCard(state, 'cloze-mastered', { box: 4, due: now + 14 * 86400000, seen: 8, wrong: 0 });
  const cloze = SciFlashcard.bumpBoxIfDue(state, 'cloze-mastered', false, now, 3, false);
  assert.equal(cloze.box, 4, '克漏字「還沒記得」不得降低已精熟卡的 box');
  assert.ok(cloze.due <= now + 1000, '克漏字主觀答錯應立即排回複習');

  SciStore.setCard(state, 'flash-learning', { box: 2, due: now + 3 * 86400000, seen: 3, wrong: 0 });
  const learning = SciFlashcard.markResult(state, 'flash-learning', false);
  assert.equal(learning.box, 2, '未精熟卡的主觀答錯也不得歸零');
  assert.ok(learning.due <= now + 1000);

  SciStore.setCard(state, 'quiz-mastered', { box: 4, due: now - 1, seen: 8, wrong: 0 });
  const objective = SciFlashcard.bumpBoxIfDue(state, 'quiz-mastered', false, now, 4, true);
  assert.equal(objective.box, 0, '客觀選擇題答錯仍須依 Leitner 規則歸零');
});

test('B：主觀自評不累加每日答對，也不能從科學奇遇側管取得晶能', () => {
  const { SciStore, SciEconomy, SciScienceRewards } = loadClient(
    ['js/store.js', 'js/economy.js', 'js/science-rewards.js'],
    ['SciStore', 'SciEconomy', 'SciScienceRewards'],
  );
  const facts = [{ id: 'fact-1', text: '知識', basis: '測試' }];
  const rng = (...values) => { let index = 0; return () => values[index++]; };
  const before = SciEconomy.getBalance();
  const surprise = SciScienceRewards.triggerSurprise({
    correct: true,
    rng: rng(0.01, 0.1, 0),
    facts,
    economy: SciEconomy,
    allowCrystalReward: false,
  });
  assert.equal(SciEconomy.getBalance(), before, '主觀自評命中奇遇也不得發晶能');
  assert.deepEqual(JSON.parse(JSON.stringify(surprise)), { hit: true, type: 'fact', fact: facts[0] });

  const app = source('js/app.js');
  const record = app.slice(app.indexOf('function recordAnswer'), app.indexOf('function showEnergyGain'));
  const flash = app.slice(app.indexOf('function answerFlash'), app.indexOf('// ================= 自測'));
  assert.match(record, /correct\s*&&\s*SciWeak\.isObjectiveSource\(source\)[\s\S]*recordDailySignal\('correct'/);
  assert.match(record, /allowCrystalReward:\s*SciWeak\.isObjectiveSource\(source\)/);
  assert.doesNotMatch(flash, /recordDailySignal\('correct'/, '閃卡自評不得累加每日答對任務');
});

test('C：回訪提示列出跨科到期明細，並提供切到到期科目的入口', () => {
  const { SciUiLogic } = loadClient(['js/ui-logic.js'], ['SciUiLogic']);
  const state = { cards: {
    e1: { box: 2, seen: 2, due: 2000 },
    b1: { box: 4, seen: 5, due: 900 },
    b2: { box: 2, seen: 2, due: 800 },
    b3: { box: 1, seen: 1, due: 700 },
  } };
  const summary = SciUiLogic.dueReviewSummary(state, 1000, 4, {
    nature: ['e1'], biology: ['b1', 'b2', 'b3'], chemphys: [], earth: [],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(summary.bySubject)), [
    { key: 'biology', due: 3, evergreen: 1 },
  ]);
  assert.equal(summary.targetSubject, 'biology');

  const app = source('js/app.js');
  assert.match(app, /data-review-subject="\$\{item\.key\}"/);
  assert.match(app, /querySelectorAll\('\[data-review-subject\]'\)/);
  assert.match(app, /switchSubject\(button\.dataset\.reviewSubject\)/);
});

test('D：匯入既有進度會跳過 onboarding，首次成功由實際首度答對與本機旗標守門', () => {
  const { SciUiLogic } = loadClient(['js/ui-logic.js'], ['SciUiLogic']);
  const imported = { totalReviews: 12, masteredCount: 1, checklist: {} };
  assert.equal(SciUiLogic.shouldShowOnboarding(imported.totalReviews, imported.masteredCount, imported.checklist), false);
  assert.equal(SciUiLogic.shouldShowOnboarding(0, 0, {}), true, '真正的新手仍要看到引導');

  const app = source('js/app.js');
  assert.match(app, /SciUiLogic\.shouldShowOnboarding\(state\.stats\.totalReviews,\s*masteredCardCount\(\),\s*checklist\)/);
  assert.equal((app.match(/if \(correct\) showFirstSuccess\(\);/g) || []).length, 2, '兩個作答入口都應在每次答對時交由本機旗標守門');
  assert.match(app, /if \(localStorage\.getItem\(FIRST_SUCCESS_KEY\)\) return;/, '儀式內仍以本機旗標防止重播');
});

test('E：本機 PvP 答題後標出正解與選錯，並顯示本回合傷害跳字', () => {
  const battle = source('js/battle.js');
  const pvp = battle.slice(battle.indexOf('// ── PvP：'), battle.indexOf('function pvpFinish'));
  assert.match(pvp, /function renderPvp\(midTurn,\s*feedback\s*=\s*\{\}\)/);
  assert.match(pvp, /answerFeedbackClass\(o\.id,\s*feedback\.answerId,\s*feedback\.chosenId\)/);
  assert.match(pvp, /pvpState\.dmgFoe\s*\?\s*`<span class="bat-damage-pop">-\$\{pvpState\.dmgFoe\}<\/span>`/);
  assert.match(pvp, /pvpState\.dmgMe\s*\?\s*`<span class="bat-damage-pop">-\$\{pvpState\.dmgMe\}<\/span>`/);
  assert.match(pvp, /pvpState\.dmgFoe\s*=\s*0;[\s\S]*pvpState\.dmgMe\s*=\s*0;/);
  assert.match(pvp, /renderPvp\(true,\s*\{\s*chosenId,\s*answerId:\s*q\.answerId\s*\}\)/);
});

test('F：閃卡自評先顯示綠紅視覺確認，再延遲換到下一張', () => {
  const app = source('js/app.js');
  const flash = app.slice(app.indexOf('function answerFlash'), app.indexOf('// ================= 自測'));
  assert.match(flash, /body\.querySelector\('\.card'\)[\s\S]*classList\.add\(correct \? 'flash-correct' : 'flash-wrong'\)/);
  assert.match(flash, /setTimeout\(\(\) => \{[\s\S]*preserveScroll\([\s\S]*\},\s*350\)/);
  assert.ok(
    flash.indexOf("classList.add(correct ? 'flash-correct' : 'flash-wrong')") < flash.indexOf('setTimeout(() => {'),
    '視覺確認必須發生在延遲換卡之前',
  );
});

test('G：flash／cloze 主觀答錯只記低權弱點，客觀答錯維持完整權重', () => {
  const { SciWeak } = loadClient(['js/weak.js'], ['SciWeak']);
  const state = { weakLog: [
    { termId: 'flash', unit: 'life', correct: false, guessed: false, source: 'flash' },
    { termId: 'cloze', unit: 'life', correct: false, guessed: true, source: 'cloze' },
    { termId: 'quiz', unit: 'life', correct: false, guessed: false, source: 'quiz' },
  ] };
  assert.deepEqual(JSON.parse(JSON.stringify(SciWeak.getWeakTerms(state, 10))), [
    { termId: 'quiz', score: 1 },
    { termId: 'flash', score: 0.5 },
    { termId: 'cloze', score: 0.5 },
  ]);
  assert.equal(SciWeak.isObjectiveSource('flash'), false);
  assert.equal(SciWeak.isObjectiveSource('cloze'), false);
  assert.equal(SciWeak.isObjectiveSource('quiz'), true);

  const app = source('js/app.js');
  assert.match(app, /bumpBoxIfDue\([\s\S]*SciWeak\.isObjectiveSource\(source\)\)/);
});
