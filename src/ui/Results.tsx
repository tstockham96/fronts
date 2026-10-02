import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { CONFIG } from '../config';
import { formatCountdown, msUntilLocalMidnight } from '../core/date';
import { rateColor } from '../core/scoring';
import { shareSquares } from '../core/share';
import { getDayMap, twistFor } from '../core/twists';
import { analyze, hindsight, type Analysis } from '../game';
import type { Pool } from '../core/scoring';
import { Count, fmtStars } from './Battle';
import { Fort, Icon } from './icons';

interface Props {
  mode: 'ranked' | 'practice';
  puzzle: number;
  army: number[];
  pool: Pool;
  /** Percent at the moment of deploying (ranked only), to show live movement. */
  deployedPct?: number;
  rival?: { name: string; outcome: 1 | 0 | -1; you: number; them: number };
  streak?: number;
  onShare?: (a: Analysis) => void;
  onCopy?: (a: Analysis) => void;
  onChallenge?: () => void;
  onPractice: () => void;
  onBack?: () => void;
  onWarRoom: () => void;
  onStats?: () => void;
}

export function Results(p: Props) {
  const map = getDayMap(p.puzzle);
  const a = useMemo(() => analyze(map, p.pool, p.army), [p.puzzle, p.pool, p.army.join()]);
  const [best, setBest] = useState<{ army: number[]; score: number } | null>(null);
  useEffect(() => {
    setBest(null);
    const t = setTimeout(() => setBest(hindsight(map, p.pool)), 60);
    return () => clearTimeout(t);
  }, [p.puzzle, p.pool]);

  const ranked = p.mode === 'ranked';
  const delta = ranked && p.deployedPct !== undefined ? a.pct - p.deployedPct : 0;
  const squares = shareSquares(map, a.score.frontRates);

  return (
    <div class="results screen-enter" data-testid="results">
      <section class="card hero">
        <div class="hero-kicker">
          {ranked ? `FRONTS #${map.puzzle}` : `Practice · Yesterday`} <span class="dot">·</span> {map.twist.emoji} {map.twist.name}
        </div>
        <div class="hero-beat">Beat</div>
        <div class="hero-pct" data-testid="pct">
          <Count to={a.pct} ms={1100} />
          <span>%</span>
        </div>
        <div class="hero-of">of generals</div>
        <div class="hero-live">
          {ranked ? (
            <>
              <i class="live-dot" /> Live vs {a.pool.count.toLocaleString('en-US')} generals · final at midnight
              {delta !== 0 && <b class={delta > 0 ? 'up' : 'down'}> {delta > 0 ? '▲' : '▼'}{Math.abs(delta)} since you deployed</b>}
            </>
          ) : (
            <>vs yesterday's {a.pool.count.toLocaleString('en-US')} generals</>
          )}
        </div>
        <div class="badge-row">
          <div class="badge-medal">{a.badge.emoji}</div>
          <div>
            <div class="badge-name">{a.badge.name}</div>
            <div class="badge-line">{a.badge.line}</div>
          </div>
        </div>
        {p.rival && (
          <div class={`rival-line o${p.rival.outcome}`}>
            {p.rival.outcome === 1 ? 'You beat' : p.rival.outcome === -1 ? 'You fell to' : 'You drew with'} {p.rival.name}{' '}
            <b>
              {fmtStars(p.rival.you)}★–{fmtStars(p.rival.them)}★
            </b>
          </div>
        )}
      </section>

      {ranked && (
        <section class="card share-card">
          <div class="share-preview" aria-label="Share preview">
            <div>
              FRONTS #{map.puzzle} ⚔️ {map.twist.name}
            </div>
            <div>
              Beat {a.pct}% of generals {a.badge.emoji}
            </div>
            <div class="sq-row">
              {squares.map((s) => (
                <span>
                  {s.label}
                  {s.emoji}
                </span>
              ))}
            </div>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" onClick={() => p.onShare?.(a)} data-testid="share">
              <Icon.share /> Share
            </button>
            <button class="btn btn-ghost" onClick={() => p.onCopy?.(a)} data-testid="copy">
              <Icon.copy /> Copy
            </button>
          </div>
          <button class="btn btn-ink wide" onClick={p.onChallenge} data-testid="challenge">
            <Icon.swords /> Challenge a friend
          </button>
        </section>
      )}

      {!ranked && (
        <section class="card btn-stack">
          <button class="btn btn-primary wide" onClick={p.onPractice} data-testid="practice-again">
            Practice again
          </button>
          {p.onBack && (
            <button class="btn btn-ghost wide" onClick={p.onBack}>
              Back to today
            </button>
          )}
        </section>
      )}

      <section class="card">
        <h3 class="card-title">Where you won</h3>
        <ul class="rates">
          {a.score.frontRates.map((r, i) => {
            const c = rateColor(r);
            return (
              <li>
                <div class="rate-fort">
                  <Fort value={map.rules.values[i]} size={34} owner={c === 'green' ? 'you' : c === 'red' ? 'foe' : 'none'} />
                </div>
                <div class="rate-main">
                  <div class="rate-top">
                    <b>
                      ★{map.rules.values[i]} {map.names[i]}
                    </b>
                    <span>
                      you {p.army[i]} · crowd {Math.round(a.avg[i])}
                    </span>
                  </div>
                  <div class="rate-bar">
                    <i class={c} style={{ width: `${Math.max(2, r * 100)}%` }} />
                  </div>
                </div>
                <div class={`rate-pct ${c}`}>{Math.round(r * 100)}%</div>
              </li>
            );
          })}
        </ul>
        {map.hiddenIndex >= 0 && <p class="fine">🌫️ The fogged front was {map.names[map.hiddenIndex]}: ★{map.rules.values[map.hiddenIndex]}.</p>}
      </section>

      <section class="card intel">
        <h3 class="card-title">Crowd intel</h3>
        <p class="hint">“{a.hint}”</p>
        <div class="intel-block">
          <div class="intel-label">The average general</div>
          <AvgChart map={map} avg={a.avg} army={p.army} />
        </div>
        <ArmyLine label="Most common army" army={a.common[0]?.army ?? []} note={`${Math.round((a.common[0]?.share ?? 0) * 100)}% of generals`} map={map} />
        <ArmyLine
          label="Best army in hindsight"
          army={best?.army ?? []}
          note={best ? `would beat ${Math.round(best.score * 100)}%` : 'scouting…'}
          map={map}
          highlight
        />
      </section>

      {CONFIG.features.ads && (
        <aside class="ad-slot" aria-label="Advertisement">
          <span>Advertisement</span>
          <small>320 × 100 ad slot</small>
        </aside>
      )}

      {CONFIG.features.warRoom && (
        <button class="card warroom-teaser" onClick={p.onWarRoom} data-testid="warroom-teaser">
          <div class="wr-icon">🗺️</div>
          <div>
            <b>War Room</b>
            <span>Replay any past day vs that day's crowd, heatmaps, private leagues.</span>
          </div>
          <em>$3.99/mo</em>
        </button>
      )}

      {ranked && <Tomorrow puzzle={p.puzzle} />}

      {ranked && (
        <section class="card practice-card">
          <div>
            <b>Can't wait?</b>
            <span>Train against yesterday's crowd. Unlimited, unranked.</span>
          </div>
          <button class="btn btn-ghost" onClick={p.onPractice} data-testid="practice">
            Practice
          </button>
        </section>
      )}
      {ranked && p.onStats && (
        <button class="link-btn center" onClick={p.onStats}>
          {p.streak ? `🔥 ${p.streak}-day streak · ` : ''}See your stats
        </button>
      )}
    </div>
  );
}

