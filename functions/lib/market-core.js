// 科學市集純邏輯核心：驗貨白名單、價格帶、開市時窗與 HMAC 簽章。
// 零 I/O；Node 與 Cloudflare Workers 共用。

export const ITEM_CATALOG = {
  energy: { name: '能量飲', emoji: '⚡', kind: 'tool', base: 30 },
  magnifier: { name: '放大鏡', emoji: '🔍', kind: 'tool', base: 40 },
  goggles: { name: '護目鏡', emoji: '🥽', kind: 'tool', base: 60 },
};

export const TIER_LABEL = { bronze: '銅品', silver: '銀品', gold: '金品' };

export const THANKS_CARDS = [
  { id: 1, text: '謝謝你！這件寶物我會好好用在實驗裡！' },
  { id: 2, text: '市集有你真好，交易愉快！' },
  { id: 3, text: '價格真公道，讚！' },
  { id: 4, text: '正好缺這件，救了我這一場！' },
  { id: 5, text: '祝你下次對戰旗開得勝！' },
  { id: 6, text: '同班的科學夥伴，就是可靠！' },
  { id: 7, text: '你的基地一定蓋得很棒！' },
  { id: 8, text: '一起成為科學英雄吧！' },
];

export function tierOf(itemId) {
  const item = ITEM_CATALOG[itemId];
  if (!item) return null;
  return item.base < 80 ? 'bronze' : item.base <= 200 ? 'silver' : 'gold';
}

export function bandOf(itemId) {
  const item = ITEM_CATALOG[itemId];
  return item ? [Math.ceil(item.base * 0.5), Math.floor(item.base * 1.5)] : null;
}

export function validPrice(itemId, price) {
  const band = bandOf(itemId);
  return !!band && Number.isInteger(price) && price >= band[0] && price <= band[1];
}

export function isMarketOpen(nowMs = Date.now()) {
  return new Date(nowMs + 8 * 3600 * 1000).getUTCDay() === 5;
}

export function nextOpenText(nowMs = Date.now()) {
  const taipei = new Date(nowMs + 8 * 3600 * 1000);
  let days = (5 - taipei.getUTCDay() + 7) % 7;
  if (days === 0 && !isMarketOpen(nowMs)) days = 7;
  const friday = new Date(taipei.getTime() + days * 86400000);
  return `每週五全天開市，下次開市：${friday.getUTCMonth() + 1}/${friday.getUTCDate()}（週五）`;
}

export function weekKey(nowMs = Date.now()) {
  const taipei = new Date(nowMs + 8 * 3600 * 1000);
  const back = (taipei.getUTCDay() - 5 + 7) % 7;
  return new Date(taipei.getTime() - back * 86400000).toISOString().slice(0, 10);
}

export function dayStr(nowMs = Date.now()) {
  return new Date(nowMs + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

const BAD_WORDS = /笨蛋|白癡|白痴|智障|廢物|去死|王八蛋|三小|幹你|靠北|媽的|滾蛋|垃圾|腦殘|fuck|shit|bitch|asshole|idiot|stupid/i;

export function okNick(value) {
  if (typeof value !== 'string') return false;
  const nick = value.trim();
  return nick.length >= 1 && nick.length <= 12 && !/[<>&"']/.test(nick) && !BAD_WORDS.test(nick);
}

export function okClass(value) {
  return typeof value === 'string' && /^[\w一-鿿]{1,20}$/.test(value);
}

export async function sigOf(payload, secret) {
  const canonical = JSON.stringify({
    itemId: payload.itemId,
    price: payload.price,
    seller: payload.seller,
    id: payload.id,
  });
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signed = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(canonical));
  return [...new Uint8Array(signed)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}
