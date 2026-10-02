import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { baseUrl } from '../config';
import type { BattleResult } from '../core/battle';
import { formatPuzzleDate } from '../core/date';
import { decodeDuel, encodeDuel } from '../core/duel';
import { rivalName } from '../core/names';
import { duelResultText, shareText } from '../core/share';
import { getDayMap, type DayMap } from '../core/twists';
import { analyze, battle, currentPool, pickRival, poolArmy, setRealArmies, today, type Analysis } from '../game';
import { track } from '../state/analytics';
import { api } from '../state/api';
import { computeStats, load, update, type Store } from '../state/storage';
import { Battle } from './Battle';
import { copyText, nativeShare } from './clipboard';
import { Deploy } from './Deploy';
import { DuelResult } from './DuelResult';
import { Icon } from './icons';
import { ChallengeModal, HelpModal, StatsModal, WarRoomModal } from './Modals';
import { Results } from './Results';
import { setSound } from './sound';

interface DuelCtx {
  code: string;
  puzzle: number;
  id: number;
  name: string;
  army?: number[];
  serverId?: string;
}

interface BattleView {
  map: DayMap;
  mine: number[];
  theirs: number[];
  theirName: string;
  result: BattleResult;
  subtitle: string;
  cta: string;
  afterword?: string;
  next: View;
}

type View =
  | { kind: 'loading' }
  | { kind: 'deploy' }
  | { kind: 'results' }
  | { kind: 'practiceDeploy' }
  | { kind: 'practiceResults'; army: number[]; rival: { name: string; outcome: 1 | 0 | -1; you: number; them: number } }
  | { kind: 'duelDeploy'; duel: DuelCtx }
  | { kind: 'duelResult'; duel: DuelCtx; mine: number[]; theirs: number[] }
  | { kind: 'duelOwn'; duel: DuelCtx; link: string }
  | { kind: 'battle'; b: BattleView };

type ModalKind = null | 'stats' | 'help' | 'warroom' | 'challenge' | 'sendback';

const displayName = (n: string) => (n.trim() ? n.trim() : 'A rival general');

function clearHash() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

