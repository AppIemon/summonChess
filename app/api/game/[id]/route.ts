import { NextResponse } from 'next/server';
import { GameStore } from '@/lib/store';
import { Action } from '@/lib/game/types';
import { calculateNewElo } from '@/lib/rating';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const game = GameStore.getGame(id);

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const state = game.getState();
  state.roomCode = GameStore.getRoomCodeByGameId(id);

  return NextResponse.json(state);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const game = GameStore.getGame(id);

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  try {
    const action: Action = await request.json();
    const result = game.executeAction(action);

    if (result.success) {
      GameStore.saveGame(id, game);
      const state = game.getState();

      // Check for game end
      if (state.winner || state.isDraw) {
        // Need player IDs. Assuming they are on the game instance or state.
        // If not on state, we might need to rely on the room info or assume game instance has them.
        // Let's assume game.whitePlayerId and game.blackPlayerId are available.
        const whiteId = (game as any).whitePlayerId;
        const blackId = (game as any).blackPlayerId;

        if (whiteId && blackId) {
          const whiteUser = GameStore.getUser(whiteId);
          const blackUser = GameStore.getUser(blackId);

          if (whiteUser && blackUser) {
            // Determine score for White
            let score = 0.5;
            if (state.winner === 'white') score = 1;
            else if (state.winner === 'black') score = 0;
            // If draw, score 0.5

            const newWhiteElo = calculateNewElo(whiteUser.elo, blackUser.elo, score as any, whiteUser.gamesPlayed);
            const newBlackElo = calculateNewElo(blackUser.elo, whiteUser.elo, (1 - score) as any, blackUser.gamesPlayed);

            GameStore.updateUser(whiteId, { elo: newWhiteElo, gamesPlayed: whiteUser.gamesPlayed + 1 });
            GameStore.updateUser(blackId, { elo: newBlackElo, gamesPlayed: blackUser.gamesPlayed + 1 });
          }
        }
      }

      return NextResponse.json({ success: true, state });
    } else {
      return NextResponse.json({ success: false, error: result.error || 'Invalid action' }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

