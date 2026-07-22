import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = (file) => readFileSync(path.join(ROOT, file), 'utf8');

function loadClient(files, names, seed = {}) {
  const storage = { ...seed };
  const localStorage = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value); },
    removeItem: (key) => { delete storage[key]; },
  };
  const context = vm.createContext({ localStorage, console, Date, Math, JSON, setTimeout, clearTimeout });
  const combined = files.map(source).join('\n;\n');
  vm.runInContext(`${combined}\nglobalThis.__round2 = { ${names.join(', ')} };`, context);
  return { api: context.__round2, storage };
}

test('findings 1+7：精通稱號、基地與四科精靈延伸到長程收藏里程碑', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/quiz.js', 'js/economy.js', 'js/battle.js', 'js/base-store.js'],
    ['SciBattle', 'SciBaseStore'],
  );
  assert.deepEqual(Array.from(api.SciBaseStore.STAGES, (stage) => stage[0]), [0, 1, 10, 30, 80, 120, 200, 300, 400, 550, 700, 850, 1000]);
  assert.deepEqual(Array.from(api.SciBattle.COMPANION_TIERS, (tier) => tier.at), [0, 5, 20, 50, 100, 200]);
  const at100 = api.SciBattle.companionForSubject('nature', 100);
  const at200 = api.SciBattle.companionForSubject('nature', 200);
  assert.equal(at200.atk, at100.atk, '滿階＋只能是視覺榮譽，不得增加戰鬥數值');
  assert.equal(at200.leech, at100.leech);
  assert.equal(at200.leechChance, at100.leechChance);
  assert.equal(at200.next, null);

  const app = source('js/app.js');
  assert.match(app, /\[120,\s*'科學學者'\]/);
  assert.match(app, /\[200,\s*'科學大師'\]/);
  assert.match(app, /\[300,\s*'科學宗師'\]/);
  assert.match(app, /\[400,\s*'科學泰斗'\]/);
  assert.match(app, /\[550,\s*'科學巨擘'\]/);
  assert.match(app, /\[700,\s*'萬象宗師'\]/);
  assert.match(app, /\[850,\s*'星海先驅'\]/);
  assert.match(app, /\[1000,\s*'科學典藏家'\]/);
  assert.match(app, /再精通.*晉升/);
  assert.match(app, /已達頂點，繼續收藏每一張精通/);
});

test('Round4-5b：客觀答對跨過精通門檻時立即顯示稱號與基地升階慶祝', () => {
  const app = source('js/app.js');
  const record = app.slice(app.indexOf('function recordAnswer'), app.indexOf('function showEnergyGain'));
  assert.match(record, /masteryPromotion/);
  assert.match(record, /showMasteryPromotion/);
  assert.match(app, /基地已擴建為〈\$\{promotion\.stage\}〉/);
  assert.match(app, /playMilestoneTone\(\)/);
});

test('finding 8：巡禮依各科真實詞庫顯示全書精通與待收藏數', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/quiz.js', 'js/economy.js', 'js/battle.js'],
    ['SciBattle'],
  );
  const state = { cards: { e1: { box: 4 }, e2: { box: 3 }, b1: { box: 4 } } };
  const pools = {
    nature: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
    biology: [{ id: 'b1' }, { id: 'b2' }],
    chemphys: [], earth: [],
  };
  const progress = api.SciBattle.subjectProgress(state, 4, pools);
  assert.deepEqual(JSON.parse(JSON.stringify(progress.nature)), { mastered: 1, total: 3, remaining: 2, pct: 33 });
  assert.deepEqual(JSON.parse(JSON.stringify(progress.biology)), { mastered: 1, total: 2, remaining: 1, pct: 50 });

  const app = source('js/app.js');
  assert.doesNotMatch(app, /你點亮了整座科學宇宙/);
  assert.doesNotMatch(app, /科學領域登頂/);
  assert.doesNotMatch(app, /已滿階 ✓/);
  assert.match(app, /全書精通進度/);
  assert.match(app, /知識點等你收藏/);
  assert.match(app, /里程碑，不是終點/);
});

