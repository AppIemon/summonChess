import { SummonChessGame } from './game/engine';
import { getDb, COLLECTIONS } from './mongodb';
import { Tier, getTier } from './rating';

export interface User {
  id: string;
  nickname: string;
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

export interface RoomInfo {
  roomCode: string;
  hostId: string;
  hostNickname: string;
  hostElo?: number;
  guestId?: string;
  guestNickname?: string;
  guestElo?: number;
  spectators: Spectator[];
  gameId?: string;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
  updatedAt: number;
}

interface SerializedGame {
  gameId: string;
  data: string; // JSON serialized game state
  updatedAt: number;
}

// In-memory cache for hot data (optional performance optimization)
const memoryCache = {
  games: new Map<string, { game: SummonChessGame; cachedAt: number }>(),
  rooms: new Map<string, { room: RoomInfo; cachedAt: number }>(),
};

const CACHE_TTL = 5000; // 5 seconds cache

// Generate 6-digit room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const GameStore = {
  // ========================
  // User Management
  // ========================
  async getUser(userId: string): Promise<User | undefined> {
    const db = await getDb();
    const user = await db.collection<User>(COLLECTIONS.USERS).findOne({ id: userId });
    return user || undefined;
  },

  async registerUser(userId: string): Promise<User> {
    const db = await getDb();
    const existing = await db.collection<User>(COLLECTIONS.USERS).findOne({ id: userId });
    if (existing) return existing;

    const newUser: User = {
      id: userId,
      nickname: `Player ${userId.slice(0, 4)}`,
      elo: 400,
      gamesPlayed: 0,
      tier: Tier.Beginner,
      createdAt: Date.now(),
    };
    await db.collection(COLLECTIONS.USERS).insertOne(newUser);
    return newUser;
  },

  async updateUser(userId: string, data: Partial<User>): Promise<void> {
    const db = await getDb();
    const update: Partial<User> = { ...data };

    // Update derived tier if ELO changed
    if (data.elo !== undefined) {
      update.tier = getTier(data.elo);
    }

    await db.collection(COLLECTIONS.USERS).updateOne(
      { id: userId },
      { $set: update }
    );
  },

  // ========================
  // Game Management
  // ========================
  async createGame(id: string, whitePlayerId?: string, blackPlayerId?: string): Promise<SummonChessGame> {
    const db = await getDb();
    const game = new SummonChessGame(undefined, undefined, undefined, whitePlayerId, blackPlayerId);

    const serialized: SerializedGame = {
      gameId: id,
      data: game.serialize(),
      updatedAt: Date.now(),
    };
    await db.collection(COLLECTIONS.GAMES).insertOne(serialized);

    // Cache it
    memoryCache.games.set(id, { game, cachedAt: Date.now() });

    return game;
  },

  async getGame(id: string): Promise<SummonChessGame | undefined> {
    // Check memory cache first
    const cached = memoryCache.games.get(id);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return cached.game;
    }

    const db = await getDb();
    const doc = await db.collection<SerializedGame>(COLLECTIONS.GAMES).findOne({ gameId: id });
    if (!doc) return undefined;

