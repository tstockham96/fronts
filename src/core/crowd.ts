import { makeRng, type Rng } from './rng';
import type { DayMap } from './twists';
import type { Pool } from './scoring';

export const SIM_POOL_SIZE = 2000;

/** Ascending-by-value templates (index 0 = cheapest front, 4 = richest). */
const STACK_BIG = [
  [0, 10, 20, 30, 40],
  [5, 10, 20, 30, 35],
  [0, 0, 20, 35, 45],
  [10, 10, 20, 25, 35],
  [0, 10, 15, 30, 45],
];
const ABANDON_ONE = [
  [0, 25, 25, 25, 25],
  [0, 15, 20, 30, 35],
  [0, 20, 25, 25, 30],
  [0, 10, 25, 30, 35],
  [0, 20, 20, 30, 30],
];
const CONCEDE_TOP = [
  [25, 25, 25, 25, 0],
  [15, 25, 30, 30, 0],
  [20, 20, 30, 30, 0],
  [10, 20, 30, 40, 0],
];
/** Level-2 thinkers: beat the stackers / the flat 20s by a hair. */
const LEVEL_TWO = [
  [1, 11, 21, 31, 36],
  [0, 12, 22, 32, 34],
  [2, 12, 21, 31, 34],
  [0, 0, 21, 36, 43],
  [16, 21, 21, 21, 21],
  [0, 21, 26, 26, 27],
  [0, 1, 26, 36, 37],
  [3, 6, 21, 31, 39],
];

type Strategy = 'even' | 'proportional' | 'stackBig' | 'abandonOne' | 'hammer' | 'coalition' | 'concedeTop' | 'levelTwo' | 'random' | 'tens';
const STRATS: Strategy[] = ['even', 'proportional', 'stackBig', 'abandonOne', 'hammer', 'coalition', 'concedeTop', 'levelTwo', 'random', 'tens'];
const WEIGHTS = [14, 12, 10, 10, 7, 10, 6, 8, 13, 10];

function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}

/** Positions sorted ascending by (believed) value; ties broken randomly. */
function ascendingOrder(vals: number[], rng: Rng): number[] {
  const jitter = vals.map(() => rng.next() * 0.01);
  return vals.map((_, i) => i).sort((a, b) => vals[a] + jitter[a] - (vals[b] + jitter[b]));
}

function fromAscending(tpl: number[], order: number[]): number[] {
  const out = [0, 0, 0, 0, 0];
  order.forEach((pos, rank) => (out[pos] = tpl[rank]));
  return out;
}

/** Force integers in [0,cap] summing to exactly 100. */
export function normalizeArmy(arr: number[], cap: number, rng: Rng): number[] {
  const a = arr.map((x) => Math.max(0, Math.min(cap, Math.round(Number.isFinite(x) ? x : 0))));
  let sum = a.reduce((s, x) => s + x, 0);
  let guard = 0;
  while (sum !== 100 && guard++ < 1000) {
    if (sum < 100) {
      const room = a.map((x, i) => (x < cap ? i : -1)).filter((i) => i >= 0);
      const i = rng.weighted(room, room.map((j) => a[j] + 2));
      const add = Math.min(100 - sum, cap - a[i], sum < 90 ? 5 : 1);
      a[i] += add;
      sum += add;
    } else {
      const have = a.map((x, i) => (x > 0 ? i : -1)).filter((i) => i >= 0);
      const i = rng.weighted(have, have.map((j) => a[j]));
      const sub = Math.min(sum - 100, a[i], sum > 110 ? 5 : 1);
      a[i] -= sub;
      sum -= sub;
    }
  }
  return a;
}

/** Minimal winning coalitions: subsets of fronts worth > half the stars where no member is redundant. */
function minimalCoalitions(vals: number[]): number[][] {
  const total = vals.reduce((a, b) => a + b, 0);
  const out: number[][] = [];
  for (let mask = 1; mask < 32; mask++) {
    const idx = [0, 1, 2, 3, 4].filter((i) => mask & (1 << i));
    const s = idx.reduce((acc, i) => acc + vals[i], 0);
    if (s * 2 <= total) continue;
    if (idx.every((i) => (s - vals[i]) * 2 <= total)) out.push(idx);
  }
  return out;
}

