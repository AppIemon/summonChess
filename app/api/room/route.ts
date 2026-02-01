import { NextResponse } from 'next/server';
import { GameStore } from '@/lib/store';

// POST: Create a new room
export async function POST(request: Request) {
  try {
    const { playerId, nickname } = await request.json();

    if (!playerId) {
      return NextResponse.json({ error: 'playerId가 필요합니다.' }, { status: 400 });
    }

    const playerNickname = nickname?.trim() || '플레이어';
    const room = GameStore.createRoom(playerId, playerNickname);
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