function Tomorrow({ puzzle }: { puzzle: number }) {
  const [ms, setMs] = useState(msUntilLocalMidnight());
  useEffect(() => {
    const t = setInterval(() => setMs(msUntilLocalMidnight()), 1000);
    return () => clearInterval(t);
  }, []);
  const next = twistFor(puzzle + 1);
  return (
    <section class="card tomorrow">
      <div class="tm-label">Next battle in</div>
      <div class="tm-clock" data-testid="countdown">{formatCountdown(ms)}</div>
      <div class="tm-twist">
        <span class="tm-emoji">{next.emoji}</span>
        <div>
          <b>Tomorrow: {next.name}</b>
          <span>{next.tease}</span>
        </div>
      </div>
    </section>
  );
}

function AvgChart({ map, avg, army }: { map: ReturnType<typeof getDayMap>; avg: number[]; army: number[] }) {
  const max = Math.max(40, ...avg, ...army);
  return (
    <div class="avg-chart">
      {avg.map((v, i) => (
        <div class="avg-col">
          <div class="avg-bars">
            <i class="crowd" style={{ height: `${(v / max) * 100}%` }}>
              <span>{Math.round(v)}</span>
            </i>
            <i class="mine" style={{ height: `${(army[i] / max) * 100}%` }} />
          </div>
          <div class="avg-label">★{map.rules.values[i]}</div>
        </div>
      ))}
      <div class="avg-legend">
        <span><i class="crowd" /> crowd</span>
        <span><i class="mine" /> you</span>
      </div>
    </div>
  );
}

function ArmyLine({ label, army, note, map, highlight }: { label: string; army: number[]; note: string; map: ReturnType<typeof getDayMap>; highlight?: boolean }): ComponentChildren {
  return (
    <div class={`army-line ${highlight ? 'hl' : ''}`}>
      <div class="intel-label">
        {label} <span>{note}</span>
      </div>
      <div class="chips">
        {(army.length ? army : [null, null, null, null, null]).map((t, i) => (
          <span class="chip">
            <small>★{map.rules.values[i]}</small>
            {t ?? '·'}
          </span>
        ))}
      </div>
    </div>
  );
}
