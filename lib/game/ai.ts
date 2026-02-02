import { Chess, Move, Square } from 'chess.js';
import { PieceType, PieceColor, Action } from './types';

export class SimpleEngine {
  private depth: number;

  constructor(depth: number = 3) {
    this.depth = depth;
  }

  // Material values
  private readonly PIECE_VALUES: Record<string, number> = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000,
  };

  // Evaluate the position from the perspective of white (positive) or black (negative)
  // Higher score = better for White
  private evaluate(chess: Chess, whiteDeck: PieceType[], blackDeck: PieceType[]): number {
    let score = 0;
    const board = chess.board();

    // Material on board
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          const value = this.PIECE_VALUES[piece.type] || 0;
          score += piece.color === 'w' ? value : -value;

          // Simple position heuristic
          if (piece.type === 'p') {
            // Pawns advancing is good
            score += piece.color === 'w' ? (7 - r) * 10 : -(r * 10);
          }
        }
      }
    }

    // Material in deck
    for (const p of whiteDeck) score += (this.PIECE_VALUES[p] || 0) * 0.5;
    for (const p of blackDeck) score -= (this.PIECE_VALUES[p] || 0) * 0.5;

    // Game over states
    if (chess.isCheckmate()) {
      return chess.turn() === 'w' ? -100000 : 100000; // If White turn and mated, Black wins (positive big number? No.)
      // If turn is 'w', White is mated -> Black wins -> Score should be very small (negative)
      // If turn is 'b', Black is mated -> White wins -> Score should be very large (positive)
    }

    return score;
  }

  // Helper to generate next state
  private getNextState(fen: string, whiteDeck: PieceType[], blackDeck: PieceType[], action: Action): { fen: string, whiteDeck: PieceType[], blackDeck: PieceType[] } {
    const chess = new Chess(fen);
    const turn = chess.turn();
    let nextWhiteDeck = [...whiteDeck];
    let nextBlackDeck = [...blackDeck];

    if (action.type === 'move') {
      chess.move(action);
    } else if (action.type === 'summon') {
      // Remove from deck
      if (turn === 'w') {
        const idx = nextWhiteDeck.indexOf(action.piece!);
        if (idx !== -1) nextWhiteDeck.splice(idx, 1);
      } else {
        const idx = nextBlackDeck.indexOf(action.piece!);
        if (idx !== -1) nextBlackDeck.splice(idx, 1);
      }

      // Place piece
      chess.put({ type: action.piece!, color: turn }, action.square as Square);

      // Force turn switch manually if needed or rely on put? 
      // chess.put does NOT switch turn. chess.move DOES.
      // We must manually switch turn in FEN.
      const tokens = chess.fen().split(' ');
      tokens[1] = tokens[1] === 'w' ? 'b' : 'w';
      tokens[3] = '-'; // Reset en passant just in case
      // Fullmove clock?
      chess.load(tokens.join(' '));
    }

    return { fen: chess.fen(), whiteDeck: nextWhiteDeck, blackDeck: nextBlackDeck };
  }

  private getAllActions(chess: Chess, deck: PieceType[], color: PieceColor): Action[] {
    const actions: Action[] = [];
    const moves = chess.moves({ verbose: true });
    for (const m of moves) {
      actions.push({ type: 'move', from: m.from, to: m.to, promotion: m.promotion });
    }

    const uniquePieces = Array.from(new Set(deck)).slice(0, 3); // Limit summons
    const reachableSquares = new Set<Square>();
    // Approximate reachable squares for summoning (controlled by own pieces)
    // We use move destinations as a proxy for control
    for (const m of moves) reachableSquares.add(m.to as Square);

    for (const sq of reachableSquares) {
      if (!chess.get(sq as Square)) {
        for (const p of uniquePieces) {
          const rank = parseInt(sq[1]);
          if (p === 'p' && (rank === 1 || rank === 8)) continue;

          // Check legality: Summon must not leave King in check
          // Temporarily place piece
          chess.put({ type: p, color: color }, sq as Square);
          if (!chess.inCheck()) {
            actions.push({ type: 'summon', piece: p, square: sq as Square });
          }
          // Remove piece to restore state
          chess.remove(sq as Square);
        }
      }
    }
    return actions;
  }

  // Alpha check: best option for Maximizer (White)
  // Beta check: best option for Minimizer (Black)
  private async minimax(
    fen: string,
    whiteDeck: PieceType[],
    blackDeck: PieceType[],
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean
  ): Promise<number> {
    const chess = new Chess(fen);

    if (depth === 0 || chess.isGameOver()) {
      return this.evaluate(chess, whiteDeck, blackDeck);
    }

    const deck = isMaximizing ? whiteDeck : blackDeck;
    const actions = this.getAllActions(chess, deck, isMaximizing ? 'w' : 'b');

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const action of actions) {
        const nextState = this.getNextState(fen, whiteDeck, blackDeck, action);
        const evalScore = await this.minimax(nextState.fen, nextState.whiteDeck, nextState.blackDeck, depth - 1, alpha, beta, false);
        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const action of actions) {
        const nextState = this.getNextState(fen, whiteDeck, blackDeck, action);
        const evalScore = await this.minimax(nextState.fen, nextState.whiteDeck, nextState.blackDeck, depth - 1, alpha, beta, true);
        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  public async getBestMove(fen: string, whiteDeck: PieceType[], blackDeck: PieceType[]): Promise<Action | null> {
    const chess = new Chess(fen);
    const turn = chess.turn();
    const isMaximizing = turn === 'w';

    // Root level search
    const deck = isMaximizing ? whiteDeck : blackDeck;
    const actions = this.getAllActions(chess, deck, turn);

    // Shuffle to avoid predictability
    actions.sort(() => Math.random() - 0.5);

    let bestAction: Action | null = null;
    let bestValue = isMaximizing ? -Infinity : Infinity;
    let alpha = -Infinity;
    let beta = Infinity;

    for (const action of actions) {
      const nextState = this.getNextState(fen, whiteDeck, blackDeck, action);
      // Start recursive search
      const value = await this.minimax(nextState.fen, nextState.whiteDeck, nextState.blackDeck, this.depth - 1, alpha, beta, !isMaximizing);

      if (isMaximizing) {
        if (value > bestValue) {
          bestValue = value;
          bestAction = action;
        }
        alpha = Math.max(alpha, value);
      } else {
        if (value < bestValue) {
          bestValue = value;
          bestAction = action;
        }
        beta = Math.min(beta, value);
      }
    }

    return bestAction;
  }
}
