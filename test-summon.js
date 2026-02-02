
import { SummonChessGame } from './lib/game/engine';

async function testSummonCheckmate() {
  console.log("Testing White checkmating Black via Summon...");
  // A position where putting a piece on f7 is checkmate
  // Black king on e8, White pieces at c4 and h5
  const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 6 4";
  const game = new SummonChessGame(fen);

  // White has a Queen in deck
  // We need to make sure White actually has a Queen in deck (already true by default)

  // White summons Queen to f7 (Actually already has a Queen on h5, but let's summon another to f7)
  // Wait, f7 is occupied by a pawn. Let's use a different position.

  // Empty board except kings
  const emptyFen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
  const game2 = new SummonChessGame(emptyFen);

  // White summons Queen to e7
  // To summon to e7, it must be "reachable".
  // King is at e1. Queen cannot reach e7 from e1 because path is clear but it's too far? No, Queen can reach any distance.
  // Wait, isPathClear checks pieces.

  const res = game2.executeAction({ type: 'summon', piece: 'q', square: 'e2' }); // Summon to e2 first
  console.log("Summon Q@e2:", res.success);

  const res2 = game2.executeAction({ type: 'summon', piece: 'q', square: 'e7' }); // Summon to e7 (supported by Q@e2)
  console.log("Summon Q@e7:", res2.success);

  const state = game2.getState();
  console.log("Turn:", state.turn);
  console.log("isCheckmate:", state.isCheckmate);
  console.log("Winner:", state.winner);
}

try {
  testSummonCheckmate();
} catch (e) {
  console.error(e);
}
