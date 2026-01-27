import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { GameStore } from '@/lib/store';

export async function POST() {
  const id = uuidv4();
  GameStore.createGame(id);
  return NextResponse.json({ id });
}
