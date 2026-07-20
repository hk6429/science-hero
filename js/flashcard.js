// Leitner 5 盒間隔複習引擎。box 0-4，間隔天數對應 BOX_INTERVAL_DAYS。
const SciFlashcard = (() => {
  const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14];
  const ROUND_SIZE = 20;

  function nextDue(box) {
    const days = BOX_INTERVAL_DAYS[Math.min(box, BOX_INTERVAL_DAYS.length - 1)];
    return Date.now() + days * 86400000;
  }

  // 回傳本回合要複習的詞條：逾期優先，不足補新字（box===0 且 seen===0）。
  function getRoundQueue(state, terms, roundSize = ROUND_SIZE) {
    const now = Date.now();
    const withCard = terms.map((t) => ({ term: t, card: SciStore.getCard(state, t.id) }));

    const due = withCard
      .filter((x) => x.card.seen > 0 && x.card.due <= now)
      .sort((a, b) => a.card.due - b.card.due);

    const fresh = withCard.filter((x) => x.card.seen === 0);

    const queue = [...due, ...fresh].slice(0, roundSize);
    return queue.map((x) => x.term);
  }

  function markResult(state, id, correct) {
    const card = SciStore.getCard(state, id);
    const nextBox = correct ? Math.min(card.box + 1, BOX_INTERVAL_DAYS.length - 1) : 0;
    const updated = {
      box: nextBox,
      due: nextDue(nextBox),
      seen: card.seen + 1,
      wrong: card.wrong + (correct ? 0 : 1),
    };
    SciStore.setCard(state, id, updated);
    state.stats.totalReviews += 1;
    SciStore.touchDailyStreak(state);
    return updated;
  }

  return { getRoundQueue, markResult, BOX_INTERVAL_DAYS, ROUND_SIZE };
})();
