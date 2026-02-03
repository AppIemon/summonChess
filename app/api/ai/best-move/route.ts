import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongoose';
import BestMove from '@/models/BestMove';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fen = searchParams.get('fen');

    if (!fen) {
      return NextResponse.json({ error: 'FEN is required' }, { status: 400 });
    }

    await connectDB();
    const bestMove = await BestMove.findOne({ fen });

    return NextResponse.json({ bestMove: bestMove ? { move: bestMove.move, score: bestMove.score, depth: bestMove.depth } : null });
  } catch (error: any) {
    console.error('Error fetching best move:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fen, move, score, depth } = await req.json();

    if (!fen || !move) {
      return NextResponse.json({ error: 'FEN and move are required' }, { status: 400 });
    }

    await connectDB();

    // UPSERT: only update if depth is >= existing depth
    const existing = await BestMove.findOne({ fen });
    if (existing && existing.depth > depth) {
      return NextResponse.json({ success: true, masked: 'Existing move has higher depth' });
    }

    await BestMove.findOneAndUpdate(
      { fen },
      { move, score, depth, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving best move:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
