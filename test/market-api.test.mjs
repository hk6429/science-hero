import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ITEM_CATALOG,
  tierOf,
  bandOf,
  validPrice,
  isMarketOpen,
  weekKey,
  dayStr,
  okNick,
  okClass,
  sigOf,
} from '../functions/lib/market-core.js';
import { mktOp, onRequestPost } from '../functions/api/mkt.js';
import { kvFor } from '../functions/lib/_kv.js';
import { createFakeD1 } from './fake-d1.mjs';

const ENV = { secret: 'test-secret', forceOpen: true };
const OPEN_TS = Date.UTC(2026, 6, 24, 4, 0);
const fakeKv = () => kvFor(createFakeD1());

test('R11 市集 API 只回固定 500 文案，內部錯誤僅寫 server log', async () => {
  const secretDetail = new Error('D1 SQL internal table secret');
  const request = new Request('https://science-hero.pages.dev/api/mkt', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
    body: JSON.stringify({ op: 'wallet' }),
  });
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    const response = await onRequestPost({ request, env: { SCIENCE_HERO_DB: { prepare() { throw secretDetail; } } } });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: 0, error: '伺服器忙線，稍後再試' });
    assert.equal(logged[0][1], secretDetail);
  } finally {
    console.error = original;
  }
});

test('ITEM_CATALOG：恰好 3 件實驗道具；tierOf 白名單 fail-closed', () => {
  const ids = Object.keys(ITEM_CATALOG);
  assert.deepEqual(ids, ['energy', 'magnifier', 'goggles']);
  assert.ok(ids.every((id) => ITEM_CATALOG[id].kind === 'tool'));
  assert.equal(tierOf('energy'), 'bronze');
  assert.equal(tierOf('goggles'), 'bronze');
  assert.equal(tierOf('deco_gold'), null);
  assert.equal(tierOf('senlingdeer'), null);
});

test('bandOf/validPrice：帶＝原價×0.5～×1.5，整數且含邊界', () => {
  assert.deepEqual(bandOf('energy'), [15, 45]);
  assert.equal(bandOf('deco_gold'), null);
  assert.equal(bandOf('nope'), null);
  assert.equal(validPrice('energy', 15), true);
  assert.equal(validPrice('energy', 45), true);
  assert.equal(validPrice('energy', 46), false);
  assert.equal(validPrice('energy', 20.5), false);
  assert.equal(validPrice('nope', 30), false);
});

test('isMarketOpen：UTC+8 週五 00:00 起、23:59 止', () => {
  assert.equal(isMarketOpen(Date.UTC(2026, 6, 23, 15, 59)), false);
  assert.equal(isMarketOpen(Date.UTC(2026, 6, 23, 16, 0)), true);
  assert.equal(isMarketOpen(Date.UTC(2026, 6, 24, 15, 59)), true);
  assert.equal(isMarketOpen(Date.UTC(2026, 6, 24, 16, 0)), false);
});

test('weekKey：週五起算的一週落同桶、跨週不同桶', () => {
  assert.equal(weekKey(Date.UTC(2026, 6, 24, 4, 0)), '2026-07-24');
  assert.equal(weekKey(Date.UTC(2026, 6, 30, 4, 0)), '2026-07-24');
  assert.equal(weekKey(Date.UTC(2026, 6, 31, 4, 0)), '2026-07-31');
});

test('dayStr（UTC+8 日界線）／okNick／okClass', () => {
  assert.equal(dayStr(Date.UTC(2026, 6, 23, 16, 0)), '2026-07-24');
  assert.equal(okNick('小明'), true);
  assert.equal(okNick('a'.repeat(13)), false);
  assert.equal(okNick('<img>'), false);
  assert.equal(okNick('笨蛋'), false);
  assert.equal(okClass('七年3班'), true);
  assert.equal(okClass('a;DROP'), false);
});

test('sigOf：同 payload 同 secret 穩定；欄位或 secret 變動即不同', async () => {
  const payload = { itemId: 'energy', price: 30, seller: '小明', id: 'abc123' };
  assert.equal(await sigOf(payload, 's1'), await sigOf({ ...payload }, 's1'));
  assert.equal((await sigOf(payload, 's1')).length, 24);
  assert.notEqual(await sigOf(payload, 's1'), await sigOf({ ...payload, price: 31 }, 's1'));
  assert.notEqual(await sigOf(payload, 's1'), await sigOf(payload, 's2'));
});

