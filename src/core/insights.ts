import type { Army } from './battle';
import { makeRng } from './rng';
import { normalizeArmy } from './crowd';
import { poolArmy, scoreVsPool, type Pool } from './scoring';
import type { DayMap, Rules } from './twists';

export function averageArmy(pool: Pool): number[] {
  const s = [0, 0, 0, 0, 0];
  for (let i = 0; i < pool.count * 5; i++) s[i % 5] += pool.armies[i];
  return s.map((x) => (pool.count ? x / pool.count : 0));
}

export interface CommonArmy {
  army: Army;
  count: number;
  share: number;
}

export function commonArmies(pool: Pool, k = 5): CommonArmy[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < pool.count; i++) {
    const key = poolArmy(pool, i).join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, k)
    .map(([key, count]) => ({ army: key.split(',').map(Number), count, share: count / pool.count }));
}

function samplePool(pool: Pool, size: number): Pool {
  if (pool.count <= size) return pool;
  const step = pool.count / size;
  const armies = new Uint8Array(size * 5);
  for (let i = 0; i < size; i++) armies.set(pool.armies.subarray(Math.floor(i * step) * 5, Math.floor(i * step) * 5 + 5), i * 5);
  return { armies, count: size };
}

function climb(start: Army, pool: Pool, rules: Rules): { army: Army; score: number } {
  let cur = [...start];
  let curScore = scoreVsPool(cur, pool, rules, false).score;
  const cap = rules.maxPerFront;
  for (const step of [10, 5, 2, 1]) {
    for (let iter = 0; iter < 30; iter++) {
      let best: Army | null = null;
      let bestScore = curScore;
      for (let i = 0; i < 5; i++) {
        if (cur[i] < step) continue;
        for (let j = 0; j < 5; j++) {
          if (i === j || cur[j] + step > cap) continue;
          const cand = [...cur];
          cand[i] -= step;
          cand[j] += step;
          const s = scoreVsPool(cand, pool, rules, false).score;
          if (s > bestScore + 1e-9) {
            bestScore = s;
            best = cand;
          }
        }
      }
      if (!best) break;
      cur = best;
      curScore = bestScore;
    }
  }
  return { army: cur, score: curScore };
}

/**
 * "Best army in hindsight": evaluate a handful of candidates (popular armies,
 * classic shapes, seeded randoms) against a sample of the pool, hill-climb the
 * top few, then re-score finalists against the full pool.
 */
export function bestInHindsight(map: DayMap, pool: Pool, extra: Army[] = []): { army: Army; score: number } {
  const rules = map.rules;
  const rng = makeRng(`fronts-hindsight-${map.puzzle}-${pool.count}`);
  const sample = samplePool(pool, 700);
  const vals = rules.values;
  const sum = vals.reduce((a, b) => a + b, 0);
  const cands: Army[] = [
    ...extra,
    ...commonArmies(pool, 25).map((c) => c.army),
    normalizeArmy(vals.map((v) => (v / sum) * 100), rules.maxPerFront, rng),
    normalizeArmy([20, 20, 20, 20, 20], rules.maxPerFront, rng),
  ];
  for (let k = 0; k < 30; k++) {
    const w = vals.map((v) => -Math.log(1 - rng.next()) * v);
    const s = w.reduce((a, b) => a + b, 0);
    cands.push(normalizeArmy(w.map((x) => (x / s) * 100), rules.maxPerFront, rng));
  }
  const scored = cands
    .map((a) => ({ army: a, score: scoreVsPool(a, sample, rules, false).score }))
    .sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const starts = scored.filter((c) => (seen.has(c.army.join()) ? false : (seen.add(c.army.join()), true))).slice(0, 3);
  const finalists = starts.map((s) => climb(s.army, sample, rules));
  let best = { army: finalists[0].army, score: -1 };
  for (const f of finalists) {
    const s = scoreVsPool(f.army, pool, rules, false).score;
    if (s > best.score) best = { army: f.army, score: s };
  }
  return best;
}

