const STATS_KEY = 'haazari_stats_v1';

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  totalPoints: number;
  lastPlayedAt: number;
}

interface StatsStore {
  [playerName: string]: PlayerStats;
}

function readStore(): StatsStore {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? (JSON.parse(raw) as StatsStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: StatsStore): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(store));
  } catch {
    /* ignore storage failures (private browsing etc.) */
  }
}

/** Records the result of a completed game for the local player on this device. */
export function recordGameResult(playerName: string, won: boolean, finalScore: number): void {
  const store = readStore();
  const existing = store[playerName] ?? { gamesPlayed: 0, gamesWon: 0, totalPoints: 0, lastPlayedAt: 0 };
  store[playerName] = {
    gamesPlayed: existing.gamesPlayed + 1,
    gamesWon: existing.gamesWon + (won ? 1 : 0),
    totalPoints: existing.totalPoints + finalScore,
    lastPlayedAt: Date.now(),
  };
  writeStore(store);
}

/** All recorded names on this device, most-recently-played first - the "leaderboard" is just this browser's history. */
export function getAllStats(): { name: string; stats: PlayerStats }[] {
  const store = readStore();
  return Object.entries(store)
    .map(([name, stats]) => ({ name, stats }))
    .sort((a, b) => b.stats.lastPlayedAt - a.stats.lastPlayedAt);
}

export function getStatsFor(playerName: string): PlayerStats | null {
  const store = readStore();
  return store[playerName] ?? null;
}
