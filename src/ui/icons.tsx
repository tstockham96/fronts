import type { JSX } from 'preact';

/** Parametric fort: bigger and more fortified the more stars it's worth. */
export function Fort({ value, owner = 'none', fog = false, size = 56 }: { value: number | null; owner?: 'you' | 'foe' | 'none' | 'void'; fog?: boolean; size?: number }) {
  const v = Math.max(1, Math.min(5, value ?? 3));
  const ink = 'var(--ink)';
  const flag = owner === 'you' ? 'var(--you)' : owner === 'foe' ? 'var(--foe)' : owner === 'void' ? 'var(--muted)' : 'var(--gold)';
  const ground = 54;
  const parts: JSX.Element[] = [];
  const merlons = (x: number, y: number, w: number, key: string) => {
    const n = Math.max(2, Math.round(w / 5));
    const mw = w / (n * 2 - 1);
    for (let i = 0; i < n; i++) parts.push(<rect key={`${key}m${i}`} x={x + i * 2 * mw} y={y - 3.5} width={mw} height={3.6} fill={ink} />);
  };
  let flagX = 32;
  let flagY = 20;
  if (v === 1) {
    // Outpost: a single watchtower
    const w = 14, h = 24, x = 32 - w / 2, y = ground - h;
    parts.push(<rect key="t" x={x} y={y} width={w} height={h} fill={ink} rx={1} />);
    merlons(x, y, w, 't');
    parts.push(<rect key="w" x={30.5} y={y + 7} width={3} height={5} fill="var(--card)" rx={1.5} />);
    flagX = 32; flagY = y - 3.5;
  } else {
    const wallW = 18 + v * 7;
    const wallH = 9 + v * 2;
    const wx = 32 - wallW / 2;
    const wy = ground - wallH;
    parts.push(<rect key="wall" x={wx} y={wy} width={wallW} height={wallH} fill={ink} />);
    merlons(wx, wy, wallW, 'wall');
    const tw = 9 + (v >= 4 ? 1 : 0);
    const th = wallH + 7 + v;
    for (const side of [0, 1]) {
      const tx = side ? wx + wallW - tw + 1.5 : wx - 1.5;
      parts.push(<rect key={`tw${side}`} x={tx} y={ground - th} width={tw} height={th} fill={ink} />);
      merlons(tx, ground - th, tw, `tw${side}`);
      parts.push(<rect key={`win${side}`} x={tx + tw / 2 - 1.2} y={ground - th + 6} width={2.4} height={4} fill="var(--card)" rx={1.2} />);
    }
    flagX = wx + 3; flagY = ground - th - 3.5;
    if (v >= 3) {
      const kw = 10 + v * 1.5;
      const kh = th + 4 + (v - 3) * 4;
      const kx = 32 - kw / 2;
      parts.push(<rect key="keep" x={kx} y={ground - kh} width={kw} height={kh} fill={ink} />);
      merlons(kx, ground - kh, kw, 'keep');
      parts.push(<rect key="kwin" x={30.6} y={ground - kh + 6} width={2.8} height={5} fill="var(--card)" rx={1.4} />);
      flagX = 32; flagY = ground - kh - 3.5;
    }
    // Gate
    parts.push(<path key="gate" d={`M${28} ${ground} v-5 a4 4 0 0 1 8 0 v5 z`} fill="var(--card)" />);
  }
  return (
    <svg class="fort" width={size} height={size} viewBox="0 0 64 60" aria-hidden="true">
      <line x1="4" y1={ground + 0.5} x2="60" y2={ground + 0.5} stroke={ink} stroke-width="2" stroke-linecap="round" />
      {parts}
      <line x1={flagX} y1={flagY} x2={flagX} y2={flagY - 12} stroke={ink} stroke-width="1.6" />
      <path class="fort-flag" d={`M${flagX + 0.8} ${flagY - 12} l11 3.5 l-11 3.5 z`} fill={flag} />
      {fog && (
        <g class="fog">
          <ellipse cx="32" cy="38" rx="27" ry="15" fill="var(--paper)" opacity="0.92" />
          <ellipse cx="20" cy="33" rx="12" ry="9" fill="var(--paper)" opacity="0.9" />
          <ellipse cx="44" cy="34" rx="13" ry="9" fill="var(--paper)" opacity="0.9" />
          <text x="32" y="45" text-anchor="middle" font-family="var(--stencil)" font-size="22" fill={ink}>?</text>
        </g>
      )}
    </svg>
  );
}

export function Stars({ value, max = 5 }: { value: number | null; max?: number }) {
  if (value === null) return <span class="stars fogged">★ ? ? ?</span>;
  return (
    <span class="stars" aria-label={`${value} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} class={i < value ? 'on' : 'off'}>★</i>
      ))}
    </span>
  );
}

const P = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;
export const Icon = {
  stats: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" {...P}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
  ),
  help: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9.5" /><path d="M9.3 9.2a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9v.4" /><circle cx="12" cy="17.2" r=".6" fill="currentColor" /></svg>
  ),
  soundOn: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" {...P}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>
  ),
  soundOff: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" {...P}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>
  ),
  close: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" {...P}><path d="M6 6l12 12M18 6L6 18" /></svg>
  ),
  share: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" {...P}><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
  ),
  copy: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" {...P}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
  ),
  swords: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" {...P}><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5L13 3h3v3l-3.5 3.5M5 14l-2 2 2 2M7 17l-2 2" /></svg>
  ),
  lock: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" {...P}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
  ),
  reset: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" {...P}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 3.5v4.5h4.5" /></svg>
  ),
};
