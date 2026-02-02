import { NextResponse } from 'next/server';
import { GameStore } from '@/lib/store';

export async function POST(request: Request) {
  try {
    const { playerId } = await request.json();
    if (!playerId) {
      return NextResponse.json({ success: false, error: 'Missing playerId' }, { status: 400 });
    }

    // Register or get user
    const user = await GameStore.registerUser(playerId);

    return NextResponse.json({ success: true, user });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');

  if (!playerId) {
    return NextResponse.json({ success: false, error: 'Missing playerId' }, { status: 400 });
  }

  const user = await GameStore.getUser(playerId);
  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, user });
}
