import { SummonChessGame } from './game/engine';
import fs from 'fs';
import path from 'path';

// Storage setup
const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Declare global types
const globalForStore = globalThis as unknown as {
  games: Map<string, SummonChessGame>;
  waitingQueue: string[];
  matchedGames: Map<string, string>;
};

const games = globalForStore.games || new Map<string, SummonChessGame>();
const waitingQueue = globalForStore.waitingQueue || [];
const matchedGames = globalForStore.matchedGames || new Map<string, string>();

if (process.env.NODE_ENV !== 'production') {
  globalForStore.games = games;
  globalForStore.waitingQueue = waitingQueue;
  globalForStore.matchedGames = matchedGames;
}

// Persistence Helper
const persist = () => {
  try {
    const data = {
      games: Array.from(games.entries()).map(([id, game]) => ({ id, data: game.serialize() })),
      waitingQueue,
      matchedGames: Array.from(matchedGames.entries())
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to persist game store", e);
  }
};

const load = () => {
  if (games.size > 0) return; // Already in memory
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);

      if (Array.isArray(data.games)) {
        data.games.forEach((item: any) => {
          games.set(item.id, SummonChessGame.deserialize(item.data));
        });
      }
      if (Array.isArray(data.waitingQueue)) {
        data.waitingQueue.forEach((q: string) => waitingQueue.push(q));
      }
      if (Array.isArray(data.matchedGames)) {
        data.matchedGames.forEach(([k, v]: [string, string]) => matchedGames.set(k, v));
      }
      console.log(`Loaded ${games.size} games from disk.`);
    } catch (e) {
      console.error("Failed to load game store", e);
    }
  }
};

// Initial load
load();

export const GameStore = {
  createGame: (id: string) => {
    const game = new SummonChessGame();
    games.set(id, game);
    persist();
    return game;
  },
  getGame: (id: string) => {
    return games.get(id);
  },
  saveGame: (id: string, game: SummonChessGame) => {
    games.set(id, game);
    persist();
  },
  joinQueue: (playerId: string): { status: 'queued' | 'matched', gameId?: string } => {
    if (matchedGames.has(playerId)) {
      return { status: 'matched', gameId: matchedGames.get(playerId) };
    }

    if (waitingQueue.includes(playerId)) {
      return { status: 'queued' };
    }

    if (waitingQueue.length > 0) {
      const opponentId = waitingQueue.shift()!;
      if (opponentId === playerId) return { status: 'queued' };

      const gameId = crypto.randomUUID();
      const game = new SummonChessGame(undefined, undefined, undefined, opponentId, playerId);
      games.set(gameId, game);

      matchedGames.set(playerId, gameId);
      matchedGames.set(opponentId, gameId);

      persist();
      return { status: 'matched', gameId };
    } else {
      waitingQueue.push(playerId);
      persist();
      return { status: 'queued' };
    }
  },
  checkStatus: (playerId: string): { status: 'queued' | 'matched', gameId?: string } => {
    if (matchedGames.has(playerId)) {
      return { status: 'matched', gameId: matchedGames.get(playerId) };
    }
    return { status: 'queued' };
  }
};