test('finding 2：無盡巡禮隨連勝增強對手並只保存歷史最佳', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/quiz.js', 'js/economy.js', 'js/battle.js'],
    ['SciBattle'],
  );
  const first = api.SciBattle.endlessOpponent(0);
  const later = api.SciBattle.endlessOpponent(16);
  assert.ok(later.acc > first.acc);
  assert.ok(later.endlessLevel > first.endlessLevel);
  const state = { battle: { beaten: [], endlessBest: 3 } };
  assert.equal(api.SciBattle.recordEndlessBest(state, 2), 3);
  assert.equal(api.SciBattle.recordEndlessBest(state, 6), 6);
  assert.equal(state.battle.endlessBest, 6);

  const battle = source('js/battle.js');
  assert.match(battle, /無盡巡禮/);
  assert.match(battle, /最佳連勝/);
  assert.match(battle, /不影響段位/);
});

test('Round3-2：無盡巡禮 5/10/15/20 連勝各慶祝一次，並有基地與戰績卡展示出口', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/quiz.js', 'js/economy.js', 'js/battle.js', 'js/base-store.js'],
    ['SciBattle', 'SciBaseStore'],
  );
  const state = { battle: { beaten: [], endlessBest: 10 } };
  assert.equal(api.SciBattle.claimEndlessMilestone(state, 4), null);
  assert.deepEqual(JSON.parse(JSON.stringify(api.SciBattle.claimEndlessMilestone(state, 5))), {
    wins: 5, icon: '🔥', title: '知識之火守護者',
  });
  assert.equal(api.SciBattle.claimEndlessMilestone(state, 5), null, '同一里程碑不可重複領取');
  assert.equal(api.SciBattle.claimEndlessMilestone(state, 6), null);
  assert.deepEqual(JSON.parse(JSON.stringify(api.SciBattle.claimEndlessMilestone(state, 10))), {
    wins: 10, icon: '🏅', title: '巡禮知識行者',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(api.SciBaseStore.getWall(state).at(-1))), {
    icon: '♾️', label: '無盡巡禮最佳', value: '10 連勝',
  });

  const battle = source('js/battle.js');
  assert.match(battle, /endless-milestone-toast/);
  assert.match(battle, /claimEndlessMilestone/);
  assert.match(source('js/app.js'), /無盡巡禮最佳/);
});

test('Round4-7：無盡巡禮里程碑觸發音效回呼與專屬進場動畫', () => {
  const battle = source('js/battle.js');
  const app = source('js/app.js');
  const css = source('css/style.css');
  assert.match(battle, /ctx\.onMilestone\?\.\(milestone\)/);
  assert.match(app, /onMilestone:\s*\(\)\s*=>\s*playMilestoneTone\(\)/);
  assert.match(css, /\.endless-milestone-toast[\s\S]*animation:\s*endlessMilestoneIn/);
  assert.match(css, /\.endless-milestone-toast::after[\s\S]*content:/);
});