test('post：合法上架回 id+claimKey，list 查得到且預設班級限定', async () => {
  const redis = fakeKv();
  const posted = await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
  assert.equal(posted.ok, 1);
  assert.equal(typeof posted.id, 'string');
  assert.equal(typeof posted.claimKey, 'string');
  const listed = await mktOp(redis, { op: 'list', classCode: 'demo', scope: 'class' }, ENV, OPEN_TS);
  assert.equal(listed.list.length, 1);
  assert.deepEqual([listed.list[0].itemId, listed.list[0].price, listed.list[0].pub], ['energy', 30, 0]);
});

test('post：未知物品、價格出帶、髒話暱稱、壞班碼全拒', async () => {
  const redis = fakeKv();
  assert.equal((await mktOp(redis, { op: 'post', itemId: 'senlingdeer', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS)).ok, 0);
  assert.equal((await mktOp(redis, { op: 'post', itemId: 'energy', price: 999, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS)).ok, 0);
  assert.equal((await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '笨蛋', classCode: 'demo' }, ENV, OPEN_TS)).ok, 0);
  assert.equal((await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'a;DROP' }, ENV, OPEN_TS)).ok, 0);
});

test('post：每人每日上架上限 3 筆', async () => {
  const redis = fakeKv();
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS)).ok, 1);
  }
  const denied = await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
  assert.equal(denied.ok, 0);
  assert.match(denied.error, /3/);
});

test('post：非週五拒收；pub opt-in 同步進全站索引', async () => {
  const redis = fakeKv();
  const denied = await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, { ...ENV, forceOpen: false }, Date.UTC(2026, 6, 22, 4, 0));
  assert.equal(denied.ok, 0);
  assert.match(denied.error, /週五/);
  await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo', pub: 1 }, ENV, OPEN_TS);
  const globalList = await mktOp(redis, { op: 'list', scope: 'pub' }, ENV, OPEN_TS);
  assert.equal(globalList.list.length, 1);
  assert.equal(globalList.list[0].pub, 1);
});

async function seedWallet(redis, classCode, nick, amount) {
  return mktOp(redis, { op: 'deposit', nick, classCode, amount }, ENV, OPEN_TS);
}

test('deposit/wallet/withdraw：入金累計、查詢、出金；每日入金上限 100', async () => {
  const redis = fakeKv();
  assert.equal((await seedWallet(redis, 'demo', '小華', 60)).wallet, 60);
  assert.equal((await seedWallet(redis, 'demo', '小華', 40)).wallet, 100);
  assert.match((await seedWallet(redis, 'demo', '小華', 1)).error, /上限/);
  assert.equal((await mktOp(redis, { op: 'wallet', nick: '小華', classCode: 'demo' }, ENV, OPEN_TS)).wallet, 100);
  assert.equal((await mktOp(redis, { op: 'withdraw', nick: '小華', classCode: 'demo', amount: 30 }, ENV, OPEN_TS)).wallet, 70);
  assert.equal((await mktOp(redis, { op: 'withdraw', nick: '小華', classCode: 'demo', amount: 999 }, ENV, OPEN_TS)).ok, 0);
});

test('buy：合法購買扣錢、掛單消失並保存感謝小卡', async () => {
  const redis = fakeKv();
  await seedWallet(redis, 'demo', '小華', 50);
  const posted = await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
  const bought = await mktOp(redis, { op: 'buy', id: posted.id, nick: '小華', classCode: 'demo', cardId: 3 }, ENV, OPEN_TS);
  assert.deepEqual([bought.ok, bought.itemId, bought.price, bought.wallet], [1, 'energy', 30, 20]);
  assert.equal((await mktOp(redis, { op: 'list', classCode: 'demo', scope: 'class' }, ENV, OPEN_TS)).list.length, 0);
  const record = JSON.parse(await redis.get(`mkt:item:${posted.id}`));
  assert.deepEqual([record.sold, record.buyer, record.card], [1, '小華', 3]);
});

