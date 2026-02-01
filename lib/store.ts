import { SummonChessGame } from './game/engine';
import fs from 'fs';
import path from 'path';

// Storage setup
const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Helper to ensure dir exists
const ensureDir = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {
    console.error("Failed to ensure data dir", e);
  }
}

// Room info type
interface RoomInfo {
  roomCode: string;
  hostId: string;
  hostNickname: string;
  guestId?: string;
  guestNickname?: string;
  gameId?: string;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
}

// Declare global types
const globalForStore = globalThis as unknown as {
  games: Map<string, SummonChessGame>;
  rooms: Map<string, RoomInfo>;
};

// Always use globalThis to persist store across HMR in dev and better handle instance sharing
globalForStore.games = globalForStore.games || new Map<string, SummonChessGame>();
globalForStore.rooms = globalForStore.rooms || new Map<string, RoomInfo>();

const games = globalForStore.games;
const rooms = globalForStore.rooms;

// Generate 6-digit room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure unique
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

// Persistence Helper
const persist = () => {
  ensureDir();
  try {
    const data = {
      games: Array.from(games.entries()).map(([id, game]) => ({
        id,
        data: (typeof game.serialize === 'function') ? game.serialize() : {}
      })),
      rooms: Array.from(rooms.entries()).map(([code, info]) => ({
        code,
        info
      }))
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to persist game store", e);
  }
};

const load = () => {
  if (games.size > 0 || rooms.size > 0) return; // Already in memory

  ensureDir();
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);

      if (Array.isArray(data.games)) {
        data.games.forEach((item: any) => {
          games.set(item.id, SummonChessGame.deserialize(item.data));
        });
      }
      if (Array.isArray(data.rooms)) {
        data.rooms.forEach((item: any) => {
          rooms.set(item.code, item.info);
        });
      }
      console.log(`Loaded ${games.size} games, ${rooms.size} rooms from disk.`);
    } catch (e) {
      console.error("Failed to load game store", e);
    }
  }
};

// Initial load
load();

export const GameStore = {
  // Game management
  createGame: (id: string, whitePlayerId?: string, blackPlayerId?: string) => {
    const game = new SummonChessGame(undefined, undefined, undefined, whitePlayerId, blackPlayerId);
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
  deleteGame: (id: string) => {
    games.delete(id);
    persist();
  },

  // Room management
  createRoom: (hostId: string, hostNickname: string): RoomInfo => {
    const roomCode = generateRoomCode();
    const roomInfo: RoomInfo = {
      roomCode,
      hostId,
      hostNickname,
      status: 'waiting',
      createdAt: Date.now()
    };
    rooms.set(roomCode, roomInfo);
    persist();
    return roomInfo;
  },

  getRoom: (roomCode: string): RoomInfo | undefined => {
    return rooms.get(roomCode.toUpperCase());
  },

  joinRoom: (roomCode: string, guestId: string, guestNickname: string): { success: boolean; error?: string; room?: RoomInfo } => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      return { success: false, error: '방을 찾을 수 없습니다.' };
    }

    if (room.status !== 'waiting') {
      return { success: false, error: '이미 게임이 시작되었습니다.' };
    }

    if (room.hostId === guestId) {
      return { success: false, error: '자신의 방에 참가할 수 없습니다.' };
    }

    if (room.guestId && room.guestId !== guestId) {
      return { success: false, error: '이미 다른 플레이어가 참가했습니다.' };
    }

    // Join the room
    room.guestId = guestId;
    room.guestNickname = guestNickname;
    persist();

    return { success: true, room };
  },

  startGame: (roomCode: string): { success: boolean; error?: string; gameId?: string } => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      return { success: false, error: '방을 찾을 수 없습니다.' };
    }

    if (!room.guestId) {
      return { success: false, error: '대기 중인 플레이어가 입장해야 합니다.' };
    }

    if (room.status === 'playing' && room.gameId) {
      return { success: true, gameId: room.gameId };
    }

    // Create the game with random color assignment
    const gameId = crypto.randomUUID();
    const hostIsWhite = Math.random() < 0.5;
    const whitePlayer = hostIsWhite ? room.hostId : room.guestId;
    const blackPlayer = hostIsWhite ? room.guestId : room.hostId;
    const game = new SummonChessGame(undefined, undefined, undefined, whitePlayer, blackPlayer);
    games.set(gameId, game);

    room.gameId = gameId;
    room.status = 'playing';
    persist();

    return { success: true, gameId };
  },

  leaveRoom: (roomCode: string, playerId: string): void => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);

    if (!room) return;

    if (room.hostId === playerId) {
      // Host left, delete the room
      rooms.delete(code);
    } else if (room.guestId === playerId) {
      // Guest left
      room.guestId = undefined;
    }
    persist();
  },

  deleteRoom: (roomCode: string): void => {
    rooms.delete(roomCode.toUpperCase());
    persist();
  },

  // Cleanup old rooms (optional)
  cleanupOldRooms: () => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    for (const [code, room] of rooms.entries()) {
      if (now - room.createdAt > maxAge && room.status === 'waiting') {
        rooms.delete(code);
      }
    }
    persist();
  }
};