test('finding 4：零作答新手先看引導，隱藏零值與每日任務直到首題完成', () => {
  const app = source('js/app.js');
  const css = source('css/style.css');
  assert.match(app, /state\.stats\.totalReviews === 0/);
  assert.match(app, /dailyGoal\.hidden = isNew/);
  assert.match(app, /classList\.toggle\('is-new-player', isNew\)/);
  assert.match(app, /insertBefore\(guide, heroStats\)/);
  assert.match(css, /\.site-header\.is-new-player \.hero-stat\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.site-header\.is-new-player \.hero-mission[\s\S]*\.site-header\.is-new-player \.rank-next-goal\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(css, /\.site-header\.is-new-player \.new-player-guide\s*\{[^}]*order:\s*-1/s);
  assert.match(css, /開始練習，累積你的第一個戰功/);
});

test('Round3-4：新手首答在 header 重排前擷取錨點位置', () => {
  const app = source('js/app.js');
  const answerFlash = app.slice(app.indexOf('function answerFlash'), app.indexOf('// ================= 自測'));
  assert.ok(answerFlash.indexOf('const anchorTop = body.getBoundingClientRect().top') < answerFlash.indexOf('renderHeroStats()'));
  assert.match(answerFlash, /requestAnimationFrame/);
});

test('Round4-12：新手首答以學習卡片為錨點補償 header 高度變化', () => {
  const app = source('js/app.js');
  const answerFlash = app.slice(app.indexOf('function answerFlash'), app.indexOf('// ================= 自測'));
  assert.match(answerFlash, /getBoundingClientRect\(\)\.top/);
  assert.match(answerFlash, /window\.scrollBy\(0,\s*newAnchorTop - anchorTop\)/);
  assert.doesNotMatch(answerFlash, /window\.scrollTo\(0, scrollY\)/);
});

test('Round3-5：高階與超界主樓圖片 clamp 後 fallback 永不顯示 undefined', () => {
  const { api } = loadClient(['js/base-ui.js'], ['SciBaseUI']);
  const viewAt = (stage) => ({
    main: { stage, name: '科學大典藏館', masteredCount: 1000, next: null },
    plaques: { main: '科學研究基地' }, pavilions: [], decorations: [], motto: null, balance: 0,
  });
  for (const stage of [5, 8, 9, 12, 999]) {
    const html = api.SciBaseUI.sceneHtml(viewAt(stage));
    assert.match(html, /main-s5\.png/);
    assert.doesNotMatch(html, /undefined/);
    assert.match(html, /textContent:'[^']+'/);
  }
});

test('Round4-6：主樓 stage5–12 有漸進金色光暈，最高階有典藏之冠', () => {
  const css = source('css/style.css');
  const baseUi = source('js/base-ui.js');
  assert.match(css, /\.sb-main\[data-stage="5"\][\s\S]*drop-shadow/);
  assert.match(css, /\.sb-main\[data-stage="12"\]::before[\s\S]*典藏之冠/);
  assert.match(baseUi, /MAIN_EMOJI 只是圖片載入失敗時的 fallback/);
});

test('Round3-6：PvE 傷害跳字新回合歸零，答錯即時顯示自己 -8', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/quiz.js', 'js/economy.js', 'js/battle.js'],
    ['SciBattle'],
  );
  const state = { pHp: 100, combo: 2, shieldLeft: 0, foeDamage: 17, meDamage: 9 };
  api.SciBattle.clearDamagePops(state);
  assert.deepEqual({ foeDamage: state.foeDamage, meDamage: state.meDamage }, { foeDamage: 0, meDamage: 0 });
  api.SciBattle.applyWrongAnswer(state);
  assert.deepEqual({ pHp: state.pHp, foeDamage: state.foeDamage, meDamage: state.meDamage }, { pHp: 92, foeDamage: 0, meDamage: 8 });
  assert.match(source('js/battle.js'), /function nextRound\(\)\s*\{[\s\S]*clearDamagePops\(battleState\)[\s\S]*SciQuiz\.buildQuestion/);
});

test('Round4-9：PvE 夥伴與稚靈追擊同步累加到傷害跳字總量', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/quiz.js', 'js/economy.js', 'js/battle.js'],
    ['SciBattle'],
  );
  const state = { oHp: 88, foeDamage: 12, bestCombo: 0, totalDamage: 12, maxDamage: 12 };
  api.SciBattle.applyFollowUpDamage(state, 9, 1);
  api.SciBattle.applyFollowUpDamage(state, 5, 1);
  assert.deepEqual(
    { oHp: state.oHp, foeDamage: state.foeDamage, totalDamage: state.totalDamage },
    { oHp: 74, foeDamage: 26, totalDamage: 26 },
  );
});

test('Round3-7：班級榜只使用可重抽的白名單科學代號，前後端都拒絕真名', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/quiz.js', 'js/economy.js', 'js/battle.js', 'js/rtbattle.js'],
    ['SciRtBattle'],
  );
  const nick = api.SciRtBattle.genNick(api.SciRtBattle.mulberry32(9));
  assert.equal(api.SciRtBattle.isValidNick(nick), true);
  assert.equal(api.SciRtBattle.isValidNick('王小明'), false);

  const board = source('js/leaderboard.js');
  assert.match(board, /id="classboard-nick-preview"/);
  assert.match(board, /id="classboard-nick-reroll"/);
  assert.doesNotMatch(board, /id="classboard-nick"[^>]*<input|<input id="classboard-nick"/);
  assert.match(board, /SciRtBattle\.isValidNick\(nick\)/);
  assert.match(source('functions/api/classboard.js'), /isValidNick\(nick\)/);
});

