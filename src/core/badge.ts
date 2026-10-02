import type { Army } from './battle';
import type { Rules } from './twists';

export type BadgeId = 'strategist' | 'hammer' | 'gambler' | 'wall' | 'flanker';

export interface Badge {
  id: BadgeId;
  emoji: string;
  name: string;
  line: string;
}

export const BADGES: Record<BadgeId, Badge> = {
  strategist: { id: 'strategist', emoji: '🧠', name: 'Strategist', line: "Top 10% of today's generals." },
  hammer: { id: 'hammer', emoji: '🔨', name: 'Hammer', line: 'You smashed one front with everything.' },
  gambler: { id: 'gambler', emoji: '🎲', name: 'Gambler', line: 'You gave up two fronts and rolled the dice.' },
  wall: { id: 'wall', emoji: '🧱', name: 'Wall', line: 'Even, steady, hard to break.' },
  flanker: { id: 'flanker', emoji: '🐍', name: 'Flanker', line: 'You let them have the big prize and stole the rest.' },
};

/**
 * Player type. Priority: Strategist (top 10%) > Hammer (a front >= 45) >
 * Gambler (2+ empty fronts) > Wall (all 15-25) > Flanker (wins low fronts,
 * concedes the top one). Armies matching none get the closest shape.
 */
export function playerBadge(army: Army, rules: Rules, frontRates: number[], isTop10: boolean): Badge {
  if (isTop10) return BADGES.strategist;
  if (army.some((t) => t >= 45)) return BADGES.hammer;
  if (army.filter((t) => t === 0).length >= 2) return BADGES.gambler;
  if (army.every((t) => t >= 15 && t <= 25)) return BADGES.wall;
  const vals = rules.values;
  const order = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
  const top = order[4];
  const lowRate = (frontRates[order[0]] + frontRates[order[1]]) / 2;
  const concedes = army[top] <= 12 || frontRates[top] < 0.35;
  if (concedes && lowRate >= 0.5) return BADGES.flanker;
  // Closest-shape fallback
  if (concedes) return { ...BADGES.flanker, line: 'You went light on the big prize and spread the rest.' };
  const max = Math.max(...army);
  const min = Math.min(...army);
  if (max - min <= 20) return { ...BADGES.wall, line: 'Spread wide. No front left undefended.' };
  if (army.includes(0)) return { ...BADGES.gambler, line: 'You left a front empty and rolled the dice.' };
  return { ...BADGES.hammer, line: 'You leaned hard on the big fronts.' };
}
