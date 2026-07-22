// 每日任務只接受真實學習訊號：答對、PvE 勝場、客觀答對後的詞卡熟練度升級。
const SciDailyQuests = (() => {
  const QUESTS = [
    { id: 'correct', label: '今日答對 10 題', target: 10 },
    { id: 'battleWin', label: '打贏 1 場', target: 1 },
    { id: 'unitProgress', label: '今天讓 1 張詞卡升級熟練度', target: 1 },
  ];
  const SUBJECTS = [
    { key: 'nature', label: '國小自然' },
    { key: 'biology', label: '國中生物' },
    { key: 'chemphys', label: '國中理化' },
    { key: 'earth', label: '國中地科' },
  ];
  const ALL_CLEAR_ID = 'allClear';
  const ALL_CLEAR_BONUS = 20;

  function dateSeed(dateStr) {
    let hash = 0x811c9dc5;
    for (const char of String(dateStr)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function subjectQuestForDate(today) {
    const subject = SUBJECTS[dateSeed(today) % SUBJECTS.length];
    return { id: 'subjectCorrect', label: `在${subject.label}答對 1 題`, target: 1, subject: subject.key };
  }

  function todayState(state, today) {
    state.stats = state.stats || {};
    if (!state.stats.dailyQuests || state.stats.dailyQuests.date !== today) {
      state.stats.dailyQuests = { date: today, correct: 0, battleWin: 0, unitProgress: 0, subjectCorrect: 0, subject: subjectQuestForDate(today).subject, claimed: [] };
    }
    const daily = state.stats.dailyQuests;
    if (!Array.isArray(daily.claimed)) daily.claimed = [];
    if (!SUBJECTS.some((subject) => subject.key === daily.subject)) daily.subject = subjectQuestForDate(today).subject;
    if (!Number.isFinite(daily.subjectCorrect)) daily.subjectCorrect = 0;
    return daily;
  }

  function record(state, signal, today = SciStore.todayStr(), subject = null) {
    const daily = todayState(state, today);
    if (!QUESTS.some((quest) => quest.id === signal)) return daily;
    daily[signal] += 1;
    if (signal === 'correct' && subject === daily.subject) daily.subjectCorrect += 1;
    return daily;
  }

  function list(state, today = SciStore.todayStr()) {
    const daily = state.stats?.dailyQuests?.date === today
      ? state.stats.dailyQuests : { correct: 0, battleWin: 0, unitProgress: 0, subjectCorrect: 0, subject: subjectQuestForDate(today).subject, claimed: [] };
    const dailySubjectQuest = { ...subjectQuestForDate(today), subject: daily.subject || subjectQuestForDate(today).subject };
    const quests = [...QUESTS, dailySubjectQuest];
    return quests.map((quest) => ({
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
    const coreDone = QUESTS.every((quest) => (daily[quest.id] || 0) >= quest.target);
    if (coreDone && !daily.claimed.includes(ALL_CLEAR_ID)) {
      daily.claimed.push(ALL_CLEAR_ID);
      newly.push(ALL_CLEAR_ID);
    }
    return newly;
  }

  function rewardFor(claimId) { return claimId === ALL_CLEAR_ID ? ALL_CLEAR_BONUS : SciEconomy.EARN_TABLE.master; }

  return { QUESTS, SUBJECTS, ALL_CLEAR_ID, ALL_CLEAR_BONUS, dateSeed, subjectQuestForDate, record, list, claimNewlyCompleted, rewardFor };
})();