test('Round4-3：班級科學代號依班級碼與科目持久化，重開後讀回同一值', () => {
  const storage = {};
  const context = vm.createContext({
    localStorage: {
      getItem: (key) => storage[key] ?? null,
      setItem: (key, value) => { storage[key] = String(value); },
    },
    window: {}, document: {}, location: { hostname: 'localhost' }, URLSearchParams,
    SciRtBattle: { genNick: () => '好奇的電子', isValidNick: () => true },
  });
  vm.runInContext(`${source('js/leaderboard.js')}\nglobalThis.__board = SciClassBoard;`, context);
  const board = context.__board;
  assert.equal(board.nickStorageKey('701a', 'biology'), 'sci_classnick:701A:biology');
  board.rememberNick('701a', 'biology', '沉穩的石英');
  assert.equal(board.rememberedNick('701A', 'biology'), '沉穩的石英');
  assert.equal(board.rememberedNick('701A', 'earth'), '', '不同科目不可共用代號 key');
});

test('Round4-14b：國小自然可開啟班級協力榜，入口不再標示限國中', () => {
  const board = source('js/leaderboard.js');
  const app = source('js/app.js');
  const html = source('index.html');
  assert.match(board, /new Set\(\['nature', 'biology', 'chemphys', 'earth'\]\)/);
  assert.doesNotMatch(app, /juniorSubjects/);
  assert.match(html, />🏫 班級協力榜</);
  assert.doesNotMatch(html, /班級協力榜（國中）/);
});

test('finding 5：頂列只回報今日已練題數，不與答對十題任務混用門檻', () => {
  const html = source('index.html');
  const app = source('js/app.js');
  assert.match(html, /今日已練 0 題/);
  assert.match(app, /今日已練 \$\{daily\} 題/);
  assert.doesNotMatch(app, /今日目標：複習/);
});

test('finding 6：閃卡新手任務不承諾五張，與一次作答即可打勾一致', () => {
  const html = source('index.html');
  assert.match(html, /先翻幾張閃卡熟悉一下/);
  assert.doesNotMatch(html, /先練 5 張閃卡/);
});

test('finding 10：音效偏好可持久化，預設開啟且減少動態使用者預設靜音', () => {
  const { api } = loadClient(['js/ui-logic.js'], ['SciUiLogic']);
  assert.equal(api.SciUiLogic.soundEnabled(null, false), true);
  assert.equal(api.SciUiLogic.soundEnabled(null, true), false);
  assert.equal(api.SciUiLogic.soundEnabled('1', false), false);
  assert.equal(api.SciUiLogic.soundEnabled('0', true), true, '使用者明確開啟時應尊重選擇');
  const html = source('index.html');
  const app = source('js/app.js');
  assert.match(html, /id="sound-toggle"/);
  assert.match(app, /sci_sound_off/);
  assert.match(app, /if \(!soundEnabled\(\)\) return/);
});

test('Round4-13：閃卡以「熟悉度」取代新手看不懂的「盒序」', () => {
  const app = source('js/app.js');
  const flashcard = app.slice(app.indexOf('function renderFlashcard'), app.indexOf('function answerFlash'));
  assert.match(flashcard, /熟悉度 \$\{card\.box \+ 1\}/);
  assert.doesNotMatch(flashcard, />盒序 /);
});

test('finding 11：PvE 結算會標示正解與選錯，並保留短暫視覺停留', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/quiz.js', 'js/economy.js', 'js/battle.js'],
    ['SciBattle'],
  );
  assert.equal(api.SciBattle.answerFeedbackClass('a', 'a', 'b'), 'correct');
  assert.equal(api.SciBattle.answerFeedbackClass('b', 'a', 'b'), 'wrong');
  assert.equal(api.SciBattle.answerFeedbackClass('c', 'a', 'b'), '');
  const battle = source('js/battle.js');
  assert.match(battle, /render\(true, \{ chosenId, answerId: q\.answerId \}\)/);
  assert.match(battle, /correct \? 300 : 500/);
});

