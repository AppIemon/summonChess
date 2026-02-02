import { NextResponse } from 'next/server';
import { GameStore } from '@/lib/store';

// POST: Create a new room
export async function POST(request: Request) {
  try {
    const body = await request.json();

    let { playerId, nickname } = body;

    if (!playerId) {
      return NextResponse.json(
        { success: false, error: 'Player ID is required' },
        { status: 400 }
      );
    }

    // Ensure user is registered
    const user = await GameStore.registerUser(playerId);

    // Use stored nickname if "nickname" payload is missing
    const finalNickname = nickname || user.nickname;

    // Update nickname if provided and different
    if (nickname && nickname !== user.nickname) {
      await GameStore.updateUser(playerId, { nickname });
    }

    const room = await GameStore.createRoom(playerId, finalNickname);
    return NextResponse.json({
      success: true,
      roomCode: room.roomCode,
      room
    });
  } catch (e) {
    console.error('Create room error:', e);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