test('buy：錢包不足、買自己的、別班掛單、簽章竄改全拒', async () => {
  const redis = fakeKv();
  await seedWallet(redis, 'demo', '小華', 100);
  const poor = await mktOp(redis, { op: 'post', itemId: 'goggles', price: 90, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
  assert.match((await mktOp(redis, { op: 'buy', id: poor.id, nick: '沒錢仔', classCode: 'demo' }, ENV, OPEN_TS)).error, /晶能不足|入金/);
  const own = await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小華', classCode: 'demo' }, ENV, OPEN_TS);
  assert.equal((await mktOp(redis, { op: 'buy', id: own.id, nick: '小華', classCode: 'demo' }, ENV, OPEN_TS)).ok, 0);
  const other = await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: '別班' }, ENV, OPEN_TS);
  assert.match((await mktOp(redis, { op: 'buy', id: other.id, nick: '小華', classCode: 'demo' }, ENV, OPEN_TS)).error, /別班/);
  const record = JSON.parse(await redis.get(`mkt:item:${poor.id}`));
  record.price = 1;
  await redis.set(`mkt:item:${poor.id}`, JSON.stringify(record));
  assert.match((await mktOp(redis, { op: 'buy', id: poor.id, nick: '小華', classCode: 'demo' }, ENV, OPEN_TS)).error, /簽章/);
});

test('buy：每日限購 3 件；失敗購買不燒配額', async () => {
  const redis = fakeKv();
  await seedWallet(redis, 'demo', '小華', 100);
  const ids = [];
  for (let index = 0; index < 4; index += 1) {
    ids.push((await mktOp(redis, { op: 'post', itemId: 'energy', price: 15, seller: `賣家${index}`, classCode: 'demo' }, ENV, OPEN_TS)).id);
  }
  await mktOp(redis, { op: 'buy', id: 'no-such-id', nick: '小華', classCode: 'demo' }, ENV, OPEN_TS);
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await mktOp(redis, { op: 'buy', id: ids[index], nick: '小華', classCode: 'demo' }, ENV, OPEN_TS)).ok, 1);
  }
  const denied = await mktOp(redis, { op: 'buy', id: ids[3], nick: '小華', classCode: 'demo' }, ENV, OPEN_TS);
  assert.equal(denied.ok, 0);
  assert.match(denied.error, /限購/);
});

test('buy：搶單鎖擋雙買；非週五拒買但 deposit 平日照常', async () => {
  const redis = fakeKv();
  await seedWallet(redis, 'demo', '小華', 50);
  const posted = await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
  await redis.incr(`mkt:lock:${posted.id}`, 30);
  assert.match((await mktOp(redis, { op: 'buy', id: posted.id, nick: '小華', classCode: 'demo' }, ENV, OPEN_TS)).error, /結帳中|手慢/);
  const wed = Date.UTC(2026, 6, 22, 4, 0);
  assert.equal((await mktOp(redis, { op: 'buy', id: posted.id, nick: '小華', classCode: 'demo' }, { ...ENV, forceOpen: false }, wed)).ok, 0);
  assert.equal((await mktOp(redis, { op: 'deposit', nick: '小華', classCode: 'demo', amount: 10 }, { ...ENV, forceOpen: false }, wed)).ok, 1);
});

