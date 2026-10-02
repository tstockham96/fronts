-- FRONTS optional backend (Cloudflare D1)
CREATE TABLE IF NOT EXISTS plays (
  puzzle  INTEGER NOT NULL,
  device  TEXT    NOT NULL,
  army    TEXT    NOT NULL,          -- "a,b,c,d,e"
  ts      INTEGER NOT NULL,
  PRIMARY KEY (puzzle, device)
);
CREATE INDEX IF NOT EXISTS plays_puzzle ON plays (puzzle);

CREATE TABLE IF NOT EXISTS duels (
  id          TEXT PRIMARY KEY,
  puzzle      INTEGER NOT NULL,
  challenger  INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  army        TEXT    NOT NULL,      -- never returned before the opponent commits
  ts          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS duel_fights (
  duel     TEXT    NOT NULL,
  army     TEXT    NOT NULL,
  outcome  INTEGER NOT NULL,         -- from the challenger's point of view
  ts       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  name   TEXT    NOT NULL,
  props  TEXT,
  ts     INTEGER NOT NULL
);
