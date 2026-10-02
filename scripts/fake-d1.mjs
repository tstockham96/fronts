// Minimal in-memory stand-in for Cloudflare D1, covering exactly the queries the FRONTS worker uses.
// Used by tests/worker.test.ts and scripts/local-api.mjs (local dev without Cloudflare).
export function fakeD1() {
  const plays = [];
  const duels = new Map();
  const fights = [];
  const events = [];
  const exec = (sql, args) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('INSERT OR IGNORE INTO plays')) {
      const [puzzle, device, army, ts] = args;
      if (!plays.some((p) => p.puzzle === puzzle && p.device === device)) plays.push({ puzzle, device, army, ts });
      return [];
    }
    if (q.startsWith('SELECT army FROM plays')) return plays.filter((p) => p.puzzle === args[0]).sort((a, b) => a.ts - b.ts).slice(0, args[1]).map((p) => ({ army: p.army }));
    if (q.startsWith('SELECT 1 AS ok FROM plays')) return plays.some((p) => p.puzzle === args[0] && p.device === args[1]) ? [{ ok: 1 }] : [];
    if (q.startsWith('INSERT INTO duels')) {
      const [id, puzzle, challenger, name, army, ts] = args;
      duels.set(id, { puzzle, challenger, name, army, ts });
      return [];
    }
    if (q.startsWith('SELECT puzzle, challenger, name, army FROM duels')) return duels.has(args[0]) ? [duels.get(args[0])] : [];
    if (q.startsWith('INSERT INTO duel_fights')) return fights.push(args), [];
    if (q.startsWith('INSERT INTO events')) return events.push(args), [];
    throw new Error('fakeD1: unsupported SQL ' + q);
  };
  const prepare = (sql) => {
    let args = [];
    const stmt = {
      bind: (...a) => ((args = a), stmt),
      run: async () => (exec(sql, args), { success: true }),
      all: async () => ({ results: exec(sql, args) }),
      first: async () => exec(sql, args)[0] ?? null,
    };
    return stmt;
  };
  return { prepare, _tables: { plays, duels, fights, events } };
}