function generateOne(map: DayMap, rng: Rng): number[] {
  const cap = map.rules.maxPerFront;
  // Each simulated human's belief about the board (fog = a guess).
  const vals = map.visible.map((v) => (v === null ? rng.pick([2, 3, 3, 4, 4, 5]) : v));
  const order = ascendingOrder(vals, rng);
  const strat = rng.weighted(STRATS, WEIGHTS);
  let army: number[];
  switch (strat) {
    case 'even': {
      army = [20, 20, 20, 20, 20];
      if (rng.chance(0.3)) {
        const i = rng.int(0, 4);
        let j = rng.int(0, 4);
        if (j === i) j = (j + 1) % 5;
        const d = rng.pick([1, 1, 2, 5]);
        army[i] += d;
        army[j] -= d;
      }
      break;
    }
    case 'proportional': {
      const s = vals.reduce((a, b) => a + b, 0);
      const step = rng.chance(0.65) ? 5 : 1;
      army = vals.map((v) => roundTo((v / s) * 100, step));
      break;
    }
    case 'stackBig':
      army = fromAscending(rng.pick(STACK_BIG), order);
      break;
    case 'abandonOne':
      army = fromAscending(rng.pick(ABANDON_ONE), order);
      break;
    case 'concedeTop':
      army = fromAscending(rng.pick(CONCEDE_TOP), order);
      break;
    case 'levelTwo':
      army = fromAscending(rng.pick(LEVEL_TWO), order);
      break;
    case 'hammer': {
      const top = rng.chance(0.7) ? roundTo(rng.int(45, 65), 5) : rng.int(45, 65);
      const rest = 100 - top;
      const tpl = rng.chance(0.5)
        ? [rest / 4, rest / 4, rest / 4, rest / 4, top]
        : [0, rest / 3, rest / 3, rest / 3, top];
      // Sometimes the hammer falls on the second-best front instead.
      const ord = rng.chance(0.25) ? [...order.slice(0, 3), order[4], order[3]] : order;
      army = fromAscending(tpl, ord);
      break;
    }
    case 'coalition': {
      const coalitions = minimalCoalitions(vals);
      const c = rng.weighted(coalitions, coalitions.map((x) => 6 - x.length));
      army = [0, 0, 0, 0, 0];
      const share = Math.floor(100 / c.length);
      c.forEach((i) => (army[i] = share));
      // Give the remainder to the richest front in the coalition.
      const richest = c.reduce((b, i) => (vals[i] > vals[b] ? i : b), c[0]);
      army[richest] += 100 - share * c.length;
      if (rng.chance(0.3)) {
        // A token troop or two on abandoned fronts.
        for (let i = 0; i < 5; i++) if (!c.includes(i) && rng.chance(0.6)) { army[i] += 1; army[richest] -= 1; }
      }
      break;
    }
    case 'random': {
      const w = vals.map((v) => -Math.log(1 - rng.next()) * (0.6 + v / 5));
      const s = w.reduce((a, b) => a + b, 0);
      const step = rng.chance(0.5) ? 5 : 1;
      army = w.map((x) => roundTo((x / s) * 100, step));
      break;
    }
    case 'tens':
    default: {
      army = [0, 0, 0, 0, 0];
      for (let k = 0; k < 10; k++) army[rng.weighted([0, 1, 2, 3, 4], vals.map((v) => v + 1))] += 10;
      break;
    }
  }

  // --- Twist-aware adaptations: today's meta shifts with the twist. ---
  const top = order[4];
  if (map.rules.reinforce) {
    const thr = map.rules.reinforce.threshold;
    if (rng.chance(0.15)) army = fromAscending(rng.pick([[0, 10, 30, 30, 30], [0, 0, 30, 35, 35], [10, 0, 30, 30, 30]]), order);
    else if (rng.chance(0.4)) army = army.map((t) => (t >= thr - 8 && t < thr ? thr : t));
  }
  if (cap < 100 && rng.chance(0.4)) army[top] = Math.max(army[top], cap);
  if (map.rules.tieVoid.some(Boolean) && rng.chance(0.35)) {
    const d = rng.int(1, 3);
    army[top] += d;
    army[order[0]] -= d;
  }
  if (map.rules.adjacencyBonus && rng.chance(0.2)) {
    let best = 0;
    for (let s = 1; s <= 2; s++) if (vals[s] + vals[s + 1] + vals[s + 2] > vals[best] + vals[best + 1] + vals[best + 2]) best = s;
    army = [0, 0, 0, 0, 0];
    army[best] = 33;
    army[best + 1] = 34;
    army[best + 2] = 33;
  }
  if (map.twist.values && rng.chance(0.15)) {
    army = fromAscending([0, 10, 20, 35, 35], order);
  }

  // --- Human noise ---
  if (rng.chance(0.25)) {
    const moves = rng.int(1, 2);
    for (let m = 0; m < moves; m++) {
      const i = rng.int(0, 4);
      const j = rng.int(0, 4);
      const d = rng.int(1, 4);
      if (i !== j && army[i] >= d) {
        army[i] -= d;
        army[j] += d;
      }
    }
  }
  return normalizeArmy(army, cap, rng);
}

const poolCache = new Map<number, Pool>();

/** ~2,000 human-like simulated armies, fully determined by the day seed. */
export function generateCrowd(map: DayMap, count = SIM_POOL_SIZE): Pool {
  const cached = poolCache.get(map.puzzle);
  if (cached && cached.count === count) return cached;
  const rng = makeRng(`fronts-crowd-${map.puzzle}`);
  const armies = new Uint8Array(count * 5);
  for (let i = 0; i < count; i++) armies.set(generateOne(map, rng), i * 5);
  const pool = { armies, count };
  if (count === SIM_POOL_SIZE) poolCache.set(map.puzzle, pool);
  return pool;
}

/**
 * Cold-start blend: simulated armies fade out as real ones arrive
 * (sims capped at max(0, 2000 - 2 * realCount)).
 */
export function blendPools(sim: Pool, real: number[][]): Pool {
  const simCount = Math.max(0, Math.min(sim.count, SIM_POOL_SIZE - 2 * real.length));
  const armies = new Uint8Array((simCount + real.length) * 5);
  armies.set(sim.armies.subarray(0, simCount * 5), 0);
  real.forEach((a, i) => armies.set(a, (simCount + i) * 5));
  return { armies, count: simCount + real.length };
}

/**
 * How many armies have "arrived" so far today (static mode): the crowd fills up
 * through the day so your live rank moves until midnight, then it's final.
 */
export function liveCount(fraction: number, total = SIM_POOL_SIZE): number {
  const f = Math.max(0, Math.min(1, fraction));
  return Math.round(total * (0.45 + 0.55 * f));
}
