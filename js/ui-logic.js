// 首頁 UI 的純邏輯；保持無 DOM 依賴，可由 Node 直接測試。
const SciUiLogic = (() => {
  function moreToolsDefaultOpen() {
    return false;
  }

  function restCardHtml() {
    return `<div class="card">
      <p>今天練到這裡很棒了，休息一下吧！想再練的時候隨時回來。</p>
      <div class="btn-row rest-cta-row">
        <button class="btn btn-secondary" type="button" data-rest-action="weak">看今日弱點</button>
        <button class="btn btn-secondary" type="button" data-rest-action="subject">換一科</button>
        <button class="btn btn-primary" type="button" data-rest-action="restart">再練一輪</button>
      </div>
    </div>`;
  }

  function resolveInitialSubject(paramSubject, availableSubjects) {
    if (paramSubject && availableSubjects.includes(paramSubject)) return paramSubject;
    return availableSubjects.includes('nature') ? 'nature' : availableSubjects[0];
  }

  return { moreToolsDefaultOpen, restCardHtml, resolveInitialSubject };
})();
