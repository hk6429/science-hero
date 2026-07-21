// 每日任務只接受真實學習訊號：答對、PvE 勝場、完成單元精通。
const SciDailyQuests = (() => {
  const QUESTS = [
    { id: 'correct', label: '今日答對 10 題', target: 10 },
    { id: 'battleWin', label: '打贏 1 場', target: 1 },
    { id: 'unitProgress', label: '推進 1 單元進度', target: 1 },
  ];

  function todayState(state, today) {
    state.stats = state.stats || {};
    if (!state.stats.dailyQuests || state.stats.dailyQuests.date !== today) {
      state.stats.dailyQuests = { date: today, correct: 0, battleWin: 0, unitProgress: 0, claimed: [] };
    }
    return state.stats.dailyQuests;
  }

  function record(state, signal, today = SciStore.todayStr()) {
    const daily = todayState(state, today);
    if (!QUESTS.some((quest) => quest.id === signal)) return daily;
    daily[signal] += 1;
    return daily;
  }

  function list(state, today = SciStore.todayStr()) {
    const daily = state.stats?.dailyQuests?.date === today
      ? state.stats.dailyQuests : { correct: 0, battleWin: 0, unitProgress: 0, claimed: [] };
    return QUESTS.map((quest) => ({
      ...quest,
      value: Math.min(daily[quest.id] || 0, quest.target),
      done: (daily[quest.id] || 0) >= quest.target,
      claimed: (daily.claimed || []).includes(quest.id),
    }));
  }

  function claimNewlyCompleted(state, today = SciStore.todayStr()) {
    const daily = todayState(state, today);
    const newly = list(state, today).filter((quest) => quest.done && !quest.claimed).map((quest) => quest.id);
    daily.claimed.push(...newly);
    return newly;
  }

  return { QUESTS, record, list, claimNewlyCompleted };
})();
