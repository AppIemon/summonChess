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
    const allMoves = await BestMove.find({ fen });

    if (allMoves.length === 0) {
      return NextResponse.json({ bestMove: null });
    }

    // Filter out moves that have been proven bad
    const suitableMoves = allMoves.filter(m => {
      // Ignore if losses > wins + 2 (slightly more strict than before to keep variety)
      return m.lossCount <= m.winCount + 2;
    });

    if (suitableMoves.length === 0) {
      // If all moves are "bad", we might want to return nothing to force re-calculation
      // or return the least bad one. Let's return nothing.
      return NextResponse.json({ bestMove: null });
    }

    // Pick a random move from the suitable ones
    // We can bias this by score later if needed
    const randomIndex = Math.floor(Math.random() * suitableMoves.length);
    const selected = suitableMoves[randomIndex];

    return NextResponse.json({
      bestMove: {
        move: selected.move,
        score: selected.score,
        depth: selected.depth
      }
    });
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

    // Check if THIS SPECIFIC move exists for this FEN
    const existing = await BestMove.findOne({ fen, move });

    if (existing) {
      // Only update if depth is >= existing depth OR if existing was "bad"
      const isBad = existing.lossCount > existing.winCount + 1;
      if (existing.depth > depth && !isBad) {
        return NextResponse.json({ success: true, masked: 'Existing move has higher depth' });
      }

      await BestMove.updateOne(
        { _id: existing._id },
        { score, depth, updatedAt: new Date() }
      );
    } else {
      await BestMove.create({
        fen, move, score, depth, winCount: 0, lossCount: 0, updatedAt: new Date()
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving best move:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
