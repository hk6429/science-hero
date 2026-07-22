// Leitner 5 盒間隔複習引擎。box 0-4，間隔天數對應 BOX_INTERVAL_DAYS。
const SciFlashcard = (() => {
  const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14];
  const ROUND_SIZE = 20;

  function nextDue(box) {
    const days = BOX_INTERVAL_DAYS[Math.min(box, BOX_INTERVAL_DAYS.length - 1)];
    return Date.now() + days * 86400000;
  }

  // 把同單元叢集的新字交錯打散（round-robin across units），避免 blocked practice、
  // 讓同回合的新字跨單元交錯出現＝interleaving，強化辨異學習。
  function interleaveByUnit(items) {
    const groups = new Map();
    for (const item of items) {
      const unit = (item.term && item.term.unit) || '';
      if (!groups.has(unit)) groups.set(unit, []);
      groups.get(unit).push(item);
    }
    const buckets = [...groups.values()];
    const out = [];
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const bucket of buckets) {
        if (bucket.length) { out.push(bucket.shift()); progressed = true; }
      }
    }
    return out;
  }

  // 回傳本回合要複習的詞條：逾期優先，不足補新字（box===0 且 seen===0）。
  function getRoundQueue(state, terms, roundSize = ROUND_SIZE) {
    const now = Date.now();
    const withCard = terms.map((t) => ({ term: t, card: SciStore.getCard(state, t.id) }));

    const due = withCard
      .filter((x) => x.card.seen > 0 && x.card.due <= now)
      .sort((a, b) => a.card.due - b.card.due);

    // 新字段做跨單元交錯（逾期段維持到期先後不動）。
    const fresh = interleaveByUnit(withCard.filter((x) => x.card.seen === 0));

    const queue = [...due, ...fresh].slice(0, roundSize);
    return queue.map((x) => x.term);
  }

  // 只更新盒序本身，不動 totalReviews/streak——給呼叫端（自測/閃卡）自己決定何時記那些全域統計，
  // 避免同一次作答被算兩次。閃卡與自測共用這個函式，讓「戰功」不再只認閃卡、自測答對也算數。
  function bumpBox(state, id, correct, cap = BOX_INTERVAL_DAYS.length - 1, objective = true) {
    const card = SciStore.getCard(state, id);
    // 封頂限制「這次最多能推到哪裡」，不得把已有的更高熟悉度往下砍。
    // 主觀自評的「還沒記得」只代表需要再複習，不足以推翻已客觀驗證的熟悉度。
    const subjectiveMiss = !objective && !correct;
    const nextBox = subjectiveMiss ? card.box : correct ? Math.max(card.box, Math.min(card.box + 1, cap)) : 0;
    const updated = {
      box: nextBox,
      due: subjectiveMiss ? nextDue(0) : nextDue(nextBox),
      seen: card.seen + 1,
      wrong: card.wrong + (correct ? 0 : 1),
    };
    SciStore.setCard(state, id, updated);
    return updated;
  }

  // 自測與對戰必須尊重 Leitner 到期時間：尚未到期的答對只算作答紀錄，不推進盒序。
  function bumpBoxIfDue(state, id, correct, now = Date.now(), cap = BOX_INTERVAL_DAYS.length - 1, objective = true) {
    const card = SciStore.getCard(state, id);
    if (correct && card.seen > 0 && card.due > now) return card;
    return bumpBox(state, id, correct, cap, objective);
  }

  function markResult(state, id, correct) {
    // 閃卡是主觀自評，最多到 box3「快熟」；box4 精熟保留給選擇題／對戰等客觀答對。
    const selfAssessmentCap = BOX_INTERVAL_DAYS.length - 2;
    const updated = bumpBox(state, id, correct, selfAssessmentCap, false);
    state.stats.totalReviews += 1;
    SciStore.touchDailyStreak(state);
    return updated;
  }

  return { getRoundQueue, markResult, bumpBox, bumpBoxIfDue, BOX_INTERVAL_DAYS, ROUND_SIZE };
})();
