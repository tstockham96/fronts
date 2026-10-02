import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DayMap } from '../core/twists';
import { Fort, Icon, Stars } from './icons';
import { haptic, sfx } from './sound';

const PRESET = [20, 20, 20, 20, 20];

interface Props {
  map: DayMap;
  banner?: ComponentChildren;
  cta?: string;
  onDeploy: (army: number[]) => void;
  busy?: boolean;
}

export function Deploy({ map, banner, cta = 'Deploy', onDeploy, busy }: Props) {
  const [army, setArmy] = useState<number[]>(() => PRESET.map((x) => Math.min(x, map.rules.maxPerFront)));
  const [shake, setShake] = useState(0);
  const total = army.reduce((a, b) => a + b, 0);
  const left = 100 - total;
  const cap = map.rules.maxPerFront;
  const armyRef = useRef(army);
  armyRef.current = army;

  const setFront = (i: number, target: number) => {
    const cur = armyRef.current;
    const avail = 100 - cur.reduce((a, b) => a + b, 0);
    const v = Math.max(0, Math.min(cap, cur[i] + avail, Math.round(target)));
    if (v === cur[i]) return false;
    const next = [...cur];
    next[i] = v;
    armyRef.current = next;
    setArmy(next);
    return true;
  };

  const step = (i: number, d: number) => {
    const ok = setFront(i, armyRef.current[i] + d);
    if (ok) {
      sfx.tick(d > 0);
      haptic(5);
    } else if (d > 0 && 100 - armyRef.current.reduce((a, b) => a + b, 0) === 0) {
      setShake((s) => s + 1);
    }
    return ok;
  };

  const deploy = () => {
    if (left !== 0) {
      setShake((s) => s + 1);
      haptic([20, 40, 20]);
      return;
    }
    haptic(25);
    onDeploy(army);
  };

  return (
    <div class="deploy screen-enter">
      {banner}
      <div class="fronts-head">
        <span>Your 5 fronts</span>
        <button class="link-btn" onClick={() => setArmy(PRESET.map((x) => Math.min(x, cap)))} aria-label="Reset to 20 each">
          <Icon.reset /> 20 each
        </button>
      </div>
      <ol class="front-list">
        {army.map((t, i) => (
          <FrontRow key={i} i={i} map={map} value={t} left={left} onStep={step} onSet={setFront} />
        ))}
      </ol>
      <div class="dock">
        <div class={`troops-left ${left > 0 ? 'has-left' : 'all-in'} ${shake ? 'shake' : ''}`} key={`s${shake}`} aria-live="polite">
          <b>{left}</b>
          <span>troops<br />left</span>
        </div>
        <button class={`btn btn-primary deploy-btn ${left !== 0 ? 'is-off' : ''} ${cta.length > 8 ? 'long' : ''}`} onClick={deploy} disabled={busy} data-testid="deploy">
          {left === 0 ? (
            <>
              {cta} <Icon.swords />
            </>
          ) : left > 0 ? (
            `Place ${left} more`
          ) : (
            `Remove ${-left}`
          )}
        </button>
      </div>
    </div>
  );
}

function FrontRow({ i, map, value, left, onStep, onSet }: { i: number; map: DayMap; value: number; left: number; onStep: (i: number, d: number) => boolean; onSet: (i: number, v: number) => boolean }) {
  const vis = map.visible[i];
  const cap = map.rules.maxPerFront;
  const scale = Math.min(100, cap);
  const rf = map.rules.reinforce;
  const boosted = rf && value >= rf.threshold;
  const isVoid = map.rules.tieVoid[i];
  const cascade = map.rules.adjacencyBonus > 0 && i < 4;
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (e: PointerEvent) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (onSet(i, Math.round(x * scale))) haptic(3);
  };

  const avail = Math.min(cap, value + Math.max(0, left));
  return (
    <li class={`front-row ${cascade ? 'chained' : ''} ${value === 0 ? 'empty' : ''}`}>
      <div class="fr-fort">
        <Fort value={vis} fog={vis === null} size={52} />
        <span class="fr-val">★{vis ?? '?'}</span>
      </div>
      <div class="fr-name">
        <b>{map.names[i]}</b>
        <Stars value={vis} />
        {isVoid && <em class="tag tag-red">ties void</em>}
      </div>
      <div class="fr-step">
        <HoldButton label={`Fewer troops on ${map.names[i]}`} onStep={() => onStep(i, -1)} disabled={value === 0}>
          −
        </HoldButton>
        <output class="fr-num" aria-label={`${value} troops`} data-testid={`troops-${i}`}>
          {value}
          {boosted && <sup>+{rf!.bonus}</sup>}
        </output>
        <HoldButton label={`More troops on ${map.names[i]}`} onStep={() => onStep(i, +1)} disabled={value >= cap} dim={left <= 0}>
          +
        </HoldButton>
      </div>
      <div
        class="track"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`Troops on ${map.names[i]}`}
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={value}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onStep(i, e.shiftKey ? 5 : 1); }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onStep(i, e.shiftKey ? -5 : -1); }
        }}
      >
        <div class="track-bar">
          <div class="track-avail" style={{ width: `${(avail / scale) * 100}%` }} />
          <div class="track-fill" style={{ width: `${(value / scale) * 100}%` }} />
          {rf && rf.threshold < scale && (
            <div class={`track-mark ${boosted ? 'hit' : ''}`} style={{ left: `${(rf.threshold / scale) * 100}%` }}>
              <span>+{rf.bonus}</span>
            </div>
          )}
          <div class="track-thumb" style={{ left: `${(value / scale) * 100}%` }} />
        </div>
        {cap < 100 && <span class="track-cap">max {cap}</span>}
      </div>
    </li>
  );
}

function HoldButton({ children, onStep, label, disabled, dim }: { children: ComponentChildren; onStep: () => boolean; label: string; disabled?: boolean; dim?: boolean }) {
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const start = (e: PointerEvent) => {
    e.preventDefault();
    stop();
    if (!onStep()) return;
    let delay = 320;
    const loop = () => {
      timer.current = window.setTimeout(() => {
        if (!onStep()) return stop();
        delay = Math.max(35, delay * 0.78);
        loop();
      }, delay);
    };
    loop();
  };
  return (
    <button
      class={`step ${dim ? 'dim' : ''}`}
      aria-label={label}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onStep();
        }
      }}
    >
      {children}
    </button>
  );
}
