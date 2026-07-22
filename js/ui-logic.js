// 首頁 UI 的純邏輯；保持無 DOM 依賴，可由 Node 直接測試。
const SciUiLogic = (() => {
  function moreToolsDefaultOpen() {
    return false;
  }

  function restCardHtml() {
    return `<div class="card">
      <p>今天練到這裡很棒了，休息一下吧！想再練的時候隨時回來。</p>
      <div class="btn-row rest-cta-row">
        <button class="btn btn-secondary" type="button" data-rest-action="weak">看今日弱點</button>
        <button class="btn btn-secondary" type="button" data-rest-action="subject">換一科</button>
        <button class="btn btn-primary" type="button" data-rest-action="restart">再練一輪</button>
      </div>
    </div>`;
  }

  function resolveInitialSubject(paramSubject, availableSubjects) {
    if (paramSubject && availableSubjects.includes(paramSubject)) return paramSubject;
    return availableSubjects.includes('nature') ? 'nature' : availableSubjects[0];
  }

  function fusionRevealDelay(prefersReducedMotion) {
    return prefersReducedMotion ? 0 : 1000;
  }

  function focusUnitWeight(term, focusUnit) {
    return focusUnit && term && term.unit === focusUnit ? 3 : 1;
  }

  function focusFirst(terms, focusUnit) {
    if (!focusUnit) return [...terms];
    return [...terms].sort((a, b) => focusUnitWeight(b, focusUnit) - focusUnitWeight(a, focusUnit));
  }

  function classMilestone(value, step = 100) {
    const total = Math.max(0, Math.floor(Number(value) || 0));
    const size = Math.max(1, Math.floor(Number(step) || 100));
    const target = (Math.floor(total / size) + 1) * size;
    return { total, target, remaining: target - total, pct: Math.round((total / target) * 100) };
  }

  function dueReviewSummary(state, now = Date.now(), maxBox = 4, termsBySubject = null) {
    const cardsById = (state && state.cards) || {};
    const dueIds = Object.keys(cardsById).filter((id) => {
      const card = cardsById[id];
      return (card.seen || 0) > 0 && Number(card.due) <= now;
    });
    const dueCards = dueIds.map((id) => cardsById[id]);
    const summary = {
      due: dueCards.length,
      evergreen: dueCards.filter((card) => Number(card.box) >= maxBox).length,
    };
    if (!termsBySubject || typeof termsBySubject !== 'object') return summary;
    const dueSet = new Set(dueIds);
    summary.bySubject = Object.entries(termsBySubject).map(([key, ids]) => {
      const subjectCards = (Array.isArray(ids) ? ids : []).filter((id) => dueSet.has(id)).map((id) => cardsById[id]);
      return { key, due: subjectCards.length, evergreen: subjectCards.filter((card) => Number(card.box) >= maxBox).length };
    }).filter((item) => item.due > 0).sort((a, b) => b.due - a.due);
    summary.targetSubject = summary.bySubject[0]?.key || null;
    return summary;
  }

  function longTailUnits(units) {
    const list = Array.isArray(units) ? units : [];
    const remaining = list.filter((unit) => !unit.mastered);
    const masteredCount = list.length - remaining.length;
    if (!list.length || masteredCount / list.length < 0.6 || remaining.length < 1 || remaining.length > 3) return [];
    return remaining.map((unit) => unit.label || unit.key);
  }

  function shouldShowRestReminder(sessionAnswers, dismissed, threshold = 30) {
    return !dismissed && Number(sessionAnswers) >= threshold;
  }

  function normalizeOnboarding(value) {
    const source = value && typeof value === 'object' ? value : {};
    const done = (key) => source[key] === true || source[key] === 1;
    return { flashcard: done('flashcard'), quiz: done('quiz'), battle: done('battle') };
  }

  function onboardingComplete(value) {
    const checklist = normalizeOnboarding(value);
    return checklist.flashcard && checklist.quiz && checklist.battle;
  }

  function shouldShowOnboarding(totalReviews, masteredCount, checklist) {
    if (Number(totalReviews) === 0) return true;
    if (Number(masteredCount) > 0) return false;
    return !onboardingComplete(checklist);
  }

  function soundEnabled(storedValue, prefersReducedMotion) {
    if (storedValue === '1') return false;
    if (storedValue === '0') return true;
    return !prefersReducedMotion;
  }

  function masteryPromotion(before, after, rankTiers, stages) {
    const from = Math.max(0, Math.floor(Number(before) || 0));
    const to = Math.max(0, Math.floor(Number(after) || 0));
    if (to <= from) return null;
    const crossed = (Array.isArray(rankTiers) ? rankTiers : [])
      .filter(([threshold]) => threshold > from && threshold <= to)
      .at(-1);
    if (!crossed) return null;
    const threshold = crossed[0];
    const stage = (Array.isArray(stages) ? stages : []).find(([at]) => at === threshold);
    return { threshold, rank: crossed[1], stage: stage ? stage[1] : '' };
  }

  return {
    moreToolsDefaultOpen, restCardHtml, resolveInitialSubject, fusionRevealDelay,
    focusUnitWeight, focusFirst, classMilestone, dueReviewSummary, longTailUnits,
    shouldShowRestReminder,
    normalizeOnboarding, onboardingComplete, shouldShowOnboarding, soundEnabled, masteryPromotion,
  };
})();
