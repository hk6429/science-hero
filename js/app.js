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

  let state = null;
  let activeSubject = 'biology';
  const subjectTerms = new Map();
  let terms = [];
  let mode = 'flashcard'; // 'flashcard' | 'quiz' | 'weak'
  let unitFilter = null; // 目前選定的單元（null = 全部）
  let gradeFilter = null; // 目前選定的年級（null = 全部）

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
  let quizStartTime = 0;
  let quizAnswered = false;

  function el(sel) { return document.querySelector(sel); }

  // 換題/翻卡時常見的手機瀏覽器怪癖：舊按鈕被拿掉時，focus 掉回 body 會把畫面拉回最頂端。
  // 換內容前先讓目前的按鈕失焦、記住捲動位置，換完再退回去，避免每答一題就跳回頁首。
  function preserveScroll(renderFn) {
    const y = window.scrollY;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    renderFn();
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  let audioCtx = null;
  function playTone(freq, duration, type = 'sine') {
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
    return pool;
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
      if (s.key === activeSubject) btn.classList.add('active');
      btn.addEventListener('click', () => switchSubject(s.key));
      nav.appendChild(btn);
    });
  }

  function switchSubject(key) {
    if (!subjectTerms.has(key)) return;

    // 離開前先把這科正在進行的回合存起來，回來時可以接著練，不會平白歸零。
    flashState.set(activeSubject, { queue: flashQueue, idx: flashIdx, revealed: flashRevealed });
    quizState.set(activeSubject, { pool: quizPool, queue: quizQueue, idx: quizIdx, correct: quizCorrect });

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
    } else {
      quizPool = [];
      quizQueue = [];
      quizIdx = 0;
      quizCorrect = 0;
    }

    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
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
    wrap.innerHTML = chips;
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

    if (mode === 'flashcard' || mode === 'quiz') {
      const gradeWrap = renderGradeFilter(panel);
      if (gradeWrap) panel.insertBefore(gradeWrap, body);
      panel.insertBefore(renderUnitMap(panel), body);
    }

    if (mode === 'flashcard') renderFlashcard(body);
    else if (mode === 'quiz') renderQuiz(body);
    else renderWeak(body);
  }

  // ================= 里程碑：單元全數精通 =================
  function checkUnitMilestone(unit) {
    if (!unit) return null;
    const list = terms.filter((t) => t.unit === unit);
    if (!list.length) return null;
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    const allMastered = list.every((t) => SciStore.getCard(state, t.id).box >= maxBox);
    if (!allMastered) return null;

    state.stats.celebratedUnits = state.stats.celebratedUnits || [];
    const key = `${activeSubject}:${unit}`;
    if (state.stats.celebratedUnits.includes(key)) return null;
    state.stats.celebratedUnits.push(key);
    SciStore.save(state);
    return unit;
  }

  function renderMilestone(container, unit, onContinue) {
    const icon = UNIT_ICONS[unit] || '📘';
    const label = UNIT_LABELS[unit] || unit;
    const subjectLabel = SUBJECTS.find((s) => s.key === activeSubject)?.label || '';
    const clearedCount = (state.stats.celebratedUnits || []).length;
    const confetti = Array.from({ length: 12 }, (_, i) => `<span class="confetti-bit" style="--i:${i}"></span>`).join('');
    container.innerHTML = `
      <div class="card milestone-card celebrate-in">
        <div class="confetti-burst">${confetti}</div>
        <div class="milestone-icon">${icon}</div>
        <h3>${label} · 全數精通！</h3>
        <p>這個單元的詞條你都穩了，${subjectLabel}的戰功又推進一格。</p>
        <p class="milestone-stat">目前累積已攻克 <strong>${clearedCount}</strong> 個單元</p>
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

  function renderFlashcard(body) {
    if (flashQueue.length === 0) startFlashRound();

    if (flashQueue.length === 0) {
      body.innerHTML = `<div class="card"><p>這一科的詞條還在路上，先切去別科練功吧！</p></div>`;
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
        body.innerHTML = `<div class="card"><p>今天練到這裡很棒了，休息一下吧！想再練的時候隨時回來。</p></div>`;
      });
      return;
    }

    const t = flashQueue[flashIdx];
    const card = SciStore.getCard(state, t.id);
    body.innerHTML = `
      <div class="stat-row">
        <span>本回合 ${flashIdx + 1} / ${flashQueue.length}</span>
        <span>盒序 ${card.box + 1} / ${SciFlashcard.BOX_INTERVAL_DAYS.length}</span>
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

    const t = flashQueue[flashIdx];
    SciFlashcard.markResult(state, t.id, correct);
    SciStore.bumpDailyCount(state);
    SciStore.save(state);
    renderHeroStats();
    correct ? playCorrectTone() : playWrongTone();

    const milestoneUnit = correct ? checkUnitMilestone(t.unit) : null;
    flashIdx += 1;
    flashRevealed = false;

    preserveScroll(() => {
      if (milestoneUnit) {
        renderMilestone(body, milestoneUnit, () => { flashAnswering = false; renderFlashcard(body); });
      } else {
        flashAnswering = false;
        renderFlashcard(body);
      }
    });
  }

  // ================= 自測 =================
  function startQuizRound(pool = currentPool()) {
    quizPool = terms;
    quizQueue = shuffleArr(pool).slice(0, Math.min(15, pool.length));
    quizIdx = 0;
    quizCorrect = 0;
  }

  function quizSummaryText(correctCount, total) {
    const pct = total ? Math.round((correctCount / total) * 100) : 0;
    if (pct === 100) return `${total} 題全對，穩了！這科的底子已經很扎實。`;
    if (pct >= 80) return `${total} 題裡對了 ${correctCount} 題，手感很不錯，剩下的弱點清單已經幫你記下來了。`;
    if (pct >= 60) return `${total} 題裡對了 ${correctCount} 題，還有進步空間，去弱點清單看看卡在哪裡吧。`;
    return `${total} 題裡對了 ${correctCount} 題，這輪本來就是用來找漏洞的，弱點清單已經幫你標好了，練幾輪就會有感覺。`;
  }

  function renderQuiz(body) {
    if (quizQueue.length === 0) startQuizRound();

    if (quizQueue.length === 0) {
      body.innerHTML = `<div class="card"><p>這一科的詞條還在路上，先切去別科練功吧！</p></div>`;
      return;
    }

    if (quizIdx >= quizQueue.length) {
      body.innerHTML = `
        <div class="card celebrate-in">
          <p>${quizSummaryText(quizCorrect, quizQueue.length)}</p>
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
        body.innerHTML = `<div class="card"><p>今天練到這裡很棒了，休息一下吧！想再練的時候隨時回來。</p></div>`;
      });
      return;
    }

    const target = quizQueue[quizIdx];
    const q = SciQuiz.buildQuestion(target, quizPool.length ? quizPool : terms);
    quizAnswered = false;
    quizStartTime = Date.now();

    body.innerHTML = `
      <div class="stat-row">
        <span>第 ${quizIdx + 1} / ${quizQueue.length} 題</span>
        <span>答對 ${quizCorrect}</span>
      </div>
      <div class="progress-bar"><div style="width:${(quizIdx / quizQueue.length) * 100}%"></div></div>
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
        const subjectAtAnswer = activeSubject;
        const modeAtAnswer = mode;

        const cardEl = body.querySelector('.card');
        cardEl.classList.add(correct ? 'flash-correct' : 'flash-wrong');
        body.querySelectorAll('.quiz-option').forEach((b) => {
          b.disabled = true;
          if (b.dataset.id === q.answerId) b.classList.add('correct');
          else if (b.dataset.id === chosenId) b.classList.add('wrong');
        });

        const resultBanner = document.createElement('div');
        resultBanner.className = `quiz-result-banner ${correct ? 'is-correct' : 'is-wrong'}`;
        resultBanner.textContent = correct ? '✓ 答對了！' : '✗ 答錯了';
        cardEl.insertBefore(resultBanner, cardEl.firstChild);

        if (!correct) {
          const chosenTerm = terms.find((t) => t.id === chosenId);
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

        correct ? playCorrectTone() : playWrongTone();

        SciWeak.recordAnswer(state, { termId: target.id, unit: target.unit, correct, elapsedMs: elapsed });
        SciFlashcard.bumpBox(state, target.id, correct);
        state.stats.totalReviews += 1;
        SciStore.touchDailyStreak(state);
        SciStore.bumpDailyCount(state);
        SciStore.save(state);
        renderHeroStats();

        const milestoneUnit = correct ? checkUnitMilestone(target.unit) : null;
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
      });
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

  function renderWeak(body) {
    const panel = body.closest('.panel');
    const currentIds = new Set(terms.map((t) => t.id));
    const subjectState = {
      ...state,
      weakLog: (state.weakLog || []).filter((entry) => currentIds.has(entry.termId)),
    };
    const weakUnits = SciWeak.getWeakUnits(subjectState, UNIT_LABELS);
    const weakTerms = SciWeak.getWeakTerms(subjectState, 10)
      .map((w) => ({ ...w, term: terms.find((t) => t.id === w.termId) }))
      .filter((w) => w.term);

    if (weakUnits.length === 0 && weakTerms.length === 0) {
      body.innerHTML = `<div class="card"><p>還沒有作答紀錄——去自測闖個幾輪，這裡就會幫你標出真正該加強的地方。</p></div>`;
      return;
    }

    body.innerHTML = `
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

    body.querySelectorAll('.btn-weak-practice').forEach((btn) => {
      btn.addEventListener('click', () => practiceWeak(btn.dataset.type, btn.dataset.key, panel));
    });
  }

  // ================= Header 統計 =================
  const RANK_TIERS = [
    [0, '見習生'],
    [1, '初階英雄'],
    [10, '進階英雄'],
    [30, '資深英雄'],
    [80, '領域專家'],
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
    if (streakEl) streakEl.textContent = (state.stats && state.stats.streakDays) || 0;
    if (masteredEl) masteredEl.textContent = mastered;
    if (rankEl) rankEl.textContent = rankLabel(mastered);

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
      labelEl.textContent = daily >= DAILY_GOAL ? '今日目標已達成 🎉' : `今日目標：複習 ${capped} / ${DAILY_GOAL} 題`;
    }
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
    ctx.strokeStyle = '#2e9e5b';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1c2b22';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('🧪 科學英雄戰績卡', canvas.width / 2, 110);

    const mastered = masteredCardCount();
    const masteredUnits = countMasteredUnits();
    const streak = (state.stats && state.stats.streakDays) || 0;

    ctx.font = '26px sans-serif';
    ctx.fillStyle = '#2e9e5b';
    ctx.fillText(rankLabel(mastered), canvas.width / 2, 160);

    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#5c6b62';
    ctx.fillText(new Date().toLocaleDateString('zh-TW'), canvas.width / 2, 195);

    const rows = [
      ['🔥 連續複習', `${streak} 天`],
      ['⭐ 戰功', `${mastered} 個`],
      ['🏅 精通單元', `${masteredUnits} 個`],
    ];
    let y = 300;
    rows.forEach(([label, value]) => {
      ctx.textAlign = 'left';
      ctx.font = '28px sans-serif';
      ctx.fillStyle = '#1c2b22';
      ctx.fillText(label, 80, y);
      ctx.textAlign = 'right';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillStyle = '#2e9e5b';
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

  // ================= 進度匯出／匯入 =================
  function wireIoButtons() {
    const exportBtn = el('#export-btn');
    const importBtn = el('#import-btn');
    const importFile = el('#import-file');
    const shareBtn = el('#share-card-btn');
    if (shareBtn) shareBtn.addEventListener('click', shareStatsCard);
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
        SciStore.save(state);
        renderHeroStats();
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
      const loaded = await Promise.all(SUBJECTS.map(async (subject) => {
        const res = await fetch(subject.file);
        if (!res.ok) throw new Error(`${subject.label}資料載入失敗（HTTP ${res.status}）`);
        return [subject.key, await res.json()];
      }));
      loaded.forEach(([key, data]) => subjectTerms.set(key, data));
    } catch (err) {
      panels.insertAdjacentHTML('afterbegin', `<div class="card">這科資料一時載不出來，重新整理一次通常就好了（技術訊息：${err.message}）</div>`);
      return;
    }

    // 支援老師分享連結指定範圍：?subject=biology&unit=cell
    const params = new URLSearchParams(location.search);
    const paramSubject = params.get('subject');
    if (paramSubject && subjectTerms.has(paramSubject)) activeSubject = paramSubject;
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
    renderHeroStats();
    renderLearningBody(document.querySelector(`.panel[data-key="${activeSubject}"]`));
  }

  return { boot };
})();

document.addEventListener('DOMContentLoaded', SciApp.boot);
