import type { BattleResult } from '../core/battle';
import type { DayMap } from '../core/twists';
import { fmtStars } from './Battle';
import { Fort, Icon } from './icons';

interface Props {
  map: DayMap;
  theirName: string;
  result: BattleResult;
  record: { w: number; l: number; t: number };
  playedToday: boolean;
  onSendBack: () => void;
  onCopyBack: () => void;
  onDaily: () => void;
}

export function DuelResult({ map, theirName, result, record, playedToday, onSendBack, onCopyBack, onDaily }: Props) {
  const verdict = result.outcome === 1 ? 'Victory' : result.outcome === -1 ? 'Defeat' : 'Stalemate';
  const line =
    result.outcome === 1 ? `You broke ${theirName}'s line.` : result.outcome === -1 ? `${theirName} held the line.` : 'Dead even. Nobody blinked.';
  return (
    <div class="duel-result screen-enter" data-testid="duel-result">
      <section class="card hero duel-hero">
        <div class="hero-kicker">
          Duel · FRONTS #{map.puzzle} <span class="dot">·</span> {map.twist.emoji} {map.twist.name}
        </div>
        <div class={`stamp big o${result.outcome}`}>
          <span>{verdict}</span>
        </div>
        <div class="duel-score">
          <div class="ds-side you">
            <small>You</small>
            <b>{fmtStars(result.aStars)}★</b>
          </div>
          <div class="ds-dash">–</div>
          <div class="ds-side foe">
            <small>{theirName}</small>
            <b>{fmtStars(result.bStars)}★</b>
          </div>
        </div>
        <p class="duel-line">{line}</p>
        <div class="record" data-testid="duel-record">
          You &amp; {theirName}: <b>{record.w}–{record.l}</b>
          {record.t ? <span> ({record.t} draw{record.t > 1 ? 's' : ''})</span> : null}
        </div>
      </section>

      <section class="card">
        <h3 class="card-title">Front by front</h3>
        <ul class="h2h">
          <li class="h2h-head">
            <span class="you">You</span>
            <span />
            <span class="foe">{theirName}</span>
          </li>
          {result.fronts.map((f, i) => (
            <li class={`w${f.winner}`}>
              <span class="h2h-n you">
                {f.a}
                {f.aEff > f.a && <sup>+{f.aEff - f.a}</sup>}
              </span>
              <span class="h2h-mid">
                <Fort value={f.value} size={34} owner={f.winner === 1 ? 'you' : f.winner === -1 ? 'foe' : f.voided ? 'void' : 'none'} />
                <small>
                  ★{f.value} {map.names[i]}
                </small>
              </span>
              <span class="h2h-n foe">
                {f.b}
                {f.bEff > f.b && <sup>+{f.bEff - f.b}</sup>}
              </span>
            </li>
          ))}
        </ul>
        {result.chains.length > 0 && (
          <p class="fine">
            ⛓ Chain bonus: you +{fmtStars(result.aBonus)}★, {theirName} +{fmtStars(result.bBonus)}★
          </p>
        )}
      </section>

      <section class="card btn-stack">
        <div class="btn-row">
          <button class="btn btn-primary" onClick={onSendBack} data-testid="send-back">
            <Icon.share /> Send it back
          </button>
          <button class="btn btn-ghost" onClick={onCopyBack}>
            <Icon.copy /> Copy
          </button>
        </div>
        <button class="btn btn-ink wide" onClick={onDaily} data-testid="to-daily">
          {playedToday ? "See today's results" : "Now play today's FRONTS"} →
        </button>
      </section>
    </div>
  );
}
