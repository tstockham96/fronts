import { RATE_EMOJI, rateColor } from './scoring';
import type { DayMap } from './twists';

export interface ShareInput {
  map: DayMap;
  pct: number;
  badgeEmoji: string;
  frontRates: number[];
  link: string;
}

/** Fronts in share order: ascending star value, fog front shown as ★? (spoiler-free). */
export function shareSquares(map: DayMap, frontRates: number[]): { label: string; emoji: string; index: number }[] {
  const idx = [0, 1, 2, 3, 4].sort((a, b) => {
    const va = map.visible[a] ?? 99;
    const vb = map.visible[b] ?? 99;
    return va - vb || a - b;
  });
  return idx.map((i) => ({
    label: map.visible[i] === null ? '★?' : `★${map.visible[i]}`,
    emoji: RATE_EMOJI[rateColor(frontRates[i])],
    index: i,
  }));
}

export function shareText({ map, pct, badgeEmoji, frontRates, link }: ShareInput): string {
  const row = shareSquares(map, frontRates)
    .map((s) => `${s.label}${s.emoji}`)
    .join(' ');
  return [
    `FRONTS #${map.puzzle} ⚔️ ${map.twist.name}`,
    `Beat ${pct}% of generals ${badgeEmoji}`,
    row,
    `Break my line 👉 ${link}`,
  ].join('\n');
}

export function duelResultText(opts: { puzzle: number; myStars: number; theirStars: number; outcome: 1 | 0 | -1; theirName: string; link: string }): string {
  const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  const head =
    opts.outcome === 1
      ? `I broke ${opts.theirName}'s line ${fmt(opts.myStars)}★–${fmt(opts.theirStars)}★ ⚔️`
      : opts.outcome === -1
        ? `${opts.theirName} held the line ${fmt(opts.theirStars)}★–${fmt(opts.myStars)}★. Rematch? ⚔️`
        : `Stalemate with ${opts.theirName} ${fmt(opts.myStars)}★–${fmt(opts.theirStars)}★ 🤝`;
  return [`FRONTS #${opts.puzzle} duel`, head, `Your move 👉 ${opts.link}`].join('\n');
}
