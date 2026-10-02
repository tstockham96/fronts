import type { BadgeId } from '../core/badge';

export interface PlayRecord {
  puzzle: number;
  army: number[];
  /** Score at the moment of deploying (the live score is recomputed later). */
  score: number;
  pct: number;
  frontRates: number[];
  badge: BadgeId;
  poolCount: number;
  rivalIdx: number;
  rivalArmy: number[];
  rivalOutcome: 1 | 0 | -1;
  twist: string;
  ts: number;
}

export interface DuelRecord {
  name: string;
  w: number;
  l: number;
  t: number;
  last: number;
}

export interface Store {
  v: 1;
  deviceId: number;
  name: string;
  sound: boolean;
  plays: Record<string, PlayRecord>;
  practice: { count: number; best: number };
  duels: Record<string, DuelRecord>;
  /** Duel codes already completed on this device (no replaying the same link for records). */
  duelsDone: Record<string, { army: number[]; ts: number }>;
}

const KEY = 'fronts:v1';

function fresh(): Store {
  const deviceId = (Math.random() * 0xffffffff) >>> 0 || 1;
  return { v: 1, deviceId, name: '', sound: true, plays: {}, practice: { count: 0, best: 0 }, duels: {}, duelsDone: {} };
}

let memory: Store | null = null;

export function load(): Store {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed && parsed.v === 1) {
        memory = { ...fresh(), ...parsed };
        return memory;
      }
    }
  } catch {
    /* private mode or corrupted: fall through */
  }
  memory = fresh();
  save(memory);
  return memory;
}

export function save(s: Store = load()): void {
  memory = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full / disabled: keep in memory */
  }
}

export function update(fn: (s: Store) => void): Store {
  const s = load();
  fn(s);
  save(s);
  return s;
}

export interface Stats {
  played: number;
  streak: number;
  maxStreak: number;
  avgPct: number;
  bestPct: number;
  history: PlayRecord[];
  badges: Partial<Record<BadgeId, number>>;
}

/** Streak = consecutive puzzle numbers played, ending today (or yesterday if today isn't played yet). */
export function computeStats(s: Store, today: number): Stats {
  const nums = Object.keys(s.plays).map(Number).sort((a, b) => a - b);
  const history = nums.map((n) => s.plays[n]);
  let maxStreak = 0;
  let run = 0;
  let prev = -Infinity;
  for (const n of nums) {
    run = n === prev + 1 ? run + 1 : 1;
    maxStreak = Math.max(maxStreak, run);
    prev = n;
  }
  let streak = 0;
  let d = s.plays[today] ? today : today - 1;
  while (s.plays[d]) {
    streak++;
    d--;
  }
  const badges: Partial<Record<BadgeId, number>> = {};
  history.forEach((h) => (badges[h.badge] = (badges[h.badge] ?? 0) + 1));
  const pcts = history.map((h) => h.pct);
  return {
    played: nums.length,
    streak,
    maxStreak,
    avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0,
    bestPct: pcts.length ? Math.max(...pcts) : 0,
    history,
    badges,
  };
}
