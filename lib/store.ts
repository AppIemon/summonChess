import { SummonChessGame } from './game/engine';
import { GameState } from './game/types';

// Simple in-memory store for development/demo. 
// In production, replace with Redis/MongoDB.
const games = new Map<string, SummonChessGame>();

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
    // In-memory reference is already updated, but for patterns:
    games.set(id, game);
  }
};
