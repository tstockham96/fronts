import { resolveBattle, type Army, type BattleResult } from './core/battle';
import { playerBadge, type Badge } from './core/badge';
import { blendPools, generateCrowd, liveCount } from './core/crowd';
import { dayFraction, puzzleNumberFor } from './core/date';
import { averageArmy, bestInHindsight, commonArmies, crowdHint, type CommonArmy } from './core/insights';
import { hashStr } from './core/rng';
import { percent, poolArmy, poolScoreDistribution, quantile, scoreVsPool, slicePool, type Pool, type PoolScore } from './core/scoring';
import { getDayMap, type DayMap } from './core/twists';

const realArmies = new Map<number, number[][]>();
export function setRealArmies(puzzle: number, armies: number[][]) {
  realArmies.set(puzzle, armies);
}

export function today(): number {
  return puzzleNumberFor(new Date());
}

const poolRefs = new Map<string, Pool>();
/**
 * The pool a player is scored against right now (memoized so the same inputs
 * return the same object; UI memoization relies on reference equality).
 */
export function currentPool(puzzle: number): Pool {
  const map = getDayMap(puzzle);
  const sim = generateCrowd(map);
  const real = realArmies.get(puzzle);
  const live = puzzle === today() ? liveCount(dayFraction()) : sim.count;
  const key = `${puzzle}:${real?.length ?? 0}:${real?.length ? 0 : live}`;
  let pool = poolRefs.get(key);
  if (!pool) {
    pool = real && real.length ? blendPools(sim, real) : live < sim.count ? slicePool(sim, live) : sim;
    poolRefs.set(key, pool);
  }
  return pool;
}

export function pickRival(pool: Pool, seed: string): number {
  return hashStr(seed) % Math.max(1, pool.count);
}

const distCache = new Map<string, number[]>();
function p90(map: DayMap, pool: Pool): number {
  const key = `${map.puzzle}:${pool.count}`;
  let d = distCache.get(key);
  if (!d) {
    d = poolScoreDistribution(pool, map.rules);
    distCache.set(key, d);
  }
  return quantile(d, 0.9);
}

export interface Analysis {
  map: DayMap;
  pool: Pool;
  score: PoolScore;
  pct: number;
  badge: Badge;
  avg: number[];
  common: CommonArmy[];
  hint: string;
}

export function analyze(map: DayMap, pool: Pool, army: Army): Analysis {
  const score = scoreVsPool(army, pool, map.rules);
  const top10 = score.score >= p90(map, pool);
  const avg = averageArmy(pool);
  const common = commonArmies(pool, 5);
  return {
    map,
    pool,
    score,
    pct: percent(score.score),
    badge: playerBadge(army, map.rules, score.frontRates, top10),
    avg,
    common,
    hint: crowdHint(map, pool, avg, common, army, score.frontRates),
  };
}

const hindsightCache = new Map<string, { army: Army; score: number }>();
export function hindsight(map: DayMap, pool: Pool): { army: Army; score: number } {
  const key = `${map.puzzle}:${pool.count}`;
  let h = hindsightCache.get(key);
  if (!h) {
    h = bestInHindsight(map, pool);
    hindsightCache.set(key, h);
  }
  return h;
}

export function battle(map: DayMap, a: Army, b: Army): BattleResult {
  return resolveBattle(a, b, map.rules);
}

export { poolArmy };
