import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongoose';
import BestMove from '@/models/BestMove';

export async function POST(req: NextRequest) {
  try {
    const { history, winner } = await req.json();

    if (!history || !Array.isArray(history)) {
      return NextResponse.json({ error: 'History is required' }, { status: 400 });
    }

    await connectDB();

    // Iterate through history and update win/loss counts
    for (const item of history) {
      const { fen, move, color } = item;
      if (!fen || !move || !color) continue;

      const isWin = color === winner;
      const isLoss = winner && color !== winner;

      if (isWin) {
        const res = await BestMove.findOneAndUpdate(
          { fen, move },
          { $inc: { winCount: 1 }, updatedAt: new Date() },
          { upsert: false }
        );
        if (res) console.log(`Reinforced winning move for FEN: ${fen}`);
      } else if (isLoss) {
        const res = await BestMove.findOneAndUpdate(
          { fen, move },
          { $inc: { lossCount: 1 }, updatedAt: new Date() },
          { upsert: false }
        );
        if (res) console.log(`Penalized losing move for FEN: ${fen}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error reporting game result:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
