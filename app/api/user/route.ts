
import { NextResponse } from 'next/server';
import { GameStore } from '@/lib/store';

export async function POST(request: Request) {
  try {
    const { playerId } = await request.json();
    if (!playerId) {
      return NextResponse.json({ success: false, error: 'Missing playerId' }, { status: 400 });
    }

    // Register or get user
    const user = GameStore.registerUser(playerId);

    return NextResponse.json({ success: true, user });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
