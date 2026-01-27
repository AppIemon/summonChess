import { Chess, Square, Piece as ChessPiece } from 'chess.js';
import { GameState, Action, PieceType, PieceColor } from './types';

export class SummonChessGame {
  private chess: Chess;
  private whiteDeck: PieceType[];
  private blackDeck: PieceType[];
  private lastMove: { from: string; to: string } | null = null;

  constructor(fen?: string, whiteDeck?: PieceType[], blackDeck?: PieceType[]) {
    // Default setup: Kings only.
    // 4k3/8/8/8/8/8/8/4K3 w - - 0 1
    this.chess = new Chess(fen || '4k3/8/8/8/8/8/8/4K3 w - - 0 1');

    // Default Deck: 1 Queen, 2 Rooks, 2 Bishops, 2 Knights, 8 Pawns
    const defaultDeck: PieceType[] = ['q', 'r', 'r', 'b', 'b', 'n', 'n', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'];
    this.whiteDeck = whiteDeck ? [...whiteDeck] : [...defaultDeck];
    this.blackDeck = blackDeck ? [...blackDeck] : [...defaultDeck];
  }

  public getState(): GameState {
    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      whiteDeck: [...this.whiteDeck],
      blackDeck: [...this.blackDeck],
      isCheck: this.chess.inCheck(),
      isCheckmate: this.chess.isCheckmate(),
      isDraw: this.chess.isDraw(), // Note: logic might be overridden
      isStalemate: this.checkStalemate(),
      winner: this.getWinner(),
      history: this.chess.history(),
      lastMove: this.lastMove,
    };
  }

  public getValidMoves(square: Square) {
    return this.chess.moves({ square, verbose: true });
  }

  public executeAction(action: Action): boolean {
    if (this.checkGameOver()) return false;

    // Ensure it's the correct turn is implicitly handled by chess.js for moves, but we must check for summons
    const turn = this.chess.turn();

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

    const success = this.chess.put({ type: piece, color: turn }, square);
    if (!success) return false;

    // Remove from deck
    deck.splice(pieceIndex, 1);

    // Switch turn manually since put doesn't do it
    // To switch turn in chess.js without a move, we have to manipulate the FEN.
    const fen = this.chess.fen();
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w'; // Switch turn
    parts[3] = '-'; // En passant is lost? Maybe. Usually if you summon, you don't create en-passant opportunities, but previous ones expire.
    // Actually, according to Chess rules, en-passant target is valid only for the immediate move. 
    // If "Summon" consumes a turn, the previous en-passant opportunity is GONE.
    // So parts[3] should be '-'.

    // Update Halfmove clock (parts[4])? Yes, increments for non-capture/non-pawn. 
    // But this is an "Add piece". It resets 50-move rule? 
    // Standard crazyhouse drops reset the 50-move counter.
    parts[4] = '0';

    // Fullmove number (parts[5]) increments after Black moves.
    if (turn === 'b') {
      parts[5] = (parseInt(parts[5]) + 1).toString();
    }

    const newFen = parts.join(' ');
    this.chess.load(newFen);

    // Add to history? chess.js history won't have it.
    // We might need a separate history log or just rely on the updated state.
    // For "undo" or logging, we'd need to store this. 
    // For now, we update the state.

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
    return this.chess.isCheckmate() || (this.checkStalemate()) || this.chess.isDraw();
    // note: isDraw checks 50-move, insufficient material, etc. 
    // Insufficient material might be tricky if decks are empty.
  }

  private getWinner(): PieceColor | null {
    if (this.chess.isCheckmate()) {
      return this.chess.turn() === 'w' ? 'b' : 'w';
    }
    return null;
  }
}
