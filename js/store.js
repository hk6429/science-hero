// localStorage 存檔層。比照字鬥英雄 store.js 精簡版：每詞一筆 SRS 紀錄 + 全域統計。
const SciStore = (() => {
  const KEY = 'science-hero:v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 0 } };
      const parsed = JSON.parse(raw);
      parsed.cards = parsed.cards || {};
      parsed.stats = parsed.stats || { streakDays: 0, lastActiveDate: null, totalReviews: 0 };
      return parsed;
    } catch {
      return { cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 0 } };
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function getCard(state, id) {
    return state.cards[id] || { box: 0, due: 0, seen: 0, wrong: 0 };
  }

  function setCard(state, id, card) {
    state.cards[id] = card;
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function touchDailyStreak(state) {
    const today = todayStr();
    if (state.stats.lastActiveDate === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    state.stats.streakDays = state.stats.lastActiveDate === yesterday ? state.stats.streakDays + 1 : 1;
    state.stats.lastActiveDate = today;
  }

  function exportState(state) {
    return JSON.stringify(state, null, 2);
  }

  function importState(json) {
    const parsed = JSON.parse(json);
    parsed.cards = parsed.cards || {};
    parsed.stats = parsed.stats || { streakDays: 0, lastActiveDate: null, totalReviews: 0 };
    return parsed;
  }

  return { load, save, getCard, setCard, touchDailyStreak, todayStr, exportState, importState };
})();
