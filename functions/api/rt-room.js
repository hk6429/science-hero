import { kvFor } from '../lib/_kv.js';
import { isValidNick } from '../lib/_nick.js';

const ORIGINS = new Set([
  'https://science-hero.pages.dev',
  'https://science-hero-hk6429.vercel.app',
  'https://science-hero.netlify.app',
  'http://localhost:8788',
]);
const ROOM_TTL = 600;
const CH_TTL = 7 * 86400;
const CH_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const OK_SUBJECT = new Set(['nature', 'biology', 'chemphys', 'earth']);

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
const clamp = (value, max) => Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
const parse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
const keyOf = (code) => `rt:room:${code}`;
const chKey = (code) => `rt:ch:${code}`;
const okChCode = (code) => /^[A-HJ-NP-Z2-9]{6}$/.test(String(code || '').toUpperCase());
const genChCode = () => Array.from({ length: 6 }, () => CH_ALPHABET[Math.floor(Math.random() * CH_ALPHABET.length)]).join('');
const cleanScore = (score = {}) => ({ correct: clamp(score.correct, 10), dmg: clamp(score.dmg, 9999) });

function cleanScope(scope) {
  if (!scope || !OK_SUBJECT.has(scope.subject)) return null;
  return {
    subject: scope.subject,
    unit: typeof scope.unit === 'string' && /^[a-z_]{1,24}$/.test(scope.unit) ? scope.unit : null,
    grade: typeof scope.grade === 'string' && /^\d{1,2}$/.test(scope.grade) ? scope.grade : null,
  };
}

function cleanSnap(snap) {
  if (!snap || !isValidNick(snap.nick)) return null;
  const scope = cleanScope(snap.scope);
  if (!scope) return null;
  return { nick: snap.nick, compLv: clamp(snap.compLv, 5) || 1, hp: clamp(snap.hp, 200) || 100, scope };
}

function cleanState(state = {}) {
  return {
    dmg: clamp(state.dmg, 9999), heal: clamp(state.heal, 100), round: clamp(state.round, 10),
    combo: clamp(state.combo, 10), correct: clamp(state.correct, 10), done: state.done ? 1 : 0,
    hb: Date.now(),
  };
}

