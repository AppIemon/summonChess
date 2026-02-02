
import { NextResponse } from 'next/server';
import { GameStore } from '@/lib/store';

export async function POST(request: Request) {
  try {
    const { playerId } = await request.json();
    if (!playerId) {
      return NextResponse.json({ error: 'Player ID required' }, { status: 400 });
    }

    GameStore.registerUser(playerId);
    GameStore.addToQueue(playerId);

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

  // Check if matched
  // In a real system, we'd have a separate worker matching players.
  // Here, we can try to match on poll.


  // 1. Check if user is already in a room (matched!)
  const activeRoom = GameStore.findActiveRoom(playerId);
  if (activeRoom) {
    GameStore.removeFromQueue(playerId); // Ensure removed
    return NextResponse.json({ success: true, status: 'matched', roomCode: activeRoom.roomCode });
  }

  // 2. Try to find a match continuously
  const opponentId = GameStore.findMatch(playerId);

  if (opponentId) {
    GameStore.removeFromQueue(playerId);
    GameStore.removeFromQueue(opponentId);

    const hostUser = GameStore.getUser(playerId)!;
    const room = GameStore.createRoom(playerId, hostUser.nickname);

    const opponentUser = GameStore.getUser(opponentId)!;
    // Auto-join opponent
    GameStore.joinRoom(room.roomCode, opponentId, opponentUser.nickname);

    return NextResponse.json({ success: true, status: 'matched', roomCode: room.roomCode });
  }

  return NextResponse.json({ success: true, status: 'searching' });
}
