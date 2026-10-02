import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { BADGES, type BadgeId } from '../core/badge';
import { TWISTS } from '../core/twists';
import type { DuelRecord, Stats } from '../state/storage';
import { Icon } from './icons';

export function Modal({ title, onClose, children, tone = 'paper', testid }: { title: string; onClose: () => void; children: ComponentChildren; tone?: 'paper' | 'ink'; testid?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div class="modal-wrap" onClick={onClose}>
      <div class={`modal ${tone}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} data-testid={testid}>
        <header class="modal-head">
          <h2>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Close">
            <Icon.close />
          </button>
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function StatsModal({ stats, duels, onClose }: { stats: Stats; duels: Record<string, DuelRecord>; onClose: () => void }) {
  const recent = stats.history.slice(-14);
  const rivals = Object.values(duels).sort((a, b) => b.last - a.last).slice(0, 5);
  return (
    <Modal title="Your campaign" onClose={onClose} testid="stats">
      <div class="stat-grid">
        <div><b>{stats.played}</b><span>Played</span></div>
        <div><b>{stats.streak}</b><span>Streak 🔥</span></div>
        <div><b>{stats.maxStreak}</b><span>Best streak</span></div>
        <div><b>{stats.avgPct}%</b><span>Avg beat</span></div>
        <div><b>{stats.bestPct}%</b><span>Best day</span></div>
      </div>
      <h3 class="card-title">{recent.length > 1 ? `Last ${recent.length} battles` : 'Last battle'}</h3>
      {recent.length ? (
        <div class="history">
          {recent.map((h) => (
            <div class="hist-col" title={`#${h.puzzle}: ${h.pct}%`}>
              <i class={h.pct > 60 ? 'green' : h.pct >= 40 ? 'yellow' : 'red'} style={{ height: `${Math.max(4, h.pct)}%` }} />
              <small>#{h.puzzle}</small>
            </div>
          ))}
        </div>
      ) : (
        <p class="fine">Your first battle will show up here.</p>
      )}
      <h3 class="card-title">Player types</h3>
      <div class="badge-tally">
        {(Object.keys(BADGES) as BadgeId[]).map((id) => (
          <span class={stats.badges[id] ? 'on' : ''}>
            {BADGES[id].emoji} {BADGES[id].name} <b>{stats.badges[id] ?? 0}</b>
          </span>
        ))}
      </div>
      {rivals.length > 0 && (
        <>
          <h3 class="card-title">Rivals</h3>
          <ul class="rivals">
            {rivals.map((r) => (
              <li>
                <span>You &amp; {r.name}</span>
                <b>
                  {r.w}–{r.l}
                  {r.t ? ` (${r.t})` : ''}
                </b>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How FRONTS works" onClose={onClose} testid="help">
      <ol class="rules">
        <li>Split <b>100 troops</b> across <b>5 fronts</b>. Each front is worth ★1–★5.</li>
        <li>Against any rival, whoever sends <b>more troops</b> to a front takes its stars. Ties split them.</li>
        <li>More stars than your rival = you win that battle.</li>
        <li>Your army fights <b>every general who played today</b>. Your score is the share you beat.</li>
      </ol>
      <p class="fine">There's no safe army. If everyone stacks ★5, give it up and take the rest. If everyone plays 20s, 21 beats 20. Read the crowd.</p>
      <h3 class="card-title">Daily twists</h3>
      <ul class="twist-list">
        {TWISTS.map((t) => (
          <li>
            <span>{t.emoji}</span>
            <div>
              <b>{t.name}</b>
              <small>{t.rule}</small>
            </div>
          </li>
        ))}
      </ul>
      <h3 class="card-title">Player types</h3>
      <ul class="twist-list">
        {Object.values(BADGES).map((b) => (
          <li>
            <span>{b.emoji}</span>
            <div>
              <b>{b.name}</b>
              <small>{b.line}</small>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function WarRoomModal({ onClose, onCta }: { onClose: () => void; onCta: () => void }) {
  const [joined, setJoined] = useState(false);
  return (
    <Modal title="War Room" onClose={onClose} tone="ink" testid="warroom">
      <div class="wr-hero">
        <div class="wr-map">🗺️</div>
        <p>Every battle ever fought, on your desk.</p>
      </div>
      <ul class="wr-list">
        <li><span>⏪</span><div><b>Any past day</b><small>Replay #1 to yesterday against that day's real crowd.</small></div></li>
        <li><span>🔥</span><div><b>Heatmaps</b><small>See exactly where the world stacked its troops.</small></div></li>
        <li><span>🧪</span><div><b>Army lab</b><small>Test any army against today's pool after you play.</small></div></li>
        <li><span>🏆</span><div><b>Private leagues</b><small>Your office, your group chat, your daily standings.</small></div></li>
      </ul>
      <div class="wr-price">
        <b>$3.99</b>
        <span>/ month · cancel anytime</span>
      </div>
      <button
        class="btn btn-gold wide"
        onClick={() => {
          onCta();
          setJoined(true);
        }}
        data-testid="warroom-cta"
      >
        {joined ? "You're on the list ✓" : 'Start 7-day free trial'}
      </button>
      <p class="fine center">{joined ? 'Payments are not live yet. We will email you at launch.' : 'Preview: payments are not live yet.'}</p>
    </Modal>
  );
}

export function ChallengeModal({ title = 'Challenge a friend', lead, name, onName, onShare, onCopy, onClose }: { title?: string; lead?: string; name: string; onName: (n: string) => void; onShare: () => void; onCopy: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} testid="challenge-modal">
      <p class="lead">{lead ?? 'Your army goes into the link, sealed. Your friend has to commit their own army before they see yours.'}</p>
      <label class="field">
        <span>Sign your challenge</span>
        <input
          value={name}
          maxLength={18}
          placeholder="Your name"
          onInput={(e) => onName((e.currentTarget as HTMLInputElement).value)}
          data-testid="name-input"
        />
      </label>
      <div class="btn-row">
        <button class="btn btn-primary" onClick={onShare} data-testid="challenge-share">
          <Icon.share /> Send link
        </button>
        <button class="btn btn-ghost" onClick={onCopy} data-testid="challenge-copy">
          <Icon.copy /> Copy link
        </button>
      </div>
      <p class="fine center">No signup. Works in any browser.</p>
    </Modal>
  );
}
