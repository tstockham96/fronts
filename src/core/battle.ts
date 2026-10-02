import type { Rules } from './twists';

export type Army = number[];
export type Side = 1 | 0 | -1; // 1 = A wins, -1 = B wins, 0 = tie

export interface FrontResult {
  a: number;
  b: number;
  aEff: number;
  bEff: number;
  value: number;
  winner: Side;
  aStars: number;
  bStars: number;
  /** Tie on a front where ties award nothing (Fortress). */
  voided: boolean;
}

export interface BattleResult {
  fronts: FrontResult[];
  aBonus: number;
  bBonus: number;
  aStars: number;
  bStars: number;
  outcome: Side;
  /** Indices i where fronts i and i+1 form a bonus chain (sign = who gets it). */
  chains: { index: number; side: Side }[];
}

export function effective(troops: number, rules: Rules): number {
  const r = rules.reinforce;
  return r && troops >= r.threshold ? troops + r.bonus : troops;
}

export function isValidArmy(army: unknown, rules: Rules): army is Army {
  if (!Array.isArray(army) || army.length !== rules.values.length) return false;
  let sum = 0;
  for (const t of army) {
    if (!Number.isInteger(t) || t < 0 || t > rules.maxPerFront) return false;
    sum += t;
  }
  return sum === 100;
}

/**
 * Resolve one battle. On each front more effective troops wins its stars; a tie
 * splits them (unless the front voids ties). Adjacency bonuses are added, then
 * more total stars wins; equal stars is a tie. (In Classic this is identical to
 * "more than half of all stars wins".)
 */
export function resolveBattle(a: Army, b: Army, rules: Rules): BattleResult {
  const fronts: FrontResult[] = [];
  let aStars = 0;
  let bStars = 0;
  for (let i = 0; i < rules.values.length; i++) {
    const value = rules.values[i];
    const aEff = effective(a[i], rules);
    const bEff = effective(b[i], rules);
    let winner: Side = 0;
    let as = 0;
    let bs = 0;
    let voided = false;
    if (aEff > bEff) {
      winner = 1;
      as = value;
    } else if (bEff > aEff) {
      winner = -1;
      bs = value;
    } else if (rules.tieVoid[i]) {
      voided = true;
    } else {
      as = bs = value / 2;
    }
    aStars += as;
    bStars += bs;
    fronts.push({ a: a[i], b: b[i], aEff, bEff, value, winner, aStars: as, bStars: bs, voided });
  }
  let aBonus = 0;
  let bBonus = 0;
  const chains: { index: number; side: Side }[] = [];
  if (rules.adjacencyBonus) {
    for (let i = 0; i < fronts.length - 1; i++) {
      const w = fronts[i].winner;
      if (w !== 0 && w === fronts[i + 1].winner) {
        chains.push({ index: i, side: w });
        if (w === 1) aBonus += rules.adjacencyBonus;
        else bBonus += rules.adjacencyBonus;
      }
    }
  }
  aStars += aBonus;
  bStars += bBonus;
  const outcome: Side = aStars > bStars ? 1 : aStars < bStars ? -1 : 0;
  return { fronts, aBonus, bBonus, aStars, bStars, outcome, chains };
}
