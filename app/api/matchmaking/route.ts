import { NextResponse } from 'next/server';
import { GameStore } from '@/lib/store';

export async function POST(request: Request) {
  try {
    const { playerId } = await request.json();
    if (!playerId) {
      return NextResponse.json({ error: 'Player ID required' }, { status: 400 });
    }

    await GameStore.registerUser(playerId);
    await GameStore.addToQueue(playerId);

    return NextResponse.json({ success: true, status: 'searching' });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');

  if (!playerId) {
    return NextResponse.json({ error: 'Player ID required' }, { status: 400 });
  }

  // 1. Check if user is already in a room (matched!)
  const activeRoom = await GameStore.findActiveRoom(playerId);
  if (activeRoom) {
    await GameStore.removeFromQueue(playerId);
    return NextResponse.json({ success: true, status: 'matched', roomCode: activeRoom.roomCode });
  }

  // 2. Try to find a match
  const opponentId = await GameStore.findMatch(playerId);

  if (opponentId) {
    await GameStore.removeFromQueue(playerId);
    await GameStore.removeFromQueue(opponentId);

    const hostUser = await GameStore.getUser(playerId);
    if (!hostUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }

    const room = await GameStore.createRoom(playerId, hostUser.nickname);

    const opponentUser = await GameStore.getUser(opponentId);
    if (opponentUser) {
      await GameStore.joinRoom(room.roomCode, opponentId, opponentUser.nickname);
    }

    return NextResponse.json({ success: true, status: 'matched', roomCode: room.roomCode });
  }

  return NextResponse.json({ success: true, status: 'searching' });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');

  if (playerId) {
    await GameStore.removeFromQueue(playerId);
  }

  return NextResponse.json({ success: true });
}