export function App() {
  const [store, setStore] = useState<Store>(() => load());
  const [puzzle, setPuzzle] = useState(today());
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const startedFor = useRef<number | null>(null);

  const commit = (fn: (s: Store) => void) => setStore({ ...update(fn) });
  const say = (text: string) => setToast({ text, id: Date.now() });
  const stats = useMemo(() => computeStats(store, puzzle), [store, puzzle]);
  const played = store.plays[puzzle];

  useEffect(() => setSound(store.sound), [store.sound]);

  // ---------- routing ----------
  const home = (): View => (load().plays[today()] ? { kind: 'results' } : { kind: 'deploy' });

  const route = async () => {
    const h = location.hash.slice(1);
    const params = new URLSearchParams(h);
    const code = params.get('d');
    const sid = params.get('s');
    const s = load();
    if (code) {
      const p = decodeDuel(code);
      if (!p) {
        clearHash();
        say('That duel link is broken. Here is today’s battle.');
        return setView(home());
      }
      const duel: DuelCtx = { code, puzzle: p.puzzle, id: p.id, name: displayName(p.name), army: p.army };
      track('duel_opened', { puzzle: p.puzzle, server: false });
      if (p.id === s.deviceId) return setView({ kind: 'duelOwn', duel, link: location.href });
      const done = s.duelsDone[code];
      if (done) return setView({ kind: 'duelResult', duel, mine: done.army, theirs: p.army });
      return setView({ kind: 'duelDeploy', duel });
    }
    if (sid) {
      setView({ kind: 'loading' });
      const meta = await api.getDuel(sid);
      if (!meta) {
        clearHash();
        say('Could not load that duel.');
        return setView(home());
      }
      const duel: DuelCtx = { code: `s:${sid}`, puzzle: meta.puzzle, id: meta.id, name: displayName(meta.name), serverId: sid };
      track('duel_opened', { puzzle: meta.puzzle, server: true });
      if (meta.id === s.deviceId) return setView({ kind: 'duelOwn', duel, link: location.href });
      return setView({ kind: 'duelDeploy', duel });
    }
    setView(home());
    // With a backend, refresh today's real armies so the live rank reflects real players.
    const p = today();
    if (api.enabled() && s.plays[p]) {
      const r = await api.pool(p, s.deviceId);
      if (r) {
        setRealArmies(p, r.armies);
        setStore({ ...load() });
      }
    }
  };

  useEffect(() => {
    void route();
    const onHash = () => void route();
    window.addEventListener('hashchange', onHash);
    // Midnight rollover: a new battle becomes available.
    const t = setInterval(() => {
      const n = today();
      setPuzzle((p) => {
        if (p !== n) {
          say('A new battle is ready ⚔️');
          setView((v) => (v.kind === 'results' || v.kind === 'deploy' ? { kind: 'deploy' } : v));
        }
        return n;
      });
    }, 20_000);
    return () => {
      window.removeEventListener('hashchange', onHash);
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (view.kind === 'deploy' && startedFor.current !== puzzle) {
      startedFor.current = puzzle;
      track('play_started', { puzzle, twist: getDayMap(puzzle).twist.id });
    }
    window.scrollTo(0, 0);
  }, [view.kind, puzzle]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------- links & sharing ----------
  // With a backend, duels are stored server-side (army hidden until the friend commits);
  // the link is created ahead of time so sharing stays inside the tap gesture.
  const [serverDuel, setServerDuel] = useState<{ key: string; id: string } | null>(null);
  const duelArmy = view.kind === 'duelResult' ? { p: view.duel.puzzle, army: view.mine } : played && view.kind === 'results' ? { p: puzzle, army: played.army } : null;
  const duelKey = duelArmy ? `${duelArmy.p}|${duelArmy.army.join()}|${store.name.trim()}` : '';
  useEffect(() => {
    if (!api.enabled() || !duelArmy || serverDuel?.key === duelKey) return;
    const t = setTimeout(async () => {
      const r = await api.createDuel({ puzzle: duelArmy.p, army: duelArmy.army, id: store.deviceId, name: store.name.trim() });
      if (r) setServerDuel({ key: duelKey, id: r.id });
    }, 400);
    return () => clearTimeout(t);
  }, [duelKey]);

  const duelLink = (p: number, army: number[]) => {
    if (serverDuel && serverDuel.key === `${p}|${army.join()}|${store.name.trim()}`) return `${baseUrl()}#s=${serverDuel.id}`;
    return `${baseUrl()}#d=${encodeDuel({ puzzle: p, army, id: store.deviceId, name: store.name.trim() })}`;
  };

  const deliver = async (text: string, how: 'share' | 'copy', what: string) => {
    if (how === 'share') {
      const r = await nativeShare(text);
      if (r === 'shared') return true;
      if (r === 'cancelled') return false;
    }
    const ok = await copyText(text);
    say(ok ? `${what} copied to clipboard` : 'Could not copy. Long-press to select instead.');
    return ok;
  };

  const shareDaily = async (a: Analysis, how: 'share' | 'copy') => {
    if (!played) return;
    const text = shareText({ map: a.map, pct: a.pct, badgeEmoji: a.badge.emoji, frontRates: a.score.frontRates, link: duelLink(puzzle, played.army) });
    (window as unknown as { __lastShare?: string }).__lastShare = text;
    if (await deliver(text, how, 'Result')) track('shared', { puzzle, how, pct: a.pct });
  };

  const shareChallenge = async (how: 'share' | 'copy') => {
    if (!played) return;
    const link = duelLink(puzzle, played.army);
    const text = `I deployed my army on FRONTS #${puzzle} ${getDayMap(puzzle).twist.emoji}\nThink you can break my line? 👉 ${link}`;
    (window as unknown as { __lastShare?: string }).__lastShare = text;
    if (await deliver(text, how, 'Challenge link')) {
      track('duel_created', { puzzle, how });
      setModal(null);
    }
  };

  // ---------- deploy handlers ----------
  const deployRanked = async (army: number[]) => {
    const p = today();
    if (load().plays[p]) return setView({ kind: 'results' });
    const map = getDayMap(p);
    setBusy(true);
    if (api.enabled()) {
      const r = await api.submitPlay(p, army, store.deviceId);
      if (r) setRealArmies(p, r.armies.filter((x) => x.join() !== army.join()));
    }
    setBusy(false);
    const pool = currentPool(p);
    const a = analyze(map, pool, army);
    const rivalIdx = pickRival(pool, `${p}:${store.deviceId}`);
    const theirs = poolArmy(pool, rivalIdx);
    const result = battle(map, army, theirs);
    commit((s) => {
      s.plays[p] = {
        puzzle: p,
        army,
        score: a.score.score,
        pct: a.pct,
        frontRates: a.score.frontRates,
        badge: a.badge.id,
        poolCount: pool.count,
        rivalIdx,
        rivalArmy: theirs,
        rivalOutcome: result.outcome,
        twist: map.twist.id,
        ts: Date.now(),
      };
    });
    track('deployed', { puzzle: p, twist: map.twist.id, pct: a.pct, badge: a.badge.id });
    setPuzzle(p);
    setView({
      kind: 'battle',
      b: {
        map,
        mine: army,
        theirs,
        theirName: rivalName(rivalIdx, p),
        result,
        subtitle: `FRONTS #${p} · 1 of ${pool.count.toLocaleString('en-US')} generals today`,
        cta: 'See your rank',
        afterword: `That was one rival. Now see how you did against all ${pool.count.toLocaleString('en-US')}.`,
        next: { kind: 'results' },
      },
    });
  };

  const deployPractice = (army: number[]) => {
    const p = today() - 1;
    const map = getDayMap(p);
    const pool = currentPool(p);
    const idx = Math.floor(Math.random() * pool.count);
    const theirs = poolArmy(pool, idx);
    const result = battle(map, army, theirs);
    const name = rivalName(idx, p);
    commit((s) => {
      s.practice.count++;
    });
    setView({
      kind: 'battle',
      b: {
        map,
        mine: army,
        theirs,
        theirName: name,
        result,
        subtitle: `Practice · yesterday's crowd`,
        cta: 'See how you did',
        afterword: `Now the real test: all ${pool.count.toLocaleString('en-US')} of yesterday's generals.`,
        next: { kind: 'practiceResults', army, rival: { name, outcome: result.outcome, you: result.aStars, them: result.bStars } },
      },
    });
  };

  const deployDuel = async (duel: DuelCtx, army: number[]) => {
    let theirs = duel.army;
    if (duel.serverId) {
      setBusy(true);
      theirs = (await api.fightDuel(duel.serverId, army))?.army;
      setBusy(false);
    }
    if (!theirs) return say('Could not reach the battlefield. Try again.');
    const map = getDayMap(duel.puzzle);
    const result = battle(map, army, theirs);
    commit((s) => {
      s.duelsDone[duel.code] = { army, ts: Date.now() };
      const r = (s.duels[duel.id] ??= { name: duel.name, w: 0, l: 0, t: 0, last: 0 });
      r.name = duel.name;
      r.last = Date.now();
      if (result.outcome === 1) r.w++;
      else if (result.outcome === -1) r.l++;
      else r.t++;
    });
    track('duel_completed', { puzzle: duel.puzzle, outcome: result.outcome });
    const full = { ...duel, army: theirs };
    setView({
      kind: 'battle',
      b: { map, mine: army, theirs, theirName: duel.name, result, subtitle: `Duel · FRONTS #${duel.puzzle}`, cta: 'See the result', next: { kind: 'duelResult', duel: full, mine: army, theirs } },
    });
  };

  const startPractice = () => {
    track('practice_started', { puzzle: today() - 1 });
    setView({ kind: 'practiceDeploy' });
  };

  const goDaily = () => {
    clearHash();
    setView(home());
  };

  // ---------- render ----------
  const header = view.kind !== 'battle' && (
    <header class="topbar">
      <button class="logo" onClick={goDaily} aria-label="FRONTS home">
        <span class="logo-mark">★</span>FRONTS
      </button>
      <div class="top-actions">
        <button class="icon-btn" onClick={() => setModal('help')} aria-label="How to play">
          <Icon.help />
        </button>
        <button class="icon-btn" onClick={() => setModal('stats')} aria-label="Stats" data-testid="stats-btn">
          <Icon.stats />
          {stats.streak > 0 && <span class="streak-pip">{stats.streak}</span>}
        </button>
        <button class="icon-btn" onClick={() => commit((s) => void (s.sound = !s.sound))} aria-label={store.sound ? 'Mute' : 'Unmute'}>
          {store.sound ? <Icon.soundOn /> : <Icon.soundOff />}
        </button>
      </div>
    </header>
  );

  let body = null;
  if (view.kind === 'loading') {
    body = <div class="loading">Scouting the battlefield…</div>;
  } else if (view.kind === 'deploy') {
    const map = getDayMap(puzzle);
    const count = currentPool(puzzle).count;
    body = (
      <Deploy
        key={`r${puzzle}`}
        map={map}
        busy={busy}
        onDeploy={deployRanked}
        banner={
          <>
            <MetaRow puzzle={puzzle} right={<><i class="live-dot" /> {count.toLocaleString('en-US')} generals fought today</>} />
            <TwistBanner map={map} />
            <p class="rule-line">Win more stars than each rival. You'll fight everyone who played today.</p>
          </>
        }
      />
    );
  } else if (view.kind === 'practiceDeploy') {
    const map = getDayMap(today() - 1);
    body = (
      <Deploy
        key={`p${store.practice.count}`}
        map={map}
        cta="Attack"
        onDeploy={deployPractice}
        banner={
          <>
            <div class="mode-banner practice">
              <b>Practice</b> vs yesterday's crowd · unranked
              <button class="link-btn" onClick={goDaily}>Exit</button>
            </div>
            <TwistBanner map={map} label="Yesterday's twist" />
          </>
        }
      />
    );
  } else if (view.kind === 'duelDeploy') {
    const map = getDayMap(view.duel.puzzle);
    const d = view.duel;
    body = (
      <Deploy
        key={`d${d.code}`}
        map={map}
        busy={busy}
        cta="Break the seal"
        onDeploy={(a) => deployDuel(d, a)}
        banner={
          <>
            <div class="mode-banner duel" data-testid="duel-banner">
              <span class="seal"><Icon.lock /></span>
              <div>
                <b>{d.name} challenges you</b>
                <span>Their army is sealed. Commit yours to break the seal.</span>
              </div>
            </div>
            <TwistBanner map={map} label={`FRONTS #${map.puzzle}`} />
          </>
        }
      />
    );
  } else if (view.kind === 'battle') {
    const b = view.b;
    body = <Battle key={`${b.subtitle}${b.mine.join()}${b.theirs.join()}`} {...b} onDone={() => setView(b.next)} />;
  } else if (view.kind === 'results' && played) {
    const map = getDayMap(puzzle);
    const rb = battle(map, played.army, played.rivalArmy ?? poolArmy(currentPool(puzzle), played.rivalIdx));
    body = (
      <Results
        key={`res${puzzle}`}
        mode="ranked"
        puzzle={puzzle}
        army={played.army}
        pool={currentPool(puzzle)}
        deployedPct={played.pct}
        rival={{ name: rivalName(played.rivalIdx, puzzle), outcome: rb.outcome, you: rb.aStars, them: rb.bStars }}
        streak={stats.streak}
        onShare={(a) => shareDaily(a, 'share')}
        onCopy={(a) => shareDaily(a, 'copy')}
        onChallenge={() => setModal('challenge')}
        onPractice={startPractice}
        onWarRoom={() => {
          track('warroom_opened', { from: 'results' });
          setModal('warroom');
        }}
        onStats={() => setModal('stats')}
      />
    );
  } else if (view.kind === 'results') {
    body = <div class="loading">…</div>;
  } else if (view.kind === 'practiceResults') {
    const p = today() - 1;
    body = (
      <Results
        key={`pr${store.practice.count}`}
        mode="practice"
        puzzle={p}
        army={view.army}
        pool={currentPool(p)}
        rival={view.rival}
        onPractice={startPractice}
        onBack={goDaily}
        onWarRoom={() => {
          track('warroom_opened', { from: 'practice' });
          setModal('warroom');
        }}
      />
    );
  } else if (view.kind === 'duelResult') {
    const map = getDayMap(view.duel.puzzle);
    const result = battle(map, view.mine, view.theirs);
    const rec = store.duels[view.duel.id] ?? { w: 0, l: 0, t: 0 };
    const v = view;
    const backText = () =>
      duelResultText({ puzzle: map.puzzle, myStars: result.aStars, theirStars: result.bStars, outcome: result.outcome, theirName: v.duel.name, link: duelLink(map.puzzle, v.mine) });
    body = (
      <DuelResult
        map={map}
        theirName={view.duel.name}
        result={result}
        record={rec}
        playedToday={!!played}
        onSendBack={() => setModal('sendback')}
        onCopyBack={async () => {
          const t = backText();
          (window as unknown as { __lastShare?: string }).__lastShare = t;
          if (await deliver(t, 'copy', 'Rematch link')) track('duel_created', { puzzle: map.puzzle, rematch: true });
        }}
        onDaily={goDaily}
      />
    );
  } else if (view.kind === 'duelOwn') {
    const d = view.duel;
    const link = view.link;
    body = (
      <div class="screen-enter own-duel">
        <section class="card hero">
          <div class="hero-kicker">Your challenge · FRONTS #{d.puzzle}</div>
          <p class="lead center">This is your own duel link. Send it to a friend: they'll have to commit an army before they see yours.</p>
          <button class="btn btn-primary wide" onClick={() => deliver(`Think you can break my line? 👉 ${link}`, 'share', 'Link')}>
            <Icon.share /> Send it to a friend
          </button>
          <button class="btn btn-ghost wide" onClick={goDaily}>Back to today</button>
        </section>
      </div>
    );
  }

  return (
    <div class={`app view-${view.kind}`}>
      <aside class="desk-tagline" aria-hidden="true">
        <b>100 troops.</b>
        <b>5 fronts.</b>
        <span>Everyone who played today is your enemy.</span>
      </aside>
      {header}
      <main class="main">{body}</main>
      {modal === 'stats' && <StatsModal stats={stats} duels={store.duels} onClose={() => setModal(null)} />}
      {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
      {modal === 'warroom' && <WarRoomModal onClose={() => setModal(null)} onCta={() => track('warroom_cta', {})} />}
      {modal === 'challenge' && (
        <ChallengeModal
          name={store.name}
          onName={(n) => commit((s) => void (s.name = n))}
          onShare={() => shareChallenge('share')}
          onCopy={() => shareChallenge('copy')}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'sendback' && view.kind === 'duelResult' && (
        <ChallengeModal
          title="Send it back"
          lead={`Your army for this map goes into a rematch link. ${view.duel.name} has to commit before seeing it.`}
          name={store.name}
          onName={(n) => commit((s) => void (s.name = n))}
          onShare={async () => {
            const map = getDayMap(view.duel.puzzle);
            const r = battle(map, view.mine, view.theirs);
            const t = duelResultText({ puzzle: map.puzzle, myStars: r.aStars, theirStars: r.bStars, outcome: r.outcome, theirName: view.duel.name, link: duelLink(map.puzzle, view.mine) });
            (window as unknown as { __lastShare?: string }).__lastShare = t;
            if (await deliver(t, 'share', 'Rematch link')) {
              track('duel_created', { puzzle: map.puzzle, rematch: true });
              setModal(null);
            }
          }}
          onCopy={async () => {
            const map = getDayMap(view.duel.puzzle);
            const r = battle(map, view.mine, view.theirs);
            const t = duelResultText({ puzzle: map.puzzle, myStars: r.aStars, theirStars: r.bStars, outcome: r.outcome, theirName: view.duel.name, link: duelLink(map.puzzle, view.mine) });
            (window as unknown as { __lastShare?: string }).__lastShare = t;
            if (await deliver(t, 'copy', 'Rematch link')) {
              track('duel_created', { puzzle: map.puzzle, rematch: true });
              setModal(null);
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
      {toast && (
        <div class="toast" key={toast.id} role="status" data-testid="toast">
          {toast.text}
        </div>
      )}
    </div>
  );
}

function MetaRow({ puzzle, right }: { puzzle: number; right?: preact.ComponentChildren }) {
  return (
    <div class="meta-row">
      <span class="meta-num">
        #{puzzle} <span>· {formatPuzzleDate(puzzle)}</span>
      </span>
      <span class="meta-right">{right}</span>
    </div>
  );
}

function TwistBanner({ map, label = "Today's twist" }: { map: DayMap; label?: string }) {
  return (
    <div class={`twist twist-${map.twist.id}`} data-testid="twist">
      <span class="twist-emoji">{map.twist.emoji}</span>
      <div class="twist-text">
        <small>{label}</small>
        <b>{map.twist.name}</b>
        <span>{map.twist.rule}</span>
      </div>
    </div>
  );
}
