import { Chess, Square, Piece as ChessPiece } from 'chess.js';
import { GameState, Action, PieceType, PieceColor } from './types';

export class SummonChessGame {
  private chess: Chess;
  private whiteDeck: PieceType[];
  private blackDeck: PieceType[];
  private lastMove: { from: string; to: string } | null = null;

  private whitePlayerId?: string;
  private blackPlayerId?: string;

  constructor(fen?: string, whiteDeck?: PieceType[], blackDeck?: PieceType[], whitePlayerId?: string, blackPlayerId?: string) {
    // Default setup: Kings only.
    // 4k3/8/8/8/8/8/8/4K3 w - - 0 1
    this.chess = new Chess(fen || '4k3/8/8/8/8/8/8/4K3 w - - 0 1');

    // Default Deck: 1 Queen, 2 Rooks, 2 Bishops, 2 Knights, 8 Pawns
    const defaultDeck: PieceType[] = ['q', 'r', 'r', 'b', 'b', 'n', 'n', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'];
    this.whiteDeck = whiteDeck ? [...whiteDeck] : [...defaultDeck];
    this.blackDeck = blackDeck ? [...blackDeck] : [...defaultDeck];
    this.whitePlayerId = whitePlayerId;
    this.blackPlayerId = blackPlayerId;
  }

  public getState(): GameState {
    const isDraw = (this.whiteDeck.length === 0 && this.blackDeck.length === 0) ? this.chess.isDraw() : this.chess.isThreefoldRepetition();

    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      whiteDeck: [...this.whiteDeck],
      blackDeck: [...this.blackDeck],
      isCheck: this.chess.inCheck(),
      isCheckmate: this.isTrueCheckmate(),
      isDraw: isDraw,
      isStalemate: this.checkStalemate(),
      winner: this.getWinner(),
      history: this.chess.history(),
      lastMove: this.lastMove,
      whitePlayerId: this.whitePlayerId,
      blackPlayerId: this.blackPlayerId,
    };
  }

  public getValidMoves(square: Square) {
    return this.chess.moves({ square, verbose: true });
  }


  public executeAction(action: Action & { playerId?: string }, playerId?: string): { success: boolean, error?: string } {
    if (this.checkGameOver()) {
      return { success: false, error: "Game Over" };
    }

    const turn = this.chess.turn();
    const effectivePlayerId = playerId || action.playerId;

    // Validate Player
    if (effectivePlayerId) {
      if (turn === 'w' && this.whitePlayerId && effectivePlayerId !== this.whitePlayerId) {
        return { success: false, error: `Not White's turn (ID mismatch)` };
      }
      if (turn === 'b' && this.blackPlayerId && effectivePlayerId !== this.blackPlayerId) {
        return { success: false, error: `Not Black's turn (ID mismatch)` };
      }
    } else {
      console.log("Warning: No playerId provided for action");
    }

    if (action.type === 'move') {
      try {
        const move = this.chess.move({
          from: action.from,
          to: action.to,
          promotion: action.promotion || 'q',
        });
        if (move) {
          this.lastMove = { from: move.from, to: move.to };
          return { success: true };
        }
      } catch (e) {
        return { success: false, error: "Invalid move rule" };
      }
      return { success: false, error: "Invalid move" };
    } else if (action.type === 'summon') {
      return this.summonPiece(action.piece, action.square as Square);
    }
    return { success: false, error: "Unknown action type" };
  }

