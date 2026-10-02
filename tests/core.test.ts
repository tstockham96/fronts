import { describe, expect, it } from 'vitest';
import { resolveBattle, isValidArmy, effective } from '../src/core/battle';
import { TWISTS, twistFor, getDayMap, rulesFor, type TwistDef } from '../src/core/twists';
import { generateCrowd, blendPools, normalizeArmy, liveCount, SIM_POOL_SIZE } from '../src/core/crowd';
import { scoreVsPool, poolFromArmies, poolArmy, percent, rateColor, slicePool } from '../src/core/scoring';
import { averageArmy, commonArmies, bestInHindsight, crowdHint } from '../src/core/insights';
import { playerBadge } from '../src/core/badge';
import { shareText } from '../src/core/share';
import { encodeDuel, decodeDuel } from '../src/core/duel';
import { makeRng, hashStr } from '../src/core/rng';
import { puzzleNumberFor, dateForPuzzle } from '../src/core/date';

const byId = (id: string) => TWISTS.find((t) => t.id === id)!;
const classic = rulesFor(byId('classic'), [1, 2, 3, 4, 5]);

describe('battle resolution', () => {
  it('more troops wins the front and its stars', () => {
    const r = resolveBattle([0, 0, 30, 30, 40], [20, 20, 20, 20, 20], classic);
    expect(r.fronts.map((f) => f.winner)).toEqual([-1, -1, 1, 1, 1]);
    expect(r.aStars).toBe(12);
    expect(r.bStars).toBe(3);
    expect(r.outcome).toBe(1);
  });
  it('ties split stars; identical armies tie', () => {
    const r = resolveBattle([20, 20, 20, 20, 20], [20, 20, 20, 20, 20], classic);
    expect(r.aStars).toBe(7.5);
    expect(r.bStars).toBe(7.5);
    expect(r.outcome).toBe(0);
  });
  it('more than half the stars wins (7.5 of 15 is a tie)', () => {
    // A takes ★5 + ★2 = 7, tie on ★1 (0.5 each) => 7.5 vs 7.5
    const r = resolveBattle([10, 30, 0, 0, 60], [10, 0, 40, 50, 0], classic);
    expect(r.aStars).toBe(7.5);
    expect(r.outcome).toBe(0);
  });
  it('is antisymmetric', () => {
    const rng = makeRng(1);
    for (let k = 0; k < 200; k++) {
      const a = normalizeArmy([rng.int(0, 50), rng.int(0, 50), rng.int(0, 50), rng.int(0, 50), rng.int(0, 50)], 100, rng);
      const b = normalizeArmy([rng.int(0, 50), rng.int(0, 50), rng.int(0, 50), rng.int(0, 50), rng.int(0, 50)], 100, rng);
      expect(resolveBattle(a, b, classic).outcome + resolveBattle(b, a, classic).outcome).toBe(0);
    }
  });
  it('validates armies', () => {
    expect(isValidArmy([20, 20, 20, 20, 20], classic)).toBe(true);
    expect(isValidArmy([20, 20, 20, 20, 19], classic)).toBe(false);
    expect(isValidArmy([20, 20, 20, 20, 20.5], classic)).toBe(false);
    expect(isValidArmy([-1, 21, 20, 20, 40], classic)).toBe(false);
    expect(isValidArmy([0, 0, 0, 50, 50], rulesFor(byId('supply'), [1, 2, 3, 4, 5]))).toBe(false);
  });
});

