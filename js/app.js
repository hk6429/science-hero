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

  // ---- 閃卡狀態（依科目分開保留，切分頁不會弄丟進度）----
  const flashState = new Map();
  let flashQueue = [];
  let flashIdx = 0;
  let flashRevealed = false;

  // ---- 自測狀態（依科目分開保留）----
  const quizState = new Map();
  let quizPool = [];
  let quizQueue = [];
  let quizIdx = 0;
  let quizCorrect = 0;
  let quizStartTime = 0;
  let quizAnswered = false;

  function el(sel) { return document.querySelector(sel); }

  function shuffleArr(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function currentPool() {
    return unitFilter ? terms.filter((t) => t.unit === unitFilter) : terms;
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

  function renderUnitMap(panel) {
    const wrap = document.createElement('div');
    wrap.className = 'unit-map';
    const units = [...new Set(terms.map((t) => t.unit))];
    const chips = ['', ...units].map((u) => {
      const isAll = u === '';
      const label = isAll ? '全部' : (UNIT_LABELS[u] || u);
      const icon = isAll ? '📚' : (UNIT_ICONS[u] || '📘');
      const pct = isAll ? masteryPct(terms) : masteryPct(terms.filter((t) => t.unit === u));
      const active = (isAll && !unitFilter) || u === unitFilter;
      return `<button class="unit-chip${active ? ' active' : ''}" data-unit="${u}" style="--progress:${pct}">
        <span class="unit-chip-ring"><span class="unit-chip-icon">${icon}</span></span>
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
    panel.insertBefore(renderModeSwitch(panel), body);

    if (mode === 'flashcard' || mode === 'quiz') {
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
    container.innerHTML = `
      <div class="card milestone-card celebrate-in">
        <div class="milestone-icon">${icon}</div>
        <h3>${label} · 全數精通！</h3>
        <p>這個單元的詞條你都穩了，${subjectLabel}的戰功又推進一格。</p>
        <div class="btn-row"><button class="btn btn-primary" id="milestone-continue">繼續</button></div>
      </div>`;
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
            <button class="btn btn-primary" id="flash-again">再戰一輪</button>
          </div>
        </div>`;
      body.querySelector('#flash-again').addEventListener('click', () => {
        startFlashRound();
        renderFlashcard(body);
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
    const t = flashQueue[flashIdx];
    SciFlashcard.markResult(state, t.id, correct);
    SciStore.bumpDailyCount(state);
    SciStore.save(state);
    renderHeroStats();

    const milestoneUnit = correct ? checkUnitMilestone(t.unit) : null;
    flashIdx += 1;
    flashRevealed = false;

    if (milestoneUnit) {
      renderMilestone(body, milestoneUnit, () => renderFlashcard(body));
    } else {
      renderFlashcard(body);
    }
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
            <button class="btn btn-primary" id="quiz-again">再來測一次</button>
          </div>
        </div>`;
      body.querySelector('#quiz-again').addEventListener('click', () => {
        startQuizRound();
        renderQuiz(body);
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

        body.querySelectorAll('.quiz-option').forEach((b) => {
          b.disabled = true;
          if (b.dataset.id === q.answerId) b.classList.add('correct');
          else if (b.dataset.id === chosenId) b.classList.add('wrong');
        });

        if (!correct) {
          const note = document.createElement('div');
          note.className = 'quiz-feedback';
          note.innerHTML = `<div class="quiz-feedback-label">戰後解說</div>正確答案：<strong>${target.term}</strong> — ${target.def}`;
          body.querySelector('.card').appendChild(note);
        }

        SciWeak.recordAnswer(state, { termId: target.id, unit: target.unit, correct, elapsedMs: elapsed });
        state.stats.totalReviews += 1;
        SciStore.touchDailyStreak(state);
        SciStore.bumpDailyCount(state);
        SciStore.save(state);
        renderHeroStats();

        const milestoneUnit = correct ? checkUnitMilestone(target.unit) : null;
        if (milestoneUnit) {
          setTimeout(() => {
            renderMilestone(body, milestoneUnit, () => {
              quizIdx += 1;
              renderQuiz(body);
            });
          }, 700);
          return;
        }

        setTimeout(() => {
          quizIdx += 1;
          renderQuiz(body);
        }, correct ? 700 : 1800);
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
      <p class="weak-intro">🧭 戰情室：這是你目前卡住的地方</p>
      <div class="card">
        <h3>這幾個單元該回頭看看了</h3>
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
        <h3>這幾個詞卡在半路了</h3>
        <ul class="weak-list">
          ${weakTerms.map((w) => `
            <li>
              <span>${w.term.term}</span>
              <span class="weak-actions">
                <span class="weak-score">${w.score}</span>
                <button class="btn-weak-practice" data-type="term" data-key="${w.termId}">複習這個</button>
              </span>
            </li>`).join('') || '<li>目前沒有卡住的地方</li>'}
        </ul>
      </div>`;

    body.querySelectorAll('.btn-weak-practice').forEach((btn) => {
      btn.addEventListener('click', () => practiceWeak(btn.dataset.type, btn.dataset.key, panel));
    });
  }

  // ================= Header 統計 =================
  function renderHeroStats() {
    const streakEl = el('#streak-days');
    const masteredEl = el('#mastered-count');
    if (streakEl) streakEl.textContent = (state.stats && state.stats.streakDays) || 0;
    if (masteredEl) {
      const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
      masteredEl.textContent = Object.values((state && state.cards) || {}).filter((c) => c.box >= maxBox).length;
    }

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

  // ================= 進度匯出／匯入 =================
  function wireIoButtons() {
    const exportBtn = el('#export-btn');
    const importBtn = el('#import-btn');
    const importFile = el('#import-file');
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