async function limited(kv, key, max) {
  return await kv.incr(key, 60) > max;
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const kv = kvFor(env.SCIENCE_HERO_DB);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const roleOk = (role) => role === 'p1' || role === 'p2';
  const codeOk = (code) => /^\d{4}$/.test(code || '');

  if (['create', 'join', 'challenge', 'challengeResult', 'seasonAdd'].includes(body.op)) {
    if (await limited(kv, `rt:rl:room:${ip}`, 30)) return reply(request, { ok: 0, error: '操作太頻繁，休息一下再試' });
  }

  if (body.op === 'challenge') {
    const scope = cleanScope(body.scope);
    if (!Number.isInteger(body.seed) || body.seed < 0 || body.seed >= 2 ** 31 || !scope || !isValidNick(body.nick)) {
      return reply(request, { ok: 0, error: '挑戰書資料不正確' });
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = genChCode();
      if (await kv.exists(chKey(code))) continue;
      await kv.set(chKey(code), { seed: body.seed, scope, challenger: body.nick, score: cleanScore(body.score), accepter: null }, { ex: CH_TTL });
      return reply(request, { ok: 1, code });
    }
    return reply(request, { ok: 0, error: '目前挑戰書太多，請稍後再試' });
  }

  if (body.op === 'accept') {
    const code = String(body.code || '').toUpperCase();
    if (!okChCode(code)) return reply(request, { ok: 0, error: '挑戰碼格式不正確' });
    const challenge = parse(await kv.get(chKey(code)));
    if (!challenge) return reply(request, { ok: 0, error: '挑戰書不存在或已過期' });
    return reply(request, { ok: 1, seed: challenge.seed, scope: challenge.scope, challenger: challenge.challenger, score: challenge.score });
  }

  if (body.op === 'challengeResult') {
    const code = String(body.code || '').toUpperCase();
    if (!okChCode(code) || !isValidNick(body.nick)) return reply(request, { ok: 0, error: '挑戰結果資料不正確' });
    const challenge = parse(await kv.get(chKey(code)));
    if (!challenge) return reply(request, { ok: 0, error: '挑戰書不存在或已過期' });
    challenge.accepter = { nick: body.nick, score: cleanScore(body.score) };
    await kv.set(chKey(code), challenge, { ex: CH_TTL });
    return reply(request, { ok: 1, challenger: { nick: challenge.challenger, score: challenge.score }, accepter: challenge.accepter });
  }

  if (body.op === 'seasonAdd') {
    if (!isValidNick(body.nick)) return reply(request, { ok: 0, error: '暱稱不符合詞庫' });
    const season = new Date().toISOString().slice(0, 7);
    const key = `rt:season:${season}`;
    const verdict = ['win', 'lose', 'draw'].includes(body.verdict) ? body.verdict : (Number(body.pts) >= 20 ? 'win' : 'lose');
    const total = await kv.zincrby(key, verdict === 'win' ? 20 : 5, body.nick);
    const statsKey = `${key}:stats`;
    const previous = parse(await kv.hget(statsKey, body.nick)) || { wins: 0, battles: 0, streak: 0 };
    const stats = {
      wins: previous.wins + (verdict === 'win' ? 1 : 0),
      battles: previous.battles + 1,
      streak: verdict === 'win' ? previous.streak + 1 : 0,
    };
    await kv.hset(statsKey, { [body.nick]: stats });
    await kv.expire(statsKey, 100 * 86400);
    await kv.expire(key, 100 * 86400);
    return reply(request, { ok: 1, total, ...stats, winRate: Math.round(stats.wins / stats.battles * 100) });
  }

  if (body.op === 'seasonTop') {
    const season = /^\d{4}-\d{2}$/.test(body.season || '') ? body.season : new Date().toISOString().slice(0, 7);
    const rows = await kv.zrange(`rt:season:${season}`, 0, 9, { rev: true, withScores: true });
    const top = [];
    const statsKey = `rt:season:${season}:stats`;
    for (let index = 0; index < rows.length; index += 2) {
      const stats = parse(await kv.hget(statsKey, rows[index])) || { wins: 0, battles: 0, streak: 0 };
      top.push({ nick: rows[index], pts: rows[index + 1], ...stats, winRate: stats.battles ? Math.round(stats.wins / stats.battles * 100) : 0 });
    }
    return reply(request, { ok: 1, season, top });
  }

  if (body.op === 'create') {
    const snap = cleanSnap(body.snap);
    if (!snap) return reply(request, { ok: 0, error: 'bad snap' });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      if (await kv.exists(keyOf(code))) continue;
      const seed = Math.floor(Math.random() * (2 ** 31));
      await kv.set(keyOf(code), { seed, scope: snap.scope }, { ex: ROOM_TTL });
      await kv.set(`${keyOf(code)}:p1`, { snap, state: cleanState() }, { ex: ROOM_TTL });
      return reply(request, { ok: 1, code, seed });
    }
    return reply(request, { ok: 0, error: '目前房間太多，請稍後再試' });
  }

  if (body.op === 'join') {
    const snap = cleanSnap(body.snap);
    if (!codeOk(body.code) || !snap) return reply(request, { ok: 0, error: 'bad req' });
    const meta = parse(await kv.get(keyOf(body.code)));
    if (!meta) return reply(request, { ok: 0, error: '房間已過期' });
    if (await kv.exists(`${keyOf(body.code)}:p2`)) return reply(request, { ok: 0, error: '房間已滿' });
    const p1 = parse(await kv.get(`${keyOf(body.code)}:p1`));
    await kv.set(`${keyOf(body.code)}:p2`, { snap: { ...snap, scope: meta.scope }, state: cleanState() }, { ex: ROOM_TTL });
    return reply(request, { ok: 1, seed: meta.seed, scope: meta.scope, opp: p1?.snap || null });
  }

  if (body.op === 'push') {
    if (!codeOk(body.code) || !roleOk(body.role)) return reply(request, { ok: 0, error: 'bad req' });
    if (await limited(kv, `rt:rl:push:${ip}`, 120)) return reply(request, { ok: 0, error: '操作太頻繁，休息一下再試' });
    if (!await kv.exists(keyOf(body.code))) return reply(request, { ok: 0, error: '房間已過期' });
    const playerKey = `${keyOf(body.code)}:${body.role}`;
    const player = parse(await kv.get(playerKey));
    if (!player?.snap) return reply(request, { ok: 0, error: 'bad req' });
    await kv.set(playerKey, { snap: player.snap, state: cleanState(body.state) }, { ex: ROOM_TTL });
    return reply(request, { ok: 1 });
  }

  if (body.op === 'poll') {
    if (!codeOk(body.code) || !roleOk(body.role)) return reply(request, { ok: 0, error: 'bad req' });
    if (!await kv.exists(keyOf(body.code))) return reply(request, { ok: 0, error: '房間已過期' });
    const other = body.role === 'p1' ? 'p2' : 'p1';
    const opponent = parse(await kv.get(`${keyOf(body.code)}:${other}`));
    return reply(request, { ok: 1, opp: opponent ? { snap: opponent.snap, state: opponent.state, hb: opponent.state?.hb } : null, now: Date.now() });
  }

  return reply(request, { ok: 0, error: 'bad op' });
}
