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

  return { recordAnswer, recordFlash, getWeakUnits, getWeakTerms, FAST_GUESS_MS, LUCKY_GUESS_MS };
})();
