// 連線對戰 UI：房號配對、1.5 秒輪詢與本機 seeded 出題。
const SciRtBattleUI = (() => {
  const api = (body) => SHAPI.call('/api/rt-room', body);
  const liveApi = (body) => SHAPI.call('/api/rt-live', body);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function mount(el, ctx) {
    let room = null;
    let questions = [];
    let state = null;
    let pollTimer = null;
    let roundTimer = null;
    let roundStarted = 0;
    const sessionNick = SciRtBattle.genNick();
    const gone = () => !el.isConnected;
    const on = (selector, event, fn) => el.querySelector(selector)?.addEventListener(event, fn);
    const clearTimers = () => { clearInterval(pollTimer); clearInterval(roundTimer); pollTimer = null; roundTimer = null; };
    const myNick = () => SciRtBattle.loadClass?.()?.nick || sessionNick;
    const mySnap = () => ({
      nick: myNick(),
      compLv: SciBattle.companionFor(ctx.masteredCardCount || 0).level,
      hp: SciRtBattle.MAX_HP,
      scope: ctx.scope,
    });

    function home() {
      clearTimers();
      el.innerHTML = `<div class="card">
        <h3>🌐 連線對戰</h3>
        <p>開一間 4 位數房間，跟遠端的科學英雄同題對戰。</p>
        <div class="btn-row"><button class="btn btn-primary" id="rt-create">開房等對手</button></div>
        <label class="rt-input-label">或輸入房號 <input id="rt-code-input" inputmode="numeric" maxlength="4" autocomplete="off" /></label>
        <div class="btn-row"><button class="btn" id="rt-join">加入房間</button></div>
        <hr><div class="btn-row"><button class="btn" id="rt-challenge-create">📮 發挑戰書</button></div>
        <label class="rt-input-label">挑戰碼 <input id="rt-challenge-code" maxlength="6" autocomplete="off" /></label>
        <div class="btn-row"><button class="btn" id="rt-challenge-accept">⚔️ 輸入挑戰碼應戰</button></div>
        <hr><div class="btn-row"><button class="btn" id="rt-live-student">📡 隨堂戰況（學生）</button><button class="btn" id="rt-live-host">🧑‍🏫 我是老師</button></div>
        <div class="btn-row"><button class="btn" id="rt-season-board">🏆 賽季排位榜</button></div>
        <div id="rt-extra-actions"></div>
      </div>`;
      on('#rt-create', 'click', create);
      on('#rt-join', 'click', () => join(el.querySelector('#rt-code-input')?.value || ''));
      on('#rt-challenge-create', 'click', createChallengeRun);
      on('#rt-challenge-accept', 'click', () => acceptChallenge(el.querySelector('#rt-challenge-code')?.value || ''));
      on('#rt-live-student', 'click', studentSetup);
      on('#rt-live-host', 'click', hostSetup);
      on('#rt-season-board', 'click', showSeasonBoard);
    }

    async function create() {
      if ((ctx.pool || []).length < 4) return failCard('這個範圍的詞條不足 4 筆，請換個範圍再開房');
      const result = await api({ op: 'create', snap: mySnap() });
      if (!result.ok) return result.error === 'offline' ? offlineCard() : failCard(result.error || '開房失敗');
      room = { code: result.code, role: 'p1', seed: result.seed, scope: ctx.scope, opp: null };
      lobby();
    }

    function lobby() {
      el.innerHTML = `<div class="card rt-wait"><h3>房間號</h3><div class="rt-code">${room.code}</div><p>等待對手加入中…（房間保留 10 分鐘）</p><button class="btn" id="rt-home">離開房間</button></div>`;
      on('#rt-home', 'click', home);
      pollTimer = setInterval(waitForOpponent, SciRtBattle.POLL_MS);
      waitForOpponent();
    }

    async function waitForOpponent() {
      if (gone() || !room) return clearTimers();
      const result = await api({ op: 'poll', code: room.code, role: room.role });
      if (!result.ok) {
        if (result.error === '房間已過期') failCard('房間已過期，重開一間吧');
        return;
      }
      if (result.opp) { room.opp = result.opp.snap; clearInterval(pollTimer); start(); }
    }

    async function join(rawCode) {
      const code = String(rawCode).trim();
      if (!/^\d{4}$/.test(code)) return failCard('請輸入 4 位數房號');
      const result = await api({ op: 'join', code, snap: mySnap() });
      if (!result.ok) return result.error === 'offline' ? offlineCard() : failCard(result.error || '找不到這個房間，確認房號再試一次');
      room = { code, role: 'p2', seed: result.seed, scope: result.scope, opp: result.opp };
      start();
    }

    async function createChallengeRun() {
      if ((ctx.pool || []).length < 4) return failCard('這個範圍的詞條不足 4 筆');
      const seed = Math.floor(Math.random() * (2 ** 31));
      runSolo(seed, ctx.scope, async (score) => {
        const result = await api({ op: 'challenge', seed, scope: ctx.scope, nick: myNick(), score });
        if (!result.ok) return result.error === 'offline' ? offlineCard() : failCard(result.error || '發送挑戰書失敗');
        const shareText = `${myNick()} 向你發出科學挑戰！答對 ${score.correct} 題、輸出 ${score.dmg}，挑戰碼 ${result.code}（7 天內有效）`;
        el.innerHTML = `<div class="card celebrate-in"><h3>📮 挑戰書已封印</h3><div class="rt-code">${result.code}</div><p>7 天內有效</p><button class="btn btn-primary" id="rt-copy">複製戰帖</button><button class="btn" id="rt-home">回連線對戰</button></div>`;
        on('#rt-copy', 'click', () => navigator.clipboard?.writeText(shareText));
        on('#rt-home', 'click', home);
      });
    }

    async function acceptChallenge(rawCode) {
      const code = String(rawCode).trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return failCard('請輸入 6 碼挑戰碼');
      const accepted = await api({ op: 'accept', code });
      if (!accepted.ok) return accepted.error === 'offline' ? offlineCard() : failCard(accepted.error || '找不到這張挑戰書');
      runSolo(accepted.seed, accepted.scope, async (score) => {
        const result = await api({ op: 'challengeResult', code, nick: myNick(), score });
        if (!result.ok) return failCard(result.error || '上傳挑戰結果失敗');
        const a = result.challenger;
        const b = result.accepter;
        const cmp = (x, y) => x.score.correct !== y.score.correct ? x.score.correct - y.score.correct : x.score.dmg - y.score.dmg;
        const outcome = cmp(a, b);
        el.innerHTML = `<div class="card celebrate-in"><h3>${outcome < 0 ? '🏆 挑戰成功！' : outcome > 0 ? '💪 對手這次領先' : '🤝 平手'}</h3><div class="rt-result-table"><div><b>${esc(a.nick)}</b><p>答對 ${a.score.correct}・輸出 ${a.score.dmg}</p></div><div><b>${esc(b.nick)}</b><p>答對 ${b.score.correct}・輸出 ${b.score.dmg}</p></div></div><button class="btn" id="rt-home">回連線對戰</button></div>`;
        on('#rt-home', 'click', home);
      });
    }

    function runSolo(seed, scope, onComplete) {
      const pool = ctx.poolForScope ? ctx.poolForScope(scope) : ctx.pool;
      if (!pool || pool.length < 4) return failCard('這個挑戰範圍的詞條不足 4 筆');
      const solo = { questions: SciRtBattle.buildQuestions(seed, pool), pool, idx: 0, correct: 0, dmg: 0, combo: 0, boost: {}, script: SciRtBattle.buildAdventureScript(seed, 'p1'), locked: false };

      function render() {
        clearInterval(roundTimer);
        solo.locked = false;
        const q = solo.questions[solo.idx];
        roundStarted = Date.now();
        el.innerHTML = `<div class="card"><p>挑戰書・第 ${solo.idx + 1}/${solo.questions.length} 題・<span id="rt-countdown">${SciRtBattle.ROUND_SEC}</span> 秒</p><h3 class="quiz-prompt">${esc(q.prompt)}</h3><div class="quiz-options">${q.options.map((option) => `<button class="quiz-option" data-id="${esc(option.id)}">${esc(option.label)}</button>`).join('')}</div></div>`;
        el.querySelectorAll?.('.quiz-option').forEach((button) => button.addEventListener('click', () => answerSolo(button.dataset.id, Date.now() - roundStarted)));
        if (solo.boost.eliminate) {
          const wrong = [...(el.querySelectorAll?.('.quiz-option') || [])].filter((button) => button.dataset.id !== q.answerId);
          const picked = wrong[Math.floor(Math.random() * wrong.length)]; if (picked) picked.disabled = true;
          solo.boost.eliminate = false;
        }
        roundTimer = setInterval(() => {
          const left = Math.max(0, SciRtBattle.ROUND_SEC - Math.floor((Date.now() - roundStarted) / 1000));
          const label = el.querySelector('#rt-countdown'); if (label) label.textContent = left;
          if (left <= 0) answerSolo(null, SciRtBattle.ROUND_SEC * 1000);
        }, 250);
      }

      function answerSolo(id, elapsedMs) {
        if (solo.locked) return;
        solo.locked = true;
        clearInterval(roundTimer);
        const q = solo.questions[solo.idx];
        const correct = id === q.answerId;
        const target = solo.pool.find((term) => term.id === q.answerId);
        ctx.recordAnswer?.(target, correct, elapsedMs);
        const result = SciRtBattle.answerResult({ correct, combo: solo.combo, myHp: SciRtBattle.MAX_HP, boost: solo.boost });
        solo.dmg += result.dmg; solo.combo = result.nextCombo; if (correct) solo.correct += 1;
        solo.boost = {}; solo.idx += 1;
        const event = solo.script.get(solo.idx);
        if (event && event.effect !== 'heal') solo.boost[event.effect] = true;
        el.innerHTML = `<div class="card ${correct ? 'correct' : 'wrong'}"><h3>${correct ? '✅ 答對了！' : '💡 這題記起來'}</h3>${event ? `<div class="rt-adventure">${event.emoji} 科學奇遇【${esc(event.name)}】——${esc(event.desc)}</div>` : ''}</div>`;
        setTimeout(() => solo.idx >= solo.questions.length ? onComplete({ correct: solo.correct, dmg: solo.dmg }) : render(), 900);
      }
      render();
    }

    function studentSetup() {
      const saved = SciRtBattle.loadClass();
      let nick = saved?.nick || SciRtBattle.genNick();
      el.innerHTML = `<div class="card"><h3>📡 加入隨堂戰況</h3><label class="rt-input-label">班級碼 <input id="rt-class-code" maxlength="12" value="${esc(saved?.code || '')}" /></label><p>你的科學代號：<strong id="rt-nick-preview">${esc(nick)}</strong></p><button class="btn" id="rt-reroll">🎲 抽一個科學代號</button><button class="btn btn-primary" id="rt-live-enter">加入</button><button class="btn" id="rt-home">返回</button></div>`;
      on('#rt-reroll', 'click', () => { nick = SciRtBattle.genNick(); const label = el.querySelector('#rt-nick-preview'); if (label) label.textContent = nick; });
      on('#rt-live-enter', 'click', () => enterStudent(el.querySelector('#rt-class-code')?.value || '', nick));
      on('#rt-home', 'click', home);
    }

    function enterStudent(rawCode, nick) {
      const code = String(rawCode).trim();
      if (!/^[A-Za-z0-9]{2,12}$/.test(code)) return failCard('班級碼需為 2–12 位英數字');
      SciRtBattle.saveClass({ code, nick });
      let currentQ = 0;
      let questionsForLive = [];
      let answered = false;

      async function pollLive() {
        if (gone()) return clearTimers();
        const result = await liveApi({ op: 'state', code });
        if (!result.ok || !result.live) return failCard(result.error || '目前沒有這場隨堂戰況');
        const live = result.live;
        if (!questionsForLive.length) {
          const pool = ctx.poolForScope(live.scope);
          if (pool.length < 4) return failCard('這個出題範圍的詞條不足 4 筆');
          questionsForLive = SciRtBattle.buildQuestions(live.seed, pool, live.qn);
        }
        if (live.phase === 'lobby') {
          el.innerHTML = `<div class="card rt-wait"><h3>已加入 ${esc(code)}</h3><p>等老師開始第一題…</p></div>`;
        } else if (live.phase === 'end') {
          clearTimers();
          const roster = await liveApi({ op: 'roster', code });
          renderStudentBoard(roster.list || [], nick);
        } else if (live.qNo !== currentQ) {
          currentQ = live.qNo; answered = false; renderLiveQuestion(live);
        }
      }

      function renderLiveQuestion(live) {
        const q = questionsForLive[live.qNo - 1];
        el.innerHTML = `<div class="card"><p>隨堂戰況・第 ${live.qNo}/${live.qn} 題</p><h3 class="quiz-prompt">${esc(q.prompt)}</h3><div class="quiz-options">${q.options.map((option) => `<button class="quiz-option" data-id="${esc(option.id)}">${esc(option.label)}</button>`).join('')}</div></div>`;
        const started = Date.now();
        el.querySelectorAll?.('.quiz-option').forEach((button) => button.addEventListener('click', async () => {
          if (answered) return; answered = true;
          const correct = button.dataset.id === q.answerId;
          const pool = ctx.poolForScope(live.scope);
          const target = pool.find((term) => term.id === q.answerId);
          ctx.recordAnswer?.(target, correct, Date.now() - started);
          await liveApi({ op: 'answer', code, nick, qNo: live.qNo, correct });
          el.innerHTML = `<div class="card rt-wait"><h3>${correct ? '✅ 答對了' : '💡 這題記起來'}</h3><p>等老師出下一題…</p></div>`;
        }));
      }

      function renderStudentBoard(rows, studentNick) {
        const board = SciRtBattle.safeBoard(rows, studentNick);
        el.innerHTML = `<div class="card celebrate-in"><h3>🏁 隨堂戰況結束</h3><ol>${board.top.map((row) => `<li>${esc(row.nick)}・${row.score} 題</li>`).join('')}</ol>${board.me ? `<p>你目前第 ${board.me.rank} 名・答對 ${board.me.score} 題</p>` : ''}<p>跟上一場的自己比就是進步。</p><button class="btn" id="rt-home">回連線對戰</button></div>`;
        on('#rt-home', 'click', home);
      }

      el.innerHTML = `<div class="card rt-wait"><p>正在加入隨堂戰況…</p></div>`;
      pollTimer = setInterval(pollLive, 3000);
      pollLive();
    }

    function hostSetup() {
      el.innerHTML = `<div class="card"><h3>🧑‍🏫 開啟全班戰況</h3><label class="rt-input-label">班級碼 <input id="rt-host-code" maxlength="12" /></label><label class="rt-input-label">題數 <select id="rt-host-qn"><option>5</option><option>10</option><option>15</option></select></label><button class="btn btn-primary" id="rt-host-start">開場</button><button class="btn" id="rt-home">返回</button></div>`;
      on('#rt-host-start', 'click', () => startHost(el.querySelector('#rt-host-code')?.value || '', Number(el.querySelector('#rt-host-qn')?.value || 5)));
      on('#rt-home', 'click', home);
    }

    async function startHost(rawCode, qn) {
      const code = String(rawCode).trim();
      const started = await liveApi({ op: 'start', code, qn, scope: ctx.scope });
      if (!started.ok) return started.error === 'offline' ? offlineCard() : failCard(started.error || '開場失敗');
      const token = started.token;

      async function renderHost() {
        const stateResult = await liveApi({ op: 'state', code });
        const rosterResult = await liveApi({ op: 'roster', code });
        const live = stateResult.live;
        const board = SciRtBattle.safeBoard(rosterResult.list || [], null);
        el.innerHTML = `<div class="card"><h3>📡 ${esc(code)} 全班戰況</h3><p>${live.phase === 'lobby' ? '大家加入後按下一題' : live.phase === 'end' ? '已結束' : `第 ${live.qNo}/${live.qn} 題`}・已答 ${board.total} 人</p><ol>${board.top.map((row) => `<li>${esc(row.nick)}・${row.score} 題</li>`).join('')}</ol>${live.phase !== 'end' ? '<button class="btn btn-primary" id="rt-host-next">下一題</button><button class="btn" id="rt-host-end">結束</button>' : `<p>全班共 ${board.total} 人參賽</p><button class="btn" id="rt-home">回連線對戰</button>`}</div>`;
        on('#rt-host-next', 'click', async () => { await liveApi({ op: 'next', code, token }); renderHost(); });
        on('#rt-host-end', 'click', async () => { await liveApi({ op: 'end', code, token }); renderHost(); });
        on('#rt-home', 'click', home);
        if (live.phase === 'end') clearTimers();
      }
      await renderHost();
      pollTimer = setInterval(renderHost, 3000);
    }

    async function showSeasonBoard() {
      const remote = await api({ op: 'seasonTop' });
      const local = ctx.state?.rtSeason;
      const top = remote.ok ? remote.top : [];
      const season = remote.ok ? remote.season : (local?.key || SciRtBattle.seasonKey(SciStore.todayStr()));
      const history = Object.entries(local?.titles || {});
      el.innerHTML = `<div class="card"><h3>🏆 ${esc(season)} 賽季排位</h3>${remote.ok ? `<ol>${top.map((row) => `<li>${esc(row.nick)}・${row.pts} 分</li>`).join('') || '<li>還沒有人上榜</li>'}</ol>` : '<p>連上網路才看得到全服排行。</p>'}${local ? `<p>你：${esc(SciRtBattle.titleFor(local.pts))}・${local.pts} 分</p>` : '<p>完成一場連線對戰就會開始累積。</p>'}${history.length ? `<h4>歷季稱號</h4><ul>${history.map(([key, title]) => `<li>${esc(key)}・${esc(title)}</li>`).join('')}</ul>` : ''}<p>每月 1 日換季重新起算；輸了也有參與分，不倒扣。</p><button class="btn" id="rt-home">回連線對戰</button></div>`;
      on('#rt-home', 'click', home);
    }

    function start() {
      const pool = ctx.poolForScope ? ctx.poolForScope(room.scope) : ctx.pool;
      if (!pool || pool.length < 4) return failCard('這個範圍的詞條不足 4 筆，請請房主換個範圍');
      questions = SciRtBattle.buildQuestions(room.seed, pool);
      state = { pool, idx: 0, dmg: 0, heal: 0, combo: 0, correct: 0, done: false, oppDmg: 0, oppHeal: 0, oppCorrect: 0, oppCombo: 0, oppDone: false, oppHb: Date.now(), boost: {}, finished: false, locked: false, hitFlash: false, advScript: SciRtBattle.buildAdventureScript(room.seed, room.role), lastAdventure: null };
      pollTimer = setInterval(tick, SciRtBattle.POLL_MS);
      nextRound();
    }

    const myHp = () => SciRtBattle.hpOf(SciRtBattle.MAX_HP, state.oppDmg, state.heal);
    const oppHp = () => SciRtBattle.hpOf(SciRtBattle.MAX_HP, state.dmg, state.oppHeal);
    const hpBar = (label, hp, cls) => `<div class="bat-hp ${cls}"><span>${esc(label)} ${hp}/${SciRtBattle.MAX_HP}</span><div><i style="width:${hp}%"></i></div></div>`;

    async function tick() {
      if (gone() || !state || state.finished) return clearTimers();
      await api({ op: 'push', code: room.code, role: room.role, state: { dmg: state.dmg, heal: state.heal, round: state.idx, combo: state.combo, correct: state.correct, done: state.done ? 1 : 0 } });
      const result = await api({ op: 'poll', code: room.code, role: room.role });
      if (!result.ok) return;
      if (result.opp) {
        room.opp ||= result.opp.snap;
        state.hitFlash = result.opp.state.correct > state.oppCorrect;
        state.oppDmg = result.opp.state.dmg;
        state.oppHeal = result.opp.state.heal;
        state.oppCorrect = result.opp.state.correct || 0;
        state.oppCombo = result.opp.state.combo || 0;
        state.oppDone = !!result.opp.state.done;
        state.oppHb = result.opp.state.hb;
        paintHud();
      }
      const verdict = SciRtBattle.judge({ myHp: myHp(), oppHp: oppHp(), myDone: state.done, oppDone: state.oppDone, oppHbAgeMs: result.opp ? result.now - state.oppHb : 0 });
      if (verdict) finish(verdict);
    }

    function paintHud() {
      const hud = el.querySelector('#rt-hud');
      if (hud && state) hud.innerHTML = `<div class="rt-vs${state.hitFlash ? ' rt-hit-flash' : ''}">${hpBar(myNick(), myHp(), 'me')}<b>VS</b>${hpBar(room.opp?.nick || '對手', oppHp(), 'foe')}</div><p>你：連擊 ${state.combo}・答對 ${state.correct}　｜　對手答對 ${state.oppCorrect} 題${state.oppCombo > 1 ? `・連擊中 ×${state.oppCombo}` : ''}</p>`;
      state.hitFlash = false;
    }

    function nextRound() {
      clearInterval(roundTimer);
      state.locked = false;
      const q = questions[state.idx];
      roundStarted = Date.now();
      el.innerHTML = `<div id="rt-hud"></div><div class="card"><p>第 ${state.idx + 1}/${questions.length} 題・<span id="rt-countdown">${SciRtBattle.ROUND_SEC}</span> 秒</p><h3 class="quiz-prompt">${esc(q.prompt)}</h3><div class="quiz-options">${q.options.map((option) => `<button class="quiz-option" data-id="${esc(option.id)}">${esc(option.label)}</button>`).join('')}</div></div>`;
      paintHud();
      el.querySelectorAll?.('.quiz-option').forEach((button) => button.addEventListener('click', () => answer(button.dataset.id, Date.now() - roundStarted)));
      if (state.boost.eliminate) {
        const wrong = [...(el.querySelectorAll?.('.quiz-option') || [])].filter((button) => button.dataset.id !== q.answerId);
        const picked = wrong[Math.floor(Math.random() * wrong.length)];
        if (picked) { picked.disabled = true; picked.style.textDecoration = 'line-through'; }
        state.boost.eliminate = false;
      }
      roundTimer = setInterval(() => {
        const left = Math.max(0, SciRtBattle.ROUND_SEC - Math.floor((Date.now() - roundStarted) / 1000));
        const label = el.querySelector('#rt-countdown'); if (label) label.textContent = left;
        if (left <= 0) answer(null, SciRtBattle.ROUND_SEC * 1000);
      }, 250);
    }

    function answer(chosenId, elapsedMs) {
      if (state.locked || state.finished) return;
      state.locked = true;
      clearInterval(roundTimer);
      const q = questions[state.idx];
      const correct = chosenId === q.answerId;
      const target = state.pool.find((term) => term.id === q.answerId);
      ctx.recordAnswer?.(target, correct, elapsedMs);
      const result = SciRtBattle.answerResult({ correct, combo: state.combo, myHp: myHp(), boost: state.boost });
      state.dmg += result.dmg;
      state.combo = result.nextCombo;
      if (correct) state.correct += 1;
      state.boost = {};
      state.idx += 1;
      maybeAdventure();
      if (state.idx >= questions.length) state.done = true;
      const adventure = state.lastAdventure ? `<div class="card rt-adventure">${state.lastAdventure.emoji} 科學奇遇【${esc(state.lastAdventure.name)}】——${esc(state.lastAdventure.desc)}</div>` : '';
      el.innerHTML = `<div id="rt-hud"></div><div class="card ${correct ? 'correct' : 'wrong'}"><h3>${correct ? '✅ 答對了！' : '💡 這題記起來'}</h3><p>${esc(target?.term || '')}：${esc(target?.definition || '')}</p></div>${adventure}`;
      state.lastAdventure = null;
      paintHud();
      setTimeout(() => state.done ? waitOpponent() : nextRound(), 900);
    }

    function maybeAdventure() {
      const event = state.advScript.get(state.idx);
      if (!event) return;
      if (event.effect === 'heal') state.heal = Math.min(100, state.heal + event.amount);
      else state.boost[event.effect] = true;
      state.lastAdventure = event;
    }

    function waitOpponent() {
      el.innerHTML = `<div id="rt-hud"></div><div class="card rt-wait"><h3>你打完了！</h3><p>等待對手完賽…</p></div>`;
      paintHud();
    }

    function finish(verdict) {
      if (!state || state.finished) return;
      state.finished = true;
      clearTimers();
      const season = SciRtBattle.recordSeasonResult(ctx.state, SciStore.todayStr(), verdict);
      SciStore.save(ctx.state);
      api({ op: 'seasonAdd', nick: myNick(), pts: verdict === 'win' ? SciRtBattle.WIN_PTS : SciRtBattle.LOSE_PTS });
      const titles = { win: '🏆 獲勝！', lose: '💪 惜敗', draw: '🤝 平手' };
      el.innerHTML = `<div class="card celebrate-in"><h3>${titles[verdict]}</h3><p>答對 ${state.correct}/${questions.length}・總輸出 ${state.dmg}</p><p>🗓️ ${season.key} 賽季・${esc(season.title)}（${season.pts} 分，勝+20/其餘+5）</p>${verdict === 'lose' ? '<p>段位分不扣——把知識點記牢，下次贏回來！</p>' : ''}<button class="btn btn-primary" id="rt-home">回連線對戰</button></div>`;
      on('#rt-home', 'click', home);
    }

    function offlineCard() { failCard('😴 連不上對戰伺服器。沒有網路也沒關係——「答題對戰」的電腦對手與同裝置雙人模式都不用連線。'); }
    function failCard(message) {
      clearTimers();
      el.innerHTML = `<div class="card"><p>${esc(message)}</p><button class="btn" id="rt-home">回連線對戰</button></div>`;
      on('#rt-home', 'click', home);
    }

    home();
  }

  return { mount };
})();
