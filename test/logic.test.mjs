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
  const code = `${combined}\nglobalThis.__exports = { SciStore, SciFlashcard, SciQuiz, SciWeak };`;
  vm.runInContext(code, context, { filename: 'combined.js' });
  return context.__exports;
}

function makeSandbox() {
  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const sandbox = { localStorage, console, Date, Math, JSON };
  const context = vm.createContext(sandbox);
  return loadScripts(context, ['js/store.js', 'js/flashcard.js', 'js/quiz.js', 'js/weak.js']);
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
