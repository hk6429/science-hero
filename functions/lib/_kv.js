// Redis-over-D1 shim（科學英雄子系統共用：即時對戰 rt: / 科學市集 mkt:）
// 契約：get/hget/hgetall/lrange 回原始字串；寫入物件自動 stringify；TTL 為 epoch ms。

const encode = (value) => typeof value === 'string' ? value : JSON.stringify(value);
const now = () => Date.now();
const expAt = (seconds) => seconds == null ? null : now() + Number(seconds) * 1000;

function bounds(length, start, stop) {
  let from = Number(start);
  let to = Number(stop);
  if (from < 0) from = length + from;
  if (to < 0) to = length + to;
  from = Math.max(0, from);
  to = Math.min(length - 1, to);
  return from > to || from >= length ? null : [from, to];
}

export function kvFor(db) {
  async function purge(table, key) {
    await db.prepare(`DELETE FROM ${table} WHERE k=?1 AND exp IS NOT NULL AND exp<=?2`).bind(key, now()).run();
  }

  async function get(key) {
    await purge('kv', key);
    return db.prepare('SELECT v FROM kv WHERE k=?1').bind(key).first('v');
  }

  async function set(key, value, options = {}) {
    await db.prepare(`INSERT INTO kv (k,v,exp) VALUES (?1,?2,?3)
      ON CONFLICT(k) DO UPDATE SET v=excluded.v, exp=excluded.exp`)
      .bind(key, encode(value), expAt(options.ex)).run();
    return 'OK';
  }

  async function incr(key, ttlSec) {
    await purge('kv', key);
    const expires = expAt(ttlSec);
    await db.prepare(`INSERT INTO kv (k,v,exp) VALUES (?1,'1',?2)
      ON CONFLICT(k) DO UPDATE SET v=CAST(CAST(kv.v AS INTEGER)+1 AS TEXT)`)
      .bind(key, expires).run();
    return Number(await get(key));
  }

  async function del(...keys) {
    let changes = 0;
    for (const key of keys) {
      for (const table of ['kv', 'hash', 'list', 'zset']) {
        const result = await db.prepare(`DELETE FROM ${table} WHERE k=?1`).bind(key).run();
        changes += Number(result.meta?.changes || 0);
      }
    }
    return changes;
  }

  async function exists(key) {
    for (const table of ['kv', 'hash', 'list', 'zset']) {
      await purge(table, key);
      const count = await db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE k=?1`).bind(key).first('c');
      if (Number(count) > 0) return 1;
    }
    return 0;
  }

  async function expire(key, seconds) {
    const expiry = expAt(seconds);
    let changed = 0;
    for (const table of ['kv', 'hash', 'list', 'zset']) {
      const result = await db.prepare(`UPDATE ${table} SET exp=?2 WHERE k=?1`).bind(key, expiry).run();
      changed += Number(result.meta?.changes || 0);
    }
    return changed ? 1 : 0;
  }

  async function hget(key, field) {
    await purge('hash', key);
    return db.prepare('SELECT v FROM hash WHERE k=?1 AND f=?2').bind(key, field).first('v');
  }

  async function hgetall(key) {
    await purge('hash', key);
    const { results } = await db.prepare('SELECT f,v FROM hash WHERE k=?1 ORDER BY f').bind(key).all();
    if (!results.length) return null;
    return Object.fromEntries(results.map(({ f, v }) => [f, v]));
  }

  async function hset(key, object) {
    const statements = Object.entries(object).map(([field, value]) => db.prepare(`INSERT INTO hash (k,f,v,exp) VALUES (?1,?2,?3,NULL)
      ON CONFLICT(k,f) DO UPDATE SET v=excluded.v`).bind(key, field, encode(value)));
    if (statements.length) await db.batch(statements);
    return statements.length;
  }

  async function hlen(key) {
    await purge('hash', key);
    return Number(await db.prepare('SELECT COUNT(*) AS c FROM hash WHERE k=?1').bind(key).first('c'));
  }

  async function lpush(key, ...values) {
    const statements = values.map((value) => db.prepare('INSERT INTO list (k,v,exp) VALUES (?1,?2,NULL)').bind(key, encode(value)));
    if (statements.length) await db.batch(statements);
    return Number(await db.prepare('SELECT COUNT(*) AS c FROM list WHERE k=?1').bind(key).first('c'));
  }

  async function listRows(key) {
    await purge('list', key);
    return (await db.prepare('SELECT id,v FROM list WHERE k=?1 ORDER BY id DESC').bind(key).all()).results;
  }

  async function lrange(key, start, stop) {
    const rows = await listRows(key);
    const range = bounds(rows.length, start, stop);
    return range ? rows.slice(range[0], range[1] + 1).map((row) => row.v) : [];
  }

  async function ltrim(key, start, stop) {
    const rows = await listRows(key);
    const range = bounds(rows.length, start, stop);
    const keep = new Set(range ? rows.slice(range[0], range[1] + 1).map((row) => row.id) : []);
    const remove = rows.filter((row) => !keep.has(row.id));
    if (remove.length) await db.batch(remove.map((row) => db.prepare('DELETE FROM list WHERE id=?1').bind(row.id)));
    return 'OK';
  }

  async function zadd(key, { score, member }) {
    await db.prepare(`INSERT INTO zset (k,member,score,exp) VALUES (?1,?2,?3,NULL)
      ON CONFLICT(k,member) DO UPDATE SET score=excluded.score`).bind(key, member, Number(score)).run();
    return 1;
  }

  async function zincrby(key, delta, member) {
    await db.prepare(`INSERT INTO zset (k,member,score,exp) VALUES (?1,?2,?3,NULL)
      ON CONFLICT(k,member) DO UPDATE SET score=zset.score+excluded.score`).bind(key, member, Number(delta)).run();
    return Number(await db.prepare('SELECT score FROM zset WHERE k=?1 AND member=?2').bind(key, member).first('score'));
  }

  async function zrows(key, rev) {
    await purge('zset', key);
    const direction = rev ? 'DESC' : 'ASC';
    return (await db.prepare(`SELECT member,score FROM zset WHERE k=?1 ORDER BY score ${direction}, member ASC`).bind(key).all()).results;
  }

  async function zrange(key, start, stop, options = {}) {
    const rows = await zrows(key, options.rev);
    const range = bounds(rows.length, start, stop);
    const selected = range ? rows.slice(range[0], range[1] + 1) : [];
    return options.withScores ? selected.flatMap((row) => [row.member, Number(row.score)]) : selected.map((row) => row.member);
  }

  async function zrem(key, ...members) {
    if (!members.length) return 0;
    const results = await db.batch(members.map((member) => db.prepare('DELETE FROM zset WHERE k=?1 AND member=?2').bind(key, member)));
    return results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
  }

  async function zremrangebyrank(key, start, stop) {
    const rows = await zrows(key, false);
    const range = bounds(rows.length, start, stop);
    if (!range) return 0;
    return zrem(key, ...rows.slice(range[0], range[1] + 1).map((row) => row.member));
  }

  return { get, set, incr, del, exists, expire, hget, hgetall, hset, hlen, lpush, lrange, ltrim, zadd, zincrby, zrange, zrem, zremrangebyrank };
}