test('finding 12：科學奇遇與休息提醒同時存在時分層且錯位顯示', () => {
  const css = source('css/style.css');
  assert.match(css, /\.science-surprise\s*\{[^}]*z-index:\s*2500/s);
  assert.match(css, /body:has\(\.rest-reminder\) \.science-surprise\s*\{[^}]*bottom:\s*96px/s);
});

test('finding 13：觸控按下測驗選項時立即縮放回饋', () => {
  const css = source('css/style.css');
  assert.match(css, /\.quiz-option:active:not\(:disabled\)\s*\{[^}]*transform:\s*scale\(\.98\)/s);
});

test('finding 14：融合答錯零扣款，答對後保證成功且不再讀隨機結果', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/quiz.js', 'js/weak.js', 'js/economy.js', 'js/battle.js', 'js/fusion-store.js'],
    ['SciFusionStore'],
    { sci_econ: JSON.stringify({ balance: 60 }) },
  );
  const state = { cards: {}, weakLog: [] };
  for (let i = 1; i <= 100; i += 1) {
    state.cards[`e${String(i).padStart(4, '0')}`] = { box: 4 };
    state.cards[`b${String(i).padStart(4, '0')}`] = { box: 4 };
  }
  for (let i = 0; i < 15; i += 1) {
    state.weakLog.push({ termId: 'e0001', correct: true }, { termId: 'b0001', correct: true });
  }
  const fstate = api.SciFusionStore.load();
  const wrong = api.SciFusionStore.fuse(fstate, state, 'nature', 'biology', {
    knowledgeCheckPassed: false, today: '2026-07-22', rng: () => 0,
  });
  assert.equal(wrong.reason, 'knowledge-check');
  assert.equal(api.SciFusionStore.crystalBalance(), 60);
  const correct = api.SciFusionStore.fuse(fstate, state, 'nature', 'biology', {
    knowledgeCheckPassed: true, today: '2026-07-22', rng: () => 0,
  });
  assert.equal(correct.result, 'success');
  assert.equal(api.SciFusionStore.crystalBalance(), 30);
});

test('Round4-8：融合揭示題答對立即標綠、閃卡並顯示正向橫幅，答錯也標出正解', () => {
  const app = source('js/app.js');
  const reveal = app.slice(app.indexOf('function renderRevealQuestion'), app.indexOf('function renderNicknamePanel'));
  assert.match(reveal, /option\.dataset\.id === q\.answerId[\s\S]*classList\.add\('correct'\)/);
  assert.match(reveal, /classList\.add\('flash-correct'\)/);
  assert.match(reveal, /✓ 答對了！/);
  assert.match(reveal, /setTimeout\(renderFusionLab,\s*(?:[6-9]\d\d|\d{4,})\)/, '正向回饋應留下可感知時間');
});

test('findings 3+16：累計練習天數文案一致，不再使用守繼', () => {
  const base = source('js/base-store.js');
  const html = source('index.html');
  assert.match(base, /label: '累計天數'/);
  assert.doesNotMatch(base, /守繼天數/);
  assert.match(html, /累計練習/);
});

test('finding 15：閃卡自評封頂快熟盒，客觀答對才能跨進精熟盒', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/flashcard.js'],
    ['SciStore', 'SciFlashcard'],
  );
  const state = api.SciStore.load();
  for (let i = 0; i < 8; i += 1) api.SciFlashcard.markResult(state, 'e0001', true);
  assert.equal(api.SciStore.getCard(state, 'e0001').box, 3);
  state.cards.e0001.due = 0;
  api.SciFlashcard.bumpBoxIfDue(state, 'e0001', true, Date.now());
  assert.equal(api.SciStore.getCard(state, 'e0001').box, 4);
});

