import { NextResponse } from 'next/server';
import { GameStore } from '@/lib/store';
import { v4 as uuidv4 } from 'uuid'; // Ensure we use uuid if crypto.randomUUID not available or just reuse

export async function POST(request: Request) {
  try {
    const { playerId } = await request.json();
    if (!playerId) {
      return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });
    }

    const result = GameStore.joinQueue(playerId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');

  if (!playerId) {
    return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });
  }

  const result = GameStore.checkStatus(playerId);
  return NextResponse.json(result);
}
