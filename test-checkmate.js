
const { SummonChessGame } = require('./lib/game/engine');
const { Chess } = require('chess.js');

function testCheckmate() {
  console.log("Testing White checkmating Black...");
  // A standard scholar's mate position
  const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 6 4";
  const game = new SummonChessGame(fen);

  // White moves Q:f7#
  const res = game.executeAction({ type: 'move', from: 'h5', to: 'f7' });
  console.log("Move success:", res.success);

  const state = game.getState();
  console.log("Turn:", state.turn); // Should be 'b'
  console.log("isCheckmate:", state.isCheckmate); // Should be true
  console.log("Winner:", state.winner); // Should be 'w'

  if (state.winner === 'w') {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

try {
  testCheckmate();
} catch (e) {
  console.error(e);
  process.exit(1);
}