  private summonPiece(piece: PieceType, square: Square): { success: boolean, error?: string } {
    const turn = this.chess.turn();
    const deck = turn === 'w' ? this.whiteDeck : this.blackDeck;

    // Check if piece is in deck
    const pieceIndex = deck.indexOf(piece);
    if (pieceIndex === -1) return { success: false, error: "Piece not in deck" };

    // Check if square is empty
    if (this.chess.get(square)) return { success: false, error: "Square occupied" };

    // Validate placement rules
    const rank = parseInt(square[1]);

    // Rank restriction: Own half
    if (turn === 'w' && rank > 4) return { success: false, error: "Must summon in ranks 1-4" };
    if (turn === 'b' && rank < 5) return { success: false, error: "Must summon in ranks 5-8" };

    // Pawn restriction: No rank 1 or 8
    if (piece === 'p' && (rank === 1 || rank === 8)) return { success: false, error: "Pawns cannot be summoned on rank 1 or 8" };

    // Place the piece
    const success = this.chess.put({ type: piece, color: turn }, square);
    if (!success) {
      return { success: false, error: "Placement failed (internal)" };
    }

    // Check if we are checking ourselves (Self-check)
    if (this.chess.inCheck()) {
      this.chess.remove(square); // Revert
      return { success: false, error: "Cannot summon: results in self-check" };
    }

    // Remove from deck
    deck.splice(pieceIndex, 1);

    // Switch turn manually
    const fen = this.chess.fen();
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-';
    parts[4] = '0';
    // Let's reset it to keep the game alive.

    if (turn === 'b') {
      parts[5] = (parseInt(parts[5]) + 1).toString();
    }

    const newFen = parts.join(' ');
    try {
      this.chess.load(newFen);
    } catch (e) {
      deck.push(piece);
      this.chess.remove(square);
      return { success: false, error: "FEN invalid update" };
    }

    this.lastMove = { from: '@', to: square };
    return { success: true };
  }

  private checkStalemate(): boolean {
    if (this.chess.inCheck()) return false; // Cannot be stalemate if in check
    if (this.chess.moves().length > 0) return false; // Have board moves

    // No board moves. Check if summons can save.
    const turn = this.chess.turn();
    const deck = turn === 'w' ? this.whiteDeck : this.blackDeck;

    if (deck.length === 0) return true; // No pieces to summon -> Stalemate.

    const hasNonPawn = deck.some(p => p !== 'p');
    const hasPawn = deck.some(p => p === 'p');

    for (let r = 1; r <= 8; r++) {
      for (let c = 0; c < 8; c++) {
        const file = 'abcdefgh'[c];
        const square = (file + r) as Square;
        if (!this.chess.get(square)) {
          if (hasNonPawn) return false;
          if (hasPawn && r !== 1 && r !== 8) return false;
        }
      }
    }

    return true; // No moves, no valid summons.
  }

  private checkGameOver(): boolean {
    if (this.isTrueCheckmate()) return true;
    if (this.checkStalemate()) return true;

    // Custom draw check
    if (this.chess.isThreefoldRepetition()) return true;

    // Only allow "Insufficient Material" if decks are empty
    if (this.whiteDeck.length === 0 && this.blackDeck.length === 0) {
      if (this.chess.isDraw()) return true;
    }

    return false;
  }

  private isTrueCheckmate(): boolean {
    if (!this.chess.isCheckmate()) return false;
    // Standard checkmate is true (no moves). Check if summons can save.
    return !this.canSummonToEscape();
  }

  private canSummonToEscape(): boolean {
    const turn = this.chess.turn();
    const deck = turn === 'w' ? this.whiteDeck : this.blackDeck;
    if (deck.length === 0) return false;

    // We need to see if ANY summon results in NOT being in check.
    // Try each unique piece in deck
    const uniquePieces = Array.from(new Set(deck));

    // We can use a temporary chess instance to test.
    // Optimisation: Only check empty squares.
    // Optimisation: Only check squares that block the check line or capture the attacker?
    // Capturing by summon is impossible (cannot summon on piece).
    // So we must BLOCK the line of fire.
    // Or if checking piece is a knight/pawn (not sliding), it cannot be blocked.
    // If double check, it's harder.

    // Brute force is safest: Try summing every unique piece to every valid square.
    // 8x4 = 32 squares max (usually less). 5 piece types max. ~150 checks. Fast enough.

    const fen = this.chess.fen();

    for (const piece of uniquePieces) {
      for (let r = 1; r <= 8; r++) {
        // Rank restriction: Own half
        if (turn === 'w' && r > 4) continue;
        if (turn === 'b' && r < 5) continue;

        // Pawn restriction
        if (piece === 'p' && (r === 1 || r === 8)) continue;

        for (let c = 0; c < 8; c++) {
          const file = 'abcdefgh'[c];
          const square = (file + r) as Square;

          // Must be empty
          if (this.chess.get(square)) continue;

          // Test Summon
          const tempChess = new Chess(fen);
          tempChess.put({ type: piece, color: turn }, square);

          if (!tempChess.inCheck()) {
            return true; // Found a savior!
          }
        }
      }
    }
    return false;
  }

  private getWinner(): PieceColor | null {
    if (this.isTrueCheckmate()) {
      return this.chess.turn() === 'w' ? 'b' : 'w';
    }
    return null;
  }
}
