// 答題對戰：PvE ＋ 同裝置雙人 PvP，複用 SciQuiz 出題器，不重新設計出題邏輯。
const SciBattle = (() => {
  const MAX_HP = 100;

  const OPPONENTS = [
    { id: 'apprentice', name: '見習研究員', emoji: '🔬', tier: '入門', acc: 0.50,
      taunt: '讓我看看你的基礎功！', win: '再多做點筆記吧。', lose: '學得真快，佩服！' },
    { id: 'alchemist', name: '煉金學徒', emoji: '🧪', tier: '入門', acc: 0.50,
      taunt: '這幾題你答得出來嗎？', win: '配方還差你一味。', lose: '這場實驗你成功了！' },
    { id: 'ecologist', name: '生態觀察員', emoji: '🌱', tier: '進階', acc: 0.62,
      taunt: '大自然的規律，你熟悉嗎？', win: '再觀察久一點就會懂。', lose: '你的觀察力很敏銳！' },
    { id: 'engineer', name: '力學工匠', emoji: '⚙️', tier: '進階', acc: 0.62,
      taunt: '力與運動，來試試看！', win: '齒輪還沒對上呢。', lose: '這一局你抓對力道了！' },
    { id: 'geomancer', name: '地脈守護者', emoji: '🌋', tier: '高手', acc: 0.75,
      taunt: '地球的秘密沒那麼好懂。', win: '地層還埋著更多考驗。', lose: '你讀懂了地球的語言！' },
    { id: 'geneticist', name: '基因解碼師', emoji: '🧬', tier: '高手', acc: 0.75,
      taunt: '生命的密碼，準備好了嗎？', win: '基因序列你還沒解完。', lose: '完美解碼，厲害！' },
    { id: 'astromancer', name: '星辰賢者', emoji: '🪐', tier: '宗師', acc: 0.88,
      taunt: '宇宙的尺度，你能理解嗎？', win: '星空還很遙遠。', lose: '你已經配得上仰望星空了。' },
    { id: 'elementalist', name: '元素宗師', emoji: '⚛️', tier: '宗師', acc: 0.88,
      taunt: '萬物皆由元素構成，接招吧！', win: '週期表你還沒背熟。', lose: '你已是真正的元素宗師！' },
  ];

  const TIER_UNLOCK = { 入門: 0, 進階: 0, 高手: 30, 宗師: 80 };

  function foeArt(opponent, extraClass = '') {
    return `<img class="bat-foe-img ${extraClass}" src="assets/battle/foe-${opponent.id}.png" alt="${opponent.name}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${opponent.emoji}',className:'bat-face ${extraClass}'}))">`;
  }

  function isUnlocked(opponent, totalReviews) {
    return (totalReviews || 0) >= (TIER_UNLOCK[opponent.tier] || 0);
  }

  // 答對傷害：基礎 12 + 連擊加成，血量 <30 時背水一戰 1.5 倍。
  function calcDamage(combo, hp) {
    let dmg = 12 + combo * 3;
    if (hp < 30) dmg = Math.round(dmg * 1.5);
    return dmg;
  }

  // 流暢度曲線本身保留完整 1.3→0.7 規格；實戰只把 >1 的部分當正向加成，
  // 因此慢答維持普通傷害，不形成倒數或懲罰。此函式只由 PvE 呼叫。
  function speedMultiplier(elapsedMs) {
    const ms = Math.max(0, Number(elapsedMs) || 0);
    if (ms <= 3000) return 1.3;
    if (ms >= 8000) return 0.7;
    return 1.3 - ((ms - 3000) / 5000) * 0.6;
  }

  function calcPveDamage(combo, hp, elapsedMs) {
    return Math.round(calcDamage(combo, hp) * Math.max(1, speedMultiplier(elapsedMs)));
  }

  function enemyDamage(opponent, round) {
    const tierGrowth = { 入門: 1, 進階: 2, 高手: 3, 宗師: 4 };
    const turn = Math.max(1, Math.floor(round) || 1);
    const base = 8 + Math.round(opponent.acc * 8);
    const endlessGrowth = Math.floor(Math.max(0, (opponent.endlessLevel || 1) - 1) / 3);
    const scaled = base + Math.floor((turn - 1) / 3) * (tierGrowth[opponent.tier] || 1) + endlessGrowth;
    const special = (opponent.tier === '高手' || opponent.tier === '宗師') && turn % 3 === 0;
    return special ? scaled * 2 : scaled;
  }

  function recordPlayerHit(summary, damage, combo) {
    summary.bestCombo = Math.max(summary.bestCombo || 0, combo || 0);
    summary.totalDamage = (summary.totalDamage || 0) + damage;
    summary.maxDamage = Math.max(summary.maxDamage || 0, damage);
    return summary;
  }

  function applyWrongAnswer(state) {
    if (state.shieldLeft > 0) state.shieldLeft -= 1;
    else state.combo = 0;
    state.pHp = Math.max(0, state.pHp - 8);
    state.meDamage = 8;
    state.foeDamage = 0;
    return state;
  }

  function clearDamagePops(state) {
    state.foeDamage = 0;
    state.meDamage = 0;
    return state;
  }

  function answerFeedbackClass(optionId, answerId, chosenId) {
    if (!answerId) return '';
    if (optionId === answerId) return 'correct';
    if (optionId === chosenId) return 'wrong';
    return '';
  }

  // ── 段位排行：只認 PvE 勝負，跟「精通詞卡稱號」是兩套獨立指標 ──
  const RANKS = [
    { name: '銅牌探索者', ico: '🥉', at: 0 },
    { name: '銀牌研究員', ico: '🥈', at: 100 },
    { name: '金牌學者', ico: '🥇', at: 250 },
    { name: '白金專家', ico: '🎖️', at: 450 },
    { name: '鑽石大師', ico: '💠', at: 700 },
    { name: '傳奇科學家', ico: '👑', at: 1000 },
  ];

  function weekStr(d = new Date()) {
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${week}`;
  }

  function rankState(state) {
    state.rank = state.rank || { pts: 0, peak: 0, shieldWk: null };
    return state.rank;
  }

  function rankInfo(state) {
    const r = rankState(state);
    // 對孩子顯示的是歷史最高進度：戰敗不讓段位條倒退，也不呈現懲罰。
    const p = Math.max(r.pts, r.peak || 0);
    let i = 0;
    while (i + 1 < RANKS.length && p >= RANKS[i + 1].at) i++;
    const cur = RANKS[i];
    const next = RANKS[i + 1] || null;
    return { ...cur, pts: p, peak: r.peak, next, pct: next ? Math.round(((p - cur.at) / (next.at - cur.at)) * 100) : 100 };
  }

  function rankWin(state) {
    const r = rankState(state);
    const cap = RANKS[RANKS.length - 1].at;
    const before = r.pts;
    r.pts = Math.min(cap, r.pts + 20);
    r.peak = Math.max(r.peak, r.pts);
    return { delta: r.pts - before, ...rankInfo(state) };
  }

  function rankLose(state) {
    const r = rankState(state);
    const wk = weekStr();
    if (r.shieldWk !== wk) {
      r.shieldWk = wk;
      return { delta: 0, shield: true, ...rankInfo(state) };
    }
    r.pts = Math.max(0, r.pts - 10);
    return { delta: -10, ...rankInfo(state) };
  }

  // ── 科學夥伴：等級直接讀「精通詞卡數」，不另存數值，跟真實學習量掛鉤 ──
  const COMPANION_TIERS = [
    { at: 0, emoji: '🥚', name: '神秘蛋', atk: 0, leech: 0, leechChance: 0 },
    { at: 5, emoji: '🐣', name: '科學雛靈', atk: 2, leech: 0, leechChance: 0 },
    { at: 20, emoji: '🦉', name: '智慧貓頭鷹', atk: 4, leech: 0, leechChance: 0 },
    { at: 50, emoji: '🐉', name: '智慧之龍', atk: 6, leech: 5, leechChance: 0.1 },
    { at: 100, emoji: '✨', name: '星靈', atk: 9, leech: 8, leechChance: 0.2 },
    // 200 張是純視覺收藏態；助戰數值刻意維持 100 張滿階，不製造額外優勢。
    { at: 200, emoji: '🌟', name: '星靈・典藏', atk: 9, leech: 8, leechChance: 0.2 },
  ];

  function companionFor(masteredCount) {
    const n = masteredCount || 0;
    let i = 0;
    while (i + 1 < COMPANION_TIERS.length && n >= COMPANION_TIERS[i + 1].at) i++;
    const cur = COMPANION_TIERS[i];
    const next = COMPANION_TIERS[i + 1] || null;
    return { ...cur, level: i + 1, mastered: n, next };
  }

  // 四科精靈：進化門檻與助戰數值沿用既有科學夥伴，只更換各科形象。
  const SUBJECT_LINES = {
    nature: [
      ['🌰', '萌芽種子'], ['🌱', '新芽綠靈'], ['🌿', '藤蔓精靈'], ['🌳', '巨木守衛'], ['🍀', '萬物之靈'], ['🌟', '萬物之靈・典藏'],
    ],
    biology: [
      ['🥚', '細胞原卵'], ['🐛', '幼蟲之靈'], ['🦋', '蝶翼精靈'], ['🦉', '智慧之鴞'], ['🧬', '生命之靈'], ['🌟', '生命之靈・典藏'],
    ],
    chemphys: [
      ['⚗️', '燒瓶精靈'], ['🧪', '試管之靈'], ['🔥', '焰晶精靈'], ['⚡', '電光之靈'], ['⚛️', '元素宗靈'], ['🌟', '元素宗靈・典藏'],
    ],
    earth: [
      ['🪨', '礦石精靈'], ['🌋', '火山之靈'], ['🌊', '海潮精靈'], ['🌍', '地脈守護'], ['🪐', '星辰之靈'], ['🌟', '星辰之靈・典藏'],
    ],
  };
  Object.keys(SUBJECT_LINES).forEach((key) => {
    SUBJECT_LINES[key] = SUBJECT_LINES[key].map(([emoji, name], i) => ({
      ...COMPANION_TIERS[i], emoji, name,
    }));
  });

  const PREFIX_SUBJECT = { e: 'nature', b: 'biology', pc: 'chemphys', d: 'earth' };

  function subjectOfId(id) {
    const match = String(id).match(/^([a-z]+)/);
    return (match && PREFIX_SUBJECT[match[1]]) || null;
  }

  function masteredBySubject(state, maxBox) {
    const result = { nature: 0, biology: 0, chemphys: 0, earth: 0 };
    const cards = (state && state.cards) || {};
    Object.keys(cards).forEach((id) => {
      const subject = subjectOfId(id);
      if (subject && cards[id].box >= maxBox) result[subject] += 1;
    });
    return result;
  }

  function subjectProgress(state, maxBox, termsBySubject) {
    const cards = (state && state.cards) || {};
    const result = {};
    Object.keys(termsBySubject || {}).forEach((subject) => {
      const pool = termsBySubject[subject] || [];
      const mastered = pool.filter((term) => (cards[term.id] || {}).box >= maxBox).length;
      const total = pool.length;
      result[subject] = {
        mastered,
        total,
        remaining: Math.max(0, total - mastered),
        pct: total ? Math.round((mastered / total) * 100) : 0,
      };
    });
    return result;
  }

  function companionForSubject(subjectKey, masteredCount) {
    const line = SUBJECT_LINES[subjectKey] || COMPANION_TIERS;
    const n = masteredCount || 0;
    let i = 0;
    while (i + 1 < line.length && n >= line[i + 1].at) i++;
    const cur = line[i];
    return { ...cur, level: i + 1, mastered: n, next: line[i + 1] || null };
  }

  function subjectCompanionArt(subjectKey, companion, extraClass = '') {
    const artLevel = Math.min(companion.level, 5);
    const plusClass = companion.level > 5 ? ' bat-companion-plus' : '';
    return `<img class="${extraClass}${plusClass}" src="assets/battle/sprite-${subjectKey}-s${artLevel}.png" alt="${companion.name}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${companion.emoji}',className:'${extraClass}${plusClass}'}))">`;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function beatenList(state) {
    state.battle = state.battle || { beaten: [] };
    state.battle.beaten = state.battle.beaten || [];
    return state.battle.beaten;
  }

  function endlessOpponent(streak) {
    const wins = Math.max(0, Math.floor(streak) || 0);
    const cycle = Math.floor(wins / OPPONENTS.length);
    const base = OPPONENTS[wins % OPPONENTS.length];
    return {
      ...base,
      name: `${base.name}・巡禮 ${wins + 1}`,
      acc: Math.min(0.96, base.acc + cycle * 0.03),
      endlessLevel: wins + 1,
    };
  }

  function recordEndlessBest(state, streak) {
    beatenList(state);
    state.battle.endlessBest = Math.max(state.battle.endlessBest || 0, Math.max(0, Math.floor(streak) || 0));
    return state.battle.endlessBest;
  }

  const ENDLESS_MILESTONES = [
    { wins: 5, icon: '🔥', title: '知識之火守護者' },
    { wins: 10, icon: '🏅', title: '巡禮知識行者' },
    { wins: 15, icon: '🌟', title: '星海探索先鋒' },
    { wins: 20, icon: '♾️', title: '萬象巡禮典藏家' },
  ];

  function claimEndlessMilestone(state, streak) {
    beatenList(state);
    const wins = Math.max(0, Math.floor(streak) || 0);
    const milestone = ENDLESS_MILESTONES.find((item) => item.wins === wins);
    if (!milestone) return null;
    state.battle.endlessCelebrated = Array.isArray(state.battle.endlessCelebrated)
      ? state.battle.endlessCelebrated : [];
    if (state.battle.endlessCelebrated.includes(wins)) return null;
    state.battle.endlessCelebrated.push(wins);
    return { ...milestone };
  }

  // ── mount：掛在指定容器上，ctx = { pool, state, subjectLabel, recordAnswer, masteredCardCount } ──
  function mount(el, ctx) {
    const { pool, state, subjectLabel, recordAnswer, masteredCardCount } = ctx;
    let opp = null;
    let battleState = null;
    let locked = false;
    let endlessMode = false;
    let endlessStreak = 0;

    function showEndlessMilestone(milestone) {
      if (!milestone) return;
      const toast = document.createElement('aside');
      toast.className = 'first-success endless-milestone-toast celebrate-in';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = `<strong>${milestone.icon} 巡禮 ${milestone.wins} 連勝</strong><span>${milestone.title}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4200);
    }

    const currentCompanion = () => ctx.subjectKey
      ? companionForSubject(ctx.subjectKey, ctx.masteredCountForSubject)
      : companionFor(masteredCardCount);

    function totalReviews() {
      return state.stats.totalReviews || 0;
    }

    function rankStrip() {
      const r = rankInfo(state);
      return `<div class="bat-rank">
        <span class="bat-rank-ico">${r.ico}</span>
        <span class="bat-rank-body">
          <span class="bat-rank-name">${r.name}　<b>${r.pts} 分</b></span>
          <span class="bat-rank-bar"><span style="width:${r.pct}%"></span></span>
          <span class="bat-rank-next">${r.next ? `再 ${r.next.at - r.pts} 分晉升 ${r.next.ico} ${r.next.name}` : '已達最高段位！'}</span>
        </span>
      </div>`;
    }

    function companionCard() {
      const c = currentCompanion();
      const face = ctx.subjectKey
        ? subjectCompanionArt(ctx.subjectKey, c, 'bat-companion-face')
        : `<span class="bat-companion-face">${c.emoji}</span>`;
      return `<div class="bat-companion">
        ${face}
        <span class="bat-companion-body">
          <span class="bat-companion-name">${c.name}　Lv.${c.level}</span>
          <span class="bat-companion-desc">${c.atk > 0 ? `對戰時追擊 +${c.atk}${c.leech ? `・${Math.round(c.leechChance * 100)}% 機率回血 +${c.leech}` : ''}` : '再精通幾張詞卡就會孵化'}</span>
          <span class="bat-companion-next">${c.next ? `再精通 ${c.next.at - c.mastered} 張詞卡進化為 ${c.next.emoji} ${c.next.name}` : '已達最高進化階段！'}</span>
        </span>
      </div>`;
    }

    function assistTag() {
      const c = currentCompanion();
      if (!c.atk) return '';
      const icon = ctx.subjectKey
        ? subjectCompanionArt(ctx.subjectKey, c, 'bat-assist-img')
        : c.emoji;
      return `<div class="bat-assist">${icon} ${c.name} 助戰（追擊 ${c.atk}${c.leech ? '・機率回血' : ''}）</div>`;
    }

    function renderPicker() {
      if (pool.length < 4) {
        el.innerHTML = `<div class="card"><p>這個範圍的詞條還不夠開打（至少要 4 筆），先切別的單元或全部範圍再來對戰吧！</p></div>`;
        return;
      }
      const beaten = new Set(beatenList(state));
      const marketReady = typeof SciMarketStore !== 'undefined';
      const inventory = marketReady ? SciMarketStore.getInv() : {};
      const carry = marketReady ? SciMarketStore.getCarry() : null;
      const carryItems = marketReady ? Object.entries(SciMarketStore.ITEM_CATALOG).filter(([id, item]) => item.kind === 'tool' && inventory[id] > 0) : [];
      el.innerHTML = `
        <p class="bat-mission">🔥 任務：守護科學的知識之火</p>
        <p class="bat-hint">在「${subjectLabel}」目前選定的範圍內出題，挑一位對手開打！</p>
        ${rankStrip()}
        ${companionCard()}
        ${carryItems.length ? `<div class="bat-carry"><strong>🎒 戰前攜帶（PvE）</strong>
          ${carryItems.map(([id, item]) => `<button type="button" data-carry="${id}" class="${carry === id ? 'active' : ''}">${item.emoji} ${item.name} ×${inventory[id]}</button>`).join('')}
          <button type="button" data-carry="">不帶</button></div>` : ''}
        <div class="btn-row"><button class="btn btn-primary" id="bat-endless">♾️ 無盡巡禮</button>
        <button class="btn btn-secondary bat-pvp-btn" id="bat-pvp">👥 雙人對戰（同裝置輪流答題）</button></div>
        <p class="bat-hint">無盡巡禮會隨連勝增強對手；最佳連勝 <b>${state.battle.endlessBest || 0}</b> 場，不影響段位、不倒扣分數。</p>
        <div class="bat-oppgrid">
          ${OPPONENTS.map((o) => {
            const unlocked = isUnlocked(o, totalReviews());
            const won = beaten.has(o.id);
            return `<button class="bat-oppcard${unlocked ? '' : ' locked'}" data-id="${o.id}" data-open="${unlocked ? 1 : 0}">
              ${unlocked ? foeArt(o) : '<span class="bat-face">🔒</span>'}
              <span class="bat-name">${unlocked ? o.name : '？？？'}${won ? ' 🏆' : ''}</span>
              <span class="bat-tier">${o.tier}</span>
              ${unlocked ? '' : `<span class="bat-locknote">累積答對 ${TIER_UNLOCK[o.tier]} 題解鎖</span>`}
            </button>`;
          }).join('')}
        </div>
        <p class="bat-trophy">🏆 已擊敗 ${beaten.size} / ${OPPONENTS.length} 位守護者</p>`;
      el.querySelectorAll('.bat-oppcard').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.dataset.open === '0') return;
          start(OPPONENTS.find((o) => o.id === btn.dataset.id));
        });
      });
      el.querySelectorAll('[data-carry]').forEach((btn) => btn.addEventListener('click', () => {
        if (typeof SciMarketStore === 'undefined') return;
        SciMarketStore.setCarry(btn.dataset.carry || null);
        renderPicker();
      }));
      el.querySelector('#bat-pvp').addEventListener('click', startPvp);
      el.querySelector('#bat-endless').addEventListener('click', () => {
        endlessStreak = 0;
        start(endlessOpponent(endlessStreak), { endless: true });
      });
    }

    // ── PvE ──
    function start(o, options = {}) {
      opp = o;
      endlessMode = options.endless === true;
      battleState = { pHp: MAX_HP, oHp: MAX_HP, combo: 0, round: 0, bestCombo: 0, totalDamage: 0, maxDamage: 0, log: `守護知識之火！${opp.taunt}` };
      if (typeof SciMarketStore !== 'undefined') {
        const carried = SciMarketStore.takeCarry();
        if (carried) {
          battleState.pHp += carried.effect.hp || 0;
          battleState.excludeLeft = carried.effect.excludeOnce ? 1 : 0;
          battleState.shieldLeft = carried.effect.shieldOnce ? 1 : 0;
          battleState.log = `${carried.toolId === 'energy' ? '⚡ 能量飲生效！' : carried.toolId === 'magnifier' ? '🔍 放大鏡已備妥！' : '🥽 護目鏡已戴上！'} ${opp.taunt}`;
        }
      }
      locked = false;
      nextRound();
    }

    function nextRound() {
      if (battleState.oHp <= 0) return finish(true);
      if (battleState.pHp <= 0) return finish(false);
      clearDamagePops(battleState);
      battleState.round += 1;
      battleState.q = SciQuiz.buildQuestion(pool[Math.floor(Math.random() * pool.length)], pool);
      battleState.qStart = Date.now();
      locked = false;
      render();
    }

    function hpBar(hp, side) {
      return `<div class="bat-hp ${hp <= 30 ? 'low' : ''} ${side}">
        <div class="bat-hp-fill" style="width:${Math.min(100, hp)}%"></div><span>${hp}</span></div>`;
    }

    function render(midTurn, feedback = {}) {
      const q = battleState.q;
      el.innerHTML = `
        <div class="bat-arena">
          <div class="bat-side foe">
            ${foeArt(opp, 'big')}
            ${battleState.foeDamage ? `<span class="bat-damage-pop">-${battleState.foeDamage}</span>` : ''}
            <div class="bat-name">${opp.name}</div>
            ${hpBar(battleState.oHp, 'foe')}
          </div>
          <div class="bat-log" role="status" aria-live="polite">${battleState.log}</div>
          <div class="bat-side me">
            ${battleState.meDamage ? `<span class="bat-damage-pop">-${battleState.meDamage}</span>` : ''}
            ${hpBar(battleState.pHp, 'me')}
            <div class="bat-name">你 ${battleState.pHp < 30 ? '💢背水一戰' : battleState.combo >= 2 ? `🔥連擊 ×${battleState.combo}` : ''}</div>
            ${assistTag()}
          </div>
        </div>
        <div class="card">
          <div class="quiz-prompt">${q.mode === 'term2def' ? `「${q.prompt}」是在說什麼？` : `這個定義說的是哪個詞：<br>「${q.prompt}」`}</div>
          <div class="quiz-options">
            ${q.options.map((o) => `<button class="quiz-option ${answerFeedbackClass(o.id, feedback.answerId, feedback.chosenId)}" data-id="${o.id}" ${midTurn ? 'disabled' : ''}>${o.label}</button>`).join('')}
          </div>
          ${!midTurn && battleState.excludeLeft > 0 ? '<button type="button" class="btn btn-secondary bat-magnify">🔍 排除一個錯誤選項</button>' : ''}
        </div>`;
      if (!midTurn) {
        el.querySelectorAll('.quiz-option').forEach((btn) => {
          btn.addEventListener('click', () => onAnswer(btn.dataset.id));
        });
        const magnify = el.querySelector('.bat-magnify');
        if (magnify) magnify.addEventListener('click', () => {
          const wrong = [...el.querySelectorAll('.quiz-option')].filter((btn) => btn.dataset.id !== q.answerId && !btn.disabled);
          if (wrong.length) wrong[Math.floor(Math.random() * wrong.length)].disabled = true;
          battleState.excludeLeft = 0;
          magnify.remove();
        });
      }
    }

    function onAnswer(chosenId) {
      if (locked) return;
      locked = true;
      const q = battleState.q;
      const correct = chosenId === q.answerId;
      const target = pool.find((t) => t.id === q.answerId);
      const elapsedMs = Date.now() - battleState.qStart;

      recordAnswer(target, correct, elapsedMs, SciQuiz.questionContentLength(q));

      if (correct) {
        const dmg = calcPveDamage(battleState.combo, battleState.pHp, elapsedMs);
        battleState.foeDamage = dmg;
        battleState.meDamage = 0;
        battleState.oHp = Math.max(0, battleState.oHp - dmg);
        battleState.combo++;
        recordPlayerHit(battleState, dmg, battleState.combo);
        battleState.log = `命中！對 ${opp.name} 造成 ${dmg} 點傷害${battleState.combo >= 2 ? `（連擊 ×${battleState.combo}）` : ''}`;
        const c = currentCompanion();
        if (c.atk > 0 && battleState.oHp > 0) {
          battleState.oHp = Math.max(0, battleState.oHp - c.atk);
          recordPlayerHit(battleState, c.atk, battleState.combo);
          battleState.log += `　${c.emoji} ${c.name} 追擊 -${c.atk}`;
          if (c.leech && Math.random() < c.leechChance) {
            battleState.pHp = Math.min(MAX_HP, battleState.pHp + c.leech);
            battleState.log += `・回血 +${c.leech}`;
          }
        }
        // 稚靈隨行：只在 PvE 答對後疊加第二段小額追擊，不改 calcDamage。
        const cubMods = ctx.cubMods || { atk: 0, leech: 0, leechChance: 0 };
        if (cubMods.atk > 0 && battleState.oHp > 0) {
          const cubAtk = Math.min(cubMods.atk, 5);
          battleState.oHp = Math.max(0, battleState.oHp - cubAtk);
          recordPlayerHit(battleState, cubAtk, battleState.combo);
          const activeCub = SciFusionStore.listCubs(SciFusionStore.load()).find((cub) => cub.isActive);
          battleState.log += `　${activeCub ? `${ctx.cubArt?.(activeCub, 'bat-cub-chase') || activeCub.emoji} ${activeCub.displayName}` : '稚靈'} 追擊 -${cubAtk}`;
          if (cubMods.leech && Math.random() < cubMods.leechChance) {
            battleState.pHp = Math.min(MAX_HP, battleState.pHp + cubMods.leech);
            battleState.log += `・回血 +${cubMods.leech}`;
          }
        }
      } else {
        const protectedCombo = battleState.shieldLeft > 0;
        applyWrongAnswer(battleState);
        battleState.log = `答錯！${opp.name} 趁隙反擊，你 -8（正確答案：${target.term}）`;
        if (protectedCombo) battleState.log += '　🥽 護目鏡保住了連擊！';
      }
      render(true, { chosenId, answerId: q.answerId });

      setTimeout(() => {
        if (battleState.oHp <= 0) return finish(true);
        if (battleState.pHp <= 0) return finish(false);
        const hit = Math.random() < opp.acc;
        if (hit) {
          const dmg = enemyDamage(opp, battleState.round);
          battleState.meDamage = dmg;
          battleState.foeDamage = 0;
          battleState.pHp = Math.max(0, battleState.pHp - dmg);
          const special = (opp.tier === '高手' || opp.tier === '宗師') && battleState.round % 3 === 0;
          battleState.log = `${opp.name}${special ? ' 施放大招' : ' 出招'}——你受到 ${dmg} 點傷害`;
        } else {
          battleState.oHp = Math.max(0, battleState.oHp - 4);
          battleState.log = `${opp.name} 一時語塞，自損 4`;
        }
        render(true);
        setTimeout(nextRound, 400);
      }, correct ? 300 : 500);
    }

    function finish(win) {
      const rk = endlessMode ? { delta: 0, ...rankInfo(state) } : (win ? rankWin(state) : rankLose(state));
      let endlessMilestone = null;
      if (endlessMode && win) {
        endlessStreak += 1;
        recordEndlessBest(state, endlessStreak);
        endlessMilestone = claimEndlessMilestone(state, endlessStreak);
      } else if (win) {
        const beaten = beatenList(state);
        if (!beaten.includes(opp.id)) beaten.push(opp.id);
      }
      SciStore.save(state);
      showEndlessMilestone(endlessMilestone);
      if (win && !endlessMode) {
        const reward = SciEconomy.earnCrystals(SciEconomy.EARN_TABLE.battleWin, 'battleWin'); // 對戰勝 +5（僅 PvE；PvP 不發，防同機自刷）
        if (reward.earned > 0) ctx.onEnergyGain?.(reward.earned);
      }
      if (win && !endlessMode) ctx.onBattleWin?.();
      const endlessStatus = endlessMode
        ? `<div class="bat-rankdelta steady">♾️ 本次連勝 ${endlessStreak} 場・最佳 ${state.battle.endlessBest || 0} 場；段位分數不受影響。</div>`
        : `<div class="bat-rankdelta ${win ? 'up' : 'steady'}">${rk.ico} ${rk.name}　${win ? `${rk.delta > 0 ? '+' : ''}${rk.delta} 分（${rk.pts}）` : `段位進度保留（歷史最高 ${rk.pts} 分）`}</div>`;
      el.innerHTML = `<div class="card celebrate-in">
        <div class="bat-result-emoji">${win ? '🏆' : endlessMode ? '🌿' : '💀'}</div>
        <p>${win ? `擊敗 ${opp.name}！` : `不敵 ${opp.name}……`}</p>
        <div class="bat-quote">「${win ? opp.lose : opp.win}」</div>
        ${endlessStatus}
        <div class="bat-record-summary"><span>最高連擊 <b>${battleState.bestCombo}</b></span><span>總輸出 <b>${battleState.totalDamage}</b></span><span>最高傷害 <b>${battleState.maxDamage}</b></span></div>
        <div class="btn-row">
          <button class="btn btn-secondary" id="bat-back">回對手選單</button>
          <button class="btn btn-primary" id="bat-again">${endlessMode && win ? '繼續巡禮' : endlessMode ? '再走一輪' : '再戰一場'}</button>
        </div>
      </div>`;
      el.querySelector('#bat-again').addEventListener('click', () => {
        if (endlessMode) {
          if (!win) endlessStreak = 0;
          start(endlessOpponent(endlessStreak), { endless: true });
        } else start(opp);
      });
      el.querySelector('#bat-back').addEventListener('click', () => renderPicker());
    }

    // ── PvP：同裝置雙人輪流答題，不記段位分、不觸發夥伴助戰，維持公平 ──
    let pvpState = null;
    let pvpLocked = false;

    function startPvp() {
      pvpState = { hp: [MAX_HP, MAX_HP], turn: 0, combo: [0, 0], log: '玩家 1 先攻！' };
      pvpLocked = false;
      pvpRound();
    }

    function pvpRound() {
      if (pvpState.hp[0] <= 0) return pvpFinish(2);
      if (pvpState.hp[1] <= 0) return pvpFinish(1);
      pvpState.q = SciQuiz.buildQuestion(pool[Math.floor(Math.random() * pool.length)], pool);
      pvpState.qStart = Date.now();
      pvpLocked = false;
      renderPvp();
    }

    function renderPvp(midTurn) {
      const q = pvpState.q;
      const t = pvpState.turn;
      el.innerHTML = `
        <div class="bat-arena pvp">
          <div class="bat-side foe">
            <div class="bat-name">玩家 2 ${pvpState.combo[1] >= 2 ? `🔥×${pvpState.combo[1]}` : ''}</div>
            ${hpBar(pvpState.hp[1], t === 1 ? 'active' : '')}
          </div>
          <div class="bat-log" role="status" aria-live="polite">${pvpState.log}</div>
          <div class="bat-side me">
            ${hpBar(pvpState.hp[0], t === 0 ? 'active' : '')}
            <div class="bat-name">玩家 1 ${pvpState.combo[0] >= 2 ? `🔥×${pvpState.combo[0]}` : ''}</div>
          </div>
        </div>
        <div class="bat-turn">👉 玩家 ${t + 1} 作答</div>
        <div class="card">
          <div class="quiz-prompt">${q.mode === 'term2def' ? `「${q.prompt}」是在說什麼？` : `這個定義說的是哪個詞：<br>「${q.prompt}」`}</div>
          <div class="quiz-options">
            ${q.options.map((o) => `<button class="quiz-option" data-id="${o.id}" ${midTurn ? 'disabled' : ''}>${o.label}</button>`).join('')}
          </div>
        </div>`;
      if (!midTurn) {
        el.querySelectorAll('.quiz-option').forEach((btn) => {
          btn.addEventListener('click', () => onPvpAnswer(btn.dataset.id));
        });
      }
    }

    function onPvpAnswer(chosenId) {
      if (pvpLocked) return;
      pvpLocked = true;
      const me = pvpState.turn;
      const foe = 1 - me;
      const q = pvpState.q;
      const correct = chosenId === q.answerId;
      const target = pool.find((t) => t.id === q.answerId);
      const elapsedMs = Date.now() - pvpState.qStart;

      recordAnswer(target, correct, elapsedMs, SciQuiz.questionContentLength(q));

      if (correct) {
        const dmg = calcDamage(pvpState.combo[me], pvpState.hp[me]);
        pvpState.hp[foe] = Math.max(0, pvpState.hp[foe] - dmg);
        pvpState.combo[me]++;
        pvpState.log = `玩家 ${me + 1} 命中！玩家 ${foe + 1} -${dmg}`;
      } else {
        pvpState.combo[me] = 0;
        pvpState.hp[me] = Math.max(0, pvpState.hp[me] - 6);
        pvpState.log = `玩家 ${me + 1} 答錯，自損 6（正確答案：${target.term}）`;
      }
      renderPvp(true);
      setTimeout(() => {
        pvpState.turn = foe;
        pvpRound();
      }, correct ? 900 : 1300);
    }

    function pvpFinish(winner) {
      el.innerHTML = `<div class="card celebrate-in">
        <div class="bat-result-emoji">🏆</div>
        <p>玩家 ${winner} 獲勝！</p>
        <div class="btn-row">
          <button class="btn btn-secondary" id="bat-back">回對手選單</button>
          <button class="btn btn-primary" id="bat-again">再來一局</button>
        </div>
      </div>`;
      el.querySelector('#bat-again').addEventListener('click', startPvp);
      el.querySelector('#bat-back').addEventListener('click', () => renderPicker());
    }

    renderPicker();
  }

  return {
    OPPONENTS, TIER_UNLOCK, foeArt, isUnlocked, calcDamage, speedMultiplier, calcPveDamage, enemyDamage, recordPlayerHit, applyWrongAnswer, clearDamagePops, answerFeedbackClass, endlessOpponent, recordEndlessBest, ENDLESS_MILESTONES, claimEndlessMilestone, mount,
    RANKS, rankInfo, rankWin, rankLose, weekStr,
    COMPANION_TIERS, companionFor,
    SUBJECT_LINES, PREFIX_SUBJECT, subjectOfId, masteredBySubject, subjectProgress, companionForSubject, subjectCompanionArt,
  };
})();
