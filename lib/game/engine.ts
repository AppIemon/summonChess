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
    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      whiteDeck: [...this.whiteDeck],
      blackDeck: [...this.blackDeck],
      isCheck: this.chess.inCheck(),
      isCheckmate: this.isTrueCheckmate(),
      isDraw: this.chess.isDraw(), // Note: logic might be overridden
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

  public executeAction(action: Action, playerId?: string): boolean {
    if (this.checkGameOver()) return false;

    const turn = this.chess.turn();

    // Validate Player
    if (playerId) {
      if (turn === 'w' && this.whitePlayerId && playerId !== this.whitePlayerId) {
        console.log("Not White's turn or wrong ID");
        return false;
      }
      if (turn === 'b' && this.blackPlayerId && playerId !== this.blackPlayerId) {
        console.log("Not Black's turn or wrong ID");
        return false;
      }
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
          return true;
        }
      } catch (e) {
        return false;
      }
    } else if (action.type === 'summon') {
      return this.summonPiece(action.piece, action.square as Square);
    }
    return false;
  }

  private summonPiece(piece: PieceType, square: Square): boolean {
    const turn = this.chess.turn();
    const deck = turn === 'w' ? this.whiteDeck : this.blackDeck;

    // Check if piece is in deck
    const pieceIndex = deck.indexOf(piece);
    if (pieceIndex === -1) return false;

    // Check if square is empty
    if (this.chess.get(square)) return false;

    // Validate placement rules
    // White: Rank 1-4 (Index 0-3 ??? No, chess.js uses Rank 1-8 logic or 0-7?)
    // chess.js square 'a1' is bottom left.
    // Rank 1 is '1'.

    const rank = parseInt(square[1]);

    // Pawn restriction: No rank 1 or 8
    if (piece === 'p') {
      if (rank === 1 || rank === 8) return false;
    }

    // Place the piece
    // Chess.js doesn't have a direct "put" method that records history cleanly for games, 
    // but `put` exists. However, `put` doesn't change turn or record history.
    // To record history, we might need to hack it or just accept it's a custom move.

    // Temporarily place the piece to check legality
    const success = this.chess.put({ type: piece, color: turn }, square);
    if (!success) {
      console.log("Put failed");
      return false;
    }

    // Check if we are checking ourselves (Self-check)
    if (this.chess.inCheck()) {
      console.log("Self check prevented");
      this.chess.remove(square); // Revert
      return false;
    }

    // Remove from deck
    deck.splice(pieceIndex, 1);

    // Switch turn manually since put doesn't do it
    const fen = this.chess.fen();
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w'; // Switch turn
    parts[3] = '-'; // En passant
    parts[4] = '0'; // Halfmove reset?

    // Fullmove number
    if (turn === 'b') {
      parts[5] = (parseInt(parts[5]) + 1).toString();
    }

    const newFen = parts.join(' ');
    try {
      this.chess.load(newFen);
    } catch (e) {
      console.log("FEN load failed: " + newFen, e);
      // Revert deck and board?
      deck.push(piece);
      this.chess.remove(square); // Ideally restore full previous state
      return false;
    }

    this.lastMove = { from: '@', to: square }; // Special indicator for summon
    return true;


  }

  private checkStalemate(): boolean {
    if (this.chess.isCheckmate()) return false;

    // If standard stalemate is FALSE, then we have moves, so not stalemate.
    if (!this.chess.isStalemate()) return false;

    // If standard stalemate is TRUE, we have no board moves.
    // But can we summon?
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
          // Empty!
          if (hasNonPawn) return false; // Can summon non-pawn here.
          if (hasPawn) {
            // Can summon pawn?
            if (r !== 1 && r !== 8) return false;
          }
        }
      }
    }

    return true; // No moves, no valid summons.
  }

  private checkGameOver(): boolean {
    return this.isTrueCheckmate() || (this.checkStalemate()) || this.chess.isDraw();
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
        for (let c = 0; c < 8; c++) {
          // Optimization: Check only my half?
          // White: Rank 1-4. Black: Rank 5-8.
          // if (turn === 'w' && r > 4) continue;
          // if (turn === 'b' && r < 5) continue;

          // Pawn restrictions
          if (piece === 'p' && (r === 1 || r === 8)) continue;

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
