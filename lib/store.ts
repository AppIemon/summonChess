import { SummonChessGame } from './game/engine';
import fs from 'fs';
import path from 'path';
import { Tier, getTier } from './rating';

// Storage setup
const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Helper to ensure dir exists
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export interface User {
  id: string;
  nickname: string; // e.g. "Player #1234" or "User <ID>"
  elo: number;
  gamesPlayed: number;
  tier: Tier;
  createdAt: number;
}

export interface Spectator {
  id: string;
  nickname: string;
  elo?: number;
  tier?: Tier;
}

// Room info type
export interface RoomInfo {
  roomCode: string;
  hostId: string;
  hostNickname: string;
  hostElo?: number;
  guestId?: string;
  guestNickname?: string;
  guestElo?: number;
  spectators: Spectator[]; // Now includes elo info if available
  gameId?: string;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
}

// Declare global types
const globalForStore = globalThis as unknown as {
  games: Map<string, SummonChessGame>;
  rooms: Map<string, RoomInfo>;
  users: Map<string, User>;
  matchQueue: string[]; // List of user IDs waiting for match
};

// Always use globalThis to persist store across HMR in dev and better handle instance sharing
globalForStore.games = globalForStore.games || new Map<string, SummonChessGame>();
globalForStore.rooms = globalForStore.rooms || new Map<string, RoomInfo>();
globalForStore.users = globalForStore.users || new Map<string, User>();
globalForStore.matchQueue = globalForStore.matchQueue || [];

const games = globalForStore.games;
const rooms = globalForStore.rooms;
const users = globalForStore.users;
const matchQueue = globalForStore.matchQueue;

// Generate 6-digit room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Persistence Helper
function persist() {
  try {
    ensureDir();
    const data = {
      rooms: Array.from(rooms.entries()),
      users: Array.from(users.entries()),
      games: Array.from(games.entries()).map(([id, game]) => [id, game.serialize()]),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to persist store:', e);
  }
}

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        console.error('Invalid JSON in store.json');
        return;
      }

      if (Array.isArray(data.rooms)) {
        data.rooms.forEach((entry: any) => {
          if (Array.isArray(entry) && entry.length === 2) {
            rooms.set(entry[0], entry[1]);
          }
        });
      }

      if (Array.isArray(data.users)) {
        data.users.forEach((entry: any) => {
          if (Array.isArray(entry) && entry.length === 2) {
            users.set(entry[0], entry[1]);
          }
        });
      }

      if (Array.isArray(data.games)) {
        data.games.forEach((entry: any) => {
          if (Array.isArray(entry) && entry.length === 2) {
            try {
              games.set(entry[0], SummonChessGame.deserialize(entry[1]));
            } catch (e) {
              console.error(`Failed to deserialize game ${entry[0]}:`, e);
            }
          }
        });
      }
    }
  } catch (e) {
    console.error('Failed to load store:', e);
  }
}

// Initial load
load();

