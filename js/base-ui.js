// 科學基地 UI：場景渲染與互動。資料規則全在 js/base-store.js；本檔只管 DOM。
// sceneHtml/wallHtml 為純函式（node vm 可單測），頂層不碰 document，缺圖一律 onerror 換 emoji 佔位。
const SciBaseUI = (() => {
  const IMG_DIR = 'assets/base';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const fallback = (emoji) => {
    const safeEmoji = emoji || '✨';
    return `onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${safeEmoji}',className:'sb-emoji'}))"`;
  };

  // MAIN_EMOJI 只是圖片載入失敗時的 fallback；高階主樓的逐階差異由 data-stage CSS 呈現。
  const MAIN_EMOJI = ['⛺', '🏠', '🏢', '🏛️', '🏰', '🏯', '🌆', '🏙️', '🛰️', '🚀', '🌠', '🌌', '🔭'];
  const PAV_EMOJI = { nature: '🌱', biology: '🔬', chemphys: '⚗️', earth: '🔭' };

  function sceneHtml(view) {
    const m = view.main;
    const mainStage = Math.max(0, Math.floor(Number(m.stage) || 0));
    const mainArtStage = Math.min(mainStage + 1, 5);
    const mainEmoji = MAIN_EMOJI[Math.min(mainStage, MAIN_EMOJI.length - 1)] || MAIN_EMOJI.at(-1);
    const main =
      `<button class="sb-main" type="button" data-target="main" data-stage="${mainStage}"` +
      ` aria-label="基地主樓・${esc(m.name)}（點擊掛門牌）">` +
      `<img src="${IMG_DIR}/main-s${mainArtStage}.png" alt="" loading="lazy" ${fallback(mainEmoji)}>` +
      `<span class="sb-plaque">${esc(view.plaques.main)}</span>` +
      `<span class="sb-main-rank">${esc(m.name)}・精通 ${m.masteredCount} 張${m.next ? `（再 ${m.next.at - m.masteredCount} 張升「${esc(m.next.name)}」）` : '（已達最高階）'}</span>` +
      `</button>`;

    const pavs = view.pavilions.map((p) =>
      `<button class="sb-pav sb-pav--${p.key}" type="button" data-target="${p.key}" data-tier="${p.tier}"` +
      ` aria-label="${esc(p.name)}・${esc(p.tierName)} ${p.pct}%（點擊掛門牌）">` +
      `<img src="${IMG_DIR}/pav-${p.key}-t${p.tier + 1}.png" alt="" loading="lazy" ${fallback(PAV_EMOJI[p.key])}>` +
      `<span class="sb-plaque sb-plaque--small">${esc(view.plaques[p.key])}</span>` +
      `<span class="sb-pav-meta">${esc(p.tierName)}・${p.pct}%</span></button>`,
    ).join('');

    const decors = view.decorations.map((d) =>
      `<div class="sb-decor grade-${d.grade}" data-decor="${esc(d.id)}" data-subject="${esc(d.subject)}"` +
      ` style="left:${d.x}%;top:${d.y}%" role="button" tabindex="0"` +
      ` aria-label="${esc(d.term)}・${esc(d.theme)}・${esc(d.gradeName)}（可拖曳，點擊換樣式）">` +
      `<img src="${IMG_DIR}/decor-${d.subject}-${d.styleIdx}.png" alt="" draggable="false" loading="lazy" ${fallback(d.themeEmoji)}></div>`,
    ).join('');

    const motto = view.motto ? `<span class="sb-motto">「${esc(view.motto.text)}」</span>` : '';
    return `<div class="sb-bg"><img src="${IMG_DIR}/bg-base.jpg" alt="" ${fallback('🌌')}></div>` +
      `<span class="sb-balance">💠 ${view.balance}</span>${motto}${main}${pavs}${decors}`;
  }

  function rankWallHtml(state) {
    const peak = Math.max(state?.rank?.peak || 0, state?.rank?.pts || 0);
    const badges = SciBattle.RANKS.map((rank) =>
      `<button type="button" class="sb-rank-badge${peak >= rank.at ? ' is-lit' : ''}" aria-pressed="${peak >= rank.at}">` +
      `<span>${rank.ico}</span><b>${esc(rank.name)}</b><small>${peak >= rank.at ? '已點亮' : `${rank.at} 分解鎖`}</small></button>`,
    ).join('');
    const titles = Object.entries(state?.rtSeason?.titles || {});
    return `<h3 class="sb-sub">段位徽章牆</h3><div class="sb-rank-wall">${badges}</div>` +
      (titles.length ? `<h4>賽季稱號</h4><ul class="sb-season-titles">${titles.map(([season, title]) => `<li>${esc(season)}・${esc(title)}</li>`).join('')}</ul>` : '');
  }

  function wallHtml(entries, state) {
    return `<h3 class="sb-sub">基地成就牆</h3><div class="sb-wall-grid">` +
      entries.map((e) =>
        `<div class="sb-wall-item"><span class="sb-wall-icon">${e.icon}</span>` +
        `<b>${esc(e.label)}</b><span>${esc(e.value)}</span></div>`,
      ).join('') + `</div>${state ? rankWallHtml(state) : ''}`;
  }

  function loreWallHtml(cards, state) {
    const unlocked = new Set(state?.stats?.scienceLore || []);
    const items = cards.map((card) => unlocked.has(card.id)
      ? `<article class="sb-lore-card"><span>${esc(card.icon)}</span><h4>${esc(card.title)}</h4>` +
        `<b>${esc(card.who)}・${esc(card.year)}</b><p>${esc(card.blurb)}</p></article>`
      : '<article class="sb-lore-card is-locked" aria-label="尚未解鎖的科學史卡"><span aria-hidden="true">❓</span><h4>尚未解鎖</h4><p>精通對應單元後，故事就會在這裡現身。</p></article>',
    ).join('');
    return `<h3 class="sb-sub">科學史圖鑑</h3><div class="sb-lore-grid">${items || '<p>圖鑑準備中。</p>'}</div>`;
  }

  // 純函式：樣式面板／門牌面板／慶典卡
  function stylePanelHtml(subjectKey, baseState, balance) {
    const shop = SciBaseStore.STYLE_SHOP[subjectKey] || [];
    const saved = (baseState.styles && baseState.styles[subjectKey]) || { owned: [0], active: 0 };
    const owned = Array.isArray(saved.owned) ? saved.owned : [0];
    const active = SciBaseStore.styleOf(baseState, subjectKey);
    return `<div class="sb-style-balance">目前晶能：💠 ${balance}</div><div class="sb-style-list">` +
      shop.map((s, i) => {
        const status = i === active ? '使用中' : (owned.includes(i) ? '已擁有' : `💠 ${s.cost}`);
        return `<button class="sb-style-opt${i === active ? ' is-active' : ''}" type="button" data-style="${i}">` +
          `<img src="${IMG_DIR}/decor-${subjectKey}-${i}.png" alt="" ${fallback('🎁')}>` +
          `<b>${esc(s.name)}</b><span>${status}</span></button>`;
      }).join('') + `</div>`;
  }

  function plaquePanelHtml(targetId, currentText) {
    const words = SciBaseStore.PLAQUE_BANK.map((w) =>
      `<button class="sb-word" type="button" data-word="${w.id}">${esc(w.w)}</button>`,
    ).join('');
    const motto = targetId === 'main'
      ? `<h3 class="sb-sub">研究銘言</h3><div class="sb-motto-list">` +
        `<button class="sb-motto-opt" type="button" data-motto="">不掛銘言</button>` +
        SciBaseStore.MOTTO_BANK.map((m) =>
          `<button class="sb-motto-opt" type="button" data-motto="${m.id}">${esc(m.text)}</button>`,
        ).join('') + `</div>`
      : '';
    return `<div class="sb-preview">門牌預覽：<b id="sb-plaque-preview">${esc(currentText)}</b>` +
      `<button id="sb-plaque-clear" class="base-tool-btn" type="button">清空重選</button></div>` +
      `<p class="base-hint">從詞庫選 1–2 個詞組成門牌（不開放自由輸入）。</p>` +
      `<div class="sb-word-bank">${words}</div>${motto}` +
      `<div class="sb-panel-actions"><button id="sb-plaque-save" class="base-tool-btn" type="button">掛上門牌</button>` +
      `<button id="sb-panel-close" class="base-tool-btn" type="button">關閉</button></div>`;
  }

  function celebrationHtml(celeb) {
    const icon = celeb.type === 'stage' ? '🏗️' : celeb.type === 'pav' ? '🏛️' : '🥇';
    return `<div class="sb-epic-card" role="dialog" aria-modal="true" aria-label="基地慶典" tabindex="-1">` +
      `<div class="sb-epic-icon">${icon}</div>` +
      `<h3>${esc(celeb.title)}</h3><p>${esc(celeb.text)}</p>` +
      `<button class="base-tool-btn" id="sb-epic-close" type="button">繼續建設</button></div>`;
  }

  const $ = (id) => document.getElementById(id);
  let getState = () => null;
  let getTermsBySubject = () => null;
  let getLore = () => [];
  let base = null;
  let showingWall = false;
  let plaquePick = [];

  function view() { return SciBaseStore.getBaseView(getState(), getTermsBySubject(), base); }
  function renderScene() { $('base-scene').innerHTML = sceneHtml(view()); }

  function closePanel() { document.getElementById('sb-panel')?.remove(); }

  function openPanel(innerHtml, bind) {
    closePanel();
    const panel = document.createElement('div');
    panel.className = 'sb-panel';
    panel.id = 'sb-panel';
    panel.innerHTML = innerHtml;
    if (!panel.querySelector('#sb-panel-close')) {
      const closeBtn = document.createElement('button');
      closeBtn.id = 'sb-panel-close';
      closeBtn.className = 'base-tool-btn';
      closeBtn.type = 'button';
      closeBtn.textContent = '關閉';
      panel.appendChild(closeBtn);
    }
    panel.querySelector('#sb-panel-close').addEventListener('click', closePanel);
    $('base-scene').appendChild(panel);
    bind(panel);
  }

  function pctOf(scene, ev) {
    const r = scene.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * 100, y: ((ev.clientY - r.top) / r.height) * 100 };
  }

  function bindDrag(scene) {
    let drag = null;
    scene.addEventListener('pointerdown', (ev) => {
      const el = ev.target.closest('.sb-decor');
      if (!el) return;
      drag = { el, id: el.dataset.decor, subject: el.dataset.subject, moved: false };
      el.classList.add('is-dragging');
      el.setPointerCapture(ev.pointerId);
    });
    scene.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      drag.moved = true;
      const p = pctOf(scene, ev);
      drag.el.style.left = `${Math.max(2, Math.min(98, p.x))}%`;
      drag.el.style.top = `${Math.max(2, Math.min(98, p.y))}%`;
    });
    scene.addEventListener('pointerup', (ev) => {
      if (!drag) return;
      const { el, id, subject, moved } = drag;
      el.classList.remove('is-dragging');
      drag = null;
      if (moved) {
        const p = pctOf(scene, ev);
        if (SciBaseStore.placeDecor(base, id, p.x, p.y).ok) SciBaseStore.saveBase(base);
      } else {
        openPanel(stylePanelHtml(subject, base, SciEconomy.getBalance()), (panel) => bindStylePanel(panel, subject));
      }
    });
  }

  function bindStylePanel(panel, subjectKey) {
    panel.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-style]');
      if (!btn) return;
      const r = SciBaseStore.buyStyle(base, subjectKey, Number(btn.dataset.style));
      if (!r.ok) { alert(r.msg); return; }
      SciBaseStore.saveBase(base);
      renderScene();
      openPanel(stylePanelHtml(subjectKey, base, SciEconomy.getBalance()), (next) => bindStylePanel(next, subjectKey));
    });
  }

  function bindPlaquePanel(panel, targetId) {
    plaquePick = [];
    panel.addEventListener('click', (ev) => {
      const word = ev.target.closest('[data-word]');
      if (word) {
        if (plaquePick.length < SciBaseStore.PLAQUE_MAX) plaquePick.push(word.dataset.word);
        const selected = SciBaseStore.PLAQUE_BANK.filter((w) => plaquePick.includes(w.id));
        panel.querySelector('#sb-plaque-preview').textContent = selected.map((w) => w.w).join('');
        return;
      }
      if (ev.target.closest('#sb-plaque-clear')) {
        plaquePick = [];
        panel.querySelector('#sb-plaque-preview').textContent = '（重新選詞）';
        return;
      }
      if (ev.target.closest('#sb-plaque-save')) {
        if (plaquePick.length < SciBaseStore.PLAQUE_MIN) return;
        if (SciBaseStore.setPlaque(base, targetId, plaquePick).ok) {
          SciBaseStore.saveBase(base);
          renderScene();
        }
        return;
      }
      const motto = ev.target.closest('[data-motto]');
      if (motto && SciBaseStore.setMotto(base, motto.dataset.motto || null).ok) {
        SciBaseStore.saveBase(base);
        renderScene();
      }
    });
  }

  function playCelebrations() {
    const pend = SciBaseStore.pendingCelebrations(getState(), getTermsBySubject(), base);
    if (!pend.length) return;
    const celeb = pend[0];
    const prevFocus = document.activeElement;
    const d = document.createElement('div');
    d.className = 'sb-epic';
    d.innerHTML = celebrationHtml(celeb);
    document.body.appendChild(d);
    const done = () => {
      document.removeEventListener('keydown', onKey);
      d.remove();
      SciBaseStore.markCelebrated(base, celeb.id);
      SciBaseStore.saveBase(base);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      playCelebrations();
    };
    const onKey = (e) => { if (e.key === 'Escape') done(); };
    document.addEventListener('keydown', onKey);
    d.querySelector('.sb-epic-card').focus();
    d.querySelector('#sb-epic-close').onclick = done;
  }

  function toggleWall() {
    showingWall = !showingWall;
    if (showingWall) {
      $('base-scene').innerHTML = wallHtml(SciBaseStore.getWall(getState(), base), getState()) + loreWallHtml(getLore(), getState());
      $('base-wall-btn').textContent = '回場景';
    } else {
      renderScene();
      $('base-wall-btn').textContent = '成就牆';
    }
  }

  function open() {
    const state = getState();
    if (!state || !getTermsBySubject()) return;
    base = SciBaseStore.loadBase();
    if (!SciBaseStore.isSeeded(base)) {
      SciBaseStore.seedCelebrated(state, getTermsBySubject(), base);
      SciBaseStore.saveBase(base);
    }
    renderScene();
    $('base-overlay').hidden = false;
    document.body.classList.add('base-open');
    showingWall = false;
    $('base-wall-btn').textContent = '成就牆';
    playCelebrations();
  }

  function close() {
    $('base-overlay').hidden = true;
    document.body.classList.remove('base-open');
  }

  function refresh() {
    const overlay = $('base-overlay');
    if (!overlay || overlay.hidden) return;
    base = SciBaseStore.loadBase();
    if (showingWall) {
      $('base-scene').innerHTML = wallHtml(SciBaseStore.getWall(getState(), base), getState()) + loreWallHtml(getLore(), getState());
    } else {
      renderScene();
    }
  }

  function init(opts) {
    getState = opts.getState;
    getTermsBySubject = opts.getTermsBySubject;
    getLore = opts.getLore || (() => []);
    $('btn-base').addEventListener('click', open);
    $('base-close').addEventListener('click', close);
    bindDrag($('base-scene'));
    $('base-scene').addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-target]');
      if (t && SciBaseStore.PLAQUE_TARGETS.includes(t.dataset.target)) {
        const targetId = t.dataset.target;
        openPanel(plaquePanelHtml(targetId, view().plaques[targetId]), (p) => bindPlaquePanel(p, targetId));
      }
    });
    $('base-wall-btn').addEventListener('click', toggleWall);
    $('base-donate').addEventListener('click', () => {
      const result = SciBaseStore.donateResearch(base);
      if (!result.ok) { alert(result.msg); return; }
      SciBaseStore.saveBase(base);
      if (showingWall) $('base-scene').innerHTML = wallHtml(SciBaseStore.getWall(getState(), base), getState()) + loreWallHtml(getLore(), getState());
      else renderScene();
    });
    $('base-reset').addEventListener('click', () => {
      if (confirm('把所有裝飾放回預設位置嗎？裝飾不會消失，只是回到原位。')) {
        SciBaseStore.resetPlacements(base);
        SciBaseStore.saveBase(base);
        renderScene();
      }
    });
  }

  return { sceneHtml, wallHtml, loreWallHtml, rankWallHtml, stylePanelHtml, plaquePanelHtml, celebrationHtml, init, refresh };
})();
