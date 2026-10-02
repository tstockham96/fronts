import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BattleResult } from '../core/battle';
import type { DayMap } from '../core/twists';
import { Fort } from './icons';
import { haptic, sfx } from './sound';

interface Props {
  map: DayMap;
  mine: number[];
  theirs: number[];
  theirName: string;
  result: BattleResult;
  subtitle: string;
  cta: string;
  /** Line under the verdict stamp. */
  afterword?: string;
  onDone: () => void;
}

const INTRO = 380;
const STEP = 520;
const RESOLVE = 340;

export function fmtStars(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.5', '½').replace('.0', '');
}

export function Battle({ map, mine, theirs, theirName, result, subtitle, cta, afterword, onDone }: Props) {
  // Reveal cheapest front first, the richest last: crescendo.
  const order = useMemo(() => [0, 1, 2, 3, 4].sort((a, b) => result.fronts[a].value - result.fronts[b].value || a - b), [result]);
  const [shown, setShown] = useState(0); // fronts whose bars are out
  const [resolved, setResolved] = useState(0); // fronts with a winner stamped
  const [bonus, setBonus] = useState(false);
  const [verdict, setVerdict] = useState(false);
  const [ready, setReady] = useState(false);
  const timers = useRef<number[]>([]);
  const hasChains = result.chains.length > 0;

  useEffect(() => {
    sfx.deploy();
    const t = timers.current;
    const at = (ms: number, fn: () => void) => t.push(window.setTimeout(fn, ms));
    order.forEach((idx, k) => {
      at(INTRO + k * STEP, () => setShown(k + 1));
      at(INTRO + k * STEP + RESOLVE, () => {
        setResolved(k + 1);
        sfx.clash(result.fronts[idx].winner);
        haptic(result.fronts[idx].winner === 1 ? 18 : 8);
      });
    });
    const end = INTRO + 5 * STEP;
    if (hasChains) at(end - 60, () => { setBonus(true); sfx.pop(); });
    const v = end + (hasChains ? 260 : 60);
    at(v, () => {
      setVerdict(true);
      if (result.outcome === 1) sfx.victory();
      else if (result.outcome === -1) sfx.defeat();
      else sfx.draw();
      haptic(result.outcome === 1 ? [30, 50, 60] : 40);
    });
    at(v + 450, () => setReady(true));
    return () => t.forEach(clearTimeout);
  }, []);

  const skip = () => {
    if (ready) return;
    timers.current.forEach(clearTimeout);
    setShown(5);
    setResolved(5);
    setBonus(true);
    setVerdict(true);
    setReady(true);
  };

  const shownSet = new Set(order.slice(0, shown));
  const resolvedSet = new Set(order.slice(0, resolved));
  let you = 0;
  let foe = 0;
  resolvedSet.forEach((i) => {
    you += result.fronts[i].aStars;
    foe += result.fronts[i].bStars;
  });
  if (bonus) {
    you += result.aBonus;
    foe += result.bBonus;
  }
  const maxT = Math.max(50, ...mine, ...theirs);
  const verdictText = result.outcome === 1 ? 'Victory' : result.outcome === -1 ? 'Defeat' : 'Stalemate';

  return (
    <div class="battle screen-enter" onClick={skip} data-testid="battle">
      <div class="battle-top">
        <div class="battle-sub">{subtitle}</div>
        <div class="scoreboard">
          <div class="sb-side you">
            <span class="sb-name">You</span>
            <span class="sb-stars" key={`y${you}`}>{fmtStars(you)}<i>★</i></span>
          </div>
          <div class="sb-vs">vs</div>
          <div class="sb-side foe">
            <span class="sb-name">{theirName}</span>
            <span class="sb-stars" key={`f${foe}`}>{fmtStars(foe)}<i>★</i></span>
          </div>
        </div>
      </div>
      <ol class="battle-rows">
        {result.fronts.map((f, i) => {
          const isShown = shownSet.has(i);
          const isRes = resolvedSet.has(i);
          const active = isShown && !isRes;
          const owner = !isRes ? 'none' : f.winner === 1 ? 'you' : f.winner === -1 ? 'foe' : f.voided ? 'void' : 'none';
          const chainHere = bonus && result.chains.find((c) => c.index === i);
          return (
            <li class={`brow ${active ? 'active' : ''} ${isRes ? `res w${f.winner}` : ''}`}>
              <span class="b-num you">
                {isShown ? <Count to={f.a} /> : '?'}
                {isShown && f.aEff > f.a && <sup>+{f.aEff - f.a}</sup>}
              </span>
              <div class="b-bar you"><i style={{ width: isShown ? `${(f.a / maxT) * 100}%` : '0%' }} /></div>
              <div class="b-fort">
                <Fort value={isRes || map.visible[i] !== null ? f.value : null} fog={!isShown && map.visible[i] === null} owner={owner} size={46} />
                <span class={`b-val ${isShown && map.visible[i] === null ? 'revealed' : ''}`}>★{isShown || map.visible[i] !== null ? f.value : '?'}</span>
                {isRes && (
                  <span class={`b-gain ${f.winner === 1 ? 'you' : f.winner === -1 ? 'foe' : 'tie'}`}>
                    {f.winner === 0 ? (f.voided ? 'void' : `½ each`) : `+${f.value}★`}
                  </span>
                )}
              </div>
              <div class="b-bar foe"><i style={{ width: isShown ? `${(f.b / maxT) * 100}%` : '0%' }} /></div>
              <span class="b-num foe">
                {isShown ? <Count to={f.b} /> : '?'}
                {isShown && f.bEff > f.b && <sup>+{f.bEff - f.b}</sup>}
              </span>
              {chainHere && <span class={`b-chain ${chainHere.side === 1 ? 'you' : 'foe'}`}>⛓ +{map.rules.adjacencyBonus}★</span>}
            </li>
          );
        })}
      </ol>
      <div class="battle-foot">
        {verdict ? (
          <div class={`stamp o${result.outcome}`}>
            <span>{verdictText}</span>
            <small>
              {fmtStars(result.aStars)}★ – {fmtStars(result.bStars)}★
            </small>
          </div>
        ) : null}
        {verdict && afterword && <p class="afterword">{afterword}</p>}
        {!verdict && (
          <div class="battle-hint">{shown === 0 ? 'Troops advancing…' : 'Tap to skip'}</div>
        )}
        <button
          class={`btn btn-primary battle-cta ${ready ? 'in' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
          tabIndex={ready ? 0 : -1}
          data-testid="battle-continue"
        >
          {cta} →
        </button>
      </div>
    </div>
  );
}

export function Count({ to, ms = 320, format }: { to: number; ms?: number; format?: (n: number) => string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - (1 - p) ** 3;
      setV(Math.round(to * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{format ? format(v) : v}</>;
}
