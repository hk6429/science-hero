// 自測題型：四選一，題型隨機在「詞條選定義」「定義選詞條」之間交叉出。
// 誘答優先取同 distractor_pool，不足時退而求其次取同 unit，仍不足才取全體隨機。
const SciQuiz = (() => {
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickDistractors(target, pool, count = 3) {
    const samePool = pool.filter((t) => t.id !== target.id && t.distractor_pool === target.distractor_pool);
    const sameUnit = pool.filter((t) => t.id !== target.id && t.unit === target.unit && t.distractor_pool !== target.distractor_pool);
    const rest = pool.filter((t) => t.id !== target.id && t.unit !== target.unit);

    const picked = [];
    for (const bucket of [shuffle(samePool), shuffle(sameUnit), shuffle(rest)]) {
      for (const t of bucket) {
        if (picked.length >= count) break;
        if (!picked.find((p) => p.id === t.id)) picked.push(t);
      }
      if (picked.length >= count) break;
    }
    return picked.slice(0, count);
  }

  // mode: 'term2def'（看詞條選定義）或 'def2term'（看定義選詞條）
  function buildQuestion(target, pool, mode = null) {
    const qMode = mode || (Math.random() < 0.5 ? 'term2def' : 'def2term');
    const distractors = pickDistractors(target, pool, 3);
    const options = shuffle([target, ...distractors]);

    if (qMode === 'term2def') {
      return {
        mode: qMode,
        prompt: target.term,
        options: options.map((o) => ({ id: o.id, label: o.def })),
        answerId: target.id,
      };
    }
    return {
      mode: qMode,
      prompt: target.def,
      options: options.map((o) => ({ id: o.id, label: o.term })),
      answerId: target.id,
    };
  }

  return { buildQuestion, pickDistractors };
})();
