// 答題對戰：PvE，答對＝對「科學守護者」造成傷害。複用 SciQuiz 出題器，不重新設計出題邏輯。
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

  // ── mount：掛在指定容器上，ctx = { pool, state, subjectLabel, recordAnswer } ──
  function mount(el, ctx) {
    const { pool, state, subjectLabel, recordAnswer } = ctx;
    let opp = null;
    let battleState = null;
    let locked = false;

    function totalReviews() {
      return state.stats.totalReviews || 0;
    }

    function renderPicker() {
      if (pool.length < 4) {
        el.innerHTML = `<div class="card"><p>這個範圍的詞條還不夠開打（至少要 4 筆），先切別的單元或全部範圍再來對戰吧！</p></div>`;
        return;
      }
      const beaten = new Set(beatenList(state));
      el.innerHTML = `
        <p class="bat-hint">在「${subjectLabel}」目前選定的範圍內出題，挑一位對手開打！</p>
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
    }

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
      if (win) {
        const beaten = beatenList(state);
        if (!beaten.includes(opp.id)) beaten.push(opp.id);
        SciStore.save(state);
      }
      el.innerHTML = `<div class="card celebrate-in">
        <div class="bat-result-emoji">${win ? '🏆' : '💀'}</div>
        <p>${win ? `擊敗 ${opp.name}！` : `不敵 ${opp.name}……`}</p>
        <div class="bat-quote">「${win ? opp.lose : opp.win}」</div>
        <div class="btn-row">
          <button class="btn btn-secondary" id="bat-back">回對手選單</button>
          <button class="btn btn-primary" id="bat-again">再戰一場</button>
        </div>
      </div>`;
      el.querySelector('#bat-again').addEventListener('click', () => start(opp));
      el.querySelector('#bat-back').addEventListener('click', () => renderPicker());
    }

    renderPicker();
  }

  return { OPPONENTS, TIER_UNLOCK, isUnlocked, calcDamage, mount };
})();