/** One-line crowd hint, e.g. "Most people overloaded ★5". Twist-specific insights win when available. */
export function crowdHint(map: DayMap, pool: Pool, avg: number[], common: CommonArmy[], player?: Army, rates?: number[]): string {
  const vals = map.rules.values;
  const n = Math.max(1, pool.count);
  const A = pool.armies;
  const sum = vals.reduce((a, b) => a + b, 0);
  const top = vals.indexOf(Math.max(...vals));
  const low = vals.indexOf(Math.min(...vals));
  const fair = (vals[top] / sum) * 100;
  const pctOf = (k: number) => Math.round((k / n) * 100);
  const options: { score: number; text: string }[] = [];

  // --- twist-specific ---
  if (map.hiddenIndex >= 0) {
    const h = map.hiddenIndex;
    options.push({ score: 10, text: `The fog hid ★${vals[h]} at ${map.names[h]}. The crowd sent ${Math.round(avg[h])} troops into the mist.` });
  }
  if (map.rules.reinforce) {
    const thr = map.rules.reinforce.threshold;
    let k = 0;
    for (let i = 0; i < pool.count; i++) {
      for (let f = 0; f < 5; f++) if (A[i * 5 + f] === thr) { k++; break; }
    }
    options.push({ score: 10, text: `${pctOf(k)}% of armies parked exactly ${thr} somewhere to grab the +${map.rules.reinforce.bonus}.` });
  }
  if (map.rules.tieVoid.some(Boolean)) {
    const hist = new Map<number, number>();
    for (let i = 0; i < pool.count; i++) hist.set(A[i * 5 + top], (hist.get(A[i * 5 + top]) ?? 0) + 1);
    const [bid, k] = [...hist.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    options.push({ score: 10, text: `Most common ★${vals[top]} bid: ${bid} troops (${pctOf(k)}%). Every tie there scored nothing.` });
  }
  if (map.rules.maxPerFront < 100) {
    const cap = map.rules.maxPerFront;
    let k = 0;
    for (let i = 0; i < pool.count; i++) {
      for (let f = 0; f < 5; f++) if (A[i * 5 + f] === cap) { k++; break; }
    }
    options.push({ score: 10, text: `${pctOf(k)}% of generals maxed out a front at ${cap}.` });
  }
  if (map.rules.adjacencyBonus) {
    let k = 0;
    for (let i = 0; i < pool.count; i++) {
      for (let f = 0; f < 3; f++) if (A[i * 5 + f] >= 25 && A[i * 5 + f + 1] >= 25 && A[i * 5 + f + 2] >= 25) { k++; break; }
    }
    options.push({ score: 10, text: `${pctOf(k)}% of generals stacked three neighbouring fronts to farm chain bonuses.` });
  }
  const peaks = vals.map((v, i) => (v === vals[top] ? i : -1)).filter((i) => i >= 0);
  if (peaks.length === 2) {
    options.push({ score: 10, text: `The crowd split the peaks: ${Math.round(avg[peaks[0]])} on ${map.names[peaks[0]]}, ${Math.round(avg[peaks[1]])} on ${map.names[peaks[1]]}.` });
  }

  // --- general crowd reads ---
  if (avg[top] > fair + 2) options.push({ score: 9 + (avg[top] - fair) / 10, text: `Most generals overloaded ★${vals[top]}: ${Math.round(avg[top])} troops on average.` });
  const perStar = avg.map((a, i) => a / vals[i]);
  const cheap = perStar.indexOf(Math.min(...perStar));
  options.push({ score: 8.5, text: `★${vals[cheap]} ${map.names[cheap]} was the bargain: the crowd paid just ${perStar[cheap].toFixed(1)} troops per star there.` });
  let zeroLow = 0;
  let flat = 0;
  for (let i = 0; i < pool.count; i++) {
    if (A[i * 5 + low] === 0) zeroLow++;
    let isFlat = true;
    for (let f = 0; f < 5; f++) if (A[i * 5 + f] !== 20) isFlat = false;
    if (isFlat) flat++;
  }
  if (zeroLow / n > 0.35) options.push({ score: 8, text: `${pctOf(zeroLow)}% of generals left ★${vals[low]} empty. Cheap stars were up for grabs.` });
  if (flat / n > 0.05) options.push({ score: 4 + (flat / n) * 40, text: `${pctOf(flat)}% played the flat 20s. 21 beats 20.` });
  if (player && rates) {
    let worst = -1;
    for (let i = 0; i < 5; i++) if (player[i] > 0 && (worst < 0 || rates[i] < rates[worst])) worst = i;
    if (worst >= 0 && rates[worst] < 0.3) {
      options.push({ score: 7, text: `You sent ${player[worst]} to ★${vals[worst]} and still lost it ${Math.round((1 - rates[worst]) * 100)}% of the time. Crowd average: ${Math.round(avg[worst])}.` });
    }
  }
  if (common[0] && common[0].share > 0.03) options.push({ score: 5, text: `Most common army: ${common[0].army.join('·')} (${Math.round(common[0].share * 100)}% of generals).` });
  options.sort((a, b) => b.score - a.score);
  return options[0]?.text ?? 'No dominant strategy today. The crowd was all over the map.';
}
