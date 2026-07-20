// 跨子系統共用 API helper：即時對戰與科學市集皆經此呼叫後端。
const SHAPI = (() => {
  const API_ORIGIN = 'https://science-hero.pages.dev';
  const SAME_ORIGIN_HOSTS = ['science-hero.pages.dev', 'localhost', '127.0.0.1'];

  function apiBase(hostname) {
    return SAME_ORIGIN_HOSTS.includes(hostname) ? '' : API_ORIGIN;
  }

  function createApi({ fetchFn, hostname } = {}) {
    const doFetch = fetchFn || ((...args) => fetch(...args));
    const host = () => hostname || (typeof location !== 'undefined' ? location.hostname : '');
    return {
      base() { return apiBase(host()); },
      async call(path, body) {
        if (typeof path !== 'string' || !path.startsWith('/api/')) {
          throw new TypeError(`SHAPI.call path 必須以 /api/ 開頭：${path}`);
        }
        try {
          const response = await doFetch(apiBase(host()) + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
          });
          return await response.json();
        } catch {
          return { ok: 0, error: 'offline' };
        }
      },
    };
  }

  const api = createApi();
  return { API_ORIGIN, apiBase, createApi, call: api.call, base: api.base };
})();
