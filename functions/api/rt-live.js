import { kvFor } from '../lib/_kv.js';
import { isValidNick } from '../lib/_nick.js';

const TTL = 7200;
const OK_SUBJECT = new Set(['nature', 'biology', 'chemphys', 'earth']);
const ORIGINS = new Set(['https://science-hero.pages.dev', 'https://science-hero-hk6429.vercel.app', 'https://science-hero.netlify.app', 'http://localhost:8788']);
const parse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

function cleanScope(scope) {
  if (!scope || !OK_SUBJECT.has(scope.subject)) return null;
  return {
    subject: scope.subject,
    unit: typeof scope.unit === 'string' && /^[a-z_]{1,24}$/.test(scope.unit) ? scope.unit : null,
    grade: typeof scope.grade === 'string' && /^\d{1,2}$/.test(scope.grade) ? scope.grade : null,
  };
}

function cors(request) {
  const requested = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.has(requested) ? requested : 'https://science-hero.pages.dev',
    'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8',
  };
}
const reply = (request, value) => new Response(JSON.stringify(value), { headers: cors(request) });
const liveKey = (code) => `rt:live:${code}`;
const rosterKey = (code) => `${liveKey(code)}:roster`;
const publicLive = (live) => live ? { seed: live.seed, qn: live.qn, scope: live.scope, phase: live.phase, qNo: live.qNo } : null;

async function hostToken(secret, code, startTs) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${code}:${startTs}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export function onRequestOptions({ request }) { return new Response(null, { status: 204, headers: cors(request) }); }

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const kv = kvFor(env.SCIENCE_HERO_DB);
  const code = String(body.code || '');
  if (!/^[A-Za-z0-9]{2,12}$/.test(code)) return reply(request, { ok: 0, error: '班級碼格式不正確' });
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (body.op === 'start' && await kv.incr(`rt:rl:live:${ip}`, 60) > 30) return reply(request, { ok: 0, error: '操作太頻繁，休息一下再試' });
  if (body.op === 'answer' && await kv.incr(`rt:rl:live-answer:${ip}`, 60) > 120) return reply(request, { ok: 0, error: '作答送出太頻繁' });

  if (body.op === 'start') {
    const scope = cleanScope(body.scope);
    if (![5, 10, 15].includes(Number(body.qn)) || !scope || !env.RT_SECRET) return reply(request, { ok: 0, error: '開場資料不正確' });
    const old = parse(await kv.get(liveKey(code)));
    if (old && old.phase !== 'end') return reply(request, { ok: 0, error: '這個班級碼已有進行中的隨堂戰況' });
    const startTs = Date.now();
    const live = { seed: Math.floor(Math.random() * (2 ** 31)), qn: Number(body.qn), scope, phase: 'lobby', qNo: 0, startTs };
    await kv.del(rosterKey(code));
    await kv.set(liveKey(code), live, { ex: TTL });
    return reply(request, { ok: 1, live: publicLive(live), token: await hostToken(env.RT_SECRET, code, startTs) });
  }

  const live = parse(await kv.get(liveKey(code)));
  if (body.op === 'state') return reply(request, { ok: 1, live: publicLive(live) });
  if (!live) return reply(request, { ok: 0, error: '找不到這場隨堂戰況' });

  if (body.op === 'next' || body.op === 'end') {
    const expected = await hostToken(env.RT_SECRET || '', code, live.startTs);
    if (body.token !== expected) return reply(request, { ok: 0, error: '主持憑證不對' });
    if (body.op === 'end') live.phase = 'end';
    else if (live.phase === 'lobby') { live.phase = 'q'; live.qNo = 1; }
    else if (live.qNo >= live.qn) live.phase = 'end';
    else live.qNo += 1;
    await kv.set(liveKey(code), live, { ex: TTL });
    return reply(request, { ok: 1, live: publicLive(live) });
  }

  if (body.op === 'answer') {
    if (live.phase !== 'q' || !isValidNick(body.nick) || Number(body.qNo) !== live.qNo) return reply(request, { ok: 0, error: '作答資料不正確' });
    const previous = parse(await kv.hget(rosterKey(code), body.nick)) || { score: 0, qNo: 0 };
    if (Number(body.qNo) <= previous.qNo) return reply(request, { ok: 1 });
    await kv.hset(rosterKey(code), { [body.nick]: { score: previous.score + (body.correct ? 1 : 0), qNo: Number(body.qNo) } });
    await kv.expire(rosterKey(code), TTL);
    return reply(request, { ok: 1 });
  }

  if (body.op === 'roster') {
    const hash = await kv.hgetall(rosterKey(code)) || {};
    const list = Object.entries(hash).map(([nick, value]) => ({ nick, ...(parse(value) || { score: 0, qNo: 0 }) })).sort((a, b) => b.score - a.score || a.nick.localeCompare(b.nick));
    return reply(request, { ok: 1, list });
  }

  return reply(request, { ok: 0, error: 'bad op' });
}
