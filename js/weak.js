// 弱點聚合：合併「答錯」「秒答但答錯（判定用猜的）」兩個訊號，依 unit 彙整。
const SciWeak = (() => {
  const FAST_GUESS_MS = 1500;
  const LUCKY_GUESS_MS = 800;

  function isObjectiveSource(source) {
    return source !== 'flash' && source !== 'cloze';
  }

  function readingThresholdMs(contentLength) {
    const chars = Math.max(0, Number(contentLength) || 0);
    return Math.min(4000, Math.max(LUCKY_GUESS_MS, 500 + chars * 25));
  }

  function recentPerformanceUnstable(log, termId) {
    const recent = log.filter((entry) => entry.termId === termId && isObjectiveSource(entry.source)).slice(-5);
    if (recent.length < 3) return true;
    return recent.filter((entry) => entry.correct).length / recent.length < 0.8;
  }

  // 記錄一次作答結果（quiz 呼叫）：{ termId, unit, correct, elapsedMs }
  function recordAnswer(state, { termId, unit, correct, elapsedMs, contentLength = 0, source = 'quiz' }) {
    state.weakLog = state.weakLog || [];
    const luckyGuess = correct
      && elapsedMs < readingThresholdMs(contentLength)
      && recentPerformanceUnstable(state.weakLog, termId);
    state.weakLog.push({
      termId,
      unit,
      correct,
      guessed: !correct && elapsedMs < FAST_GUESS_MS,
      luckyGuess,
      source,
      t: Date.now(),
    });
    // 只保留最近 300 筆，避免 localStorage 無限成長
    if (state.weakLog.length > 300) state.weakLog = state.weakLog.slice(-300);
  }

  function recordFlash(state, { termId, unit, correct }) {
    recordAnswer(state, { termId, unit, correct, elapsedMs: Infinity, seen: Infinity, source: 'flash' });
  }

  function recoveredWeakScores(log) {
    const score = new Map();
    const unitByTerm = new Map();
    for (const entry of log) {
      unitByTerm.set(entry.termId, entry.unit);
      if (entry.correct && !isObjectiveSource(entry.source)) continue;
      if (entry.correct && !entry.luckyGuess) {
        score.set(entry.termId, 0);
        continue;
      }
      const added = entry.luckyGuess ? 0.75 : 1 + (entry.guessed ? 0.5 : 0);
      score.set(entry.termId, (score.get(entry.termId) || 0) + added);
    }
    return { score, unitByTerm };
  }

  // 回傳依 unit 彙整的弱點分數；一次客觀答對會清掉該詞較早的錯誤，只保留之後的新訊號。
  function getWeakUnits(state, unitLabels) {
    const log = state.weakLog || [];
    const recovered = recoveredWeakScores(log);
    const score = new Map();
    recovered.score.forEach((value, termId) => {
      if (value <= 0) return;
      const unit = recovered.unitByTerm.get(termId);
      score.set(unit, (score.get(unit) || 0) + value);
    });
    return [...score.entries()]
      .map(([unit, s]) => ({ unit, label: unitLabels[unit] || unit, score: s }))
      .sort((a, b) => b.score - a.score);
  }

  function getWeakTerms(state, limit = 10) {
    const log = state.weakLog || [];
    const { score } = recoveredWeakScores(log);
    return [...score.entries()]
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([termId, s]) => ({ termId, score: s }));
  }

  // 校準落差：孩子在閃卡自評「我記住了」(flash+correct)，之後同一個詞在自測答錯(quiz+wrong)。
  // 代表「自認會、其實還沒真的會」——純從 weakLog 依時間序推導，不新增追蹤欄位。
  function getCalibrationMisses(state) {
    const log = state.weakLog || [];
    const lastClaimed = {}; // termId -> 最近一次自評記住的時間
    const misses = {};      // termId -> 落差次數（純物件，跨測試 realm 也安全）
    for (const entry of log) {
      if (entry.source === 'flash' && entry.correct) {
        lastClaimed[entry.termId] = entry.t;
      } else if (entry.source === 'quiz' && !entry.correct && entry.termId in lastClaimed) {
        if (entry.t >= lastClaimed[entry.termId]) {
          misses[entry.termId] = (misses[entry.termId] || 0) + 1;
          delete lastClaimed[entry.termId]; // 一次落差只記一次，下次自評才會重新計
        }
      }
    }
    return misses;
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
      // 0 題不寫「正確率 0%」——不誠實也打擊士氣，改標「尚無作答紀錄」。
      const acc = recent.total ? `近 30 題正確率 ${Math.round(recent.accuracy * 100)}%（${recent.total} 題）` : '尚無作答紀錄';
      return `${subject.label}：精通 ${mastered} 張｜${acc}`;
    });
    const weakLines = getWeakTerms(state, 10)
      .map((entry) => termById.get(entry.termId))
      .filter(Boolean)
      .map((term, index) => `${index + 1}. ${term.term}`);
    // 誠實透明：把系統已算好的「疑似用猜的」訊號攤給家長（資料已在 weakLog，不新增追蹤）。
    const luckyCount = (state.weakLog || []).filter((entry) => entry.luckyGuess).length;
    const guessLine = luckyCount
      ? `最近有 ${luckyCount} 題疑似靠猜答對（建議請孩子解釋為什麼對，確認是真的理解）。`
      : '最近沒有明顯「疑似靠猜」的作答，答對大多是真的想過的。';
    // 校準落差：自認記住卻在自測答錯的詞，最需要回頭複習。
    const calibMisses = getCalibrationMisses(state);
    const calibTerms = Object.keys(calibMisses)
      .map((termId) => termById.get(termId))
      .filter(Boolean)
      .slice(0, 5)
      .map((term) => term.term);
    const calibLine = calibTerms.length
      ? `有 ${calibTerms.length} 個詞孩子自認「記住了」，之後自測卻答錯（${calibTerms.join('、')}）——這幾個最值得再一起看一次。`
      : '目前沒有「自認記住卻答錯」的落差，自我評估算準。';
    return [
      '科學英雄學習摘要',
      '',
      '各科學習概況',
      ...subjectLines,
      '',
      '學習誠實度',
      guessLine,
      calibLine,
      '',
      '目前最需要加強的詞（最多 10 個）',
      ...(weakLines.length ? weakLines : ['目前尚無明顯弱點詞。']),
      '',
      '＊以上為本裝置的自我練習紀錄，未經雲端驗證，供陪伴孩子時參考。',
    ].join('\n');
  }

  return { recordAnswer, recordFlash, getWeakUnits, getWeakTerms, getCalibrationMisses, buildFamilySummary, readingThresholdMs, recentPerformanceUnstable, FAST_GUESS_MS, LUCKY_GUESS_MS };
})();
