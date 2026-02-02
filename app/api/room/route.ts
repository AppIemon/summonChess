import { NextResponse } from 'next/server';
import { GameStore } from '@/lib/store';

// POST: Create a new room
export async function POST(request: Request) {
  try {
    const body = await request.json();

    let { playerId, nickname } = body; // Nickname might be undefined now

    if (!playerId) {
      return NextResponse.json(
        { success: false, error: 'Player ID is required' },
        { status: 400 }
      );
    }

    // Ensure user is registered
    const user = GameStore.registerUser(playerId);

    // Use stored nickname if "nickname" payload is missing or we want to enforce consistency
    // But for now, let's allow updating nickname if provided? 
    // Actually, task says "remove nickname input". So we rely on "Player XXXX".
    // Or if we want to allow renaming later.
    // Let's just use what's in the store if nickname arg is not provided.
    const finalNickname = nickname || user.nickname;

    // (Optional) Update nickname if provided and different
    if (nickname && nickname !== user.nickname) {
      GameStore.updateUser(playerId, { nickname });
    }

    const room = GameStore.createRoom(playerId, finalNickname);
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
