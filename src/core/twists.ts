import { makeRng } from './rng';

/**
 * Data-driven twist list. A twist is just a bag of rule modifiers that the
 * battle engine understands. To add a twist, add an entry here (and, if it needs
 * a brand-new modifier, teach `rulesFor`/`battle.ts` about it).
 */
export interface TwistDef {
  id: string;
  name: string;
  emoji: string;
  /** One-line rule shown on the deploy screen. */
  rule: string;
  /** Tomorrow-tease / help copy. */
  tease: string;
  /** Base star values (shuffled across positions daily). Default ★1..★5. */
  values?: number[];
  /** Max troops on any single front. */
  maxPerFront?: number;
  /** One front (whose base value is within [min,max]) is hidden; its true value is drawn from [min,max]. */
  fog?: { min: number; max: number };
  /** Ties on the highest-value front award nothing to either side. */
  tieVoidTop?: boolean;
  /** Bonus stars for each pair of adjacent fronts won. */
  adjacencyBonus?: number;
  /** Fronts with >= threshold troops fight with +bonus effective troops. */
  reinforce?: { threshold: number; bonus: number };
}

export const TWISTS: TwistDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    emoji: '⚔️',
    rule: 'No tricks. Pure Blotto.',
    tease: 'No tricks. Just you, 100 troops and the world.',
  },
  {
    id: 'fog',
    name: 'Fog of War',
    emoji: '🌫️',
    rule: 'One front is hidden: worth ★2–★5. Revealed in battle.',
    tease: "One front's value stays hidden until the battle.",
    fog: { min: 2, max: 5 },
  },
  {
    id: 'fortress',
    name: 'Fortress',
    emoji: '🏰',
    rule: 'A tie on the ★5 front gives nobody anything.',
    tease: 'Ties on the ★5 fortress award nothing.',
    tieVoidTop: true,
  },
  {
    id: 'supply',
    name: 'Supply Cap',
    emoji: '📦',
    rule: 'Max 40 troops on any one front.',
    tease: 'No front can hold more than 40 troops.',
    maxPerFront: 40,
  },
  {
    id: 'twin',
    name: 'Twin Peaks',
    emoji: '⛰️',
    rule: 'Two ★5 fronts, no ★4.',
    tease: 'Two ★5 peaks on the map.',
    values: [1, 2, 3, 5, 5],
  },
  {
    id: 'cascade',
    name: 'Cascade',
    emoji: '⛓️',
    rule: '+1★ for every two side-by-side fronts you win.',
    tease: 'Win neighbouring fronts for bonus stars.',
    adjacencyBonus: 1,
  },
  {
    id: 'reinforce',
    name: 'Reinforcements',
    emoji: '🚁',
    rule: 'Any front with 30+ troops fights as if it had +5.',
    tease: 'Commit 30+ to a front and it fights with +5.',
    reinforce: { threshold: 30, bonus: 5 },
  },
];

export interface Rules {
  /** True star values by position. */
  values: number[];
  maxPerFront: number;
  /** Per position: does a tie award nothing? */
  tieVoid: boolean[];
  adjacencyBonus: number;
  reinforce: { threshold: number; bonus: number } | null;
}

export interface DayMap {
  puzzle: number;
  twist: TwistDef;
  /** Values as shown before battle (null = hidden by fog). */
  visible: (number | null)[];
  hiddenIndex: number;
  names: string[];
  rules: Rules;
  totalStars: number;
}

export const FRONT_NAMES = [
  'Ridge', 'Harbor', 'Mill', 'Pass', 'Keep', 'Ford', 'Bastion', 'Quarry', 'Orchard', 'Citadel',
  'Bridge', 'Beacon', 'Vineyard', 'Station', 'Dam', 'Abbey', 'Mine', 'Lighthouse', 'Crossing', 'Fen',
  'Summit', 'Docks', 'Granary', 'Watchtower', 'Hollow', 'Causeway', 'Foundry', 'Outpost', 'Market', 'Cliffs',
];

function rawCyclePerm(cycle: number, n: number): number[] {
  const rng = makeRng(`fronts-twist-cycle-${cycle}`);
  return rng.shuffle(Array.from({ length: n }, (_, i) => i));
}

/**
 * Deterministic rotation: every block of N days (N = number of twists) shows each
 * twist exactly once, in a seeded order, never repeating across block boundaries.
 */
export function twistFor(puzzle: number, list: TwistDef[] = TWISTS): TwistDef {
  const n = list.length;
  if (n === 1) return list[0];
  const k = puzzle - 1;
  const cycle = Math.floor(k / n);
  const pos = k - cycle * n;
  const perm = rawCyclePerm(cycle, n);
  const prevLast = rawCyclePerm(cycle - 1, n)[n - 1];
  if (perm[0] === prevLast) [perm[0], perm[1]] = [perm[1], perm[0]];
  return list[perm[pos]];
}

export function rulesFor(twist: TwistDef, values: number[]): Rules {
  const max = Math.max(...values);
  return {
    values,
    maxPerFront: twist.maxPerFront ?? 100,
    tieVoid: values.map((v) => !!twist.tieVoidTop && v === max),
    adjacencyBonus: twist.adjacencyBonus ?? 0,
    reinforce: twist.reinforce ?? null,
  };
}

const mapCache = new Map<number, DayMap>();

export function getDayMap(puzzle: number): DayMap {
  const hit = mapCache.get(puzzle);
  if (hit) return hit;
  const twist = twistFor(puzzle);
  const rng = makeRng(`fronts-map-${puzzle}`);
  const values = rng.shuffle([...(twist.values ?? [1, 2, 3, 4, 5])]);
  let hiddenIndex = -1;
  const visible: (number | null)[] = [...values];
  if (twist.fog) {
    const { min, max } = twist.fog;
    const candidates = values.map((v, i) => (v >= min && v <= max ? i : -1)).filter((i) => i >= 0);
    hiddenIndex = rng.pick(candidates);
    values[hiddenIndex] = rng.int(min, max);
    visible[hiddenIndex] = null;
  }
  const names = rng.shuffle([...FRONT_NAMES]).slice(0, 5);
  const rules = rulesFor(twist, values);
  const map: DayMap = {
    puzzle,
    twist,
    visible,
    hiddenIndex,
    names,
    rules,
    totalStars: values.reduce((a, b) => a + b, 0),
  };
  mapCache.set(puzzle, map);
  return map;
}