    try {
      const game = SummonChessGame.deserialize(doc.data);
      memoryCache.games.set(id, { game, cachedAt: Date.now() });
      return game;
    } catch (e) {
      console.error(`Failed to deserialize game ${id}:`, e);
      return undefined;
    }
  },

  async saveGame(id: string, game: SummonChessGame): Promise<void> {
    const db = await getDb();
    await db.collection(COLLECTIONS.GAMES).updateOne(
      { gameId: id },
      {
        $set: {
          data: game.serialize(),
          updatedAt: Date.now(),
        }
      },
      { upsert: true }
    );

    // Update cache
    memoryCache.games.set(id, { game, cachedAt: Date.now() });
  },

  async deleteGame(id: string): Promise<void> {
    const db = await getDb();
    await db.collection(COLLECTIONS.GAMES).deleteOne({ gameId: id });
    memoryCache.games.delete(id);
  },

  // ========================
  // Room Management
  // ========================
  async createRoom(hostId: string, hostNickname: string): Promise<RoomInfo> {
    const db = await getDb();
    const code = generateRoomCode();

    // Try to get updated user info
    const hostUser = await this.getUser(hostId);

    const room: RoomInfo = {
      roomCode: code,
      hostId,
      hostNickname: hostUser ? hostUser.nickname : hostNickname,
      hostElo: hostUser?.elo,
      spectators: [],
      status: 'waiting',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.cleanupOldRooms().catch(e => console.error('Cleanup error:', e));

    await db.collection(COLLECTIONS.ROOMS).insertOne(room);
    memoryCache.rooms.set(code, { room, cachedAt: Date.now() });
    return room;
  },

  async getRoom(roomCode: string, bypassCache = false): Promise<RoomInfo | undefined> {
    // Check cache
    if (!bypassCache) {
      const cached = memoryCache.rooms.get(roomCode);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
        return cached.room;
      }
    }

    const db = await getDb();
    const room = await db.collection<RoomInfo>(COLLECTIONS.ROOMS).findOne({ roomCode });
    if (!room) return undefined;

    // Consistency check: If room says playing but game is missing, reset it
    if (room.status === 'playing' && room.gameId) {
      const game = await this.getGame(room.gameId);
      if (!game) {
        room.status = 'waiting';
        room.gameId = undefined;
        await db.collection(COLLECTIONS.ROOMS).updateOne(
          { roomCode },
          { $set: { status: 'waiting', gameId: undefined } }
        );
      }
    }

    if (!bypassCache) {
      memoryCache.rooms.set(roomCode, { room, cachedAt: Date.now() });
    }
    return room;
  },

  async joinRoom(
    roomCode: string,
    playerId: string,
    nickname: string,
    asSpectator = false
  ): Promise<{ success: boolean; error?: string; room?: RoomInfo }> {
    const db = await getDb();
    const room = await this.getRoom(roomCode);
    if (!room) return { success: false, error: '방을 찾을 수 없습니다.' };

    const user = await this.getUser(playerId);
    const safeNickname = user ? user.nickname : nickname;
    const userElo = user?.elo;
    const userTier = user?.tier;

    if (asSpectator) {
      if (!room.spectators.some(s => s.id === playerId)) {
        await db.collection(COLLECTIONS.ROOMS).updateOne(
          { roomCode },
          {
            $push: {
              spectators: {
                id: playerId,
                nickname: safeNickname,
                elo: userElo,
                tier: userTier
              }
            } as any
          }
        );
        memoryCache.rooms.delete(roomCode);
      }
      const updatedRoom = await this.getRoom(roomCode);
      return { success: true, room: updatedRoom };
    }

    if (room.hostId === playerId) {
      return { success: true, room };
    }

    if (room.guestId) {
      if (room.guestId === playerId) return { success: true, room };
      return { success: false, error: '방이 꽉 찼습니다.' };
    }

    await db.collection(COLLECTIONS.ROOMS).updateOne(
      { roomCode },
      {
        $set: {
          guestId: playerId,
          guestNickname: safeNickname,
          guestElo: userElo,
          updatedAt: Date.now()
        }
      }
    );

    memoryCache.rooms.delete(roomCode);
    const updatedRoom = await this.getRoom(roomCode);
    return { success: true, room: updatedRoom };
  },

  async startGame(roomCode: string): Promise<{ success: boolean; error?: string; gameId?: string }> {
    const db = await getDb();
    // Bypass cache to ensure we see the guest
    const room = await this.getRoom(roomCode, true);
    if (!room) return { success: false, error: 'Room not found' };

    console.log(`Starting game in room ${roomCode}. Host: ${room.hostId}, Guest: ${room.guestId}`);

    if (!room.guestId) {
      console.warn(`Cannot start game in room ${roomCode}: No guestId found.`, room);
      return { success: false, error: '상대 플레이어가 없습니다.' };
    }

    const gameId = generateRoomCode();
    await this.createGame(gameId, room.hostId, room.guestId);

    await db.collection(COLLECTIONS.ROOMS).updateOne(
      { roomCode },
      { $set: { status: 'playing', gameId, updatedAt: Date.now() } }
    );

    memoryCache.rooms.delete(roomCode);
    return { success: true, gameId };
  },

  async finishRoom(gameId: string): Promise<void> {
    const db = await getDb();
    await db.collection(COLLECTIONS.ROOMS).updateOne(
      { gameId },
      { $set: { status: 'finished', updatedAt: Date.now() } }
    );
    // Find room code to clear cache
    const room = await db.collection<RoomInfo>(COLLECTIONS.ROOMS).findOne({ gameId });
    if (room) {
      memoryCache.rooms.delete(room.roomCode);
    }
  },

  async leaveRoom(roomCode: string, playerId: string): Promise<void> {
    const db = await getDb();
    const room = await this.getRoom(roomCode);
    if (!room) return;

    if (room.hostId === playerId) {
      await db.collection(COLLECTIONS.ROOMS).deleteOne({ roomCode });
      memoryCache.rooms.delete(roomCode);
    } else if (room.guestId === playerId) {
      const update: any = {
        $unset: { guestId: '', guestNickname: '', guestElo: '' }
      };
      if (room.status === 'playing') {
        update.$set = { status: 'finished', updatedAt: Date.now() };
      } else {
        update.$set = { updatedAt: Date.now() };
      }
      await db.collection(COLLECTIONS.ROOMS).updateOne({ roomCode }, update);
      memoryCache.rooms.delete(roomCode);
    } else {
      await db.collection(COLLECTIONS.ROOMS).updateOne(
        { roomCode },
        {
          $pull: { spectators: { id: playerId } } as any,
          $set: { updatedAt: Date.now() }
        }
      );
      memoryCache.rooms.delete(roomCode);
    }
  },

  async deleteRoom(roomCode: string): Promise<void> {
    const db = await getDb();
    await db.collection(COLLECTIONS.ROOMS).deleteOne({ roomCode });
    memoryCache.rooms.delete(roomCode);
  },

  async resetRoom(roomCode: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    const room = await this.getRoom(roomCode);
    if (!room) return { success: false, error: 'Room not found' };

    await db.collection(COLLECTIONS.ROOMS).updateOne(
      { roomCode },
      { $set: { status: 'waiting', updatedAt: Date.now() }, $unset: { gameId: '' } }
    );

    memoryCache.rooms.delete(roomCode);
    return { success: true };
  },

  async getRoomCodeByGameId(gameId: string): Promise<string | undefined> {
    const db = await getDb();
    const room = await db.collection<RoomInfo>(COLLECTIONS.ROOMS).findOne({ gameId });
    return room?.roomCode;
  },

  // ========================
  // Matchmaking
  // ========================
  // For matchmaking, we'll use a simple collection
  async addToQueue(playerId: string): Promise<void> {
    const db = await getDb();
    await db.collection('matchQueue').updateOne(
      { playerId },
      { $set: { playerId, joinedAt: Date.now() } },
      { upsert: true }
    );
  },

  async removeFromQueue(playerId: string): Promise<void> {
    const db = await getDb();
    await db.collection('matchQueue').deleteOne({ playerId });
  },

  async findMatch(playerId: string): Promise<string | null> {
    const db = await getDb();
    const opponent = await db.collection<{ playerId: string }>('matchQueue')
      .findOne({ playerId: { $ne: playerId } });
    return opponent?.playerId || null;
  },

  async findActiveRoom(playerId: string): Promise<RoomInfo | undefined> {
    const db = await getDb();
    const now = Date.now();
    // Only return rooms created in the last 24 hours
    const room = await db.collection<RoomInfo>(COLLECTIONS.ROOMS).findOne({
      $and: [
        { $or: [{ hostId: playerId }, { guestId: playerId }] },
        { createdAt: { $gt: now - 86400000 } }
      ]
    });
    return room || undefined;
  },

  async cleanupOldRooms(): Promise<void> {
    const db = await getDb();
    const now = Date.now();

    // Delete empty waiting/finished rooms older than 1 hour
    await db.collection(COLLECTIONS.ROOMS).deleteMany({
      status: { $ne: 'playing' },
      updatedAt: { $lt: now - 3600000 }
    });

    // Delete stale playing rooms older than 24 hours
    await db.collection(COLLECTIONS.ROOMS).deleteMany({
      status: 'playing',
      createdAt: { $lt: now - 86400000 }
    });

    // Clear old games (older than 24 hours)
    await db.collection(COLLECTIONS.GAMES).deleteMany({
      updatedAt: { $lt: now - 86400000 }
    });
  }
};