test('finding 17：客觀答對會清除該詞較早的弱點分，只保留之後的新錯誤', () => {
  const { api } = loadClient(['js/weak.js'], ['SciWeak']);
  const state = { weakLog: [
    { termId: 'e1', unit: 'life', correct: false, guessed: false },
    { termId: 'e1', unit: 'life', correct: false, guessed: true },
    { termId: 'e1', unit: 'life', correct: true, luckyGuess: false },
    { termId: 'e1', unit: 'life', correct: false, guessed: false },
    { termId: 'e2', unit: 'life', correct: false, guessed: false },
    { termId: 'e2', unit: 'life', correct: true, luckyGuess: false },
  ] };
  assert.deepEqual(JSON.parse(JSON.stringify(api.SciWeak.getWeakTerms(state))), [{ termId: 'e1', score: 1 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(api.SciWeak.getWeakUnits(state, { life: '生命' }))), [{ unit: 'life', label: '生命', score: 1 }]);
});

test('Round4-4：跨單元鷹架誘答的答對只衰減弱點，同單元鑑別題才清零', () => {
  const { api } = loadClient(['js/weak.js'], ['SciWeak']);
  const scaffold = { weakLog: [
    { termId: 'e1', unit: 'life', correct: false, source: 'quiz' },
    { termId: 'e1', unit: 'life', correct: true, source: 'quiz', recoveryStrength: 'scaffold' },
  ] };
  assert.deepEqual(JSON.parse(JSON.stringify(api.SciWeak.getWeakTerms(scaffold))), [{ termId: 'e1', score: 0.5 }]);

  const discriminating = { weakLog: [
    { termId: 'e1', unit: 'life', correct: false, source: 'quiz' },
    { termId: 'e1', unit: 'life', correct: true, source: 'quiz', recoveryStrength: 'strong' },
  ] };
  assert.deepEqual(JSON.parse(JSON.stringify(api.SciWeak.getWeakTerms(discriminating))), []);
});

test('Round4-4b：出題器標記誘答鑑別度並傳入弱點記錄', () => {
  const { api } = loadClient(['js/quiz.js'], ['SciQuiz']);
  const target = { id: 'a', term: '甲', def: '甲義', unit: 'u1', distractor_pool: 'p1' };
  const rest = [1, 2, 3].map((n) => ({ id: `r${n}`, term: `異${n}`, def: `異義${n}`, unit: 'u2', distractor_pool: 'p2' }));
  const same = [1, 2, 3].map((n) => ({ id: `s${n}`, term: `近${n}`, def: `近義${n}`, unit: 'u1', distractor_pool: 'p1' }));
  assert.equal(api.SciQuiz.buildQuestion(target, [target, ...rest, ...same], 'term2def', 0).recoveryStrength, 'scaffold');
  assert.equal(api.SciQuiz.buildQuestion(target, [target, ...same], 'term2def', 4).recoveryStrength, 'strong');
  assert.match(source('js/app.js'), /recoveryStrength/);
});

test('Round3-8：閃卡主觀「我記得」不會清除先前客觀弱點分', () => {
  const { api } = loadClient(['js/weak.js'], ['SciWeak']);
  const state = { weakLog: [
    { termId: 'e1', unit: 'life', correct: false, guessed: true, source: 'quiz' },
  ] };
  api.SciWeak.recordFlash(state, { termId: 'e1', unit: 'life', correct: true });
  assert.deepEqual(JSON.parse(JSON.stringify(api.SciWeak.getWeakTerms(state))), [{ termId: 'e1', score: 1.5 }]);
});

test('Round3-9：克漏字自評封頂 box3 且不清弱點，box4 留給客觀答對', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/flashcard.js', 'js/weak.js'],
    ['SciStore', 'SciFlashcard', 'SciWeak'],
  );
  const state = api.SciStore.load();
  api.SciStore.setCard(state, 'e1', { box: 3, due: 0, seen: 5, wrong: 1 });
  api.SciFlashcard.bumpBoxIfDue(state, 'e1', true, Date.now(), 3);
  assert.equal(api.SciStore.getCard(state, 'e1').box, 3, '克漏字自評最多到快熟盒');
  state.cards.e1.due = 0;
  api.SciFlashcard.bumpBoxIfDue(state, 'e1', true, Date.now());
  assert.equal(api.SciStore.getCard(state, 'e1').box, 4, '客觀答對仍可進精熟盒');

  const weakState = { weakLog: [
    { termId: 'e1', unit: 'life', correct: false, guessed: false, source: 'quiz' },
  ] };
  api.SciWeak.recordAnswer(weakState, {
    termId: 'e1', unit: 'life', correct: true, elapsedMs: 5000, source: 'cloze',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(api.SciWeak.getWeakTerms(weakState))), [{ termId: 'e1', score: 1 }]);

  const app = source('js/app.js');
  assert.match(app, /settleAnswer\(body, cardEl, target, correct, elapsed, null, SciQuiz\.questionContentLength\(q\), 'cloze'\)/);
});

