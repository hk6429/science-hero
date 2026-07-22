import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const context = vm.createContext({});
vm.runInContext(
  `${readFileSync(path.join(root, 'js', 'ui-logic.js'), 'utf8')}\nglobalThis.__ui = SciUiLogic;`,
  context,
  { filename: 'ui-logic.js' },
);
const ui = context.__ui;

test('D6：新使用者的更多功能預設關閉', () => {
  assert.equal(ui.moreToolsDefaultOpen({ isNew: true }), false);
});

test('D7：「今天先這樣」收尾卡提供弱點、換科與再練一輪 CTA', () => {
  const html = ui.restCardHtml();
  assert.match(html, /data-rest-action="weak"[^>]*>看今日弱點/);
  assert.match(html, /data-rest-action="subject"[^>]*>換一科/);
  assert.match(html, /data-rest-action="restart"[^>]*>再練一輪/);
});

test('D9：未指定科目時預設國小自然，有效 subject 參數仍優先', () => {
  const available = ['nature', 'biology', 'chemphys', 'earth'];
  assert.equal(ui.resolveInitialSubject(null, available), 'nature');
  assert.equal(ui.resolveInitialSubject('earth', available), 'earth');
  assert.equal(ui.resolveInitialSubject('unknown', available), 'nature');
});

test('D17：融合揭曉一般動態保留一秒懸念，減少動態時立即顯示', () => {
  assert.equal(ui.fusionRevealDelay(false), 1000);
  assert.equal(ui.fusionRevealDelay(true), 0);
});

test('E3：自選主攻單元只提高優先權，不排除其他單元', () => {
  const terms = [{ id: 'a', unit: 'cell' }, { id: 'b', unit: 'genetics' }];
  assert.equal(ui.focusUnitWeight(terms[0], 'cell'), 3);
  assert.equal(ui.focusUnitWeight(terms[1], 'cell'), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.focusFirst(terms, 'genetics'))), [terms[1], terms[0]]);
});

test('E4/E5：班級共同里程碑永遠指向下一階並回報正向差距', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ui.classMilestone(145))), {
    total: 145, target: 200, remaining: 55, pct: 73,
  });
  assert.equal(ui.classMilestone(200).target, 300);
  assert.equal(ui.classMilestone(-9).remaining, 100);
});

test('F7/G15：到期摘要保留精熟盒序，只回報可溫和回顧的張數', () => {
  const state = { cards: {
    dueMastered: { box: 4, seen: 5, due: 900 },
    dueLearning: { box: 2, seen: 2, due: 800 },
    future: { box: 4, seen: 5, due: 1100 },
  } };
  assert.deepEqual(JSON.parse(JSON.stringify(ui.dueReviewSummary(state, 1000, 4))), { due: 2, evergreen: 1 });
  assert.equal(state.cards.dueMastered.box, 4);
});

test('G12：大部分單元精通且只剩少數時才給長尾登頂指引', () => {
  const units = [
    { key: 'a', label: '細胞', mastered: true },
    { key: 'b', label: '遺傳', mastered: true },
    { key: 'c', label: '生態', mastered: true },
    { key: 'd', label: '演化', mastered: false },
    { key: 'e', label: '分類', mastered: false },
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(ui.longTailUnits(units))), ['演化', '分類']);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.longTailUnits(units.slice(2)))), []);
});

test('H22：單次作答達門檻且未關閉才出現休息提醒', () => {
  assert.equal(ui.shouldShowRestReminder(29, false), false);
  assert.equal(ui.shouldShowRestReminder(30, false), true);
  assert.equal(ui.shouldShowRestReminder(60, true), false);
});

test('F9：新手檢查清單只保存三個布林完成狀態', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ui.normalizeOnboarding({ flashcard: 1, quiz: true, battle: 'yes', extra: true }))), {
    flashcard: true, quiz: true, battle: false,
  });
  assert.equal(ui.onboardingComplete({ flashcard: true, quiz: true, battle: true }), true);
});

test('Round4-5：精通數跨過門檻時同時回報新稱號與基地階段', () => {
  const ranks = [[0, '見習生'], [10, '初階科學家'], [30, '進階科學家']];
  const stages = [[0, '見習營帳'], [10, '進階實驗樓'], [30, '資深研究院']];
  assert.deepEqual(
    JSON.parse(JSON.stringify(ui.masteryPromotion(9, 10, ranks, stages))),
    { threshold: 10, rank: '初階科學家', stage: '進階實驗樓' },
  );
  assert.equal(ui.masteryPromotion(10, 10, ranks, stages), null);
  assert.equal(ui.masteryPromotion(10, 11, ranks, stages), null);
});
