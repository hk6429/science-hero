import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as core from '../functions/lib/market-core.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const plain = (value) => value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;

function makeSandbox(seed = {}) {
  const raw = { ...seed };
  const localStorage = {
    getItem: (key) => key in raw ? raw[key] : null,
    setItem: (key, value) => { raw[key] = String(value); },
    removeItem: (key) => { delete raw[key]; },
  };
  const context = vm.createContext({ localStorage, console, Date, Math, JSON, window: {} });
  const files = ['js/store.js', 'js/economy.js', 'js/market-store.js'];
  const combined = files.map((file) => readFileSync(path.join(ROOT, file), 'utf8')).join('\n;\n');
  vm.runInContext(`${combined}\nglobalThis.__exports = { SciEconomy, SciMarketStore };`, context, { filename: 'market-combined.js' });
  const wrap = (module) => new Proxy(module, {
    get(target, prop) {
      const value = target[prop];
      return typeof value === 'function' ? (...args) => plain(value(...args)) : plain(value);
    },
  });
  return { lib: { SciEconomy: wrap(context.__exports.SciEconomy), SciMarketStore: wrap(context.__exports.SciMarketStore) }, raw };
}

test('前後端常數同步：目錄、品階、價格帶、時窗與小卡不漂移', () => {
  const { SciMarketStore: market } = makeSandbox().lib;
  assert.deepEqual(market.ITEM_CATALOG, core.ITEM_CATALOG);
  for (const id of [...Object.keys(core.ITEM_CATALOG), 'senlingdeer', '']) {
    assert.equal(market.tierOf(id), core.tierOf(id));
    assert.deepEqual(market.bandOf(id), core.bandOf(id));
  }
  for (const ts of [Date.UTC(2026, 6, 23, 15, 59), Date.UTC(2026, 6, 23, 16), Date.UTC(2026, 6, 24, 15, 59), Date.UTC(2026, 6, 24, 16)]) {
    assert.equal(market.isMarketOpen(ts), core.isMarketOpen(ts));
  }
  assert.deepEqual(market.THANKS_CARDS, core.THANKS_CARDS);
});

test('背包與直購：白名單、庫存與 SciEconomy 單一入口', () => {
  const { SciMarketStore: market, SciEconomy: economy } = makeSandbox().lib;
  assert.equal(market.grantItem('senlingdeer').ok, false);
  assert.equal(market.grantItem('energy').ok, true);
  assert.equal(market.removeItem('energy').ok, true);
  assert.equal(market.removeItem('energy').ok, false);
  assert.equal(market.buyDirect('energy').ok, false);
  economy.earnCrystals(50, 'test-seed');
  assert.equal(market.buyDirect('energy').ok, true);
  assert.equal(market.getInv().energy, 1);
  assert.equal(economy.getBalance(), 20);
});

test('戰前攜帶：只認有庫存的 tool，開戰一次性消耗', () => {
  const market = makeSandbox().lib.SciMarketStore;
  assert.deepEqual(market.toolEffect('energy'), { hp: 10 });
  assert.deepEqual(market.toolEffect('goggles'), { shieldOnce: true });
  assert.equal(market.toolEffect('deco_gold'), null);
  assert.equal(market.setCarry('magnifier').ok, false);
  market.grantItem('magnifier');
  assert.equal(market.setCarry('deco_gold').ok, false);
  assert.equal(market.setCarry('magnifier').ok, true);
  assert.deepEqual(market.takeCarry(), { toolId: 'magnifier', effect: { excludeOnce: true } });
  assert.equal(market.takeCarry(), null);
  assert.equal(market.getInv().magnifier || 0, 0);
});

test('claims、每日限購快取、曾經持有留痕可持久化', () => {
  const market = makeSandbox().lib.SciMarketStore;
  market.addClaim({ id: 'x1', claimKey: 'k', itemId: 'energy', price: 30 });
  assert.equal(market.getClaims().length, 1);
  market.removeClaim('x1');
  assert.deepEqual(market.getClaims(), []);
  const friday = Date.UTC(2026, 6, 24, 4);
  market.bumpBuys(friday);
  market.bumpBuys(friday);
  assert.equal(market.buysToday(friday), 2);
  assert.equal(market.buysToday(friday + 86400000), 0);
  market.recordEver({ itemId: 'energy', dir: 'sold', peer: '小華', ts: friday });
  assert.equal(market.getEver()[0].dir, 'sold');
});

test('classInfo 壞檔降級；基地未就緒不吞券', () => {
  const { lib, raw } = makeSandbox();
  const market = lib.SciMarketStore;
  assert.equal(market.classInfo(), null);
  raw.sci_class = JSON.stringify({ classCode: '七年3班', nick: '小明' });
  assert.deepEqual(market.classInfo(), { classCode: '七年3班', nick: '小明' });
  raw.sci_class = '{{{壞檔';
  assert.equal(market.classInfo(), null);
  market.grantItem('deco_gold');
  assert.deepEqual(market.redeemDeco('deco_gold'), { ok: 0, pending: 1 });
  assert.equal(market.getInv().deco_gold, 1);
});

test('市集出金與退款豁免每日晶能收入上限', () => {
  const { SciMarketStore: market, SciEconomy: economy } = makeSandbox().lib;
  economy.earnCrystals(100, 'answer');
  assert.equal(market.settleToLocal(25).earned, 25);
  assert.equal(market.refundLocal(10).earned, 10);
  assert.equal(economy.getBalance(), 135);
});
