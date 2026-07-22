// 國中班級協力學習榜：班級總精通量優先，個人貢獻僅在學生主動填入白名單暱稱後顯示。
const SciClassBoard = (() => {
  const SUBJECTS = new Set(['biology', 'chemphys', 'earth']);
  const CLASS_CODE = /^[A-Z0-9]{4,12}$/;
  const STORAGE_KEY = 'sci_classcode';
  const OFFLINE_MESSAGE = '目前無法連線班級榜，你的練習已存在本機';
  let current = null;
  let previousFocus = null;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const cleanCode = (value) => String(value ?? '').trim().toUpperCase();
  const cleanMastered = (value) => Math.max(0, Math.min(999, Math.floor(Number(value) || 0)));

  function rememberedCode() {
    try {
      const code = cleanCode(localStorage.getItem(STORAGE_KEY));
      return CLASS_CODE.test(code) ? code : '';
    } catch { return ''; }
  }

  function rememberCode(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* Storage may be unavailable. */ }
  }

  function defaultApiBase() {
    if (typeof SHAPI !== 'undefined' && SHAPI && typeof SHAPI.base === 'function') return SHAPI.base();
    if (window.SHAPI && typeof window.SHAPI.base === 'function') return window.SHAPI.base();
    const local = ['science-hero.pages.dev', 'localhost', '127.0.0.1'].includes(location.hostname);
    return local ? '' : 'https://science-hero.pages.dev';
  }

  function apiUrl(path) {
    const base = typeof current.apiBase === 'string' ? current.apiBase.replace(/\/$/, '') : defaultApiBase();
    return `${base}${path}`;
  }

  async function request(path, options) {
    try {
      const response = await fetch(apiUrl(path), options);
      const result = await response.json();
      return response.ok ? result : { ok: 0, error: result?.error || 'request-failed' };
    } catch { return { ok: 0, error: 'offline' }; }
  }

  function ensureOverlay() {
    if ($('classboard-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'classboard-overlay';
    overlay.className = 'sh-overlay classboard-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `<section id="classboard-panel" class="sh-panel classboard-panel" role="dialog" aria-modal="true" aria-labelledby="classboard-title" tabindex="-1">
      <button id="classboard-close" class="classboard-close" type="button" aria-label="關閉班級協力榜">×</button>
      <header class="classboard-header">
        <p class="classboard-eyebrow">全班一起點亮科學知識</p>
        <h2 id="classboard-title">🏫 班級協力學習榜</h2>
        <p>主角是全班累積的真實精通詞卡數；暱稱貢獻榜完全自由參加。</p>
      </header>
      <div class="classboard-total-card" aria-live="polite">
        <span>本班總精通量</span>
        <strong id="classboard-total">—</strong>
        <small>個知識點</small>
        <div id="classboard-milestone" class="classboard-milestone" hidden>
          <div class="classboard-milestone-bar"><span></span></div>
          <p></p>
        </div>
      </div>
      <form id="classboard-form" class="classboard-form">
        <label>班級碼
          <input id="classboard-class-code" name="classCode" type="text" inputmode="text" maxlength="12" pattern="[A-Za-z0-9]{4,12}" autocomplete="off" required placeholder="例如 701A">
        </label>
        <label>科學暱稱（自願公開）
          <input id="classboard-nick" name="nick" type="text" maxlength="12" autocomplete="off" required placeholder="例如 好奇的電子01">
        </label>
        <p class="classboard-privacy-note">不填暱稱就不會出現在個人貢獻列表，也不收集真名。</p>
        <div class="classboard-actions">
          <button id="classboard-refresh" class="classboard-refresh" type="button">只查看班級成果</button>
          <button id="classboard-submit" class="classboard-submit" type="submit">加入並更新我的貢獻</button>
        </div>
      </form>
      <p id="classboard-status" class="classboard-status" role="status" aria-live="polite"></p>
      <section class="classboard-members-section" aria-labelledby="classboard-members-title">
        <h3 id="classboard-members-title">自願公開的知識貢獻</h3>
        <ul id="classboard-members" class="classboard-members"></ul>
      </section>
    </section>`;
    document.body.appendChild(overlay);
    $('classboard-close').addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    $('classboard-refresh').addEventListener('click', refresh);
    $('classboard-form').addEventListener('submit', submitContribution);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !overlay.hidden) close();
    });
  }

  function setStatus(message, kind = '') {
    const node = $('classboard-status');
    if (!node) return;
    node.textContent = message || '';
    node.dataset.kind = kind;
  }

  function renderBoard(result) {
    const milestone = SciUiLogic.classMilestone(result.total);
    $('classboard-total').textContent = String(milestone.total);
    const milestoneEl = $('classboard-milestone');
    milestoneEl.hidden = false;
    milestoneEl.querySelector('span').style.width = `${milestone.pct}%`;
    milestoneEl.querySelector('p').textContent = `全班再精通 ${milestone.remaining} 個知識點，就一起抵達 ${milestone.target} 里程碑！`;
    const members = Array.isArray(result.members) ? result.members.slice(0, 50) : [];
    $('classboard-members').innerHTML = members.length
      ? members.map((member) => `<li class="classboard-member"><span>${esc(member.nick)}</span><strong>${cleanMastered(member.mastered)} 個</strong></li>`).join('')
      : '<li class="classboard-empty">還沒有同學自願公開貢獻；班級總量仍可一起累積。</li>';
  }

  async function refresh() {
    if (!current) return { ok: 0 };
    const classCode = cleanCode($('classboard-class-code')?.value);
    if (!CLASS_CODE.test(classCode)) {
      setStatus('請輸入 4–12 碼英文字母或數字的班級碼。', 'error');
      return { ok: 0 };
    }
    rememberCode(classCode);
    const query = new URLSearchParams({ classCode, subject: current.subject });
    const result = await request(`/api/classboard?${query}`, { method: 'GET' });
    if (!result.ok) {
      setStatus(OFFLINE_MESSAGE, 'offline');
      return result;
    }
    renderBoard(result);
    return result;
  }

  async function submitContribution(event) {
    event.preventDefault();
    if (!current) return;
    const classCode = cleanCode($('classboard-class-code').value);
    const nick = $('classboard-nick').value.trim();
    if (!CLASS_CODE.test(classCode)) {
      setStatus('請輸入 4–12 碼英文字母或數字的班級碼。', 'error');
      return;
    }
    if (!nick) {
      setStatus('若要自願公開貢獻，請填入科學暱稱。', 'error');
      return;
    }
    $('classboard-submit').disabled = true;
    setStatus('正在把你的精通成果加入班級總量…');
    const result = await request('/api/classboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op: 'submit', classCode, subject: current.subject, nick, mastered: current.mastered,
      }),
    });
    $('classboard-submit').disabled = false;
    if (!result.ok) {
      setStatus(result.error === 'offline' ? OFFLINE_MESSAGE : '暫時無法更新，請檢查班級碼與科學暱稱後再試。', 'offline');
      return;
    }
    rememberCode(classCode);
    setStatus(`你為班級點亮了 ${current.mastered} 個知識點！`, 'success');
    await refresh();
  }

  async function open(opts = {}) {
    if (!SUBJECTS.has(opts.subject)) return { ok: 0, error: 'junior-high-only' };
    current = {
      subject: opts.subject,
      mastered: cleanMastered(opts.mastered),
      apiBase: opts.apiBase,
    };
    ensureOverlay();
    previousFocus = document.activeElement;
    $('classboard-class-code').value = rememberedCode();
    $('classboard-overlay').hidden = false;
    $('classboard-panel').focus();
    setStatus('');
    if (rememberedCode()) await refresh();
    else {
      $('classboard-total').textContent = '—';
      $('classboard-members').innerHTML = '<li class="classboard-empty">輸入班級碼，就能看見全班一起累積的成果。</li>';
    }
    return { ok: 1 };
  }

  function close() {
    const overlay = $('classboard-overlay');
    if (overlay) overlay.hidden = true;
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }

  function mount(opts = {}) { return open(opts); }

  return { mount, open, close, refresh };
})();

window.SciClassBoard = SciClassBoard;