export const GameStore = {
  // User Management
  getUser(userId: string): User | undefined {
    return users.get(userId);
  },

  registerUser(userId: string): User {
    if (users.has(userId)) {
      return users.get(userId)!;
    }
    const newUser: User = {
      id: userId,
      nickname: `Player ${userId.slice(0, 4)}`, // Default nickname
      elo: 400,
      gamesPlayed: 0,
      tier: Tier.Beginner,
      createdAt: Date.now(),
    };
    users.set(userId, newUser);
    persist();
    return newUser;
  },

  updateUser(userId: string, data: Partial<User>) {
    const user = users.get(userId);
    if (user) {
      Object.assign(user, data);

      // Update derived fields if ELO changed
      if (data.elo !== undefined) {
        user.tier = getTier(user.elo);
      }

      persist();
    }
  },

  // Game management
  createGame(id: string, whitePlayerId?: string, blackPlayerId?: string) {
    const game = new SummonChessGame(undefined, undefined, undefined, whitePlayerId, blackPlayerId);
    // Initialize game with player IDs if needed
    games.set(id, game);
    return game;
  },

  getGame(id: string) {
    return games.get(id);
  },

  saveGame(id: string, game: SummonChessGame) {
    games.set(id, game);
    persist();
  },

  deleteGame(id: string) {
    games.delete(id);
  },

  // Room management
  createRoom(hostId: string, hostNickname: string): RoomInfo {
    const code = generateRoomCode();

    // Try to get updated user info
    const hostUser = users.get(hostId);

    const room: RoomInfo = {
      roomCode: code,
      hostId,
      hostNickname: hostUser ? hostUser.nickname : hostNickname,
      hostElo: hostUser?.elo,
      spectators: [],
      status: 'waiting',
      createdAt: Date.now(),
    };
    rooms.set(code, room);
    persist();
    return room;
  },

  getRoom(roomCode: string): RoomInfo | undefined {
    const room = rooms.get(roomCode);
    // Consistency check: If room says playing but game is missing, reset it
    if (room && room.status === 'playing' && room.gameId && !games.has(room.gameId)) {
      room.status = 'waiting';
      room.gameId = undefined;
      persist();
    }
    return room;
  },

  addBot(roomCode: string): { success: boolean; error?: string } {
    const room = rooms.get(roomCode);
    if (!room) return { success: false, error: 'Room not found' };
    if (room.status !== 'waiting') return { success: false, error: 'Game already active' };
    if (room.guestId) return { success: false, error: 'Room is full' };

    room.guestId = 'BOT';
    room.guestNickname = 'Bot (Lv.1)';
    persist();

    return { success: true };
  },

  joinRoom(roomCode: string, playerId: string, nickname: string, asSpectator = false): { success: boolean; error?: string; room?: RoomInfo } {
    const room = rooms.get(roomCode);
    if (!room) return { success: false, error: '방을 찾을 수 없습니다.' };

    const user = users.get(playerId);
    const safeNickname = user ? user.nickname : nickname;
    const userElo = user?.elo;
    const userTier = user?.tier;

    if (asSpectator) {
      // Check if already in spectators
      if (!room.spectators.some(s => s.id === playerId)) {
        room.spectators.push({
          id: playerId,
          nickname: safeNickname,
          elo: userElo,
          tier: userTier
        });
        persist();
      }
      return { success: true, room };
    }

    if (room.hostId === playerId) {
      // Re-joining as host?
      return { success: true, room };
    }

    if (room.guestId) {
      if (room.guestId === playerId) return { success: true, room };
      return { success: false, error: '방이 꽉 찼습니다.' };
    }

    room.guestId = playerId;
    room.guestNickname = safeNickname;
    room.guestElo = userElo;
    persist();

    return { success: true, room };
  },

  startGame(roomCode: string): { success: boolean; error?: string; gameId?: string } {
    const room = rooms.get(roomCode);
    if (!room) return { success: false, error: 'Room not found' };

    // Check if we have enough players or a bot
    if (!room.guestId) return { success: false, error: 'Not enough players' };

    const gameId = generateRoomCode(); // Unique ID for game
    const game = this.createGame(gameId, room.hostId, room.guestId);

    room.status = 'playing';
    room.gameId = gameId;
    persist();

    return { success: true, gameId };
  },

  leaveRoom(roomCode: string, playerId: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (room.hostId === playerId) {
      // Host left - destroy room or assign new host?
      // Simple logic: destroy room
      rooms.delete(roomCode);
    } else if (room.guestId === playerId) {
      room.guestId = undefined;
      room.guestNickname = undefined;
      room.guestElo = undefined;
      if (room.status === 'playing') {
        // End game if playing?
        room.status = 'finished';
      }
    } else {
      // Remove spectator
      room.spectators = room.spectators.filter(s => s.id !== playerId);
    }
    persist();
  },

  deleteRoom(roomCode: string): void {
    rooms.delete(roomCode);
    persist();
  },

  resetRoom(roomCode: string): { success: boolean; error?: string } {
    const room = rooms.get(roomCode);
    if (!room) return { success: false, error: 'Room not found' };

    room.status = 'waiting';
    room.gameId = undefined;
    persist();
    return { success: true };
  },

  getRoomCodeByGameId(gameId: string): string | undefined {
    for (const [code, room] of rooms.entries()) {
      if (room.gameId === gameId) return code;
    }
    return undefined;
  },

  // Matchmaking
  addToQueue(playerId: string) {
    if (!matchQueue.includes(playerId)) {
      matchQueue.push(playerId);
    }
  },

  removeFromQueue(playerId: string) {
    const idx = matchQueue.indexOf(playerId);
    if (idx !== -1) {
      matchQueue.splice(idx, 1);
    }
  },

  findMatch(playerId: string): string | null {
    // Try to find someone else in queue
    // Simple FIFO: just pick the first person who isn't me
    for (const opponentId of matchQueue) {
      if (opponentId !== playerId) {
        return opponentId;
      }
    }
    return null;
  },


  findActiveRoom(playerId: string): RoomInfo | undefined {
    for (const room of rooms.values()) {
      // Check host, guest, or spectator
      if (room.hostId === playerId) return room;
      if (room.guestId === playerId) return room;
      // We generally don't auto-redirect spectators unless intended, but for matchmaking we care about players.
    }
    return undefined;
  },

  cleanupOldRooms() {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      // Delete empty waiting/finished rooms older than 1 hour
      if (room.status !== 'playing' && now - room.createdAt > 3600000) {
        rooms.delete(code);
      }
      // Delete stale playing rooms older than 24 hours
      if (room.status === 'playing' && now - room.createdAt > 86400000) {
        rooms.delete(code);
      }
    }
    persist();
  }
};
