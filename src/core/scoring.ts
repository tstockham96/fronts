import { effective, type Army } from './battle';
import type { Rules } from './twists';

/** Flat pool of armies: armies[i*5 + f]. */
export interface Pool {
  armies: Uint8Array;
  count: number;
}

export interface PoolScore {
  wins: number;
  ties: number;
  losses: number;
  n: number;
  /** (wins + 0.5 * ties) / n */
  score: number;
  /** Per-front win rate vs pool: (front wins + 0.5 * non-void front ties) / n */
  frontRates: number[];
}

export function poolArmy(pool: Pool, i: number): Army {
  const o = i * 5;
  return [pool.armies[o], pool.armies[o + 1], pool.armies[o + 2], pool.armies[o + 3], pool.armies[o + 4]];
}

export function slicePool(pool: Pool, count: number): Pool {
  return { armies: pool.armies, count: Math.max(0, Math.min(pool.count, count)) };
}

export function poolFromArmies(list: Army[]): Pool {
  const armies = new Uint8Array(list.length * 5);
  list.forEach((a, i) => armies.set(a, i * 5));
  return { armies, count: list.length };
}

/** Hot-path scorer: same rules as resolveBattle, inlined for speed. */
export function scoreVsPool(army: Army, pool: Pool, rules: Rules, withFronts = true): PoolScore {
  const n = pool.count;
  const F = 5;
  const vals = rules.values;
  const adj = rules.adjacencyBonus;
  const tv = rules.tieVoid;
  const r = rules.reinforce;
  const thr = r ? r.threshold : 1e9;
  const bonus = r ? r.bonus : 0;
  const mine = army.map((t) => effective(t, rules));
  const fw = [0, 0, 0, 0, 0];
  const ft = [0, 0, 0, 0, 0];
  const win = [0, 0, 0, 0, 0];
  let wins = 0;
  let ties = 0;
  const A = pool.armies;
  for (let k = 0; k < n; k++) {
    const o = k * F;
    let as = 0;
    let bs = 0;
    for (let f = 0; f < F; f++) {
      let t = A[o + f];
      if (t >= thr) t += bonus;
      const m = mine[f];
      if (m > t) {
        as += vals[f];
        win[f] = 1;
        if (withFronts) fw[f]++;
      } else if (m < t) {
        bs += vals[f];
        win[f] = -1;
      } else {
        win[f] = 0;
        if (!tv[f]) {
          as += vals[f] / 2;
          bs += vals[f] / 2;
          if (withFronts) ft[f]++;
        }
      }
    }
    if (adj) {
      for (let f = 0; f < F - 1; f++) {
        const w = win[f];
        if (w !== 0 && w === win[f + 1]) {
          if (w === 1) as += adj;
          else bs += adj;
        }
      }
    }
    if (as > bs) wins++;
    else if (as === bs) ties++;
  }
  const losses = n - wins - ties;
  const score = n ? (wins + 0.5 * ties) / n : 0;
  const frontRates = fw.map((w, f) => (n ? (w + 0.5 * ft[f]) / n : 0));
  return { wins, ties, losses, n, score, frontRates };
}

/** "Beat X% of generals" */
export function percent(score: number): number {
  return Math.round(score * 100);
}

export type RateColor = 'green' | 'yellow' | 'red';
export function rateColor(rate: number): RateColor {
  if (rate > 0.6) return 'green';
  if (rate >= 0.4) return 'yellow';
  return 'red';
}
export const RATE_EMOJI: Record<RateColor, string> = { green: '🟩', yellow: '🟨', red: '🟥' };

/**
 * Distribution of pool members' own scores (sampled), used for the Strategist
 * badge (top 10%) and for "rank among generals".
 */
export function poolScoreDistribution(pool: Pool, rules: Rules, sample = 300): number[] {
  const n = pool.count;
  const step = Math.max(1, Math.floor(n / sample));
  const out: number[] = [];
  for (let i = 0; i < n && out.length < sample; i += step) {
    out.push(scoreVsPool(poolArmy(pool, i), pool, rules, false).score);
  }
  return out.sort((a, b) => a - b);
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 1;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx];
}