test('cancel：憑 claimKey 下架；錯 key 拒絕', async () => {
  const redis = fakeKv();
  const posted = await mktOp(redis, { op: 'post', itemId: 'magnifier', price: 40, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
  assert.equal((await mktOp(redis, { op: 'cancel', id: posted.id, claimKey: 'wrong' }, ENV, OPEN_TS)).ok, 0);
  const cancelled = await mktOp(redis, { op: 'cancel', id: posted.id, claimKey: posted.claimKey }, ENV, OPEN_TS);
  assert.deepEqual([cancelled.ok, cancelled.itemId], [1, 'magnifier']);
  assert.equal((await mktOp(redis, { op: 'list', classCode: 'demo', scope: 'class' }, ENV, OPEN_TS)).list.length, 0);
});

test('claim：售出後領九成貨款入錢包並附買家小卡；未售出與重複領擋下', async () => {
  const redis = fakeKv();
  await seedWallet(redis, 'demo', '小華', 100);
  const posted = await mktOp(redis, { op: 'post', itemId: 'goggles', price: 33, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
  assert.equal((await mktOp(redis, { op: 'claim', id: posted.id, claimKey: posted.claimKey, classCode: 'demo' }, ENV, OPEN_TS)).sold, 0);
  await mktOp(redis, { op: 'buy', id: posted.id, nick: '小華', classCode: 'demo', cardId: 5 }, ENV, OPEN_TS);
  const claimed = await mktOp(redis, { op: 'claim', id: posted.id, claimKey: posted.claimKey, classCode: 'demo' }, ENV, OPEN_TS);
  assert.deepEqual([claimed.ok, claimed.crystals, claimed.buyer, claimed.card, claimed.wallet], [1, 29, '小華', 5, 29]);
  assert.equal((await mktOp(redis, { op: 'wallet', nick: '小明', classCode: 'demo' }, ENV, OPEN_TS)).wallet, 29);
  assert.match((await mktOp(redis, { op: 'claim', id: posted.id, claimKey: posted.claimKey, classCode: 'demo' }, ENV, OPEN_TS)).error, /領過/);
});

test('claim/cancel：非週五也可善後', async () => {
  const redis = fakeKv();
  const posted = await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
  const cancelled = await mktOp(redis, { op: 'cancel', id: posted.id, claimKey: posted.claimKey }, { ...ENV, forceOpen: false }, Date.UTC(2026, 6, 22, 4, 0));
  assert.equal(cancelled.ok, 1);
});

const ROSTER_ENV = { ...ENV, roster: new Set(['小明', '小華', '小美']) };

test('roster fail-closed：名單外 post/buy/deposit 拒絕；list 仍可瀏覽', async () => {
  const redis = fakeKv();
  assert.match((await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '路人甲', classCode: 'demo' }, ROSTER_ENV, OPEN_TS)).error, /報到/);
  assert.match((await mktOp(redis, { op: 'deposit', nick: '路人甲', classCode: 'demo', amount: 10 }, ROSTER_ENV, OPEN_TS)).error, /報到/);
  const posted = await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ROSTER_ENV, OPEN_TS);
  assert.equal(posted.ok, 1);
  assert.match((await mktOp(redis, { op: 'buy', id: posted.id, nick: '路人甲', classCode: 'demo' }, ROSTER_ENV, OPEN_TS)).error, /報到/);
  await mktOp(redis, { op: 'deposit', nick: '小華', classCode: 'demo', amount: 50 }, ROSTER_ENV, OPEN_TS);
  assert.equal((await mktOp(redis, { op: 'buy', id: posted.id, nick: '小華', classCode: 'demo' }, ROSTER_ENV, OPEN_TS)).ok, 1);
  assert.equal((await mktOp(redis, { op: 'list', classCode: 'demo', scope: 'class' }, ROSTER_ENV, OPEN_TS)).ok, 1);
  assert.equal((await mktOp(redis, { op: 'list', scope: 'pub' }, ROSTER_ENV, OPEN_TS)).ok, 1);
});

test('市集 API 拒絕舊樣式券，且不再建立金級券週限量分支', async () => {
  const redis = fakeKv();
  assert.match(
    (await mktOp(redis, { op: 'post', itemId: 'deco_gold', price: 300, seller: '新賣家', classCode: 'demo' }, ENV, OPEN_TS)).error,
    /不在市集可交易清單/,
  );
  assert.equal((await mktOp(redis, { op: 'post', itemId: 'energy', price: 30, seller: '新賣家', classCode: 'demo' }, ENV, OPEN_TS)).ok, 1);
  const apiSource = readFileSync(new URL('../functions/api/mkt.js', import.meta.url), 'utf8');
  assert.doesNotMatch(apiSource, /mkt:rare|金級樣式券|tierOf\(itemId\)\s*===\s*['"]gold['"]/);
});

test('stars：成交後買賣雙方各 +1；只回前五且不列金額', async () => {
  const redis = fakeKv();
  await seedWallet(redis, 'demo', '大買家', 100);
  for (let index = 0; index < 3; index += 1) {
    const posted = await mktOp(redis, { op: 'post', itemId: 'energy', price: 15, seller: `賣家${index}`, classCode: 'demo' }, ENV, OPEN_TS);
    await mktOp(redis, { op: 'buy', id: posted.id, nick: '大買家', classCode: 'demo' }, ENV, OPEN_TS);
  }
  const stars = await mktOp(redis, { op: 'stars', classCode: 'demo' }, ENV, OPEN_TS);
  assert.equal(stars.ok, 1);
  assert.ok(stars.top.length <= 5);
  assert.deepEqual(stars.top[0], { name: '大買家', deals: 3 });
  assert.ok(stars.top.every((entry) => !('crystals' in entry)));
});
