// 科學市集單一路由：所有持久化 key 僅使用 mkt: 命名空間。
import { kvFor } from '../lib/_kv.js';
import {
  tierOf, bandOf, validPrice, isMarketOpen, weekKey, dayStr,
  okNick, okClass, sigOf, TIER_LABEL,
} from '../lib/market-core.js';

const ORIGINS = new Set([
  'https://science-hero.pages.dev',
  'https://science-hero-hk6429.vercel.app',
  'https://science-hero.netlify.app',
  'http://localhost:8788',
  'http://localhost:8765',
]);
const ITEM_TTL = 7 * 86400;
const DAILY_POST_CAP = 3;
const DAILY_BUY_CAP = 3;
const DAILY_DEP_CAP = 100;
const TAX = 0.1;
const ITEM = (id) => `mkt:item:${id}`;
const ZCLASS = (classCode) => `mkt:z:c:${classCode}`;
const ZPUB = 'mkt:z:pub';
const WALLET = (classCode, nick) => `mkt:wallet:${classCode}:${nick}`;

const parse = (value) => {
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
};
const randHex = (bytes) => [...globalThis.crypto.getRandomValues(new Uint8Array(bytes))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const memberOf = (record) => JSON.stringify({
  id: record.id,
  itemId: record.itemId,
  seller: record.seller,
  price: record.price,
  ts: record.ts,
  pub: record.pub,
});

const getWallet = async (redis, classCode, nick) => Math.max(0, Math.floor(Number(await redis.get(WALLET(classCode, nick))) || 0));
const setWallet = (redis, classCode, nick, value) => redis.set(WALLET(classCode, nick), String(Math.max(0, Math.floor(value))));
const rosterKey = (classCode) => `rt:live:${classCode}:roster`;

async function inRoster(redis, ctx, classCode, nick) {
  if (ctx.roster) return ctx.roster.has(nick);
  if (!ctx.db) return true;
  return !!(await redis.hget(rosterKey(classCode), nick));
}

export async function mktOp(redis, body = {}, ctx = {}, nowMs = Date.now()) {
  const { op } = body;
  const open = ctx.forceOpen || isMarketOpen(nowMs);

  if (op === 'stars') {
    if (!okClass(body.classCode)) return { ok: 0, error: '班級代碼不合法' };
    const raw = await redis.zrange(`mkt:deals:${body.classCode}`, 0, 4, { rev: true, withScores: true });
    const top = [];
    for (let index = 0; index < raw.length; index += 2) {
      top.push({ name: raw[index], deals: Math.max(0, Math.floor(Number(raw[index + 1]) || 0)) });
    }
    return { ok: 1, top };
  }

  if (op === 'list') {
    const scope = body.scope === 'pub' ? 'pub' : 'class';
    if (scope === 'class' && !okClass(body.classCode)) return { ok: 0, error: '班級代碼不合法' };
    const raw = await redis.zrange(scope === 'pub' ? ZPUB : ZCLASS(body.classCode), 0, 49);
    return { ok: 1, list: raw.map(parse).filter(Boolean) };
  }

  if (op === 'wallet' || op === 'deposit' || op === 'withdraw') {
    const { nick, classCode } = body;
    if (!okNick(nick) || !okClass(classCode)) return { ok: 0, error: '參數不合法' };
    const cleanNick = nick.trim();
    const current = await getWallet(redis, classCode, cleanNick);
    if (op === 'wallet') return { ok: 1, wallet: current };
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount < 1) return { ok: 0, error: '金額不合法' };
    if (op === 'deposit') {
      if (!(await inRoster(redis, ctx, classCode, cleanNick))) {
        return { ok: 0, error: '請先在即時對戰的全班戰況牆報到，才能進市集交易' };
      }
      const depositKey = `mkt:dep:${classCode}:${cleanNick}:${dayStr(nowMs)}`;
      const deposited = Math.max(0, Math.floor(Number(await redis.get(depositKey))) || 0);
      if (deposited + amount > DAILY_DEP_CAP) {
        return { ok: 0, error: `單日入金上限 ${DAILY_DEP_CAP} 晶能（今天已入 ${deposited}）` };
      }
      await redis.set(depositKey, String(deposited + amount), { ex: 86400 });
      await setWallet(redis, classCode, cleanNick, current + amount);
      return { ok: 1, wallet: current + amount };
    }
    if (current < amount) return { ok: 0, error: `錢包只有 ${current} 晶能，不夠出金` };
    await setWallet(redis, classCode, cleanNick, current - amount);
    return { ok: 1, wallet: current - amount };
  }

  if (op === 'buy') {
    if (!open) return { ok: 0, error: '市集只在每週五開市，今天先逛逛吧' };
    const { id, nick, classCode } = body;
    if (typeof id !== 'string' || !okNick(nick) || !okClass(classCode)) return { ok: 0, error: '參數不合法' };
    const cleanNick = nick.trim();
    if (!(await inRoster(redis, ctx, classCode, cleanNick))) {
      return { ok: 0, error: '請先在即時對戰的全班戰況牆報到，才能進市集交易' };
    }
    const lockKey = `mkt:lock:${id}`;
    if (await redis.incr(lockKey, 30) > 1) return { ok: 0, error: '手慢一步，這件正被別人結帳中' };
    const fail = async (error) => {
      await redis.del(lockKey);
      return { ok: 0, error };
    };
    const record = parse(await redis.get(ITEM(id)));
    if (!record || record.sold) return fail('這件已被買走或下架了');
    if (record.seller === cleanNick) return fail('不能買自己的掛單');
    if (record.classCode !== classCode && !record.pub) return fail('這是別班市集的掛單');
    const expectedSig = await sigOf(record, ctx.secret);
    if (expectedSig !== record.sig) return fail('簽章不符，掛單作廢');
    const wallet = await getWallet(redis, classCode, cleanNick);
    if (wallet < record.price) return fail(`市集錢包晶能不足（現有 ${wallet}，需要 ${record.price}）——先入金再來`);
    const buysKey = `mkt:buys:${classCode}:${cleanNick}:${dayStr(nowMs)}`;
    const boughtToday = Math.max(0, Math.floor(Number(await redis.get(buysKey))) || 0);
    if (boughtToday >= DAILY_BUY_CAP) return fail('每日限購 3 件（把撿寶的樂趣留給明天）');
    await redis.incr(buysKey, 86400);
    const cardId = Number.isInteger(body.cardId) && body.cardId >= 1 && body.cardId <= 8 ? body.cardId : 0;
    await setWallet(redis, classCode, cleanNick, wallet - record.price);
    await redis.zrem(ZCLASS(record.classCode), memberOf(record));
    if (record.pub) await redis.zrem(ZPUB, memberOf(record));
    record.sold = 1;
    record.soldTs = nowMs;
    record.buyer = cleanNick;
    record.card = cardId;
    await redis.set(ITEM(id), JSON.stringify(record), { ex: ITEM_TTL });
    await redis.zincrby(`mkt:deals:${record.classCode}`, 1, record.seller);
    await redis.zincrby(`mkt:deals:${record.classCode}`, 1, cleanNick);
    return { ok: 1, itemId: record.itemId, price: record.price, wallet: wallet - record.price };
  }

  if (op === 'cancel') {
    const record = parse(await redis.get(ITEM(body.id)));
    if (!record || record.claimKey !== body.claimKey) return { ok: 0, error: '找不到掛單' };
    if (record.sold) return { ok: 0, error: '已售出，請領貨款' };
    await redis.zrem(ZCLASS(record.classCode), memberOf(record));
    if (record.pub) await redis.zrem(ZPUB, memberOf(record));
    await redis.del(ITEM(body.id));
    return { ok: 1, itemId: record.itemId };
  }

  if (op === 'claim') {
    const record = parse(await redis.get(ITEM(body.id)));
    if (!record || record.claimKey !== body.claimKey) return { ok: 0, error: '找不到掛單' };
    if (record.classCode !== body.classCode) return { ok: 0, error: '班級代碼不符' };
    if (!record.sold) return { ok: 0, sold: 0 };
    if (record.claimed) return { ok: 0, error: '貨款已領過' };
    const crystals = Math.floor(record.price * (1 - TAX));
    const wallet = await getWallet(redis, record.classCode, record.seller);
    await setWallet(redis, record.classCode, record.seller, wallet + crystals);
    record.claimed = 1;
    await redis.set(ITEM(body.id), JSON.stringify(record), { ex: ITEM_TTL });
    return { ok: 1, crystals, buyer: record.buyer || '', card: record.card || 0, wallet: wallet + crystals };
  }

  if (op === 'post') {
    if (!open) return { ok: 0, error: '市集只在每週五開市，今天先逛逛吧' };
    const { itemId, seller, classCode } = body;
    const price = Number(body.price);
    if (!tierOf(itemId)) return { ok: 0, error: '這件不在市集可交易清單（精靈與稚靈是夥伴，不是商品）' };
    if (!validPrice(itemId, price)) {
      const [low, high] = bandOf(itemId);
      return { ok: 0, error: `${TIER_LABEL[tierOf(itemId)]}定價要在 ${low}–${high} 晶能` };
    }
    if (!okNick(seller)) return { ok: 0, error: '暱稱不合法' };
    if (!okClass(classCode)) return { ok: 0, error: '請先在即時對戰設定班級代碼' };
    const cleanSeller = seller.trim();
    if (!(await inRoster(redis, ctx, classCode, cleanSeller))) {
      return { ok: 0, error: '請先在即時對戰的全班戰況牆報到，才能進市集交易' };
    }
    const posts = await redis.incr(`mkt:posts:${classCode}:${cleanSeller}:${dayStr(nowMs)}`, 86400);
    if (posts > DAILY_POST_CAP) return { ok: 0, error: `每天最多上架 ${DAILY_POST_CAP} 筆，明天再來` };
    if (tierOf(itemId) === 'gold') {
      const rare = await redis.incr(`mkt:rare:${classCode}:${weekKey(nowMs)}`, 8 * 86400);
      if (rare > 5) return { ok: 0, error: '本班金級樣式券本週限量 5 件已滿，下週五再來' };
    }

    const id = randHex(6);
    const claimKey = randHex(12);
    const record = { id, itemId, seller: cleanSeller, price, ts: nowMs, classCode, pub: body.pub ? 1 : 0 };
    const sig = await sigOf(record, ctx.secret);
    await redis.set(ITEM(id), JSON.stringify({ ...record, claimKey, sig, sold: 0, claimed: 0, card: 0 }), { ex: ITEM_TTL });
    await redis.zadd(ZCLASS(classCode), { score: price, member: memberOf(record) });
    if (record.pub) await redis.zadd(ZPUB, { score: price, member: memberOf(record) });
    return { ok: 1, id, claimKey };
  }

  return { ok: 0, error: 'bad op' };
}

function cors(request) {
  const requested = request.headers.get('origin');
  const origin = ORIGINS.has(requested) ? requested : 'https://science-hero.pages.dev';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

const reply = (request, value, status = 200) => new Response(JSON.stringify(value), { status, headers: cors(request) });

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function onRequestPost({ request, env }) {
  const redis = kvFor(env.SCIENCE_HERO_DB);
  const body = await request.json().catch(() => ({}));
  const ip = String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  try {
    if (body.op !== 'list' && await redis.incr(`mkt:rl:${ip}`, 60) > 30) {
      return reply(request, { ok: 0, error: '操作太頻繁，請稍候再試' }, 429);
    }
    return reply(request, await mktOp(redis, body, {
      secret: env.MKT_SECRET || 'mkt-dev',
      forceOpen: env.MKT_FORCE_OPEN === '1',
      db: env.SCIENCE_HERO_DB,
    }));
  } catch (error) {
    console.error('mkt api failure', error);
    return reply(request, { ok: 0, error: '伺服器忙線，稍後再試' }, 500);
  }
}
