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

  function isUnlocked(opponent, totalReviews) {
    return (totalReviews || 0) >= (TIER_UNLOCK[opponent.tier] || 0);
  }

  // 答對傷害：基礎 12 + 連擊加成，血量 <30 時背水一戰 1.5 倍。
  function calcDamage(combo, hp) {
    let dmg = 12 + combo * 3;
    if (hp < 30) dmg = Math.round(dmg * 1.5);
    return dmg;
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
    const p = r.pts;
    let i = 0;
    while (i + 1 < RANKS.length && p >= RANKS[i + 1].at) i++;
    const cur = RANKS[i];
    const next = RANKS[i + 1] || null;
    return { ...cur, pts: p, peak: r.peak, next, pct: next ? Math.round(((p - cur.at) / (next.at - cur.at)) * 100) : 100 };
  }

  function rankWin(state) {
    const r = rankState(state);
    r.pts += 20;
    r.peak = Math.max(r.peak, r.pts);
    return { delta: 20, ...rankInfo(state) };
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
  ];

  function companionFor(masteredCount) {
    const n = masteredCount || 0;
    let i = 0;
    while (i + 1 < COMPANION_TIERS.length && n >= COMPANION_TIERS[i + 1].at) i++;
    const cur = COMPANION_TIERS[i];
    const next = COMPANION_TIERS[i + 1] || null;
    return { ...cur, level: i + 1, mastered: n, next };
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

  // ── mount：掛在指定容器上，ctx = { pool, state, subjectLabel, recordAnswer, masteredCardCount } ──
  function mount(el, ctx) {
    const { pool, state, subjectLabel, recordAnswer, masteredCardCount } = ctx;
    let opp = null;
    let battleState = null;
    let locked = false;

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
      const c = companionFor(masteredCardCount);
      return `<div class="bat-companion">
        <span class="bat-companion-face">${c.emoji}</span>
        <span class="bat-companion-body">
          <span class="bat-companion-name">${c.name}　Lv.${c.level}</span>
          <span class="bat-companion-desc">${c.atk > 0 ? `對戰時追擊 +${c.atk}${c.leech ? `・${Math.round(c.leechChance * 100)}% 機率回血 +${c.leech}` : ''}` : '再精通幾張詞卡就會孵化'}</span>
          <span class="bat-companion-next">${c.next ? `再精通 ${c.next.at - c.mastered} 張詞卡進化為 ${c.next.emoji} ${c.next.name}` : '已達最高進化階段！'}</span>
        </span>
      </div>`;
    }

    function assistTag() {
      const c = companionFor(masteredCardCount);
      if (!c.atk) return '';
      return `<div class="bat-assist">${c.emoji} ${c.name} 助戰（追擊 ${c.atk}${c.leech ? '・機率回血' : ''}）</div>`;
    }

    function renderPicker() {
      if (pool.length < 4) {
        el.innerHTML = `<div class="card"><p>這個範圍的詞條還不夠開打（至少要 4 筆），先切別的單元或全部範圍再來對戰吧！</p></div>`;
        return;
      }
      const beaten = new Set(beatenList(state));
      el.innerHTML = `
        <p class="bat-hint">在「${subjectLabel}」目前選定的範圍內出題，挑一位對手開打！</p>
        ${rankStrip()}
        ${companionCard()}
        <button class="btn btn-secondary bat-pvp-btn" id="bat-pvp">👥 雙人對戰（同裝置輪流答題）</button>
        <div class="bat-oppgrid">
          ${OPPONENTS.map((o) => {
            const unlocked = isUnlocked(o, totalReviews());
            const won = beaten.has(o.id);
            return `<button class="bat-oppcard${unlocked ? '' : ' locked'}" data-id="${o.id}" data-open="${unlocked ? 1 : 0}">
              <span class="bat-face">${unlocked ? o.emoji : '🔒'}</span>
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
      el.querySelector('#bat-pvp').addEventListener('click', startPvp);
    }

    // ── PvE ──
    function start(o) {
      opp = o;
      battleState = { pHp: MAX_HP, oHp: MAX_HP, combo: 0, log: opp.taunt };
      locked = false;
      nextRound();
    }

    function nextRound() {
      if (battleState.oHp <= 0) return finish(true);
      if (battleState.pHp <= 0) return finish(false);
      battleState.q = SciQuiz.buildQuestion(pool[Math.floor(Math.random() * pool.length)], pool);
      battleState.qStart = Date.now();
      locked = false;
      render();
    }

    function hpBar(hp, side) {
      return `<div class="bat-hp ${hp <= 30 ? 'low' : ''} ${side}">
        <div class="bat-hp-fill" style="width:${hp}%"></div><span>${hp}</span></div>`;
    }

    function render(midTurn) {
      const q = battleState.q;
      el.innerHTML = `
        <div class="bat-arena">
          <div class="bat-side foe">
            <span class="bat-face big">${opp.emoji}</span>
            <div class="bat-name">${opp.name}</div>
            ${hpBar(battleState.oHp, 'foe')}
          </div>
          <div class="bat-log" role="status" aria-live="polite">${battleState.log}</div>
          <div class="bat-side me">
            ${hpBar(battleState.pHp, 'me')}
            <div class="bat-name">你 ${battleState.pHp < 30 ? '💢背水一戰' : battleState.combo >= 2 ? `🔥連擊 ×${battleState.combo}` : ''}</div>
            ${assistTag()}
          </div>
        </div>
        <div class="card">
          <div class="quiz-prompt">${q.mode === 'term2def' ? `「${q.prompt}」是在說什麼？` : `這個定義說的是哪個詞：<br>「${q.prompt}」`}</div>
          <div class="quiz-options">
            ${q.options.map((o) => `<button class="quiz-option" data-id="${o.id}" ${midTurn ? 'disabled' : ''}>${o.label}</button>`).join('')}
          </div>
        </div>`;
      if (!midTurn) {
        el.querySelectorAll('.quiz-option').forEach((btn) => {
          btn.addEventListener('click', () => onAnswer(btn.dataset.id));
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

      recordAnswer(target, correct, elapsedMs);

      if (correct) {
        const dmg = calcDamage(battleState.combo, battleState.pHp);
        battleState.oHp = Math.max(0, battleState.oHp - dmg);
        battleState.combo++;
        battleState.log = `命中！對 ${opp.name} 造成 ${dmg} 點傷害${battleState.combo >= 2 ? `（連擊 ×${battleState.combo}）` : ''}`;
        const c = companionFor(masteredCardCount);
        if (c.atk > 0 && battleState.oHp > 0) {
          battleState.oHp = Math.max(0, battleState.oHp - c.atk);
          battleState.log += `　${c.emoji} ${c.name} 追擊 -${c.atk}`;
          if (c.leech && Math.random() < c.leechChance) {
            battleState.pHp = Math.min(MAX_HP, battleState.pHp + c.leech);
            battleState.log += `・回血 +${c.leech}`;
          }
        }
      } else {
        battleState.combo = 0;
        battleState.pHp = Math.max(0, battleState.pHp - 8);
        battleState.log = `答錯！${opp.name} 趁隙反擊，你 -8（正確答案：${target.term}）`;
      }
      render(true);

      setTimeout(() => {
        if (battleState.oHp <= 0) return finish(true);
        if (battleState.pHp <= 0) return finish(false);
        const hit = Math.random() < opp.acc;
        if (hit) {
          const dmg = 8 + Math.round(opp.acc * 8);
          battleState.pHp = Math.max(0, battleState.pHp - dmg);
          battleState.log = `${opp.name} 出招——你受到 ${dmg} 點傷害`;
        } else {
          battleState.oHp = Math.max(0, battleState.oHp - 4);
          battleState.log = `${opp.name} 一時語塞，自損 4`;
        }
        render(true);
        setTimeout(nextRound, 1000);
      }, correct ? 700 : 1200);
    }

    function finish(win) {
      const rk = win ? rankWin(state) : rankLose(state);
      if (win) {
        const beaten = beatenList(state);
        if (!beaten.includes(opp.id)) beaten.push(opp.id);
      }
      SciStore.save(state);
      el.innerHTML = `<div class="card celebrate-in">
        <div class="bat-result-emoji">${win ? '🏆' : '💀'}</div>
        <p>${win ? `擊敗 ${opp.name}！` : `不敵 ${opp.name}……`}</p>
        <div class="bat-quote">「${win ? opp.lose : opp.win}」</div>
        <div class="bat-rankdelta ${win ? 'up' : 'down'}">${rk.ico} ${rk.name}　${rk.delta > 0 ? '+' : ''}${rk.delta} 分（${rk.pts}）${rk.shield ? '　🛡️ 本週首敗保護，不扣分！' : ''}</div>
        <div class="btn-row">
          <button class="btn btn-secondary" id="bat-back">回對手選單</button>
          <button class="btn btn-primary" id="bat-again">再戰一場</button>
        </div>
      </div>`;
      el.querySelector('#bat-again').addEventListener('click', () => start(opp));
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

      recordAnswer(target, correct, elapsedMs);

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
    OPPONENTS, TIER_UNLOCK, isUnlocked, calcDamage, mount,
    RANKS, rankInfo, rankWin, rankLose, weekStr,
    COMPANION_TIERS, companionFor,
  };
})();