describe('twists', () => {
  it('Fortress: ties on ★5 award nothing to either side', () => {
    const rules = rulesFor(byId('fortress'), [3, 5, 1, 2, 4]);
    expect(rules.tieVoid).toEqual([false, true, false, false, false]);
    const r = resolveBattle([10, 40, 10, 20, 20], [20, 40, 0, 10, 30], rules);
    expect(r.fronts[1].voided).toBe(true);
    expect(r.fronts[1].aStars + r.fronts[1].bStars).toBe(0);
    // A: ★1 + ★2 = 3, B: ★3 + ★4 = 7
    expect(r.aStars).toBe(3);
    expect(r.bStars).toBe(7);
    // A tie elsewhere still splits
    const r2 = resolveBattle([20, 20, 20, 20, 20], [20, 20, 20, 20, 20], rules);
    expect(r2.aStars).toBe(5);
    expect(r2.outcome).toBe(0);
  });
  it('Reinforcements: 30+ troops fight with +5', () => {
    const rules = rulesFor(byId('reinforce'), [1, 2, 3, 4, 5]);
    expect(effective(29, rules)).toBe(29);
    expect(effective(30, rules)).toBe(35);
    const r = resolveBattle([0, 0, 30, 35, 35], [0, 0, 34, 33, 33], rules);
    expect(r.fronts[2].winner).toBe(-1); // 30+5=35 vs 34+5=39
    expect(r.fronts[3].winner).toBe(1); // 35+5=40 vs 33+5=38
    const r2 = resolveBattle([0, 0, 30, 35, 35], [0, 0, 29, 36, 35], rules);
    expect(r2.fronts[2].aEff).toBe(35);
    expect(r2.fronts[2].bEff).toBe(29);
    expect(r2.fronts[2].winner).toBe(1);
  });
  it('Reinforcements bonus applies to both sides', () => {
    const rules = rulesFor(byId('reinforce'), [1, 2, 3, 4, 5]);
    const r = resolveBattle([10, 0, 30, 30, 30], [0, 10, 33, 28, 29], rules);
    // front2: 35 vs 38 -> B ; front3: 35 vs 28 -> A ; front4: 35 vs 29 -> A
    expect(r.fronts.map((f) => f.winner)).toEqual([1, -1, -1, 1, 1]);
  });
  it('Cascade: +1 star per adjacent pair won', () => {
    const rules = rulesFor(byId('cascade'), [1, 2, 3, 4, 5]);
    const r = resolveBattle([0, 0, 34, 33, 33], [20, 20, 20, 20, 20], rules);
    expect(r.aBonus).toBe(2); // fronts 2-3 and 3-4
    expect(r.bBonus).toBe(1); // fronts 0-1
    expect(r.aStars).toBe(14);
    expect(r.bStars).toBe(4);
  });
  it('Supply Cap and Twin Peaks shape the rules', () => {
    expect(rulesFor(byId('supply'), [1, 2, 3, 4, 5]).maxPerFront).toBe(40);
    for (let p = 1; p < 200; p++) {
      const m = getDayMap(p);
      if (m.twist.id === 'twin') expect([...m.rules.values].sort()).toEqual([1, 2, 3, 5, 5]);
    }
  });
  it('Fog of War hides one ★2–★5 front, true value in 2..5', () => {
    let seen = 0;
    for (let p = 1; p < 300; p++) {
      const m = getDayMap(p);
      if (m.twist.id !== 'fog') {
        expect(m.hiddenIndex).toBe(-1);
        continue;
      }
      seen++;
      expect(m.visible[m.hiddenIndex]).toBeNull();
      expect(m.visible.filter((v) => v === null)).toHaveLength(1);
      const v = m.rules.values[m.hiddenIndex];
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
    expect(seen).toBeGreaterThan(30);
  });
  it('rotation is deterministic, uses every twist once per cycle, and never repeats day-to-day', () => {
    const n = TWISTS.length;
    for (let c = 0; c < 30; c++) {
      const ids = new Set(Array.from({ length: n }, (_, i) => twistFor(c * n + i + 1).id));
      expect(ids.size).toBe(n);
    }
    for (let p = 1; p < 500; p++) {
      expect(twistFor(p).id).toBe(twistFor(p).id);
      expect(twistFor(p).id).not.toBe(twistFor(p + 1).id);
    }
  });
  it('rotation is data-driven (works with a custom list)', () => {
    const list: TwistDef[] = [byId('classic'), byId('fog'), { id: 'x', name: 'X', emoji: '❌', rule: '', tease: '' }];
    const ids = new Set(Array.from({ length: 3 }, (_, i) => twistFor(i + 1, list).id));
    expect(ids).toEqual(new Set(['classic', 'fog', 'x']));
  });
  it('day maps are deterministic', () => {
    expect(JSON.stringify(getDayMap(42))).toBe(JSON.stringify(getDayMap(42)));
    expect(getDayMap(1).names).toHaveLength(5);
  });
});

describe('simulated crowd', () => {
  it('is deterministic per day and differs across days', () => {
    const m = getDayMap(7);
    const a = generateCrowd(m);
    const b = generateCrowd({ ...m }, SIM_POOL_SIZE + 0); // cache-independent check below
    expect(a.count).toBe(2000);
    expect(hashStr(Array.from(a.armies).join())).toBe(hashStr(Array.from(b.armies).join()));
    const fresh = generateCrowd(getDayMap(7), 1999);
    expect(Array.from(fresh.armies.subarray(0, 500))).toEqual(Array.from(a.armies.subarray(0, 500)));
    const other = generateCrowd(getDayMap(8));
    expect(Array.from(other.armies.subarray(0, 100))).not.toEqual(Array.from(a.armies.subarray(0, 100)));
  });
  it('every simulated army is valid for its day', () => {
    for (let p = 1; p <= 14; p++) {
      const m = getDayMap(p);
      const pool = generateCrowd(m);
      for (let i = 0; i < pool.count; i++) expect(isValidArmy(poolArmy(pool, i), m.rules)).toBe(true);
    }
  });
  it('looks human: lots of 20s, round numbers, empty cheap fronts', () => {
    const m = getDayMap(3);
    const pool = generateCrowd(m);
    const top = commonArmies(pool, 1)[0];
    expect(top.army).toEqual([20, 20, 20, 20, 20]);
    expect(top.share).toBeGreaterThan(0.05);
    let mult5 = 0;
    for (const t of pool.armies) if (t % 5 === 0) mult5++;
    expect(mult5 / pool.armies.length).toBeGreaterThan(0.6);
    const low = m.rules.values.indexOf(1);
    let zeros = 0;
    for (let i = 0; i < pool.count; i++) if (pool.armies[i * 5 + low] === 0) zeros++;
    expect(zeros / pool.count).toBeGreaterThan(0.1);
  });
  it('blends real armies and fades sims', () => {
    const sim = generateCrowd(getDayMap(5));
    const real = Array.from({ length: 300 }, () => [20, 20, 20, 20, 20]);
    const p = blendPools(sim, real);
    expect(p.count).toBe(2000 - 600 + 300);
    expect(blendPools(sim, Array.from({ length: 1200 }, () => [20, 20, 20, 20, 20])).count).toBe(1200);
  });
  it('live pool grows through the day', () => {
    expect(liveCount(0)).toBeLessThan(liveCount(0.5));
    expect(liveCount(1)).toBe(2000);
  });
});

describe('scoring', () => {
  it('score = (wins + ties/2) / N and matches resolveBattle', () => {
    const m = getDayMap(11);
    const pool = slicePool(generateCrowd(m), 400);
    const army = [5, 15, 25, 25, 30];
    const s = scoreVsPool(army, pool, m.rules);
    let w = 0, t = 0;
    const fr = [0, 0, 0, 0, 0];
    for (let i = 0; i < pool.count; i++) {
      const r = resolveBattle(army, poolArmy(pool, i), m.rules);
      if (r.outcome === 1) w++;
      if (r.outcome === 0) t++;
      r.fronts.forEach((f, k) => (fr[k] += f.winner === 1 ? 1 : f.winner === 0 && !f.voided ? 0.5 : 0));
    }
    expect(s.wins).toBe(w);
    expect(s.ties).toBe(t);
    expect(s.score).toBeCloseTo((w + t / 2) / pool.count, 10);
    s.frontRates.forEach((r, k) => expect(r).toBeCloseTo(fr[k] / pool.count, 10));
  });
  it('fast scorer agrees with resolveBattle under every twist', () => {
    for (const tw of TWISTS) {
      const rules = rulesFor(tw, tw.values ?? [2, 5, 1, 4, 3]);
      const rng = makeRng(tw.id);
      const armies = Array.from({ length: 300 }, () => normalizeArmy([rng.int(0, 45), rng.int(0, 45), rng.int(0, 45), rng.int(0, 45), rng.int(0, 45)], rules.maxPerFront, rng));
      const pool = poolFromArmies(armies);
      const me = armies[0];
      const s = scoreVsPool(me, pool, rules);
      let pts = 0;
      for (const b of armies) {
        const o = resolveBattle(me, b, rules).outcome;
        pts += o === 1 ? 1 : o === 0 ? 0.5 : 0;
      }
      expect(s.score).toBeCloseTo(pts / armies.length, 10);
    }
  });
  it('percent and colors', () => {
    expect(percent(0.724)).toBe(72);
    expect(rateColor(0.61)).toBe('green');
    expect(rateColor(0.6)).toBe('yellow');
    expect(rateColor(0.4)).toBe('yellow');
    expect(rateColor(0.39)).toBe('red');
  });
  it('best army in hindsight beats the common armies', () => {
    const m = getDayMap(4);
    const pool = generateCrowd(m);
    const best = bestInHindsight(m, pool);
    expect(isValidArmy(best.army, m.rules)).toBe(true);
    const common = commonArmies(pool, 3);
    for (const c of common) expect(best.score).toBeGreaterThan(scoreVsPool(c.army, pool, m.rules).score);
    expect(best.score).toBeGreaterThan(0.8);
  });
  it('averages and hint', () => {
    const m = getDayMap(4);
    const pool = generateCrowd(m);
    const avg = averageArmy(pool);
    expect(avg.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect(crowdHint(m, pool, avg, commonArmies(pool)).length).toBeGreaterThan(10);
  });
});

describe('badges', () => {
  const rates = [0.5, 0.5, 0.5, 0.5, 0.5];
  it('assigns player types', () => {
    expect(playerBadge([20, 20, 20, 20, 20], classic, rates, true).id).toBe('strategist');
    expect(playerBadge([5, 5, 5, 35, 50], classic, rates, false).id).toBe('hammer');
    expect(playerBadge([0, 0, 30, 30, 40], classic, rates, false).id).toBe('gambler');
    expect(playerBadge([16, 18, 22, 24, 20], classic, rates, false).id).toBe('wall');
    expect(playerBadge([30, 30, 30, 10, 0], classic, [0.9, 0.8, 0.7, 0.3, 0], false).id).toBe('flanker');
  });
});

describe('share + duel', () => {
  it('share text is spoiler-free and well-formed', () => {
    const m = getDayMap(1);
    const txt = shareText({ map: m, pct: 72, badgeEmoji: '🔨', frontRates: [0.7, 0.5, 0.2, 0.9, 0.65], link: 'https://fronts.gg/#d=abc' });
    const lines = txt.split('\n');
    expect(lines[0]).toBe(`FRONTS #1 ⚔️ ${m.twist.name}`);
    expect(lines[1]).toBe('Beat 72% of generals 🔨');
    expect(lines[2].match(/★/g)).toHaveLength(5);
    expect(lines[3]).toBe('Break my line 👉 https://fronts.gg/#d=abc');
    expect(txt).not.toMatch(/\b(20|30|40)\b/);
  });
  it('fog front shows ★? in the share', () => {
    let p = 1;
    while (getDayMap(p).twist.id !== 'fog') p++;
    const txt = shareText({ map: getDayMap(p), pct: 50, badgeEmoji: '🧱', frontRates: [0.5, 0.5, 0.5, 0.5, 0.5], link: 'x' });
    expect(txt).toContain('★?');
  });
  it('duel links round-trip and are obfuscated', () => {
    const p = { puzzle: 88, army: [0, 10, 20, 30, 40], id: 3735928559, name: 'Maya 🦊' };
    const code = encodeDuel(p, 77);
    expect(decodeDuel(code)).toEqual(p);
    expect(code).not.toContain('Maya');
    expect(encodeDuel(p, 78)).not.toBe(code);
    const tampered = code.slice(0, 5) + (code[5] === 'A' ? 'B' : 'A') + code.slice(6);
    expect(decodeDuel(tampered)).toBeNull();
    expect(decodeDuel('garbage!!')).toBeNull();
    const long = decodeDuel(encodeDuel({ ...p, name: '🦊🦊🦊🦊🦊🦊🦊 General' }));
    expect(long?.name).toBe('🦊🦊🦊🦊🦊🦊');
  });
});

describe('dates', () => {
  it('puzzle numbers follow the local calendar day', () => {
    expect(puzzleNumberFor(new Date(2026, 9, 2, 0, 1))).toBe(1);
    expect(puzzleNumberFor(new Date(2026, 9, 2, 23, 59))).toBe(1);
    expect(puzzleNumberFor(new Date(2026, 9, 3, 0, 0))).toBe(2);
    expect(puzzleNumberFor(new Date(2027, 9, 2, 12))).toBe(366);
    expect(dateForPuzzle(1).getUTCDate()).toBe(2);
  });
});
