import { SummonChessGame } from './game/engine';
import { GameState } from './game/types';

// Declare global types to prevent TS errors
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

export const GameStore = {
  createGame: (id: string) => {
    const game = new SummonChessGame();
    games.set(id, game);
    return game;
  },
  getGame: (id: string) => {
    return games.get(id);
  },
  saveGame: (id: string, game: SummonChessGame) => {
    games.set(id, game);
  },
  // Matching
  joinQueue: (playerId: string): { status: 'queued' | 'matched', gameId?: string } => {
    if (matchedGames.has(playerId)) {
      return { status: 'matched', gameId: matchedGames.get(playerId) };
    }

    // Check if already in queue
    if (waitingQueue.includes(playerId)) {
      return { status: 'queued' };
    }

    // Match with current waiter
    if (waitingQueue.length > 0) {
      const opponentId = waitingQueue.shift()!;
      if (opponentId === playerId) return { status: 'queued' }; // Should not happen

      // Create Game
      const gameId = crypto.randomUUID(); // Need node 19+ or polyfill. uuidv4 better.

      // Assign opponentId as White, playerId as Black (First come served white?)
      const game = new SummonChessGame(undefined, undefined, undefined, opponentId, playerId);
      games.set(gameId, game);

      // Store match info
      matchedGames.set(playerId, gameId);
      matchedGames.set(opponentId, gameId); // Opponent will poll and see this

      return { status: 'matched', gameId };
    } else {
      waitingQueue.push(playerId);
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
