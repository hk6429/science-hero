// 弱點聚合：合併「答錯」「秒答但答錯（判定用猜的）」兩個訊號，依 unit 彙整。
const SciWeak = (() => {
  const FAST_GUESS_MS = 1500;
  const LUCKY_GUESS_MS = 800;
  const LOW_FAMILIARITY_SEEN = 2;

  // 記錄一次作答結果（quiz 呼叫）：{ termId, unit, correct, elapsedMs }
  function recordAnswer(state, { termId, unit, correct, elapsedMs, seen = 0, source = 'quiz' }) {
    state.weakLog = state.weakLog || [];
    state.weakLog.push({
      termId,
      unit,
      correct,
      guessed: !correct && elapsedMs < FAST_GUESS_MS,
      luckyGuess: correct && elapsedMs < LUCKY_GUESS_MS && seen < LOW_FAMILIARITY_SEEN,
      source,
      t: Date.now(),
    });
    // 只保留最近 300 筆，避免 localStorage 無限成長
    if (state.weakLog.length > 300) state.weakLog = state.weakLog.slice(-300);
  }

  function recordFlash(state, { termId, unit, correct }) {
    recordAnswer(state, { termId, unit, correct, elapsedMs: Infinity, seen: Infinity, source: 'flash' });
  }

  // 回傳依 unit 彙整的弱點分數（答錯 +1，猜測額外 +0.5），由高到低排序。
  function getWeakUnits(state, unitLabels) {
    const log = state.weakLog || [];
    const score = new Map();
    for (const entry of log) {
      if (entry.correct && !entry.luckyGuess) continue;
      const s = (score.get(entry.unit) || 0) + (entry.luckyGuess ? 0.75 : 1 + (entry.guessed ? 0.5 : 0));
      score.set(entry.unit, s);
    }
    return [...score.entries()]
      .map(([unit, s]) => ({ unit, label: unitLabels[unit] || unit, score: s }))
      .sort((a, b) => b.score - a.score);
  }

  function getWeakTerms(state, limit = 10) {
    const log = state.weakLog || [];
    const score = new Map();
    for (const entry of log) {
      if (entry.correct && !entry.luckyGuess) continue;
      const s = (score.get(entry.termId) || 0) + (entry.luckyGuess ? 0.75 : 1 + (entry.guessed ? 0.5 : 0));
      score.set(entry.termId, s);
    }
    return [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([termId, s]) => ({ termId, score: s }));
  }

  function buildFamilySummary(state, subjects, termsBySubject, maxBox, accuracyBySubject) {
    const termById = new Map();
    subjects.forEach((subject) => {
      (termsBySubject[subject.key] || []).forEach((term) => termById.set(term.id, term));
    });
    const subjectLines = subjects.map((subject) => {
      const subjectTerms = termsBySubject[subject.key] || [];
      const mastered = subjectTerms.filter((term) => ((state.cards || {})[term.id] || {}).box >= maxBox).length;
      const recent = accuracyBySubject(state, subject.key);
      const pct = recent.total ? Math.round(recent.accuracy * 100) : 0;
      return `${subject.label}：精通 ${mastered} 張｜近 30 題正確率 ${pct}%（${recent.total} 題）`;
    });
    const weakLines = getWeakTerms(state, 10)
      .map((entry) => termById.get(entry.termId))
      .filter(Boolean)
      .map((term, index) => `${index + 1}. ${term.term}`);
    return [
      '科學英雄學習摘要',
      '',
      '各科學習概況',
      ...subjectLines,
      '',
      '目前最需要加強的詞（最多 10 個）',
      ...(weakLines.length ? weakLines : ['目前尚無明顯弱點詞。']),
    ].join('\n');
  }

  return { recordAnswer, recordFlash, getWeakUnits, getWeakTerms, buildFamilySummary, FAST_GUESS_MS, LUCKY_GUESS_MS };
})();
