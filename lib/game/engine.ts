import { Chess, Square, Piece as ChessPiece } from 'chess.js';
import { GameState, Action, PieceType, PieceColor } from './types';

export class SummonChessGame {
  private chess: Chess;
  private whiteDeck: PieceType[];
  private blackDeck: PieceType[];
  private lastMove: { from: string; to: string } | null = null;

  private whitePlayerId?: string;
  private blackPlayerId?: string;
  private resignedBy?: PieceColor;

  constructor(fen?: string, whiteDeck?: PieceType[], blackDeck?: PieceType[], whitePlayerId?: string, blackPlayerId?: string) {
    // Default setup: Kings and one pawn in front.
    // White: King e1, Pawn e2.
    // Black: King e8, Pawn e7.
    // FEN: 4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 1
    this.chess = new Chess(fen || '4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 1');

    // Default Deck: 1 Queen, 2 Rooks, 2 Bishops, 2 Knights, 8 Pawns
    // Since we start with 1 pawn on board, we reduce deck pawns to 7?
    // User request: "Start with pawn in front of king". Usually implies these are the starting pieces.
    // I will reduce the default pawn count by 1 (total 7 pawns in deck).
    const defaultDeck: PieceType[] = ['q', 'r', 'r', 'b', 'b', 'n', 'n', 'p', 'p', 'p', 'p', 'p', 'p', 'p'];
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
        // Allow resign out of turn? Usually resign is allowed anytime or mainly on turn. 
        // But preventing abuse, usually only on turn or strict player check.
        // Let's strictly enforce player check but allow resign anytime?
        // Actually, turn based games usually require action on turn.
        // But resign is special.
        // Let's stick to turn-based for now to avoid complexity, or allow if it matches *any* player ID.

        // For resign, we want to allow the *current* player to resign, or the *waiting* player?
        // If I am white, and it is black's turn, can I resign? Yes.
        // So checking "turn" against "playerId" is wrong for resign.

        if (action.type === 'resign') {
          if (effectivePlayerId === this.whitePlayerId) {
            // White resigns
          } else if (effectivePlayerId === this.blackPlayerId) {
            // Black resigns
          } else {
            return { success: false, error: "Not a player" };
          }
        } else {
          if (turn === 'w') {
            if (this.whitePlayerId && effectivePlayerId !== this.whitePlayerId) {
              return { success: false, error: `Not White's turn (ID mismatch)` };
            }
          } else if (turn === 'b') {
            if (this.blackPlayerId && effectivePlayerId !== this.blackPlayerId) {
              return { success: false, error: `Not Black's turn (ID mismatch)` };
            }
          }
        }
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
    } else if (action.type === 'resign') {
      // Determine who resigned
      // If playerId is provided, usage it.
      // If not, assume current turn player? (Unsafe)
      // With effectivePlayerId check above:
      if (effectivePlayerId === this.whitePlayerId) this.resignedBy = 'w';
      else if (effectivePlayerId === this.blackPlayerId) this.resignedBy = 'b';
      else this.resignedBy = turn; // Fallback to current turn if no ID (local testing)

      return { success: true };
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

    // Check if square is reachable by any own piece (Pseudo-legal)
    if (!this.isReachableByOwnPiece(square, turn)) {
      return { success: false, error: "Cannot summon: Square not reachable by any of your pieces" };
    }

    // Validate placement rules
    const rank = parseInt(square[1]);

    // Rank restriction: Own half - REMOVED per user request
    // if (turn === 'w' && rank > 4) return { success: false, error: "Must summon in ranks 1-4" };
    // if (turn === 'b' && rank < 5) return { success: false, error: "Must summon in ranks 5-8" };

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
    if (this.resignedBy) return false;
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
    if (this.resignedBy) return true;
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
    if (this.resignedBy) return false;
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
        // Rank restriction: Own half - REMOVED per user request
        // if (turn === 'w' && r > 4) continue;
        // if (turn === 'b' && r < 5) continue;

        // Pawn restriction
        if (piece === 'p' && (r === 1 || r === 8)) continue;

        for (let c = 0; c < 8; c++) {
          const file = 'abcdefgh'[c];
          const square = (file + r) as Square;

          // Must be empty
          if (this.chess.get(square)) continue;

          // Must be reachable
          if (!this.isReachableByOwnPiece(square, turn)) continue;

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
    if (this.resignedBy) {
      return this.resignedBy === 'w' ? 'b' : 'w';
    }
    if (this.isTrueCheckmate()) {
      return this.chess.turn() === 'w' ? 'b' : 'w';
    }
    return null;
  }
  public serialize(): any {
    return {
      fen: this.chess.fen(),
      whiteDeck: this.whiteDeck,
      blackDeck: this.blackDeck,
      whitePlayerId: this.whitePlayerId,
      blackPlayerId: this.blackPlayerId,
      resignedBy: this.resignedBy,
    };
  }

  static deserialize(data: any): SummonChessGame {
    const game = new SummonChessGame(
      data.fen,
      data.whiteDeck,
      data.blackDeck,
      data.whitePlayerId,
      data.blackPlayerId
    );
    if (data.resignedBy) {
      game.resignedBy = data.resignedBy;
    }
    return game;
  }

  private isReachableByOwnPiece(target: Square, color: PieceColor): boolean {
    // Parse target
    const targetFile = target.charCodeAt(0) - 'a'.charCodeAt(0);
    const targetRank = parseInt(target[1]) - 1; // 0-7

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const fileChar = String.fromCharCode('a'.charCodeAt(0) + c);
        const rankNum = r + 1;
        const sq = (fileChar + rankNum) as Square;
        const piece = this.chess.get(sq);

        if (!piece || piece.color !== color) continue;

        if (this.canPieceReach(piece.type, c, r, targetFile, targetRank, piece.color as PieceColor)) {
          return true;
        }
      }
    }
    return false;
  }

  private canPieceReach(type: string, fromX: number, fromY: number, toX: number, toY: number, color: PieceColor): boolean {
    const dx = toX - fromX;
    const dy = toY - fromY;

    if (dx === 0 && dy === 0) return false;

    switch (type) {
      case 'p':
        // Pawn: Forward 1 or 2. Strictly move to empty square (no diagonal attacks).
        const direction = color === 'w' ? 1 : -1;
        const startRank = color === 'w' ? 1 : 6;

        // Forward 1
        if (dx === 0 && dy === direction) return true;
        // Forward 2
        if (dx === 0 && dy === 2 * direction && fromY === startRank) {
          // Check obstruction at mid point
          const midY = fromY + direction;
          const midFile = String.fromCharCode('a'.charCodeAt(0) + fromX);
          const midSq = (midFile + (midY + 1)) as Square;
          if (!this.chess.get(midSq)) return true;
        }
        return false;
      case 'n':
        return (Math.abs(dx) === 2 && Math.abs(dy) === 1) || (Math.abs(dx) === 1 && Math.abs(dy) === 2);
      case 'k':
        return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
      case 'b':
        if (Math.abs(dx) !== Math.abs(dy)) return false;
        return this.isPathClear(fromX, fromY, toX, toY);
      case 'r':
        if (dx !== 0 && dy !== 0) return false;
        return this.isPathClear(fromX, fromY, toX, toY);
      case 'q':
        if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return false;
        return this.isPathClear(fromX, fromY, toX, toY);
    }
    return false;
  }

  private isPathClear(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const stepX = Math.sign(toX - fromX);
    const stepY = Math.sign(toY - fromY);

    let currX = fromX + stepX;
    let currY = fromY + stepY;

    while (currX !== toX || currY !== toY) {
      const fileChar = String.fromCharCode('a'.charCodeAt(0) + currX);
      const rankNum = currY + 1;
      const sq = (fileChar + rankNum) as Square;
      if (this.chess.get(sq)) return false;
      currX += stepX;
      currY += stepY;
    }
    return true;
  }
}
