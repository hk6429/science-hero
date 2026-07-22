// 四科共用閃卡／自測／弱點模組；各分頁只切換資料集，不重複實作學習邏輯。
const SciApp = (() => {
  const SUBJECTS = [
    { key: 'nature', label: '國小自然', file: 'data/elementary.json' },
    { key: 'biology', label: '國中生物', file: 'data/biology.json' },
    { key: 'chemphys', label: '國中理化', file: 'data/physics-chemistry.json' },
    { key: 'earth', label: '國中地科', file: 'data/earth-science.json' },
  ];

  const UNIT_LABELS = {
    inquiry: '科學探究與測量',
    life: '生命世界',
    matter: '物質與變化',
    energy: '力、能量、聲與光',
    earth: '地球與天空',
    environment: '環境與永續',
    cell: '細胞的構造與功能',
    body: '人體系統與恆定性',
    repro_gene: '生殖與遺傳',
    evo_classify: '演化與分類',
    ecology: '生態與環境',
    measure_matter: '測量與物質基本性質',
    chemistry: '化學反應與物質變化',
    force_motion: '力與運動',
    energy_wave: '能量、熱、聲與光',
    electricity: '電與磁',
    geology: '地質作用',
    weather: '天氣現象',
    ocean: '海洋與海流',
    astronomy: '天文與太陽系',
    earth_system: '地球系統交互作用',
  };

  const UNIT_ICONS = {
    inquiry: '🔍',
    life: '🌱',
    matter: '⚗️',
    energy: '💡',
    earth: '🌍',
    environment: '♻️',
    cell: '🔬',
    body: '🫀',
    repro_gene: '🧬',
    evo_classify: '🦴',
    ecology: '🌿',
    measure_matter: '⚖️',
    chemistry: '🧪',
    force_motion: '⚙️',
    energy_wave: '🌡️',
    electricity: '⚡',
    geology: '🪨',
    weather: '🌦️',
    ocean: '🌊',
    astronomy: '🪐',
    earth_system: '🔄',
  };

  const DAILY_GOAL = 10;
  const FOCUS_KEY = 'sci_focus_units';
  const ONBOARDING_KEY = 'sci_onboarding_checklist';
  const FIRST_SUCCESS_KEY = 'sci_first_success_seen';
  const SOUND_KEY = 'sci_sound_off';

  let state = null;
  let activeSubject = 'nature';
  const subjectTerms = new Map();
  let scienceLore = [];
  let scienceTrivia = [];
  let terms = [];
  let mode = 'flashcard'; // 'flashcard' | 'quiz' | 'battle' | 'rtbattle' | 'weak'
  let unitFilter = null; // 目前選定的單元（null = 全部）
  let gradeFilter = null; // 目前選定的年級（null = 全部）
  let familySummaryDialog = null;
  let parentGuideDialog = null;
  let fusionDialog = null;
  let journeyDialog = null;
  let sessionAnswers = 0;
  let restReminderDismissed = false;

  // ---- 閃卡狀態（依科目分開保留，切分頁不會弄丟進度）----
  const flashState = new Map();
  let flashQueue = [];
  let flashIdx = 0;
  let flashRevealed = false;
  let flashAnswering = false;

  // ---- 自測狀態（依科目分開保留）----
  const quizState = new Map();
  let quizPool = [];
  let quizQueue = [];
  let quizIdx = 0;
  let quizCorrect = 0;
  let quizMcTotal = 0;
  let quizMcCountedIdx = -1;
  let quizStartTime = 0;
  let quizAnswered = false;

  function el(sel) { return document.querySelector(sel); }

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }

  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 本機儲存不可用時仍可繼續學習。 */ }
  }

  function focusUnitFor(subject = activeSubject) {
    return loadJson(FOCUS_KEY, {})[subject] || null;
  }

  function setFocusUnit(subject, unit) {
    const saved = loadJson(FOCUS_KEY, {});
    if (unit) saved[subject] = unit;
    else delete saved[subject];
    saveJson(FOCUS_KEY, saved);
  }

  function themeColor(token, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
  }

  // 換題/翻卡時常見的手機瀏覽器怪癖：舊按鈕被拿掉時，focus 掉回 body 會把畫面拉回最頂端。
  // 換內容前先讓目前的按鈕失焦、記住捲動位置，換完再退回去，避免每答一題就跳回頁首。
  function preserveScroll(renderFn) {
    const y = window.scrollY;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    renderFn();
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  function createDialogController(overlay) {
    if (!overlay) return null;
    const panel = overlay.querySelector('[role="dialog"]');
    let previousFocus = null;
    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const close = () => {
      if (overlay.hidden) return;
      overlay.hidden = true;
      document.removeEventListener('keydown', onKeydown);
      if (previousFocus?.focus) previousFocus.focus();
      previousFocus = null;
    };

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = [...panel.querySelectorAll(focusableSelector)]
        .filter((node) => !node.hidden && node.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const open = () => {
      previousFocus = document.activeElement;
      overlay.hidden = false;
      document.addEventListener('keydown', onKeydown);
      panel?.focus();
    };

    return { open, close };
  }

  let audioCtx = null;
  function soundEnabled() {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    return SciUiLogic.soundEnabled(localStorage.getItem(SOUND_KEY), reduced);
  }

  function updateSoundButton() {
    const button = el('#sound-toggle');
    if (!button) return;
    const enabled = soundEnabled();
    button.textContent = enabled ? '🔊 音效開啟' : '🔇 音效關閉';
    button.setAttribute('aria-pressed', String(!enabled));
  }

  function playTone(freq, duration, type = 'sine') {
    if (!soundEnabled()) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch {
      // 部分瀏覽器政策會擋自動播音，靜默失敗即可，不影響其他功能。
    }
  }

  function playCorrectTone() { playTone(880, 0.18); }
  function playWrongTone() { playTone(220, 0.28, 'triangle'); }
  function playMilestoneTone() {
    playTone(660, 0.15);
    setTimeout(() => playTone(880, 0.22), 120);
  }

  function shuffleArr(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function currentPool() {
    let pool = unitFilter ? terms.filter((t) => t.unit === unitFilter) : terms;
    if (gradeFilter) pool = pool.filter((t) => String(t.grade) === gradeFilter);
    return unitFilter ? pool : SciUiLogic.focusFirst(pool, focusUnitFor());
  }

  function masteryPct(list) {
    if (!list.length) return 0;
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    const mastered = list.filter((t) => SciStore.getCard(state, t.id).box >= maxBox).length;
    return Math.round((mastered / list.length) * 100);
  }

  function renderTabs() {
    const nav = el('#tabs');
    nav.innerHTML = '';
    SUBJECTS.forEach((s) => {
      const btn = document.createElement('button');
      btn.textContent = s.label;
      btn.dataset.key = s.key;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(s.key === activeSubject));
      if (s.key === activeSubject) btn.classList.add('active');
      btn.addEventListener('click', () => switchSubject(s.key));
      nav.appendChild(btn);
    });
  }

  function switchSubject(key) {
    if (!subjectTerms.has(key)) return;

    // 離開前先把這科正在進行的回合存起來，回來時可以接著練，不會平白歸零。
    flashState.set(activeSubject, { queue: flashQueue, idx: flashIdx, revealed: flashRevealed });
    quizState.set(activeSubject, {
      pool: quizPool,
      queue: quizQueue,
      idx: quizIdx,
      correct: quizCorrect,
      mcTotal: quizMcTotal,
      mcCountedIdx: quizMcCountedIdx,
    });

    activeSubject = key;
    terms = subjectTerms.get(key);
    unitFilter = null;
    gradeFilter = null;

    const savedFlash = flashState.get(key);
    if (savedFlash) {
      flashQueue = savedFlash.queue;
      flashIdx = savedFlash.idx;
      flashRevealed = savedFlash.revealed;
    } else {
      flashQueue = [];
      flashIdx = 0;
      flashRevealed = false;
    }

    const savedQuiz = quizState.get(key);
    if (savedQuiz) {
      quizPool = savedQuiz.pool;
      quizQueue = savedQuiz.queue;
      quizIdx = savedQuiz.idx;
      quizCorrect = savedQuiz.correct;
      quizMcTotal = savedQuiz.mcTotal;
      quizMcCountedIdx = savedQuiz.mcCountedIdx;
    } else {
      quizPool = [];
      quizQueue = [];
      quizIdx = 0;
      quizCorrect = 0;
      quizMcTotal = 0;
      quizMcCountedIdx = -1;
    }

    document.querySelectorAll('#tabs button').forEach((b) => {
      const isActive = b.dataset.key === key;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
    });
    document.querySelectorAll('.panel').forEach((p) => {
      const isActive = p.dataset.key === key;
      p.classList.toggle('active', isActive);
      // 只有目前顯示的分頁能有渲染內容，避免多分頁同時存在重複 id（例如 #flash-reveal）。
      if (!isActive) {
        const body = p.querySelector('.subject-body');
        if (body) body.innerHTML = '';
        p.querySelector('.mode-switch')?.remove();
        p.querySelector('.unit-map')?.remove();
        p.querySelector('.grade-filter')?.remove();
      }
    });
    renderLearningBody(document.querySelector(`.panel[data-key="${key}"]`));
  }

  function renderModeSwitch(panel) {
    const bar = document.createElement('div');
    bar.className = 'mode-switch';
    [
      ['flashcard', '閃卡複習'],
      ['quiz', '自我測驗'],
      ['battle', '答題對戰'],
      ['weak', '弱點清單'],
    ].forEach(([key, label]) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.dataset.mode = key;
      if (key === mode) btn.classList.add('active');
      btn.addEventListener('click', () => {
        mode = key;
        renderLearningBody(panel);
      });
      bar.appendChild(btn);
    });
    return bar;
  }

  // ================= 單元關卡地圖（選擇範圍用，不強制流程）=================
  function selectUnitFilter(key, panel) {
    unitFilter = key || null;
    flashQueue = [];
    quizQueue = [];
    renderLearningBody(panel);
  }

  // ================= 年級篩選（只在該科有跨年級內容時顯示）=================
  function selectGradeFilter(grade, panel) {
    gradeFilter = grade || null;
    flashQueue = [];
    quizQueue = [];
    renderLearningBody(panel);
  }

  function renderGradeFilter(panel) {
    const grades = [...new Set(terms.map((t) => String(t.grade)))].sort();
    if (grades.length < 2) return null;
    const wrap = document.createElement('div');
    wrap.className = 'grade-filter';
    const chips = ['', ...grades].map((g) => {
      const isAll = g === '';
      const label = isAll ? '全部年級' : `${g} 年級`;
      const active = (isAll && !gradeFilter) || g === gradeFilter;
      return `<button class="grade-chip${active ? ' active' : ''}" data-grade="${g}">${label}</button>`;
    }).join('');
    wrap.innerHTML = chips;
    wrap.querySelectorAll('.grade-chip').forEach((btn) => {
      btn.addEventListener('click', () => selectGradeFilter(btn.dataset.grade, panel));
    });
    return wrap;
  }

  function unitStatus(list) {
    const seen = list.filter((t) => SciStore.getCard(state, t.id).seen > 0);
    if (seen.length === 0) return 'untouched';
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    const mastered = seen.every((t) => SciStore.getCard(state, t.id).box >= maxBox) && seen.length === list.length;
    if (mastered) return 'mastered';
    const wrongRate = seen.reduce((sum, t) => sum + SciStore.getCard(state, t.id).wrong, 0) / seen.length;
    return wrongRate > 0.3 ? 'weak' : 'progress';
  }

  function renderUnitMap(panel) {
    const wrap = document.createElement('div');
    wrap.className = 'unit-map';
    const units = [...new Set(terms.map((t) => t.unit))];
    const celebrated = new Set(state.stats.celebratedUnits || []);
    const chips = ['', ...units].map((u) => {
      const isAll = u === '';
      const label = isAll ? '全部' : (UNIT_LABELS[u] || u);
      const icon = isAll ? '📚' : (UNIT_ICONS[u] || '📘');
      const list = isAll ? terms : terms.filter((t) => t.unit === u);
      const pct = masteryPct(list);
      const active = (isAll && !unitFilter) || u === unitFilter;
      const status = isAll ? 'progress' : unitStatus(list);
      const isCelebrated = !isAll && celebrated.has(`${activeSubject}:${u}`);
      return `<button class="unit-chip${active ? ' active' : ''}" data-unit="${u}" data-status="${status}" style="--progress:${pct}">
        <span class="unit-chip-ring">
          <span class="unit-chip-icon">${icon}</span>
          ${isCelebrated ? '<span class="unit-chip-badge">✓</span>' : ''}
        </span>
        <span class="unit-chip-label">${label}</span>
      </button>`;
    }).join('');
    const focusUnit = focusUnitFor();
    wrap.innerHTML = `<label class="focus-unit-picker">🎯 本週想主攻
      <select aria-label="選擇本週想主攻的單元"><option value="">自由探索</option>${units.map((u) => `<option value="${u}" ${u === focusUnit ? 'selected' : ''}>${UNIT_LABELS[u] || u}</option>`).join('')}</select>
      <small>只提高出題優先權，不會排除其他單元。</small></label>${chips}`;
    wrap.querySelector('.focus-unit-picker select')?.addEventListener('change', (event) => {
      setFocusUnit(activeSubject, event.target.value || null);
      flashQueue = [];
      quizQueue = [];
      renderLearningBody(panel);
    });
    wrap.querySelectorAll('.unit-chip').forEach((btn) => {
      btn.addEventListener('click', () => selectUnitFilter(btn.dataset.unit, panel));
    });
    return wrap;
  }

  function renderLearningBody(panel) {
    const body = panel.querySelector('.subject-body');
    body.innerHTML = '';
    panel.querySelector('.mode-switch')?.remove();
    panel.querySelector('.unit-map')?.remove();
    panel.querySelector('.grade-filter')?.remove();
    panel.insertBefore(renderModeSwitch(panel), body);

    if (mode === 'flashcard' || mode === 'quiz' || mode === 'battle' || mode === 'rtbattle') {
      const gradeWrap = renderGradeFilter(panel);
      if (gradeWrap) panel.insertBefore(gradeWrap, body);
      panel.insertBefore(renderUnitMap(panel), body);
    }

    if (mode === 'flashcard') renderFlashcard(body);
    else if (mode === 'quiz') renderQuiz(body);
    else if (mode === 'battle') renderBattle(body);
    else if (mode === 'rtbattle') renderRtBattle(body);
    else renderWeak(body);
  }

  // ================= 答題對戰 =================
  function renderBattle(body) {
    const subjectLabel = SUBJECTS.find((s) => s.key === activeSubject)?.label || '';
    SciBattle.mount(body, {
      pool: currentPool(),
      state,
      subjectLabel,
      recordAnswer,
      masteredCardCount: masteredCardCount(),
      subjectKey: activeSubject,
      masteredCountForSubject: masteredCountForSubject(activeSubject),
      cubMods: SciFusionStore.cubBattleMods(SciFusionStore.load()),
      cubArt,
      onBattleWin: () => recordDailySignal('battleWin'),
      onMilestone: () => playMilestoneTone(),
      onEnergyGain: showEnergyGain,
    });
  }

  // ================= 連線對戰 =================
  function poolForScope(scope) {
    let pool = subjectTerms.get(scope.subject) || [];
    if (scope.unit) pool = pool.filter((term) => term.unit === scope.unit);
    if (scope.grade) pool = pool.filter((term) => String(term.grade) === scope.grade);
    return pool;
  }

  function renderRtBattle(body) {
    const subjectLabel = SUBJECTS.find((subject) => subject.key === activeSubject)?.label || '';
    SciRtBattleUI.mount(body, {
      state, subjectKey: activeSubject, subjectLabel,
      scope: { subject: activeSubject, unit: unitFilter, grade: gradeFilter },
      pool: currentPool(), poolForScope, recordAnswer, masteredCardCount: masteredCardCount(),
      onBattleWin: () => recordDailySignal('battleWin'),
    });
  }

  // 自測與對戰共用的作答記錄：弱點聚合、盒序推進、每日統計、存檔，一次做完。
  function recordAnswer(target, correct, elapsedMs, contentLength = 0, source = 'quiz', recoveryStrength = 'strong') {
    const masteredBefore = masteredCardCount();
    const previousCard = SciStore.getCard(state, target.id);
    SciWeak.recordAnswer(state, { termId: target.id, unit: target.unit, correct, elapsedMs, contentLength, source, recoveryStrength });
    const prevBox = previousCard.box;
    const prevDue = previousCard.due;
    const cap = source === 'cloze' ? SciFlashcard.BOX_INTERVAL_DAYS.length - 2 : SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    const updated = SciFlashcard.bumpBoxIfDue(state, target.id, correct, Date.now(), cap, SciWeak.isObjectiveSource(source));
    const milestoneUnit = correct && SciWeak.isObjectiveSource(source)
      ? checkUnitMilestone(target.unit, SciBattle.subjectOfId?.(target.id) || activeSubject)
      : null;
    const promotion = correct
      ? SciUiLogic.masteryPromotion(masteredBefore, masteredCardCount(), RANK_TIERS, SciBaseStore.STAGES)
      : null;
    const energy = !SciWeak.isObjectiveSource(source)
      ? { earned: 0 }
      : SciEconomy.onAnswer(correct, prevBox, updated.box); // 晶能只掛客觀作答；主觀自評不發放。
    state.stats.totalReviews += 1;
    sessionAnswers += 1;
    const surprise = SciScienceRewards.triggerSurprise({
      correct,
      rng: SciScienceRewards.mulberry32(SciScienceRewards.hashSeed(`${SciStore.todayStr()}:${target.id}:${state.stats.totalReviews}`)),
      facts: scienceTrivia,
      economy: SciEconomy,
      allowCrystalReward: SciWeak.isObjectiveSource(source),
    });
    if (correct) showFirstSuccess();
    markOnboarding(mode === 'battle' ? 'battle' : 'quiz');
    if (correct && SciWeak.isObjectiveSource(source) && updated.due > prevDue) recordDailySignal('unitProgress', false);
    if (correct && SciWeak.isObjectiveSource(source)) recordDailySignal('correct', false);
    SciStore.touchDailyStreak(state);
    SciStore.bumpDailyCount(state);
    SciStore.save(state);
    renderHeroStats();
    if (promotion) showMasteryPromotion(promotion);
    correct ? playCorrectTone() : playWrongTone();
    if (energy.earned > 0) showEnergyGain(energy.earned);
    maybeShowRestReminder();
    if (surprise.hit) showScienceSurprise(surprise);
    return { updated, milestoneUnit };
  }

  function setStackOffset(node, selector, stepPx) {
    const offset = `${document.querySelectorAll(selector).length * stepPx}px`;
    if (typeof node.style?.setProperty === 'function') node.style.setProperty('--stack-offset', offset);
    else if (node.style) node.style['--stack-offset'] = String(offset);
  }

  function showEnergyGain(amount) {
    const pop = document.createElement('span');
    pop.className = 'energy-gain-pop';
    pop.setAttribute('role', 'status');
    pop.textContent = `+${amount}💎`;
    setStackOffset(pop, '.energy-gain-pop', -40);
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 1400);
  }

  function showDailyAllClear(amount) {
    const toast = document.createElement('aside');
    toast.className = 'first-success daily-all-clear-toast celebrate-in';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = `🎉 今日任務全清！+${amount}💎`;
    setStackOffset(toast, '.first-success', 76);
    document.body.appendChild(toast);
    playMilestoneTone();
    setTimeout(() => toast.remove(), 4200);
  }

  function showMasteryPromotion(promotion) {
    const toast = document.createElement('aside');
    toast.className = 'first-success mastery-promotion-toast celebrate-in';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `<strong>🌟 晉升〈${promotion.rank}〉！</strong><span>基地已擴建為〈${promotion.stage}〉</span>`;
    setStackOffset(toast, '.first-success', 76);
    document.body.appendChild(toast);
    playMilestoneTone();
    setTimeout(() => toast.remove(), 5000);
  }

  function showFirstSuccess() {
    try {
      if (localStorage.getItem(FIRST_SUCCESS_KEY)) return;
      localStorage.setItem(FIRST_SUCCESS_KEY, '1');
    } catch { /* 儀式只顯示一次是加值；儲存失敗不影響作答。 */ }
    const toast = document.createElement('aside');
    toast.className = 'first-success celebrate-in';
    toast.setAttribute('role', 'status');
    toast.innerHTML = '<strong>🌟 你踏出第一步了！</strong><span>第一個科學線索已經被你點亮。</span>';
    setStackOffset(toast, '.first-success', 76);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
  }

  function maybeShowRestReminder() {
    if (!SciUiLogic.shouldShowRestReminder(sessionAnswers, restReminderDismissed) || el('.rest-reminder')) return;
    const reminder = document.createElement('aside');
    reminder.className = 'rest-reminder';
    reminder.setAttribute('role', 'status');
    reminder.innerHTML = '<span>👀 已經練了一段時間，休息一下、看看遠方，保護眼睛。</span><button type="button" aria-label="關閉休息提醒">知道了</button>';
    document.body.appendChild(reminder);
    reminder.querySelector('button').addEventListener('click', () => {
      restReminderDismissed = true;
      reminder.remove();
    });
  }

  function showScienceSurprise(surprise) {
    if (surprise.type === 'crystals' && !(surprise.earned > 0)) return;
    const toast = document.createElement('aside');
    toast.className = 'science-surprise celebrate-in';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = surprise.type === 'crystals'
      ? `✨ 科學奇遇：研究補給 +${surprise.earned} 晶能`
      : `✨ 科學奇遇：${surprise.fact.text}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  // ================= 里程碑：單元全數精通 =================
  function checkUnitMilestone(unit, subject = activeSubject) {
    if (!unit) return null;
    const subjectList = subjectTerms.get(subject) || (subject === activeSubject ? terms : []);
    const list = subjectList.filter((t) => t.unit === unit);
    if (!list.length) return null;
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    const allMastered = list.every((t) => SciStore.getCard(state, t.id).box >= maxBox);
    if (!allMastered) return null;

    state.stats.celebratedUnits = state.stats.celebratedUnits || [];
    const key = `${subject}:${unit}`;
    if (state.stats.celebratedUnits.includes(key)) return null;
    state.stats.celebratedUnits.push(key);
    SciScienceRewards.unlockForMasteredUnit(state, scienceLore, subject, unit, subjectList, maxBox);
    recordDailySignal('unitProgress', false);
    SciStore.save(state);
    return unit;
  }

  function renderMilestone(container, unit, onContinue) {
    const icon = UNIT_ICONS[unit] || '📘';
    const label = UNIT_LABELS[unit] || unit;
    const subjectLabel = SUBJECTS.find((s) => s.key === activeSubject)?.label || '';
    const clearedCount = (state.stats.celebratedUnits || []).length;
    const loreCard = scienceLore.find((card) => card.subject === activeSubject && card.unit === unit && (state.stats.scienceLore || []).includes(card.id));
    const loreHtml = loreCard ? `<div class="milestone-lore"><b>${loreCard.icon} 科學史卡・${loreCard.title}</b><span>${loreCard.who}・${loreCard.year}</span><p>${loreCard.blurb}</p></div>` : '';
    const confetti = Array.from({ length: 12 }, (_, i) => `<span class="confetti-bit" style="--i:${i}"></span>`).join('');
    container.innerHTML = `
      <div class="card milestone-card celebrate-in">
        <div class="confetti-burst">${confetti}</div>
        <div class="milestone-icon">${icon}</div>
        <h3>${label} · 全數精通！</h3>
        <p>這個單元的詞條你都穩了，${subjectLabel}的戰功又推進一格。</p>
        <p class="milestone-stat">目前累積已攻克 <strong>${clearedCount}</strong> 個單元</p>
        ${loreHtml}
        <div class="btn-row"><button class="btn btn-primary" id="milestone-continue">繼續</button></div>
      </div>`;
    playMilestoneTone();
    container.querySelector('#milestone-continue').addEventListener('click', () => {
      onContinue();
    });
  }

  // ================= 閃卡 =================
  function startFlashRound() {
    flashQueue = SciFlashcard.getRoundQueue(state, currentPool());
    flashIdx = 0;
    flashRevealed = false;
  }

  function emptyLearningQueueHtml() {
    if (!terms.length) {
      return `<div class="card"><p>這一科的詞條還在路上，先切去別科練功吧！</p></div>`;
    }
    if (unitFilter || gradeFilter) {
      return `<div class="card"><p>目前篩選條件下沒有可練習的詞條，換個單元或年級看看吧！</p></div>`;
    }
    return `<div class="card"><p>這一科目前沒有到期的卡，你已經追平了！卡片會依間隔複習陸續回來，先去別科或看看基地吧。</p></div>`;
  }

  function wireRestCard(body, restartRound) {
    body.querySelector('[data-rest-action="weak"]')?.addEventListener('click', () => {
      mode = 'weak';
      renderLearningBody(body.closest('.panel'));
    });
    body.querySelector('[data-rest-action="subject"]')?.addEventListener('click', () => {
      const currentIndex = SUBJECTS.findIndex((subject) => subject.key === activeSubject);
      const nextSubject = SUBJECTS[(currentIndex + 1) % SUBJECTS.length];
      switchSubject(nextSubject.key);
    });
    body.querySelector('[data-rest-action="restart"]')?.addEventListener('click', restartRound);
  }

  function renderFlashcard(body) {
    if (flashQueue.length === 0) startFlashRound();

    if (flashQueue.length === 0) {
      body.innerHTML = emptyLearningQueueHtml();
      return;
    }

    if (flashIdx >= flashQueue.length) {
      body.innerHTML = `
        <div class="card celebrate-in">
          <p>這輪 ${flashQueue.length} 張都過完了，手感應該還在，要不要趁勢再來一輪？</p>
          <div class="btn-row">
            <button class="btn btn-secondary" id="flash-stop">今天先這樣</button>
            <button class="btn btn-primary" id="flash-again">再戰一輪</button>
          </div>
        </div>`;
      body.querySelector('#flash-again').addEventListener('click', () => {
        startFlashRound();
        renderFlashcard(body);
      });
      body.querySelector('#flash-stop').addEventListener('click', () => {
        body.innerHTML = SciUiLogic.restCardHtml();
        wireRestCard(body, () => {
          startFlashRound();
          renderFlashcard(body);
        });
      });
      return;
    }

    const t = flashQueue[flashIdx];
    const card = SciStore.getCard(state, t.id);
    body.innerHTML = `
      <div class="stat-row">
        <span>本回合 ${flashIdx + 1} / ${flashQueue.length}</span>
        <span>熟悉度 ${card.box + 1} / ${SciFlashcard.BOX_INTERVAL_DAYS.length}</span>
      </div>
      <div class="progress-bar"><div style="width:${((flashIdx) / flashQueue.length) * 100}%"></div></div>
      <div class="card">
        <div class="flash-meta">${UNIT_ICONS[t.unit] || ''} ${UNIT_LABELS[t.unit] || t.unit} · ${t.category}</div>
        <div class="flash-term">${t.term}</div>
        <div class="flash-def ${flashRevealed ? '' : 'hidden'}" id="flash-def">
          ${flashRevealed ? t.def : '先想想看，答案準備好了再翻開'}
        </div>
        ${flashRevealed && t.example ? `<div class="flash-example">💡 ${t.example}</div>` : ''}
        <div class="btn-row">
          ${flashRevealed
            ? `<button class="btn btn-danger" id="flash-wrong">還沒抓到</button>
               <button class="btn btn-ok" id="flash-correct">我記住了</button>`
            : `<button class="btn btn-secondary" id="flash-reveal">翻開解釋</button>`}
        </div>
      </div>`;

    if (flashRevealed) {
      body.querySelector('#flash-wrong').addEventListener('click', () => answerFlash(body, false));
      body.querySelector('#flash-correct').addEventListener('click', () => answerFlash(body, true));
    } else {
      body.querySelector('#flash-reveal').addEventListener('click', () => {
        flashRevealed = true;
        renderFlashcard(body);
      });
    }
  }

  function answerFlash(body, correct) {
    if (flashAnswering) return;
    flashAnswering = true;
    const anchorTop = body.getBoundingClientRect().top;
    const feedbackCard = body.querySelector('.card');
    feedbackCard?.classList.add(correct ? 'flash-correct' : 'flash-wrong');

    const t = flashQueue[flashIdx];
    SciWeak.recordFlash(state, { termId: t.id, unit: t.unit, correct });
    SciFlashcard.markResult(state, t.id, correct);
    sessionAnswers += 1;
    if (correct) showFirstSuccess();
    markOnboarding('flashcard');
    SciStore.bumpDailyCount(state);
    SciStore.save(state);
    renderHeroStats();
    requestAnimationFrame(() => {
      const newAnchorTop = body.getBoundingClientRect().top;
      window.scrollBy(0, newAnchorTop - anchorTop);
    });
    correct ? playCorrectTone() : playWrongTone();
    maybeShowRestReminder();

    const milestoneUnit = correct ? checkUnitMilestone(t.unit, SciBattle.subjectOfId?.(t.id) || activeSubject) : null;
    flashIdx += 1;
    flashRevealed = false;

    setTimeout(() => {
      preserveScroll(() => {
        if (milestoneUnit) {
          renderMilestone(body, milestoneUnit, () => { flashAnswering = false; renderFlashcard(body); });
        } else {
          flashAnswering = false;
          renderFlashcard(body);
        }
      });
    }, 350);
  }

  // ================= 自測 =================
  function startQuizRound(pool = currentPool()) {
    quizPool = terms;
    // 加權選題：到期＋弱點＋新字優先，取代純隨機——讓自測真正接上間隔複習排程。
    const weakScores = new Map(SciWeak.getWeakTerms(state, 999).map((w) => [w.termId, w.score]));
    const now = Date.now();
    quizQueue = SciQuiz.weightedSample(
      pool,
      (t) => SciQuiz.quizWeight(SciStore.getCard(state, t.id), weakScores.get(t.id) || 0, now)
        * SciUiLogic.focusUnitWeight(t, focusUnitFor()),
      Math.min(15, pool.length),
    );
    quizIdx = 0;
    quizCorrect = 0;
    quizMcTotal = 0;
    quizMcCountedIdx = -1;
  }

  function quizSummaryText(correctCount, total) {
    if (total === 0) return '這輪都是回想練習，弱點清單已幫你記下，繼續保持！';
    const pct = total ? Math.round((correctCount / total) * 100) : 0;
    if (pct === 100) return `${total} 題全對，穩了！這科的底子已經很扎實。`;
    if (pct >= 80) return `${total} 題裡對了 ${correctCount} 題，手感很不錯，剩下的弱點清單已經幫你記下來了。`;
    if (pct >= 60) return `${total} 題裡對了 ${correctCount} 題，還有進步空間，去弱點清單看看卡在哪裡吧。`;
    return `${total} 題裡對了 ${correctCount} 題，這輪本來就是用來找漏洞的，弱點清單已經幫你標好了，練幾輪就會有感覺。`;
  }

  function selfTestUsesCloze(box, questionIndex) {
    return box >= 3 && questionIndex % 2 === 1;
  }

  function countQuizMcQuestion(questionIndex) {
    if (quizMcCountedIdx === questionIndex) return;
    quizMcTotal += 1;
    quizMcCountedIdx = questionIndex;
  }

  function renderQuiz(body) {
    if (quizQueue.length === 0) startQuizRound();

    if (quizQueue.length === 0) {
      body.innerHTML = emptyLearningQueueHtml();
      return;
    }

    if (quizIdx >= quizQueue.length) {
      body.innerHTML = `
        <div class="card celebrate-in">
          <p>${quizSummaryText(quizCorrect, quizMcTotal)}</p>
          <div class="btn-row">
            <button class="btn btn-secondary" id="quiz-stop">今天先這樣</button>
            <button class="btn btn-primary" id="quiz-again">再來測一次</button>
          </div>
        </div>`;
      body.querySelector('#quiz-again').addEventListener('click', () => {
        startQuizRound();
        renderQuiz(body);
      });
      body.querySelector('#quiz-stop').addEventListener('click', () => {
        body.innerHTML = SciUiLogic.restCardHtml();
        wireRestCard(body, () => {
          startQuizRound();
          renderQuiz(body);
        });
      });
      return;
    }

    const target = quizQueue[quizIdx];
    const box = SciStore.getCard(state, target.id).box;
    quizAnswered = false;
    quizStartTime = Date.now();

    const headHtml = `
      <div class="stat-row">
        <span>第 ${quizIdx + 1} / ${quizQueue.length} 題</span>
        <span>答對 ${quizCorrect}</span>
      </div>
      <div class="progress-bar"><div style="width:${(quizIdx / quizQueue.length) * 100}%"></div></div>`;

    // box3 以上交替客觀選擇題與主觀克漏字，讓各盒序都有可計入每日任務的客觀答對路徑。
    const clozeQ = selfTestUsesCloze(box, quizIdx)
      ? SciQuiz.buildQuestion(target, quizPool.length ? quizPool : terms, 'cloze', box)
      : null;
    if (clozeQ && clozeQ.hasBlank) {
      renderClozeQuestion(body, headHtml, target, clozeQ);
      return;
    }

    // 傳入該詞盒序，讓誘答難度隨精熟度調整（新學者放水、熟手加難）。
    countQuizMcQuestion(quizIdx);
    const q = SciQuiz.buildQuestion(target, quizPool.length ? quizPool : terms, null, box);
    body.innerHTML = `${headHtml}
      <div class="card">
        <div class="quiz-prompt">${q.mode === 'term2def' ? `「${q.prompt}」是在說什麼？` : `這個定義說的是哪個詞：<br>「${q.prompt}」`}</div>
        <div class="quiz-options" id="quiz-options">
          ${q.options.map((o) => `<button class="quiz-option" data-id="${o.id}">${o.label}</button>`).join('')}
        </div>
      </div>`;

    body.querySelectorAll('.quiz-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (quizAnswered) return;
        quizAnswered = true;
        const elapsed = Date.now() - quizStartTime;
        const chosenId = btn.dataset.id;
        const correct = chosenId === q.answerId;
        if (correct) quizCorrect += 1;

        const cardEl = body.querySelector('.card');
        cardEl.classList.add(correct ? 'flash-correct' : 'flash-wrong');
        body.querySelectorAll('.quiz-option').forEach((b) => {
          b.disabled = true;
          if (b.dataset.id === q.answerId) b.classList.add('correct');
          else if (b.dataset.id === chosenId) b.classList.add('wrong');
        });
        const chosenTerm = correct ? null : terms.find((t) => t.id === chosenId);
        settleAnswer(body, cardEl, target, correct, elapsed, chosenTerm, SciQuiz.questionContentLength(q), 'quiz', q.recoveryStrength);
      });
    });
  }

  // 克漏字回想題（box>=3 的精熟字）：挖空例句、先想再揭曉、誠實自評對錯。
  function renderClozeQuestion(body, headHtml, target, q) {
    body.innerHTML = `${headHtml}
      <div class="card quiz-cloze">
        <div class="quiz-cloze-tag">回想練習·不列入答對計數</div>
        <div class="quiz-prompt quiz-cloze-prompt">${q.prompt}</div>
        <button class="btn btn-secondary quiz-cloze-hint-toggle" id="cloze-hint-toggle" type="button">需要提示</button>
        <div class="quiz-cloze-hint" id="cloze-hint" hidden>${escapeHtml(SciQuiz.clozeHint(target))}</div>
        <button class="btn btn-primary quiz-cloze-reveal" id="cloze-reveal">想好了，看答案</button>
        <div class="quiz-cloze-answer" id="cloze-answer" hidden>
          <div class="quiz-cloze-term">答案：<strong>${target.term}</strong></div>
          <div class="quiz-cloze-def">複習說明：${target.def}</div>
          <div class="quiz-cloze-ask">你剛剛有想出來嗎？誠實回答，才幫得到自己。</div>
          <div class="btn-row">
            <button class="btn btn-ok" id="cloze-yes">我想出來了</button>
            <button class="btn btn-secondary" id="cloze-no">還沒記得</button>
          </div>
        </div>
      </div>`;
    const cardEl = body.querySelector('.card');
    const answerBox = body.querySelector('#cloze-answer');
    body.querySelector('#cloze-hint-toggle').addEventListener('click', (e) => {
      e.currentTarget.hidden = true;
      body.querySelector('#cloze-hint').hidden = false;
    });
    body.querySelector('#cloze-reveal').addEventListener('click', (e) => {
      e.currentTarget.hidden = true;
      answerBox.hidden = false;
    });
    const settle = (correct) => {
      if (quizAnswered) return;
      quizAnswered = true;
      const elapsed = Date.now() - quizStartTime;
      cardEl.classList.add(correct ? 'flash-correct' : 'flash-wrong');
      answerBox.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      settleAnswer(body, cardEl, target, correct, elapsed, null, SciQuiz.questionContentLength(q), 'cloze');
    };
    body.querySelector('#cloze-yes').addEventListener('click', () => settle(true));
    body.querySelector('#cloze-no').addEventListener('click', () => settle(false));
  }

  // 答題後的共同收尾（選擇題與克漏字共用）：結果橫幅、解說、下一題、記錄與情境防呆跳題。
  function settleAnswer(body, cardEl, target, correct, elapsed, chosenTerm, contentLength, source = 'quiz', recoveryStrength = 'strong') {
    const subjectAtAnswer = activeSubject;
    const modeAtAnswer = mode;

    const resultBanner = document.createElement('div');
    resultBanner.className = `quiz-result-banner ${correct ? 'is-correct' : 'is-wrong'}`;
    resultBanner.setAttribute('role', 'status');
    resultBanner.setAttribute('aria-live', 'polite');
    resultBanner.textContent = correct ? '✓ 答對了！' : '✗ 答錯了';
    cardEl.insertBefore(resultBanner, cardEl.firstChild);

    if (!correct) {
      const note = document.createElement('div');
      note.className = 'quiz-feedback';
      const compareLine = chosenTerm
        ? `<div class="quiz-feedback-compare">你選的「${chosenTerm.term}」：${chosenTerm.def}</div>`
        : '';
      note.innerHTML = `<div class="quiz-feedback-label">戰後解說</div>${compareLine}正確答案：<strong>${target.term}</strong> — ${target.def}`;
      cardEl.appendChild(note);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-secondary quiz-next-btn';
    nextBtn.textContent = '下一題 →';
    cardEl.appendChild(nextBtn);

    const { milestoneUnit } = recordAnswer(target, correct, elapsed, contentLength, source, recoveryStrength);
    // 使用者可能在延遲期間切了科目/模式，這時全域 quizIdx/quizQueue 已經是別科的狀態，
    // 這裡若不擋下來，會把別科題目誤植進（可能已不存在的）舊分頁，或把使用者尚未看到的
    // 題目悄悄跳過——這正是多位審查者回報「答完題畫面亂跳到別科」的根因。
    const stillSameContext = () => activeSubject === subjectAtAnswer && mode === modeAtAnswer;

    const goNext = () => {
      if (!stillSameContext()) return;
      if (milestoneUnit) {
        preserveScroll(() => renderMilestone(body, milestoneUnit, () => {
          quizIdx += 1;
          renderQuiz(body);
        }));
      } else {
        preserveScroll(() => {
          quizIdx += 1;
          renderQuiz(body);
        });
      }
    };

    // 拉長停留時間讓陪讀家長來得及唸出解說；同時保留手動「下一題」按鈕給想自己掌控節奏的人。
    const delay = milestoneUnit ? 1400 : (correct ? 1400 : 3200);
    const timer = setTimeout(goNext, delay);
    nextBtn.addEventListener('click', () => {
      clearTimeout(timer);
      goNext();
    });
  }

  // ================= 弱點清單 =================
  function practiceWeak(type, key, panel) {
    const subset = type === 'unit' ? terms.filter((t) => t.unit === key) : terms.filter((t) => t.id === key);
    if (subset.length === 0) return;
    mode = 'quiz';
    startQuizRound(subset);
    renderLearningBody(panel);
  }

  function openFamilySummary() {
    const overlay = el('#family-summary-overlay');
    const textarea = el('#family-summary-text');
    if (!overlay || !textarea) return;
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    textarea.value = SciWeak.buildFamilySummary(
      state,
      SUBJECTS,
      Object.fromEntries(subjectTerms),
      maxBox,
      SciFusionStore.accuracyBySubject,
    );
    el('#family-summary-status').textContent = '';
    if (familySummaryDialog) familySummaryDialog.open();
    else overlay.hidden = false;
  }

  function wireWeakActions(body) {
    body.querySelector('#family-summary-btn')?.addEventListener('click', openFamilySummary);
    body.querySelectorAll('.btn-weak-practice').forEach((btn) => {
      btn.addEventListener('click', () => practiceWeak(btn.dataset.type, btn.dataset.key, body.closest('.panel')));
    });
  }

  function renderWeak(body) {
    const currentIds = new Set(terms.map((t) => t.id));
    const subjectState = {
      ...state,
      weakLog: (state.weakLog || []).filter((entry) => currentIds.has(entry.termId)),
    };
    const weakUnits = SciWeak.getWeakUnits(subjectState, UNIT_LABELS);
    const weakTerms = SciWeak.getWeakTerms(subjectState, 10)
      .map((w) => ({ ...w, term: terms.find((t) => t.id === w.termId) }))
      .filter((w) => w.term);
    const accuracy = SciFusionStore.accuracyBySubject(subjectState, activeSubject);
    // 0 題不能顯示「正確率 0%」——那既不誠實（0 題何來 0%）又是自我羞辱。有紀錄才給百分比。
    const accuracyHtml = accuracy.total
      ? `<p class="weak-accuracy">本科近 30 題正確率 <strong>${Math.round(accuracy.accuracy * 100)}%</strong>（${accuracy.total} 題）</p>`
      : '<p class="weak-accuracy">本科還沒有作答紀錄，先去自測練幾題吧。</p>';
    const exportHtml = '<button id="family-summary-btn" class="btn btn-secondary family-summary-btn" type="button">📋 給老師／家長看</button>';
    const unitProgress = [...new Set(terms.map((term) => term.unit))].map((unit) => ({
      key: unit,
      label: UNIT_LABELS[unit] || unit,
      mastered: unitStatus(terms.filter((term) => term.unit === unit)) === 'mastered',
    }));
    const longTail = SciUiLogic.longTailUnits(unitProgress);
    const longTailHtml = longTail.length
      ? `<p class="long-tail-guide">🏔️ 就差這幾個單元登頂了：<strong>${longTail.join('、')}</strong>。挑一個慢慢收尾就好。</p>`
      : '';

    if (weakUnits.length === 0 && weakTerms.length === 0) {
      body.innerHTML = `${accuracyHtml}${longTailHtml}${exportHtml}<div class="card"><p>還沒有作答紀錄——去自測闖個幾輪，這裡就會幫你標出真正該加強的地方。</p></div>`;
      wireWeakActions(body);
      return;
    }

    body.innerHTML = `
      ${accuracyHtml}
      ${longTailHtml}
      ${exportHtml}
      <p class="weak-intro">🧭 進步地圖：這幾個地方再練一次就會更熟</p>
      <div class="card">
        <h3>這幾個單元再複習一輪吧</h3>
        <ul class="weak-list">
          ${weakUnits.map((w) => `
            <li>
              <span>${UNIT_ICONS[w.unit] || ''} ${w.label}</span>
              <span class="weak-actions">
                <span class="weak-score">${w.score}</span>
                <button class="btn-weak-practice" data-type="unit" data-key="${w.unit}">複習這個</button>
              </span>
            </li>`).join('') || '<li>目前沒有卡住的地方</li>'}
        </ul>
      </div>
      <div class="card">
        <h3>這幾個詞快到手了</h3>
        <ul class="weak-list">
          ${weakTerms.map((w) => `
            <li>
              <div class="weak-term-row">
                <span>${w.term.term}</span>
                <span class="weak-actions">
                  <span class="weak-score">${w.score}</span>
                  <button class="btn-weak-practice" data-type="term" data-key="${w.termId}">複習這個</button>
                </span>
              </div>
              <div class="weak-term-def">${w.term.def}</div>
            </li>`).join('') || '<li>目前沒有卡住的地方</li>'}
        </ul>
      </div>`;
    wireWeakActions(body);
  }

  // ================= Header 統計 =================
  const RANK_TIERS = [
    [0, '見習生'],
    [1, '初階英雄'],
    [10, '進階英雄'],
    [30, '資深英雄'],
    [80, '領域專家'],
    [120, '科學學者'],
    [200, '科學大師'],
    [300, '科學宗師'],
    [400, '科學泰斗'],
    [550, '科學巨擘'],
    [700, '萬象宗師'],
    [850, '星海先驅'],
    [1000, '科學典藏家'],
  ];

  function rankLabel(masteredCount) {
    let label = RANK_TIERS[0][1];
    for (const [threshold, name] of RANK_TIERS) {
      if (masteredCount >= threshold) label = name;
    }
    return label;
  }

  function masteredCardCount() {
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    return Object.values((state && state.cards) || {}).filter((c) => c.box >= maxBox).length;
  }

  function masteredCountForSubject(subjectKey) {
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    return SciBattle.masteredBySubject(state, maxBox)[subjectKey] || 0;
  }

  function countMasteredUnits() {
    let count = 0;
    subjectTerms.forEach((list) => {
      const units = [...new Set(list.map((t) => t.unit))];
      units.forEach((u) => {
        if (unitStatus(list.filter((t) => t.unit === u)) === 'mastered') count += 1;
      });
    });
    return count;
  }

  function renderHeroStats() {
    const streakEl = el('#streak-days');
    const masteredEl = el('#mastered-count');
    const rankEl = el('#hero-rank');
    const mastered = masteredCardCount();
    renderNewPlayerLayout();
    if (streakEl) streakEl.textContent = (state.stats && state.stats.streakDays) || 0;
    if (masteredEl) masteredEl.textContent = mastered;
    if (rankEl) rankEl.textContent = rankLabel(mastered);
    const rankGoalEl = el('#rank-next-goal');
    if (rankGoalEl) {
      const nextRank = RANK_TIERS.find(([threshold]) => threshold > mastered);
      rankGoalEl.textContent = nextRank
        ? `再精通 ${nextRank[0] - mastered} 張晉升〈${nextRank[1]}〉`
        : '已達頂點，繼續收藏每一張精通';
    }
    const loreProgress = el('#science-lore-progress');
    if (loreProgress) loreProgress.textContent = `已點亮 ${SciScienceRewards.unlockedLore(state, scienceLore).length} / ${scienceLore.length} 個科學領域`;

    const labelEl = el('#daily-goal-label');
    const fillEl = el('#daily-goal-fill');
    const wrapEl = el('#daily-goal');
    if (labelEl && fillEl && wrapEl && state.stats) {
      const today = SciStore.todayStr();
      const daily = (state.stats.dailyReviews && state.stats.dailyReviews.date === today) ? state.stats.dailyReviews.count : 0;
      const capped = Math.min(daily, DAILY_GOAL);
      const pct = Math.round((capped / DAILY_GOAL) * 100);
      fillEl.style.width = `${pct}%`;
      wrapEl.classList.toggle('done', daily >= DAILY_GOAL);
      labelEl.textContent = `今日已練 ${daily} 題${daily >= DAILY_GOAL ? ' 🎉' : ''}`;
    }
    const questList = el('#daily-quests');
    if (questList) questList.innerHTML = SciDailyQuests.list(state).map((quest) =>
      `<li class="${quest.done ? 'done' : ''}">${quest.done ? '✓' : '○'} ${quest.label}（${quest.value}/${quest.target}）</li>`).join('');
    const reviewHint = el('#return-review-hint');
    if (reviewHint) {
      const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
      const idsBySubject = Object.fromEntries([...subjectTerms].map(([key, list]) => [key, list.map((term) => term.id)]));
      const due = SciUiLogic.dueReviewSummary(state, Date.now(), maxBox, idsBySubject);
      reviewHint.hidden = !(state.stats.totalReviews > 0 && due.due > 0);
      reviewHint.innerHTML = due.due > 0
        ? `🌿 今天有 <b>${due.due}</b> 張卡可以複習${due.evergreen ? `，其中 ${due.evergreen} 張精熟卡也可以溫和回來看看` : ''}。
          <span class="return-review-actions">${due.bySubject.map((item) => {
            const label = SUBJECTS.find((subject) => subject.key === item.key)?.label || item.key;
            return `<button type="button" class="text-link-btn" data-review-subject="${item.key}">${label} ${item.due} 張</button>`;
          }).join('')}</span>`
        : '';
      reviewHint.querySelectorAll('[data-review-subject]').forEach((button) => {
        button.addEventListener('click', () => {
          mode = 'flashcard';
          switchSubject(button.dataset.reviewSubject);
          startFlashRound();
          renderLearningBody(document.querySelector(`.panel[data-key="${activeSubject}"]`));
        });
      });
    }
  }

  function recordDailySignal(signal, rerender = true) {
    SciDailyQuests.record(state, signal, SciStore.todayStr(), activeSubject);
    const rewards = SciDailyQuests.claimNewlyCompleted(state);
    rewards.forEach((claimId) => {
      const result = SciEconomy.earnCrystals(
        SciDailyQuests.rewardFor(claimId),
        claimId === SciDailyQuests.ALL_CLEAR_ID ? 'dailyQuestBonus' : 'dailyQuest',
      );
      const earned = Math.max(0, Number(result?.earned) || 0);
      if (earned > 0) showEnergyGain(earned);
      if (claimId === SciDailyQuests.ALL_CLEAR_ID && earned > 0) showDailyAllClear(earned);
    });
    SciStore.save(state);
    if (rerender) renderHeroStats();
  }

  function renderOnboarding() {
    const guide = el('#new-player-guide');
    const moreTools = el('#more-tools');
    const isNew = state.stats.totalReviews === 0;
    const checklist = SciUiLogic.normalizeOnboarding(loadJson(ONBOARDING_KEY, {}));
    if (guide) guide.hidden = !SciUiLogic.shouldShowOnboarding(state.stats.totalReviews, masteredCardCount(), checklist);
    if (moreTools) moreTools.open = SciUiLogic.moreToolsDefaultOpen({ isNew });
    guide?.querySelectorAll('[data-onboard-check]').forEach((checkbox) => {
      checkbox.checked = checklist[checkbox.dataset.onboardCheck];
      checkbox.onchange = () => {
        checklist[checkbox.dataset.onboardCheck] = checkbox.checked;
        saveJson(ONBOARDING_KEY, checklist);
        renderOnboarding();
      };
    });
    guide?.querySelectorAll('[data-onboard]').forEach((button) => {
      button.onclick = () => {
        mode = button.dataset.onboard;
        renderLearningBody(document.querySelector(`.panel[data-key="${activeSubject}"]`));
        el('#tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
  }

  function renderNewPlayerLayout() {
    const header = el('.site-header');
    const guide = el('#new-player-guide');
    const heroStats = el('.hero-stats');
    const dailyGoal = el('#daily-goal');
    const isNew = state.stats.totalReviews === 0;
    header?.classList.toggle('is-new-player', isNew);
    if (dailyGoal) dailyGoal.hidden = isNew;
    if (header && guide && heroStats) {
      if (isNew && guide.parentElement !== header) header.insertBefore(guide, heroStats);
      else if (!isNew && guide.parentElement === header) header.after(guide);
    }
  }

  function markOnboarding(task) {
    const checklist = SciUiLogic.normalizeOnboarding(loadJson(ONBOARDING_KEY, {}));
    if (!Object.prototype.hasOwnProperty.call(checklist, task) || checklist[task]) return;
    checklist[task] = true;
    saveJson(ONBOARDING_KEY, checklist);
    renderOnboarding();
  }

  // ================= 戰績卡片（免帳號免雲端的「被看見」管道）=================
  function drawStatsCard() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 760;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#eafbf0');
    grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = themeColor('--green', '#1f9d55');
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1c2b22';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('🧪 科學英雄戰績卡', canvas.width / 2, 110);

    const mastered = masteredCardCount();
    const masteredUnits = countMasteredUnits();
    const streak = (state.stats && state.stats.streakDays) || 0;
    const researchDonations = SciBaseStore.loadBase().researchDonations || 0;

    ctx.font = '26px sans-serif';
    ctx.fillStyle = themeColor('--green', '#1f9d55');
    ctx.fillText(rankLabel(mastered), canvas.width / 2, 160);

    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#5c6b62';
    ctx.fillText(new Date().toLocaleDateString('zh-TW'), canvas.width / 2, 195);

    const rows = [
      ['📅 累計練習', `${streak} 天`],
      ['⭐ 戰功', `${mastered} 個`],
      ['🏅 精通單元', `${masteredUnits} 個`],
      ['🔭 研究捐獻', `${researchDonations} 次`],
      ['♾️ 無盡巡禮最佳', `${(state.battle && state.battle.endlessBest) || 0} 連勝`],
    ];
    let y = 300;
    rows.forEach(([label, value]) => {
      ctx.textAlign = 'left';
      ctx.font = '28px sans-serif';
      ctx.fillStyle = '#1c2b22';
      ctx.fillText(label, 80, y);
      ctx.textAlign = 'right';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillStyle = themeColor('--green', '#1f9d55');
      ctx.fillText(value, canvas.width - 80, y);
      y += 90;
    });

    ctx.textAlign = 'center';
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#8a978f';
    ctx.fillText('science-hero-hk6429.vercel.app', canvas.width / 2, canvas.height - 50);

    return canvas;
  }

  function shareStatsCard() {
    const canvas = drawStatsCard();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `科學英雄戰績卡-${SciStore.todayStr()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function drawCubCard(data) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#e4f8eb');
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = themeColor('--green', '#1f9d55');
    ctx.lineWidth = 18;
    ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1c2b22';
    ctx.font = 'bold 58px sans-serif';
    ctx.fillText('🧬 科學英雄稚靈名片', canvas.width / 2, 130);
    ctx.font = '230px sans-serif';
    ctx.fillText(data.emoji, canvas.width / 2, 410);
    ctx.font = 'bold 76px sans-serif';
    ctx.fillText(data.displayName, canvas.width / 2, 530);
    if (data.displayName !== data.name) {
      ctx.fillStyle = '#5c6b62';
      ctx.font = '34px sans-serif';
      ctx.fillText(`稚靈：${data.name}`, canvas.width / 2, 585);
    }

    ctx.fillStyle = themeColor('--green', '#1f9d55');
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText(`${data.parents[0].label} × ${data.parents[1].label}`, canvas.width / 2, 670);
    ctx.fillStyle = '#33473a';
    ctx.font = '32px sans-serif';
    const chars = Array.from(data.bornLine);
    const lines = [];
    for (let i = 0; i < chars.length; i += 18) lines.push(chars.slice(i, i + 18).join(''));
    lines.forEach((line, index) => ctx.fillText(line, canvas.width / 2, 760 + index * 50));

    ctx.fillStyle = '#1c2b22';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(`主人段位：${data.rankLabel || '見習生'}`, canvas.width / 2, 1060);
    ctx.fillText(`稚靈圖鑑：${data.cubCount} / 6`, canvas.width / 2, 1120);
    ctx.fillStyle = '#718077';
    ctx.font = '26px sans-serif';
    ctx.fillText('science-hero-hk6429.vercel.app', canvas.width / 2, 1250);
    return canvas;
  }

  function shareCubCard(cubId) {
    const fstate = SciFusionStore.load();
    const data = SciFusionStore.buildCubCardData(fstate, cubId, { rankLabel: rankLabel(masteredCardCount()) });
    if (!data) return;
    const canvas = drawCubCard(data);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `科學英雄稚靈-${data.displayName}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: '我的稚靈名片' });
          return;
        } catch { /* 取消或失敗時落回下載 */ }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  // ================= 精靈融合坊 =================
  let fusionNotice = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
  }

  function cubArt(cub, extraClass = '') {
    const assetId = String(cub.id).replace(/^cub_/, '');
    return `<img class="fusion-cub-img ${extraClass}" src="assets/fusion/cub-${assetId}.png" alt="${escapeHtml(cub.displayName || cub.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${escapeHtml(cub.emoji)}',className:'fusion-cub-emoji ${extraClass}'}))">`;
  }

  function fusionReasonText(reason) {
    if (reason === 'same-subject') return '請選兩個不同科目。';
    if (reason === 'already-hatched') return '這組配對的稚靈已經孵化。';
    if (reason.startsWith('master:')) {
      const subject = reason.slice('master:'.length);
      return `${SciFusionStore.SUBJECT_LABELS[subject] || subject}尚未精通滿 100 張。`;
    }
    if (reason.startsWith('accuracy:')) {
      const subject = reason.slice('accuracy:'.length);
      return `${SciFusionStore.SUBJECT_LABELS[subject] || subject}近期正確率未達 80%（至少 15 題）。`;
    }
    return '還有融合條件未達成。';
  }

  function fusionNoticeHtml() {
    if (!fusionNotice) return '';
    if (fusionNotice.type === 'hatching') {
      return '<div class="fusion-notice is-hatching" role="status" aria-live="polite"><div class="fusion-egg" aria-hidden="true"><img class="fusion-egg-img" src="assets/companion/companion-egg.png" alt=""></div><strong>雙科光芒正在匯聚……</strong></div>';
    }
    if (fusionNotice.type === 'success') {
      const cub = fusionNotice.cub;
      return `<div class="fusion-notice is-success celebrate-in">
        <div class="fusion-result-emoji">${cubArt(cub)}</div>
        <strong>${escapeHtml(cub.name)} 誕生了！</strong><p>${escapeHtml(cub.bornLine)}</p>
        <div class="fusion-actions"><button class="btn btn-secondary" data-nick="${escapeHtml(cub.id)}">幫牠取名</button>
        <button class="btn btn-primary" data-card="${escapeHtml(cub.id)}">產生名片</button></div></div>`;
    }
    if (fusionNotice.type === 'fail') {
      return `<div class="fusion-notice is-gentle"><strong>這次光暈散開了</strong><p>${escapeHtml(fusionNotice.line)}</p>
        <p>已返還 ${fusionNotice.refund} 晶能，精靈與學習進度都完好無缺。</p></div>`;
    }
    if (fusionNotice.type === 'grand') {
      const g = fusionNotice.grand;
      return `<div class="fusion-notice is-grand celebrate-in">
        <div class="fusion-result-emoji">${cubArt(g, 'grand')}</div>
        <strong>${escapeHtml(g.name)} 降臨了！</strong><p>${escapeHtml(g.bornLine)}</p>
        <div class="fusion-actions"><button class="btn btn-primary" data-prestige="1">開啟科學守護者巡禮</button></div></div>`;
    }
    return `<div class="fusion-notice">${escapeHtml(fusionNotice.text || '')}</div>`;
  }

  function grandSectionHtml(fstate, balance) {
    const grand = SciFusionStore.GRAND;
    const cost = SciFusionStore.GRAND_COST;
    if (fstate.grandBorn) {
      return `<section class="fusion-grand is-born"><div class="fusion-grand-face">${cubArt(grand, 'grand')}</div>
        <div class="fusion-grand-body"><span class="fusion-grand-kicker">終局・科學守護者</span>
        <h3>${escapeHtml(grand.name)}</h3><p>${escapeHtml(grand.bornLine)}</p>
        <div class="fusion-actions"><button class="btn btn-primary" data-prestige="1">開啟科學守護者巡禮</button>
        <button class="btn btn-secondary" data-museum="1">參觀融合博物館</button></div></div></section>`;
    }
    const gate = SciFusionStore.canFuseGrand(fstate);
    if (gate.ok) {
      const enough = balance >= cost;
      return `<section class="fusion-grand is-ready"><div class="fusion-grand-face is-dormant">${cubArt(grand, 'grand')}</div>
        <div class="fusion-grand-body"><span class="fusion-grand-kicker">終局融合已解鎖</span>
        <h3>六道稚靈之光即將匯流……</h3><p>你已在四門科學完成元靈里程碑。迎接元靈不是全書終點；融合一次性且保證成功。</p>
        ${enough ? '' : `<p class="fusion-grand-hint">還差 ${cost - balance} 晶能（需 ${cost}）。持續作答就能補齊。</p>`}
        <button class="btn btn-primary" data-grand="1" ${enough ? '' : 'disabled'}>迎接元靈（${cost} 晶能）</button></div></section>`;
    }
    return `<section class="fusion-grand is-locked"><div class="fusion-grand-face is-silhouette">🌌</div>
      <div class="fusion-grand-body"><span class="fusion-grand-kicker">終局・尚未解鎖</span>
      <h3>集滿六隻稚靈，元靈聖獸將降臨</h3><p>還差 <b>${gate.missing}</b> 隻稚靈。每一隻都對應你在兩門科學的真實精通——慢慢來，牠會等你。</p></div></section>`;
  }

  function renderFusionLab() {
    const body = el('#fusion-body');
    if (!body) return;
    const fstate = SciFusionStore.load();
    const balance = SciFusionStore.crystalBalance();
    const today = SciStore.todayStr();
    const todayCount = fstate.lastFuseDate === today ? fstate.fuseCount : 0;
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    const mastered = SciBattle.masteredBySubject(state, maxBox);
    const bookProgress = SciBattle.subjectProgress(state, maxBox, Object.fromEntries(subjectTerms));
    const collection = SciFusionStore.listCubs(fstate);
    const owned = new Map(collection.map((cub) => [cub.id, cub]));
    const balanceEl = el('#fusion-crystal-balance');
    if (balanceEl) balanceEl.textContent = balance;

    const spiritStrip = SUBJECTS.map((subject) => {
      const count = mastered[subject.key] || 0;
      const spirit = SciBattle.companionForSubject(subject.key, count);
      return `<div class="fusion-spirit"><span>${escapeHtml(spirit.emoji)}</span><b>${escapeHtml(subject.label)}</b>
        <small>${escapeHtml(spirit.name)} Lv.${spirit.level}<br>${count >= SciFusionStore.MASTER_GATE ? '已迎接元靈里程碑' : `元靈里程碑 ${count} / 100`}<br>全書 ${count} / ${bookProgress[subject.key].total}</small></div>`;
    }).join('');

    const pairCards = SciFusionStore.CUBS.map((cub) => {
      const [a, b] = cub.pair;
      const parentLabel = `${SciFusionStore.SUBJECT_LABELS[a]} × ${SciFusionStore.SUBJECT_LABELS[b]}`;
      const ownedCub = owned.get(cub.id);
      if (ownedCub) {
        return `<article class="fusion-pair-card is-owned"><div class="fusion-cub-face">${cubArt(ownedCub)}</div>
          <strong>${escapeHtml(ownedCub.displayName)}</strong><small>${escapeHtml(parentLabel)}</small>
          <span class="fusion-owned-tag">${ownedCub.isActive ? '隨行中 ✓' : '已孵化'}</span></article>`;
      }
      const preview = SciFusionStore.getFusionPreview(fstate, a, b);
      if (!preview.known) {
        return `<article class="fusion-pair-card"><div class="fusion-cub-face is-silhouette">❓</div><strong>？？？</strong>
          <small>${escapeHtml(parentLabel)}</small><button class="btn btn-secondary" data-reveal="${a}|${b}">解謎揭曉</button></article>`;
      }
      const gate = SciFusionStore.canFuse({ maxBox }, state, a, b);
      const reasons = gate.reasons.map(fusionReasonText);
      if (balance < SciFusionStore.FUSE_COST) reasons.push(`晶能不足（需 ${SciFusionStore.FUSE_COST}）。`);
      if (todayCount >= SciFusionStore.MAX_FUSE_PER_DAY) reasons.push('今日融合次數已用完。');
      const canStart = gate.ok && balance >= SciFusionStore.FUSE_COST && todayCount < SciFusionStore.MAX_FUSE_PER_DAY;
      return `<article class="fusion-pair-card is-known"><div class="fusion-cub-face">${cubArt(preview.cub)}</div>
        <strong>${escapeHtml(preview.cub.name)}</strong><small>${escapeHtml(parentLabel)}</small><p>${escapeHtml(preview.cub.bornLine)}</p>
        ${reasons.length ? `<ul class="fusion-reasons">${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>` : ''}
        <button class="btn btn-primary" data-fuse="${a}|${b}" ${canStart ? '' : 'disabled'}>融合（${SciFusionStore.FUSE_COST} 晶能）</button></article>`;
    }).join('');

    body.innerHTML = `${fusionNoticeHtml()}<div class="fusion-summary"><span>今日融合 <b>${todayCount} / ${SciFusionStore.MAX_FUSE_PER_DAY}</b></span>
      <span>稚靈圖鑑 <b>${collection.length} / 6</b></span></div>
      <h3>四科精靈</h3><div class="fusion-spirit-strip">${spiritStrip}</div>
      <h3>稚靈配對牆</h3><div class="fusion-pair-grid">${pairCards}</div>
      <section class="fusion-collection"><h3>稚靈收藏</h3>${collection.length ? collection.map((cub) => `<div class="fusion-collection-row">
        <span class="fusion-collection-name">${cubArt(cub, 'small')} <b>${escapeHtml(cub.displayName)}</b>${cub.isActive ? ' · 隨行中' : ''}</span>
        <span class="fusion-actions"><button class="btn btn-secondary" data-active="${escapeHtml(cub.id)}">${cub.isActive ? '取消隨行' : '隨行出戰'}</button>
        <button class="btn btn-secondary" data-nick="${escapeHtml(cub.id)}">改暱稱</button><button class="btn btn-secondary" data-card="${escapeHtml(cub.id)}">看名片</button></span></div>`).join('')
        : '<p class="fusion-empty">答對隱藏題揭曉配方，學習量達標後就能迎接第一隻稚靈。</p>'}</section>
      ${grandSectionHtml(fstate, balance)}`;

    body.querySelectorAll('[data-reveal]').forEach((button) => button.addEventListener('click', () => {
      const [a, b] = button.dataset.reveal.split('|');
      renderRevealQuestion(a, b);
    }));
    body.querySelectorAll('[data-fuse]').forEach((button) => button.addEventListener('click', () => {
      const [a, b] = button.dataset.fuse.split('|');
      renderRevealQuestion(a, b, 'fuse');
    }));
    body.querySelectorAll('[data-active]').forEach((button) => button.addEventListener('click', () => {
      const next = SciFusionStore.load();
      if (next.activeCub === button.dataset.active) SciFusionStore.clearActiveCub(next);
      else SciFusionStore.setActiveCub(next, button.dataset.active);
      SciFusionStore.save(next);
      fusionNotice = { type: 'info', text: next.activeCub ? '稚靈已跟上你的對戰隊伍。' : '已取消稚靈隨行。' };
      renderFusionLab();
    }));
    body.querySelectorAll('[data-nick]').forEach((button) => button.addEventListener('click', () => renderNicknamePanel(button.dataset.nick)));
    body.querySelectorAll('[data-card]').forEach((button) => button.addEventListener('click', () => shareCubCard(button.dataset.card)));
    body.querySelectorAll('[data-grand]').forEach((button) => button.addEventListener('click', () => {
      if (!confirm(`集滿六隻稚靈的終局融合，將花費 ${SciFusionStore.GRAND_COST} 晶能迎接元靈聖獸。保證成功，確定進行？`)) return;
      const next = SciFusionStore.load();
      const result = SciFusionStore.fuseGrand(next);
      if (result.ok) {
        fusionNotice = { type: 'grand', grand: result.grand };
        SciFusionStore.save(next);
      } else {
        fusionNotice = { type: 'info', text: result.reason === 'crystals' ? '晶能不足。' : '終局融合條件還沒有全部達成。' };
      }
      renderFusionLab();
    }));
    body.querySelectorAll('[data-prestige]').forEach((button) => button.addEventListener('click', renderPrestige));
    body.querySelectorAll('[data-museum]').forEach((button) => button.addEventListener('click', renderFusionMuseum));
  }

  function renderFusionMuseum() {
    const body = el('#fusion-body');
    if (!body) return;
    const fstate = SciFusionStore.load();
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    const data = SciFusionStore.buildPrestigeData(fstate, state, { maxBox });
    body.innerHTML = `<button class="fusion-back" type="button">← 回融合坊</button><section class="fusion-museum card">
      <p class="prestige-kicker">永久榮譽陳列</p><h2>🏛️ 融合博物館</h2>
      <p>這裡收藏你用真實精通成果迎接的夥伴，不會過期，也不需要重刷。</p>
      <h3>四科精靈</h3><div class="prestige-spirit-row">${data.spirits.map((spirit) => `<div class="prestige-spirit"><span>${escapeHtml(spirit.spiritEmoji)}</span><b>${escapeHtml(spirit.spiritName)}</b><small>${escapeHtml(spirit.label)}・精通 ${spirit.mastered} 張</small></div>`).join('')}</div>
      <h3>已收集稚靈</h3><div class="fusion-museum-grid">${data.cubs.filter((cub) => cub.owned).map((cub) => `<article>${cubArt(cub)}<b>${escapeHtml(cub.displayName)}</b><p>${escapeHtml(cub.bornLine)}</p></article>`).join('')}</div>
      <h3>元靈聖獸</h3><div class="fusion-museum-grand">${cubArt(data.grand, 'grand')}<b>${escapeHtml(data.grand.name)}</b></div>
    </section>`;
    body.querySelector('.fusion-back').addEventListener('click', renderFusionLab);
  }

  function renderPrestige() {
    const body = el('#fusion-body');
    if (!body) return;
    const fstate = SciFusionStore.load();
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    const data = SciFusionStore.buildPrestigeData(fstate, state, { maxBox });
    const progress = SciBattle.subjectProgress(state, maxBox, Object.fromEntries(subjectTerms));
    const spiritCards = data.spirits.map((s) => `<div class="prestige-spirit"><span>${escapeHtml(s.spiritEmoji)}</span>
      <b>${escapeHtml(s.label)}</b><small>${escapeHtml(s.spiritName)} Lv.${s.level}<br>精通 ${s.mastered} / ${progress[s.key].total}</small></div>`).join('');
    const bookRows = SUBJECTS.map((subject) => {
      const item = progress[subject.key];
      return `<div class="book-progress-row"><span><b>${escapeHtml(subject.label)}</b> ${item.mastered} / ${item.total}</span>
        <div class="book-progress-bar" aria-label="${escapeHtml(subject.label)}全書精通 ${item.mastered} / ${item.total}"><i style="width:${item.pct}%"></i></div>
        <small>還有 ${item.remaining} 個知識點等你收藏</small></div>`;
    }).join('');
    const cubRows = data.cubs.map((cub) => `<li class="prestige-cub"><span class="prestige-cub-face">${cubArt(cub, 'small')}</span>
      <span class="prestige-cub-text"><b>${escapeHtml(cub.displayName)}</b><em>${escapeHtml(cub.bornLine)}</em></span></li>`).join('');
    body.innerHTML = `<button class="fusion-back" type="button">← 回融合坊</button>
      <div class="prestige-scroll card">
        <div class="prestige-crown">${cubArt(data.grand, 'grand')}</div>
        <p class="prestige-kicker">科學守護者巡禮</p>
        <h2>${escapeHtml(data.grand.name)}</h2>
        <p class="prestige-lead">你已迎接元靈，這是里程碑，不是終點。四門科學與六隻稚靈在元靈身上相遇，這一頁記下你走過的路。</p>
        <div class="prestige-stats"><div><b>${data.totalMastered}</b><small>累計精通詞卡</small></div>
          <div><b>${data.cubCount} / 6</b><small>稚靈圖鑑</small></div>
          <div><b>4 / 4</b><small>元靈里程碑</small></div></div>
        <h3>全書精通進度</h3><div class="book-progress-list">${bookRows}</div>
        <h3>四科里程碑精靈</h3><div class="prestige-spirit-row">${spiritCards}</div>
        <h3>六稚靈誕生語</h3><ul class="prestige-cub-list">${cubRows}</ul>
        <p class="prestige-foot">這是永久的榮譽，不會過期、不會清零。你隨時可以回來看看牠們，也可以繼續陪弱項一起變強。</p>
      </div>`;
    body.querySelector('.fusion-back').addEventListener('click', renderFusionLab);
  }

  function renderRevealQuestion(a, b, purpose = 'reveal') {
    const body = el('#fusion-body');
    const reveal = SciFusionStore.buildRevealQuestion(a, b, Object.fromEntries(subjectTerms));
    const q = reveal.question;
    const startedAt = Date.now();
    body.dataset.answered = '0';
    body.innerHTML = `<button class="fusion-back" type="button">← 回配對牆</button><div class="fusion-quiz card">
      <p class="fusion-kicker">${purpose === 'fuse' ? '融合前科學挑戰' : '配方揭曉'}·${escapeHtml(SciFusionStore.SUBJECT_LABELS[reveal.subject])}</p>
      ${purpose === 'fuse' ? `<p>答對才會扣 ${SciFusionStore.FUSE_COST} 晶能並保證融合成功；答錯不扣晶能，可以再試。</p>` : ''}
      <div class="quiz-prompt">${q.mode === 'term2def' ? `「${escapeHtml(q.prompt)}」是在說什麼？` : `這個定義說的是哪個詞：<br>「${escapeHtml(q.prompt)}」`}</div>
      <div class="quiz-options">${q.options.map((option) => `<button class="quiz-option" data-id="${escapeHtml(option.id)}">${escapeHtml(option.label)}</button>`).join('')}</div>
      <div class="fusion-quiz-feedback" aria-live="polite"></div></div>`;
    body.querySelector('.fusion-back').addEventListener('click', renderFusionLab);
    body.querySelectorAll('.quiz-option').forEach((button) => button.addEventListener('click', () => {
      if (body.dataset.answered === '1') return;
      body.dataset.answered = '1';
      const correct = button.dataset.id === q.answerId;
      const target = (subjectTerms.get(reveal.subject) || []).find((term) => term.id === q.answerId);
      recordAnswer(target, correct, Date.now() - startedAt, SciQuiz.questionContentLength(q), 'fusion', q.recoveryStrength);
      body.querySelectorAll('.quiz-option').forEach((option) => {
        option.disabled = true;
        if (option.dataset.id === q.answerId) option.classList.add('correct');
        else if (option === button && !correct) option.classList.add('wrong');
      });
      const feedback = body.querySelector('.fusion-quiz-feedback');
      if (correct) {
        body.querySelector('.fusion-quiz').classList.add('flash-correct');
        feedback.innerHTML = '<p class="quiz-result-banner is-correct">✓ 答對了！</p>';
        const next = SciFusionStore.load();
        if (purpose === 'fuse') {
          const result = SciFusionStore.fuse(next, state, a, b, {
            knowledgeCheckPassed: true,
            today: SciStore.todayStr(),
            meta: { maxBox: SciFlashcard.BOX_INTERVAL_DAYS.length - 1 },
          });
          if (result.ok) {
            SciFusionStore.save(next);
            fusionNotice = { type: 'success', cub: result.cub };
          } else {
            fusionNotice = { type: 'info', text: result.reason === 'crystals' ? '晶能不足。' : '融合條件還沒有全部達成。' };
          }
        } else {
          SciFusionStore.revealPair(next, a, b);
          SciFusionStore.save(next);
          fusionNotice = { type: 'info', text: '雙科線索合上了，稚靈真身已揭曉！' };
        }
        setTimeout(renderFusionLab, 900);
      } else {
        feedback.innerHTML = '<p>這次差一點，沒有任何資源損失。</p><button class="btn btn-secondary" type="button">再試一題</button>';
        feedback.querySelector('button').addEventListener('click', () => renderRevealQuestion(a, b, purpose));
      }
    }));
  }

  function renderNicknamePanel(cubId) {
    const body = el('#fusion-body');
    const cub = SciFusionStore.listCubs(SciFusionStore.load()).find((item) => item.id === cubId);
    if (!cub) return renderFusionLab();
    body.innerHTML = `<button class="fusion-back" type="button">← 回融合坊</button><div class="fusion-nickname card">
      <div class="fusion-result-emoji">${cubArt(cub)}</div><h3>幫 ${escapeHtml(cub.name)} 選個暱稱</h3>
      <p>只從預設詞庫組合，不開放自由輸入。</p><div class="fusion-nick-selects">
      <select id="fusion-nick-prefix">${SciFusionStore.NICK_PREFIXES.map((word, index) => `<option value="${index}">${escapeHtml(word)}</option>`).join('')}</select>
      <select id="fusion-nick-suffix">${SciFusionStore.NICK_SUFFIXES.map((word, index) => `<option value="${index}">${escapeHtml(word)}</option>`).join('')}</select></div>
      <p>預覽：<strong id="fusion-nick-preview"></strong></p><div class="fusion-actions">
      <button class="btn btn-secondary" id="fusion-nick-clear">恢復本名</button><button class="btn btn-primary" id="fusion-nick-save">儲存暱稱</button></div></div>`;
    const updatePreview = () => {
      el('#fusion-nick-preview').textContent = SciFusionStore.composeNickname(Number(el('#fusion-nick-prefix').value), Number(el('#fusion-nick-suffix').value));
    };
    body.querySelector('.fusion-back').addEventListener('click', renderFusionLab);
    el('#fusion-nick-prefix').addEventListener('change', updatePreview);
    el('#fusion-nick-suffix').addEventListener('change', updatePreview);
    el('#fusion-nick-save').addEventListener('click', () => {
      const next = SciFusionStore.load();
      SciFusionStore.setNickname(next, cubId, el('#fusion-nick-preview').textContent);
      SciFusionStore.save(next);
      fusionNotice = { type: 'info', text: '暱稱已儲存。' };
      renderFusionLab();
    });
    el('#fusion-nick-clear').addEventListener('click', () => {
      const next = SciFusionStore.load();
      SciFusionStore.setNickname(next, cubId, '');
      SciFusionStore.save(next);
      fusionNotice = { type: 'info', text: '已恢復稚靈本名。' };
      renderFusionLab();
    });
    updatePreview();
  }

  function openFusionLab() {
    const overlay = el('#fusion-overlay');
    if (!overlay) return;
    fusionNotice = null;
    renderFusionLab();
    if (fusionDialog) fusionDialog.open();
    else overlay.hidden = false;
  }

  function closeFusionLab() {
    const overlay = el('#fusion-overlay');
    if (fusionDialog) fusionDialog.close();
    else if (overlay) overlay.hidden = true;
  }

  function renderJourney() {
    const body = el('#journey-body');
    if (!body) return;
    const mastered = masteredCardCount();
    const rank = SciBattle.rankInfo(state);
    const loreCount = SciScienceRewards.unlockedLore(state, scienceLore).length;
    const fusion = SciFusionStore.load();
    const cubCount = SciFusionStore.listCubs(fusion).length;
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    const progress = SciBattle.subjectProgress(state, maxBox, Object.fromEntries(subjectTerms));
    const bookRows = SUBJECTS.map((subject) => {
      const item = progress[subject.key];
      return `<div class="book-progress-row"><span><b>${escapeHtml(subject.label)}</b> ${item.mastered} / ${item.total}</span>
        <div class="book-progress-bar" aria-label="${escapeHtml(subject.label)}全書精通 ${item.mastered} / ${item.total}"><i style="width:${item.pct}%"></i></div>
        <small>還有 ${item.remaining} 個知識點等你收藏</small></div>`;
    }).join('');
    body.innerHTML = `<p class="journey-intro">你走過的每一步，都來自真正答過、記住與精通的內容。</p>
      <div class="journey-grid">
        <article><span>⭐</span><b>精通稱號</b><strong>${escapeHtml(rankLabel(mastered))}</strong><small>${mastered} 張精通詞卡</small></article>
        <article><span>${rank.img ? `<img class="journey-rank-img" src="${rank.img}" alt="${escapeHtml(rank.name)}">` : rank.ico}</span><b>PvE 段位</b><strong>${escapeHtml(rank.name)}</strong><small>${rank.next ? `距下一段 ${rank.next.at - rank.pts} 分` : '已達頂點'}</small></article>
        <article><span>📜</span><b>科學史圖鑑</b><strong>${loreCount} / ${scienceLore.length}</strong><small>已點亮的科學故事</small></article>
        <article><span>🧬</span><b>融合收藏</b><strong>${cubCount} / ${SciFusionStore.CUBS.length}</strong><small>已迎接的稚靈</small></article>
        <article><span>🌌</span><b>元靈巡禮</b><strong>${fusion.grandBorn ? '里程碑達成' : '探索中'}</strong><small>${fusion.grandBorn ? '已迎接元靈，繼續收藏知識' : '依自己的步調前進'}</small></article>
      </div><h3>全書精通進度</h3><div class="book-progress-list">${bookRows}</div>`;
  }

  function openJourney() {
    renderJourney();
    journeyDialog?.open();
  }

  // ================= 進度匯出／匯入 =================
  function wireIoButtons() {
    const exportBtn = el('#export-btn');
    const importBtn = el('#import-btn');
    const importFile = el('#import-file');
    const shareBtn = el('#share-card-btn');
    const fusionBtn = el('#fusion-lab-btn');
    const soundToggle = el('#sound-toggle');
    if (soundToggle) {
      updateSoundButton();
      soundToggle.addEventListener('click', () => {
        localStorage.setItem(SOUND_KEY, soundEnabled() ? '1' : '0');
        updateSoundButton();
      });
    }
    const rtBattleBtn = el('#rtbattle-tool-btn');
    const fusionClose = el('#fusion-close');
    const familyOverlay = el('#family-summary-overlay');
    const parentGuideOverlay = el('#parent-guide-overlay');
    familySummaryDialog = createDialogController(familyOverlay);
    parentGuideDialog = createDialogController(parentGuideOverlay);
    fusionDialog = createDialogController(el('#fusion-overlay'));
    journeyDialog = createDialogController(el('#journey-overlay'));
    const closeFamilySummary = () => familySummaryDialog?.close();
    const closeParentGuide = () => parentGuideDialog?.close();
    if (shareBtn) shareBtn.addEventListener('click', shareStatsCard);
    if (fusionBtn) fusionBtn.addEventListener('click', openFusionLab);
    el('#journey-btn')?.addEventListener('click', openJourney);
    el('#journey-close')?.addEventListener('click', () => journeyDialog?.close());
    if (rtBattleBtn) rtBattleBtn.addEventListener('click', () => {
      mode = 'rtbattle';
      renderLearningBody(document.querySelector(`.panel[data-key="${activeSubject}"]`));
      el('#tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const classboardBtn = el('#classboard-btn');
    if (classboardBtn) classboardBtn.addEventListener('click', () => {
      window.SciClassBoard?.open({ subject: activeSubject, mastered: masteredCountForSubject(activeSubject) });
    });
    if (fusionClose) fusionClose.addEventListener('click', closeFusionLab);
    el('#family-summary-close')?.addEventListener('click', closeFamilySummary);
    el('#family-summary-done')?.addEventListener('click', closeFamilySummary);
    el('#family-summary-copy')?.addEventListener('click', async () => {
      const textarea = el('#family-summary-text');
      const status = el('#family-summary-status');
      if (!textarea) return;
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(textarea.value);
        else {
          textarea.select();
          document.execCommand('copy');
          textarea.setSelectionRange(0, 0);
        }
        if (status) status.textContent = '摘要已複製。';
      } catch {
        if (status) status.textContent = '無法自動複製，請長按文字後手動複製。';
      }
    });
    el('#parent-guide-btn')?.addEventListener('click', () => parentGuideDialog?.open());
    el('#parent-guide-close')?.addEventListener('click', closeParentGuide);
    if (!exportBtn || !importBtn || !importFile) return;

    exportBtn.addEventListener('click', () => {
      const blob = new Blob([SciStore.exportState(state)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `science-hero-progress-${SciStore.todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    importBtn.addEventListener('click', () => importFile.click());

    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        state = SciStore.importState(text);
        if ((state.stats?.totalReviews || 0) > 0) {
          localStorage.setItem(FIRST_SUCCESS_KEY, '1');
          saveJson(ONBOARDING_KEY, { flashcard: true, quiz: true, battle: true });
        }
        SciStore.save(state);
        renderHeroStats();
        renderFusionLab();
        if (typeof SciBaseUI !== 'undefined') SciBaseUI.refresh?.();
        if (typeof SciMarketUI !== 'undefined') SciMarketUI.refresh?.();
        renderOnboarding();
        renderLearningBody(document.querySelector(`.panel[data-key="${activeSubject}"]`));
        alert('進度已匯入！');
      } catch (err) {
        alert('匯入失敗，檔案格式不正確。');
      } finally {
        importFile.value = '';
      }
    });
  }

  async function boot() {
    state = SciStore.load();

    const panels = el('#panels');
    panels.innerHTML = '';

    try {
      const [loaded, loreData, triviaData] = await Promise.all([
        Promise.all(SUBJECTS.map(async (subject) => {
          const res = await fetch(subject.file);
          if (!res.ok) throw new Error(`${subject.label}資料載入失敗（HTTP ${res.status}）`);
          return [subject.key, await res.json()];
        })),
        fetch('data/science-lore.json').then((res) => { if (!res.ok) throw new Error(`科學史資料載入失敗（HTTP ${res.status}）`); return res.json(); }),
        fetch('data/science-trivia.json').then((res) => { if (!res.ok) throw new Error(`科學奇遇資料載入失敗（HTTP ${res.status}）`); return res.json(); }),
      ]);
      loaded.forEach(([key, data]) => subjectTerms.set(key, data));
      if (!SciScienceRewards.validateLore(loreData)) throw new Error('科學史資料格式不正確');
      scienceLore = loreData;
      scienceTrivia = triviaData;
    } catch (err) {
      panels.insertAdjacentHTML('afterbegin', `<div class="card">這科資料一時載不出來，重新整理一次通常就好了（技術訊息：${err.message}）</div>`);
      return;
    }

    // 支援老師分享連結指定範圍：?subject=biology&unit=cell
    const params = new URLSearchParams(location.search);
    const paramSubject = params.get('subject');
    activeSubject = SciUiLogic.resolveInitialSubject(paramSubject, [...subjectTerms.keys()]);
    terms = subjectTerms.get(activeSubject);

    const paramUnit = params.get('unit');
    if (paramUnit) {
      const filtered = terms.filter((t) => t.unit === paramUnit);
      if (filtered.length) {
        mode = 'quiz';
        unitFilter = paramUnit;
        startQuizRound(filtered);
      }
    }

    renderTabs();
    for (const s of SUBJECTS) {
      const panel = document.createElement('section');
      panel.className = `panel${s.key === activeSubject ? ' active' : ''}`;
      panel.dataset.key = s.key;
      panel.innerHTML = `<div class="subject-body"></div>`;
      panels.appendChild(panel);
    }

    wireIoButtons();
    SciBaseUI.init({
      getState: () => state,
      getTermsBySubject: () => Object.fromEntries(subjectTerms),
      getLore: () => scienceLore,
    });
    renderHeroStats();
    renderOnboarding();
    renderLearningBody(document.querySelector(`.panel[data-key="${activeSubject}"]`));
  }

  return { boot };
})();

document.addEventListener('DOMContentLoaded', SciApp.boot);
