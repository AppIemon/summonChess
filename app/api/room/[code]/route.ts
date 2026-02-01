import { NextResponse } from 'next/server';
import { GameStore } from '@/lib/store';

// GET: Get room status
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const room = GameStore.getRoom(code);

  if (!room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, room });
}

// POST: Join room
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { playerId, action, nickname } = await request.json();

    if (!playerId) {
      return NextResponse.json({ error: 'playerId가 필요합니다.' }, { status: 400 });
    }

    if (action === 'join') {
      const playerNickname = nickname?.trim() || '플레이어';
      const result = GameStore.joinRoom(code, playerId, playerNickname);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, room: result.room });
    }

    if (action === 'start') {
      const result = GameStore.startGame(code);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, gameId: result.gameId });
    }

    if (action === 'leave') {
      GameStore.leaveRoom(code, playerId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '알 수 없는 액션입니다.' }, { status: 400 });
  } catch (e) {
    console.error('Room action error:', e);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE: Delete room
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  GameStore.deleteRoom(code);
  return NextResponse.json({ success: true });
}
