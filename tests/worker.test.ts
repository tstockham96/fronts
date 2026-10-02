import { describe, expect, it } from 'vitest';
import worker from '../worker/src/index';
// @ts-expect-error plain JS helper
import { fakeD1 } from '../scripts/fake-d1.mjs';
import { puzzleNumberFor } from '../src/core/date';

const env = { DB: fakeD1(), ALLOWED_ORIGINS: '*' };
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://api.test${path}`, init), env as never);
const post = (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
// The server accepts any puzzle that is "today" somewhere on Earth; UTC today always qualifies.
const now = new Date();
const today = puzzleNumberFor(new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));

describe('worker API', () => {
  it('hides the pool until you play, then returns real armies + server score', async () => {
    expect((await call(`/api/pool?puzzle=${today}&device=dev1`)).status).toBe(403);
    const r = await post('/api/play', { puzzle: today, army: [20, 20, 20, 20, 20], device: 'dev1' });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { armies: number[][]; score: number; n: number };
    expect(body.armies).toEqual([[20, 20, 20, 20, 20]]);
    expect(body.n).toBe(2000 - 2 + 1);
    expect(body.score).toBeGreaterThan(0);
    expect((await call(`/api/pool?puzzle=${today}&device=dev1`)).status).toBe(200);
  });
  it('one ranked play per device; rejects invalid armies and stale puzzles', async () => {
    await post('/api/play', { puzzle: today, army: [0, 0, 30, 30, 40], device: 'dev1' });
    const pool = (await (await call(`/api/pool?puzzle=${today}&device=dev1`)).json()) as { armies: number[][] };
    expect(pool.armies).toHaveLength(1);
    expect((await post('/api/play', { puzzle: today, army: [50, 50, 50, 0, 0], device: 'dev2' })).status).toBe(400);
    expect((await post('/api/play', { puzzle: today - 30, army: [20, 20, 20, 20, 20], device: 'dev2' })).status).toBe(400);
  });
  it('stores duels server-side and only reveals the army after the opponent commits', async () => {
    const r = (await (await post('/api/duel', { puzzle: today, army: [0, 10, 20, 30, 40], id: 42, name: 'Maya' })).json()) as { id: string };
    const meta = (await (await call(`/api/duel/${r.id}`)).json()) as Record<string, unknown>;
    expect(meta).toEqual({ puzzle: today, id: 42, name: 'Maya' });
    expect(JSON.stringify(meta)).not.toContain('40');
    const fight = (await (await post(`/api/duel/${r.id}/fight`, { army: [20, 20, 20, 20, 20] })).json()) as { army: number[]; outcome: number };
    expect(fight.army).toEqual([0, 10, 20, 30, 40]);
    expect([1, 0, -1]).toContain(fight.outcome);
    expect((await call('/api/duel/doesnotexist')).status).toBe(404);
  });
  it('accepts analytics events and answers CORS preflight', async () => {
    expect((await post('/api/event', { name: 'shared', props: {} })).status).toBe(204);
    const pre = await call('/api/play', { method: 'OPTIONS', headers: { origin: 'https://fronts.gg' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://fronts.gg');
  });
});
