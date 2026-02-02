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
    const body = await request.json();
    const { playerId, action, nickname, asSpectator } = body;

    if (!playerId) {
      return NextResponse.json({ error: 'playerId가 필요합니다.' }, { status: 400 });
    }

    if (action === 'join') {
      // Ensure user registered
      const user = GameStore.registerUser(playerId);
      const playerNickname = nickname?.trim() || user.nickname;

      const result = GameStore.joinRoom(code, playerId, playerNickname, asSpectator);
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

    if (action === 'reset') {
      // Only host can reset? Or any player? Let's say host.
      const room = GameStore.getRoom(code);
      if (!room) return NextResponse.json({ error: '방을 찾을 수 없습니다.' }, { status: 404 });
      if (room.hostId !== playerId && room.guestId !== playerId && !room.spectators.some(s => s.id === playerId)) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }

      // Actually, if a normal player clicks "return to lobby", maybe we don't reset immediately if the other player is still viewing?
      // But simpler logic: "Return to Lobby" resets the room status to waiting if it's not already.

      const result = GameStore.resetRoom(code);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'addBot') {
      const room = GameStore.getRoom(code);
      if (!room) return NextResponse.json({ error: '방을 찾을 수 없습니다.' }, { status: 404 });
      if (room.hostId !== playerId) return NextResponse.json({ error: '방장만 봇을 추가할 수 있습니다.' }, { status: 403 });

      const result = GameStore.addBot(code);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
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