test('Round4-11：克漏字主觀自評照常記錄學習，但不觸發晶能發放', () => {
  const app = source('js/app.js');
  const record = app.slice(app.indexOf('function recordAnswer'), app.indexOf('function showEnergyGain'));
  assert.match(record, /source === 'cloze'[\s\S]*earned:\s*0/);
  assert.match(record, /SciWeak\.recordAnswer/);
  assert.match(record, /SciFlashcard\.bumpBoxIfDue/);
});

test('Round4-1：克漏字主觀答對不會把已精通 box4 降回 box3', () => {
  const { api } = loadClient(
    ['js/store.js', 'js/flashcard.js'],
    ['SciStore', 'SciFlashcard'],
  );
  const state = api.SciStore.load();
  api.SciStore.setCard(state, 'e1', { box: 4, due: 0, seen: 8, wrong: 0 });
  api.SciFlashcard.bumpBoxIfDue(state, 'e1', true, Date.now(), 3);
  assert.equal(api.SciStore.getCard(state, 'e1').box, 4, '答對只能維持或推進熟悉度，不得掉精熟');
});

test('finding 18：克漏字預設不洩漏完整定義，按需要提示才顯示低洩漏線索', () => {
  const { api } = loadClient(['js/quiz.js'], ['SciQuiz']);
  const target = { term: '光合作用', def: '植物利用光能製造養分的作用', unit: 'life' };
  const hint = api.SciQuiz.clozeHint(target);
  assert.match(hint, /4 個字/);
  assert.match(hint, /「光」/);
  assert.ok(!hint.includes(target.def));
  const app = source('js/app.js');
  assert.match(app, /id="cloze-hint-toggle"/);
  assert.match(app, /id="cloze-hint" hidden/);
  assert.match(app, /複習說明：\$\{target\.def\}/);
});

test('finding 19：僥倖答對門檻隨題目長度調整，並依近期正確率判斷是否不穩', () => {
  const { api } = loadClient(['js/quiz.js', 'js/weak.js'], ['SciQuiz', 'SciWeak']);
  assert.equal(api.SciQuiz.questionContentLength({ prompt: '題幹', options: [{ label: '甲乙' }, { label: '丙' }] }), 5);
  assert.ok(api.SciWeak.readingThresholdMs(100) > api.SciWeak.readingThresholdMs(10));
  const unstable = { weakLog: [
    { termId: 'e1', unit: 'life', correct: false },
    { termId: 'e1', unit: 'life', correct: true },
    { termId: 'e1', unit: 'life', correct: true },
  ] };
  api.SciWeak.recordAnswer(unstable, {
    termId: 'e1', unit: 'life', correct: true, elapsedMs: 1000, seen: 99, contentLength: 100,
  });
  assert.equal(unstable.weakLog.at(-1).luckyGuess, true, '看過很多次但近期表現不穩，過快答對仍應標記');

  const stable = { weakLog: Array.from({ length: 5 }, () => ({ termId: 'e2', unit: 'life', correct: true })) };
  api.SciWeak.recordAnswer(stable, {
    termId: 'e2', unit: 'life', correct: true, elapsedMs: 100, seen: 0, contentLength: 100,
  });
  assert.equal(stable.weakLog.at(-1).luckyGuess, false, '近期穩定答對者不因速度快被誤標');
  assert.match(source('js/app.js'), /SciQuiz\.questionContentLength/);
  assert.match(source('js/battle.js'), /SciQuiz\.questionContentLength/);
});
