import { NextResponse } from 'next/server';
import { GameStore } from '@/lib/store';
import { Action } from '@/lib/game/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const game = GameStore.getGame(id);

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  return NextResponse.json(game.getState());
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
    const success = game.executeAction(action);

    if (success) {
      GameStore.saveGame(id, game);
      return NextResponse.json({ success: true, state: game.getState() });
    } else {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
