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

  // box：學生對該詞的精熟度（Leitner 盒序 0-4）。新學者(box 低)先混入「明顯不同類」誘答
  // 建立正確關聯（放水）；熟手(box 高)全用同池近義誘答做細部辨異（加難）＝desirable difficulty 階梯。
  function pickDistractors(target, pool, count = 3, box = 4) {
    const samePool = pool.filter((t) => t.id !== target.id && t.distractor_pool === target.distractor_pool);
    const sameUnit = pool.filter((t) => t.id !== target.id && t.unit === target.unit && t.distractor_pool !== target.distractor_pool);
    const rest = pool.filter((t) => t.id !== target.id && t.unit !== target.unit);

    // box<=1 的新學者：先給不同單元的明顯誘答；box 越高越優先同池近義。
    const buckets = box <= 1
      ? [shuffle(rest), shuffle(sameUnit), shuffle(samePool)]
      : [shuffle(samePool), shuffle(sameUnit), shuffle(rest)];

    const picked = [];
    for (const bucket of buckets) {
      for (const t of bucket) {
        if (picked.length >= count) break;
        if (!picked.find((p) => p.id === t.id)) picked.push(t);
      }
      if (picked.length >= count) break;
    }
    return picked.slice(0, count);
  }

  // mode: 'term2def'（看詞條選定義）、'def2term'（看定義選詞條）、'cloze'（克漏字回想，產出型提取）。
  // box 傳入時用來調整誘答難度（見 pickDistractors）。cloze 只在呼叫端明確指定時產生
  //（自測用；對戰/融合共用路徑不傳 cloze，維持四選一）。
  function buildQuestion(target, pool, mode = null, box = 4) {
    const qMode = mode || (Math.random() < 0.5 ? 'term2def' : 'def2term');

    if (qMode === 'cloze') {
      const term = target.term;
      const example = String(target.example || '');
      const blanked = example.split(term).join('＿＿＿');
      return {
        mode: 'cloze',
        prompt: blanked,
        term,
        def: target.def,
        answerId: target.id,
        hasBlank: blanked !== example && example.length > 0,
      };
    }

    const distractors = pickDistractors(target, pool, 3, box);
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

  // 自測選題權重：讓「自測」變成間隔複習＋弱點優先的提取練習，而非純隨機刷題。
  // 到期(due<=now)且盒序低者最急、弱點分數高者加權、新字略優先於已精熟未到期者。
  function quizWeight(card, weakScore = 0, now = Date.now()) {
    const c = card || { box: 0, seen: 0, due: 0 };
    let w = 1; // 基礎權
    if (c.seen > 0 && c.due <= now) w += 3 + (4 - Math.min(c.box || 0, 4)); // 到期加成，盒序越低越急
    if (c.seen === 0) w += 1.5; // 新字略優先
    w += Math.min(weakScore || 0, 6); // 弱點加成（上限避免壟斷）
    return w;
  }

  // 依權重不放回抽 n 題（rng 可注入以利測試）。
  function weightedSample(items, weightOf, n, rng = Math.random) {
    const pool = items.map((item) => ({ item, w: Math.max(weightOf(item), 0.0001) }));
    const out = [];
    while (out.length < n && pool.length) {
      const total = pool.reduce((sum, x) => sum + x.w, 0);
      let r = rng() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) { r -= pool[idx].w; if (r <= 0) break; }
      if (idx >= pool.length) idx = pool.length - 1;
      out.push(pool[idx].item);
      pool.splice(idx, 1);
    }
    return out;
  }

  return { buildQuestion, pickDistractors, quizWeight, weightedSample };
})();
