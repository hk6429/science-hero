// 科學市集 UI：只透過 SciMarketStore 與 SHAPI；不直接存取市集 localStorage、不裸 fetch。
const SciMarketUI = (() => {
  let walletBalance = 0;
  let pendingBuy = null;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const callMkt = async (body) => {
    try { return await SHAPI.call('/api/mkt', body); } catch { return { ok: 0, error: 'offline' }; }
  };
  const status = (message) => { if ($('mkt-status')) $('mkt-status').textContent = message || ''; };

  function rulesHtml() {
    const rows = Object.entries(SciMarketStore.ITEM_CATALOG).map(([id, item]) => {
      const [low, high] = SciMarketStore.bandOf(id);
      return `<tr><td>${item.emoji} ${esc(item.name)}</td><td>${esc(SciMarketStore.TIER_LABEL[SciMarketStore.tierOf(id)])}</td><td>${item.base}</td><td>${low}–${high}</td></tr>`;
    }).join('');
    return `<p><strong>晶能不可兌換現實金錢或禮物。</strong>本站沒有真錢加值。</p>
      <p>精靈與稚靈是夥伴，不是商品；市集只交易實驗道具。</p>
      <ul><li>每週五全天開市；平日可瀏覽、領款與下架。</li><li>每天限購 3 件、上架 3 筆。</li><li>成交價就是掛單價，沒有殺價或隱藏折扣；賣出收取 10% 晶能稅。</li><li>錢包晶能存在伺服器，換裝置也在。</li></ul>
      <table><thead><tr><th>物品</th><th>品階</th><th>原價</th><th>掛單價格帶</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function stallHtml() {
    const effects = { energy: '開局 +10 HP', magnifier: '本場一次排除錯誤選項', goggles: '本場一次答錯保留連擊' };
    return Object.entries(SciMarketStore.ITEM_CATALOG).map(([id, item]) => `<article class="mkt-stall-card mkt-card mkt-${SciMarketStore.tierOf(id)}">
      <span class="mkt-item-face">${item.emoji}</span><strong>${esc(item.name)}</strong>
      <small>${esc(effects[id])}・原價 ${item.base} 晶能</small>
      <button type="button" data-mkt-direct="${id}">直購</button>
    </article>`).join('');
  }

  function listingHtml(list, canTrade) {
    if (!list.length) return '<p class="mkt-empty">目前沒有掛單，先逛逛直購攤位吧。</p>';
    return `<div class="mkt-grid">${list.map((record) => {
      const item = SciMarketStore.ITEM_CATALOG[record.itemId];
      if (!item) return '';
      const tier = SciMarketStore.tierOf(record.itemId);
      return `<article class="mkt-card mkt-${tier}"><span class="mkt-item-face">${item.emoji}</span><strong>${esc(item.name)}</strong>
        <span>${record.price} 晶能</span><small>賣家：${esc(record.seller)}・${esc(SciMarketStore.TIER_LABEL[tier])}</small>
        ${canTrade ? `<button type="button" data-mkt-buy="${esc(record.id)}" data-seller="${esc(record.seller)}" data-price="${Number(record.price)}" data-item="${esc(record.itemId)}">購買</button>` : ''}</article>`;
    }).join('')}</div>`;
  }

  async function refreshTopbar(info) {
    $('mkt-topbar').innerHTML = `<span>本機晶能 <b>${SciEconomy.getBalance()}</b></span><span>市集錢包 <b id="mkt-wallet">--</b></span>
      <span class="${SciMarketStore.isMarketOpen() ? 'mkt-open' : 'mkt-closed'}">${SciMarketStore.isMarketOpen() ? '🔥 開市中' : esc(SciMarketStore.nextOpenText())}</span>`;
    if (!info) return;
    const result = await callMkt({ op: 'wallet', nick: info.nick, classCode: info.classCode });
    if (result.ok && $('mkt-wallet')) {
      walletBalance = Number(result.wallet) || 0;
      $('mkt-wallet').textContent = walletBalance;
    }
  }

  async function loadLists(info) {
    if (!info) {
      $('mkt-class-pane').innerHTML = '<p>先到即時對戰的全班戰況牆報到，才能進班級市集交易。</p>';
    } else {
      const result = await callMkt({ op: 'list', classCode: info.classCode, scope: 'class' });
      $('mkt-class-pane').innerHTML = result.ok ? listingHtml(result.list || [], SciMarketStore.isMarketOpen()) : '<p>📡 連不上市集伺服器，稍後再試。</p>';
    }
    const globalResult = await callMkt({ op: 'list', scope: 'pub' });
    $('mkt-pub-pane').innerHTML = globalResult.ok ? listingHtml(resultList(globalResult), !!info && SciMarketStore.isMarketOpen()) : '<p>📡 連不上市集伺服器，稍後再試。</p>';
  }

  function resultList(result) { return Array.isArray(result.list) ? result.list : []; }

  async function loadSocial(info) {
    if (!info) {
      $('mkt-stars-pane').innerHTML = '<p>先到全班戰況牆報到，就能查看班級集市達人。</p>';
    } else {
      const result = await callMkt({ op: 'stars', classCode: info.classCode });
      if (!result.ok) $('mkt-stars-pane').innerHTML = '<p>📡 排行暫時載不出來。</p>';
      else {
        const top = (result.top || []).slice(0, 5);
        $('mkt-stars-pane').innerHTML = top.length
          ? `<ol class="mkt-stars">${top.map((entry, index) => `<li>${index === 0 ? '🏆 ' : ''}<strong>${esc(entry.name)}</strong>・成交 ${Number(entry.deals) || 0} 筆</li>`).join('')}</ol>`
          : '<p>本週還沒有人成交——當第一個吧！</p>';
      }
    }
    const ever = SciMarketStore.getEver();
    $('mkt-ever-pane').innerHTML = ever.length ? ever.map((entry) => {
      const item = SciMarketStore.ITEM_CATALOG[entry.itemId];
      const date = new Date(entry.ts).toLocaleDateString('zh-TW');
      return `<article class="mkt-ever mkt-card mkt-${SciMarketStore.tierOf(entry.itemId)}"><span>${item?.emoji || '📦'} ${esc(item?.name || entry.itemId)}</span>
        <strong>${entry.dir === 'sold' ? `售予 ${esc(entry.peer)}` : `購自 ${esc(entry.peer)}`}</strong><small>${esc(date)}</small></article>`;
    }).join('') : '<p>完成第一筆交易，這裡就會開始寫你的市集故事。</p>';
  }

  function priceOptions(itemId) {
    const item = SciMarketStore.ITEM_CATALOG[itemId];
    const band = SciMarketStore.bandOf(itemId);
    if (!item || !band) return '';
    const values = [];
    for (let value = band[0]; value <= band[1]; value += 5) values.push(value);
    if (!values.includes(item.base)) values.push(item.base);
    return [...new Set(values)].sort((a, b) => a - b)
      .map((value) => `<option value="${value}" ${value === item.base ? 'selected' : ''}>${value} 晶能</option>`).join('');
  }

  function renderClaims(info) {
    if (!info) { $('mkt-claims-list').innerHTML = '<p>報到後才能管理掛單。</p>'; return; }
    const claims = SciMarketStore.getClaims();
    $('mkt-claims-list').innerHTML = claims.length ? claims.map((claim) => {
      const item = SciMarketStore.ITEM_CATALOG[claim.itemId];
      return `<div class="mkt-claim"><span>${item?.emoji || '📦'} ${esc(item?.name || claim.itemId)}・${Number(claim.price)} 晶能</span>
        <button type="button" data-mkt-claim="${esc(claim.id)}">檢查／領款</button>
        <button type="button" data-mkt-cancel="${esc(claim.id)}">下架拿回</button></div>`;
    }).join('') : '<p class="mkt-empty">目前沒有待處理掛單。</p>';
  }

  function renderTradePanels(info) {
    const disabled = !info;
    $('mkt-wallet-actions').hidden = disabled;
    $('mkt-sell').hidden = disabled || !SciMarketStore.isMarketOpen();
    if (disabled) {
      renderClaims(null);
      return;
    }
    const inventory = SciMarketStore.getInv();
    const options = Object.entries(SciMarketStore.ITEM_CATALOG)
      .filter(([id]) => inventory[id] > 0)
      .map(([id, item]) => `<option value="${id}">${item.emoji} ${esc(item.name)} ×${inventory[id]}</option>`).join('');
    $('mkt-sell-item').innerHTML = options || '<option value="">背包目前沒有可上架物品</option>';
    $('mkt-sell-price').innerHTML = options ? priceOptions($('mkt-sell-item').value) : '';
    renderClaims(info);
  }

  async function open() {
    $('mkt-overlay').hidden = false;
    $('mkt-rules-body').innerHTML = rulesHtml();
    $('mkt-stall').innerHTML = stallHtml();
    const info = SciMarketStore.classInfo();
    renderTradePanels(info);
    await Promise.all([refreshTopbar(info), loadLists(info), loadSocial(info)]);
  }
  async function refresh() {
    if ($('mkt-overlay') && !$('mkt-overlay').hidden) await open();
  }
  function close() { $('mkt-overlay').hidden = true; }
  function switchTab(name) {
    ['class', 'pub', 'stars', 'ever'].forEach((key) => { $(`mkt-${key}-pane`).hidden = key !== name; });
  }
  function boot() {
    if (!$('btn-market') || !$('mkt-overlay')) return;
    $('btn-market').addEventListener('click', open);
    $('mkt-close').addEventListener('click', close);
    $('mkt-overlay').addEventListener('click', (event) => { if (event.target === $('mkt-overlay')) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('mkt-overlay').hidden) close(); });
    $('mkt-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-mkt-tab]');
      if (button) switchTab(button.dataset.mktTab);
    });
    $('mkt-stall').addEventListener('click', (event) => {
      const button = event.target.closest('[data-mkt-direct]');
      if (!button) return;
      const result = SciMarketStore.buyDirect(button.dataset.mktDirect);
      status(result.ok ? '直購成功，道具已放進背包！' : (result.msg || '晶能不足'));
      refreshTopbar(SciMarketStore.classInfo());
    });
    $('mkt-sell-item').addEventListener('change', () => { $('mkt-sell-price').innerHTML = priceOptions($('mkt-sell-item').value); });
    $('mkt-sell-submit').addEventListener('click', async () => {
      const info = SciMarketStore.classInfo();
      const itemId = $('mkt-sell-item').value;
      if (!info || !itemId || !SciMarketStore.isMarketOpen()) { status('市集只在每週五開市。'); return; }
      const price = Number($('mkt-sell-price').value);
      const result = await callMkt({ op: 'post', itemId, price, seller: info.nick, classCode: info.classCode, pub: $('mkt-sell-pub').checked ? 1 : 0 });
      if (!result.ok) { status(result.error || '上架失敗'); return; }
      const removed = SciMarketStore.removeItem(itemId);
      if (!removed.ok) { status('背包數量不同步，請勿重複操作並重新整理。'); return; }
      SciMarketStore.addClaim({ id: result.id, claimKey: result.claimKey, itemId, price });
      status('已上架！賣出後回來領貨款（收 10% 稅）。');
      renderTradePanels(info);
      loadLists(info);
    });
    $('mkt-overlay').addEventListener('click', async (event) => {
      const buy = event.target.closest('[data-mkt-buy]');
      if (buy) {
        const info = SciMarketStore.classInfo();
        if (!info || !SciMarketStore.isMarketOpen()) { status('今日僅供瀏覽——每週五全天開市。'); return; }
        if (SciMarketStore.buysToday() >= SciMarketStore.DAILY_BUY_CAP) { status('今天已買滿 3 件。'); return; }
        if (buy.dataset.seller === info.nick) { status('不能買自己的掛單。'); return; }
        if (walletBalance < Number(buy.dataset.price)) { status('市集錢包晶能不足，請先入金。'); return; }
        pendingBuy = { id: buy.dataset.mktBuy, seller: buy.dataset.seller, price: Number(buy.dataset.price), itemId: buy.dataset.item };
        $('mkt-buy-panel').hidden = false;
      }
      const claimButton = event.target.closest('[data-mkt-claim]');
      const cancelButton = event.target.closest('[data-mkt-cancel]');
      if (claimButton) await handleClaim(claimButton.dataset.mktClaim);
      if (cancelButton) await handleCancel(cancelButton.dataset.mktCancel);
    });
    $('mkt-card-choice').innerHTML += SciMarketStore.THANKS_CARDS.map((card) => `<option value="${card.id}">${esc(card.text)}</option>`).join('');
    $('mkt-buy-cancel').addEventListener('click', () => { pendingBuy = null; $('mkt-buy-panel').hidden = true; });
    $('mkt-buy-confirm').addEventListener('click', handleBuy);
    $('mkt-deposit').addEventListener('click', () => moveWallet('deposit'));
    $('mkt-withdraw').addEventListener('click', () => moveWallet('withdraw'));
  }

  async function handleBuy() {
    const info = SciMarketStore.classInfo();
    if (!info || !pendingBuy) return;
    const result = await callMkt({ op: 'buy', id: pendingBuy.id, nick: info.nick, classCode: info.classCode, cardId: Number($('mkt-card-choice').value) });
    if (!result.ok) { status(result.error || '購買失敗'); return; }
    SciMarketStore.grantItem(result.itemId);
    SciMarketStore.bumpBuys();
    SciMarketStore.recordEver({ itemId: result.itemId, dir: 'bought', peer: pendingBuy.seller, ts: Date.now() });
    walletBalance = result.wallet;
    status(`購買成功！${SciMarketStore.ITEM_CATALOG[result.itemId].name}已放進背包。`);
    pendingBuy = null;
    $('mkt-buy-panel').hidden = true;
    await open();
  }

  async function moveWallet(op) {
    const info = SciMarketStore.classInfo();
    if (!info) return;
    const amount = Number($('mkt-wallet-amount').value);
    if (op === 'deposit') {
      const paid = SciMarketStore.payLocal(amount);
      if (!paid.ok) { status(paid.msg || '本機晶能不足'); return; }
      const result = await callMkt({ op: 'deposit', nick: info.nick, classCode: info.classCode, amount });
      if (!result.ok) {
        SciMarketStore.refundLocal(amount);
        status(`${result.error || '入金失敗'}；晶能已原路退回。`);
        return;
      }
      walletBalance = result.wallet;
      status(`已入金 ${amount} 晶能。`);
    } else {
      const result = await callMkt({ op: 'withdraw', nick: info.nick, classCode: info.classCode, amount });
      if (!result.ok) { status(result.error || '出金失敗'); return; }
      SciMarketStore.settleToLocal(amount);
      walletBalance = result.wallet;
      status(`已出金 ${amount} 晶能到本機。`);
    }
    refreshTopbar(info);
  }

  async function handleClaim(id) {
    const info = SciMarketStore.classInfo();
    const claim = SciMarketStore.getClaims().find((entry) => entry.id === id);
    if (!info || !claim) return;
    const result = await callMkt({ op: 'claim', id, claimKey: claim.claimKey, classCode: info.classCode });
    if (result.ok) {
      SciMarketStore.removeClaim(id);
      SciMarketStore.recordEver({ itemId: claim.itemId, dir: 'sold', peer: result.buyer, ts: Date.now() });
      const card = SciMarketStore.THANKS_CARDS.find((entry) => entry.id === result.card);
      status(`+${result.crystals} 晶能已入市集錢包${card ? `；買家小卡：${card.text}` : ''}`);
      renderClaims(info);
      refreshTopbar(info);
    } else if (result.sold === 0) status('尚未售出，可繼續等待或下架拿回。');
    else if (/找不到掛單/.test(result.error || '')) { SciMarketStore.removeClaim(id); renderClaims(info); status('掛單已過期，本機紀錄已整理。'); }
    else status(result.error || '檢查失敗');
  }

  async function handleCancel(id) {
    const info = SciMarketStore.classInfo();
    const claim = SciMarketStore.getClaims().find((entry) => entry.id === id);
    if (!info || !claim) return;
    const result = await callMkt({ op: 'cancel', id, claimKey: claim.claimKey });
    if (!result.ok) { status(result.error || '下架失敗'); return; }
    SciMarketStore.grantItem(result.itemId);
    SciMarketStore.removeClaim(id);
    status('已下架，物品回到背包；不收手續費。');
    renderTradePanels(info);
    loadLists(info);
  }

  return { boot, open, close, refresh, callMkt, rulesHtml, stallHtml, listingHtml };
})();

document.addEventListener('DOMContentLoaded', SciMarketUI.boot);
