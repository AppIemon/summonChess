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

    if (bestMove) {
      // If the move has been proven bad (many more losses than wins), ignore it
      // This forces the AI to re-evaluate and hopefully find a better move
      if (bestMove.lossCount > bestMove.winCount + 1) {
        console.log(`Skipping bad cached move for FEN: ${fen} (Wins: ${bestMove.winCount}, Losses: ${bestMove.lossCount})`);
        return NextResponse.json({ bestMove: null });
      }
    }

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

    // UPSERT logic
    const existing = await BestMove.findOne({ fen });

    let winCount = 0;
    let lossCount = 0;

    if (existing) {
      // If same move, keep counts. If different move, reset them.
      const moveStr = JSON.stringify(move);
      const existingMoveStr = JSON.stringify(existing.move);

      if (moveStr === existingMoveStr) {
        winCount = existing.winCount;
        lossCount = existing.lossCount;
      }

      // Only update if depth is >= existing depth OR if existing was "bad"
      const isBad = existing.lossCount > existing.winCount + 1;
      if (existing.depth > depth && !isBad) {
        return NextResponse.json({ success: true, masked: 'Existing move has higher depth' });
      }
    }

    await BestMove.findOneAndUpdate(
      { fen },
      { move, score, depth, winCount, lossCount, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving best move:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
