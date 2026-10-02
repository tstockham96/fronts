/**
 * FRONTS optional backend: a tiny Cloudflare Worker + D1.
 *
 *   POST /api/play            {puzzle, army, device}  -> store army, return real armies + server score
 *   GET  /api/pool?puzzle&device                       -> real armies (only once that device has played)
 *   POST /api/duel            {puzzle, army, id, name} -> {id}
 *   GET  /api/duel/:id                                 -> {puzzle, id, name}   (no army!)
 *   POST /api/duel/:id/fight  {army}                   -> {army, outcome}      (reveals after commit)
 *   POST /api/event           {name, props}            -> 204
 *
 * Game rules are imported from the frontend's pure core, so scoring is identical.
 */
import { isValidArmy, resolveBattle } from '../../src/core/battle';
import { blendPools, generateCrowd } from '../../src/core/crowd';
import { scoreVsPool } from '../../src/core/scoring';
import { getDayMap } from '../../src/core/twists';
import { EPOCH } from '../../src/core/date';

interface D1Result<T> { results: T[] }
interface D1Stmt {
  bind(...v: unknown[]): D1Stmt;
  run(): Promise<unknown>;
  all<T>(): Promise<D1Result<T>>;
  first<T>(): Promise<T | null>;
}
interface Env {
  DB: { prepare(sql: string): D1Stmt };
  ALLOWED_ORIGINS?: string;
}

const MAX_POOL = 20000;

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin') ?? '*';
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin : allowed[0] ?? '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  };
}

const json = (data: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

/** Puzzles that are "today" somewhere on Earth (UTC-12 .. UTC+14). */
function livePuzzles(now = Date.now()): number[] {
  const epoch = Date.UTC(EPOCH.y, EPOCH.m - 1, EPOCH.d);
  const at = (offsetH: number) => Math.floor((now + offsetH * 3600_000 - epoch) / 86_400_000) + 1;
  return [...new Set([at(-12), at(0), at(14)])];
}

const parseArmy = (s: string) => s.split(',').map(Number);

async function realArmies(env: Env, puzzle: number): Promise<number[][]> {
  const rows = await env.DB.prepare('SELECT army FROM plays WHERE puzzle = ? ORDER BY ts LIMIT ?').bind(puzzle, MAX_POOL).all<{ army: string }>();
  return rows.results.map((r) => parseArmy(r.army));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    try {
      if (req.method === 'POST' && path === '/api/play') {
        const { puzzle, army, device } = (await req.json()) as { puzzle: number; army: number[]; device: string };
        if (!livePuzzles().includes(puzzle)) return json({ error: 'not a live puzzle' }, 400, h);
        const map = getDayMap(puzzle);
        if (!isValidArmy(army, map.rules) || typeof device !== 'string' || device.length > 64) return json({ error: 'invalid army' }, 400, h);
        // One ranked play per device per puzzle: first submission wins.
        await env.DB.prepare('INSERT OR IGNORE INTO plays (puzzle, device, army, ts) VALUES (?, ?, ?, ?)').bind(puzzle, device, army.join(','), Date.now()).run();
        const armies = await realArmies(env, puzzle);
        const pool = blendPools(generateCrowd(map), armies);
        const s = scoreVsPool(army, pool, map.rules);
        return json({ armies, score: s.score, frontRates: s.frontRates, n: pool.count }, 200, h);
      }
      if (req.method === 'GET' && path === '/api/pool') {
        const puzzle = Number(url.searchParams.get('puzzle'));
        const device = url.searchParams.get('device') ?? '';
        const played = await env.DB.prepare('SELECT 1 AS ok FROM plays WHERE puzzle = ? AND device = ?').bind(puzzle, device).first<{ ok: number }>();
        if (!played && livePuzzles().includes(puzzle)) return json({ error: 'play first' }, 403, h);
        return json({ armies: await realArmies(env, puzzle) }, 200, { ...h, 'cache-control': 'private, max-age=30' });
      }
      if (req.method === 'POST' && path === '/api/duel') {
        const { puzzle, army, id, name } = (await req.json()) as { puzzle: number; army: number[]; id: number; name: string };
        const map = getDayMap(puzzle);
        if (!isValidArmy(army, map.rules)) return json({ error: 'invalid army' }, 400, h);
        const duelId = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
        await env.DB.prepare('INSERT INTO duels (id, puzzle, challenger, name, army, ts) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(duelId, puzzle, id >>> 0, String(name ?? '').slice(0, 24), army.join(','), Date.now())
          .run();
        return json({ id: duelId }, 200, h);
      }
      const m = path.match(/^\/api\/duel\/([a-z0-9]{4,32})(\/fight)?$/);
      if (m) {
        const row = await env.DB.prepare('SELECT puzzle, challenger, name, army FROM duels WHERE id = ?').bind(m[1]).first<{ puzzle: number; challenger: number; name: string; army: string }>();
        if (!row) return json({ error: 'not found' }, 404, h);
        if (req.method === 'GET' && !m[2]) return json({ puzzle: row.puzzle, id: row.challenger, name: row.name }, 200, h);
        if (req.method === 'POST' && m[2]) {
          const { army } = (await req.json()) as { army: number[] };
          const map = getDayMap(row.puzzle);
          if (!isValidArmy(army, map.rules)) return json({ error: 'invalid army' }, 400, h);
          const theirs = parseArmy(row.army);
          const outcome = resolveBattle(theirs, army, map.rules).outcome;
          await env.DB.prepare('INSERT INTO duel_fights (duel, army, outcome, ts) VALUES (?, ?, ?, ?)').bind(m[1], army.join(','), outcome, Date.now()).run();
          return json({ army: theirs, outcome: -outcome }, 200, h);
        }
      }
      if (req.method === 'POST' && path === '/api/event') {
        const body = (await req.text()).slice(0, 2000);
        let name = 'unknown';
        try {
          name = String((JSON.parse(body) as { name?: string }).name ?? 'unknown').slice(0, 40);
        } catch {
          /* ignore */
        }
        await env.DB.prepare('INSERT INTO events (name, props, ts) VALUES (?, ?, ?)').bind(name, body, Date.now()).run();
        return new Response(null, { status: 204, headers: h });
      }
      return json({ error: 'not found' }, 404, h);
    } catch (e) {
      return json({ error: 'bad request', detail: String(e) }, 400, h);
    }
  },
};
