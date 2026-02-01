import { Chess, Square, Piece as ChessPiece } from 'chess.js';
import { GameState, Action, PieceType, PieceColor, ChatMessage } from './types';

export class SummonChessGame {
  private chess: Chess;
  private whiteDeck: PieceType[];
  private blackDeck: PieceType[];
  private lastMove: { from: string; to: string } | null = null;

  private whitePlayerId?: string;
  private blackPlayerId?: string;
  private resignedBy?: PieceColor;

  private whiteTime: number = 600; // 10 minutes
  private blackTime: number = 600;
  private lastActionTimestamp: number;
  private chat: ChatMessage[] = [];
  private isTimeout: boolean = false;

  constructor(fen?: string, whiteDeck?: PieceType[], blackDeck?: PieceType[], whitePlayerId?: string, blackPlayerId?: string) {
    // Default setup: Kings only (no pawns)
    this.chess = new Chess(fen || '4k3/8/8/8/8/8/8/4K3 w - - 0 1');

    // Default Deck: 1 Queen, 2 Rooks, 2 Bishops, 2 Knights, 8 Pawns
    const defaultDeck: PieceType[] = ['q', 'r', 'r', 'b', 'b', 'n', 'n', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'];
    this.whiteDeck = whiteDeck ? [...whiteDeck] : [...defaultDeck];
    this.blackDeck = blackDeck ? [...blackDeck] : [...defaultDeck];
    this.whitePlayerId = whitePlayerId;
    this.blackPlayerId = blackPlayerId;
    this.lastActionTimestamp = Date.now();
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
      whiteTime: Math.max(0, this.whiteTime),
      blackTime: Math.max(0, this.blackTime),
      isTimeout: this.isTimeout,
      chat: [...this.chat],
    };
  }

  public getValidMoves(square: Square) {
    return this.chess.moves({ square, verbose: true });
  }

  public executeAction(action: Action & { playerId?: string }, playerId?: string): { success: boolean, error?: string } {
    const turn = this.chess.turn();
    const effectivePlayerId = playerId || action.playerId;

    // Chat is special: does not consume time or require turn
    if (action.type === 'chat') {
      this.chat.push({
        id: Math.random().toString(36).substr(2, 9),
        senderId: effectivePlayerId || 'system',
        nickname: action.nickname || 'Unknown',
        text: action.text,
        timestamp: Date.now()
      });
      if (this.chat.length > 50) this.chat.shift();
      return { success: true };
    }

    if (this.checkGameOver()) {
      return { success: false, error: "Game Over" };
    }

    // Update time before action
    const now = Date.now();
    const elapsed = (now - this.lastActionTimestamp) / 1000;
    this.lastActionTimestamp = now;

    if (turn === 'w') {
      this.whiteTime -= elapsed;
      if (this.whiteTime <= 0) {
        this.whiteTime = 0;
        this.isTimeout = true;
      }
    } else {
      this.blackTime -= elapsed;
      if (this.blackTime <= 0) {
        this.blackTime = 0;
        this.isTimeout = true;
      }
    }

    // Validate Player
    if (effectivePlayerId) {
      if (turn === 'w' && this.whitePlayerId && effectivePlayerId !== this.whitePlayerId && action.type !== 'resign') {
        return { success: false, error: `Not White's turn (ID mismatch)` };
      } else if (turn === 'b' && this.blackPlayerId && effectivePlayerId !== this.blackPlayerId && action.type !== 'resign') {
        return { success: false, error: `Not Black's turn (ID mismatch)` };
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
          return { success: true };
        }
      } catch (e) {
        return { success: false, error: "Invalid move rule" };
      }
      return { success: false, error: "Invalid move" };
    } else if (action.type === 'summon') {
      return this.summonPiece(action.piece, action.square as Square);
    } else if (action.type === 'resign') {
      if (effectivePlayerId === this.whitePlayerId) this.resignedBy = 'w';
      else if (effectivePlayerId === this.blackPlayerId) this.resignedBy = 'b';
      else this.resignedBy = turn;
      return { success: true };
    }
    return { success: false, error: "Unknown action type" };
  }

  private summonPiece(piece: PieceType, square: Square): { success: boolean, error?: string } {
    const turn = this.chess.turn();
    const deck = turn === 'w' ? this.whiteDeck : this.blackDeck;

    const pieceIndex = deck.indexOf(piece);
    if (pieceIndex === -1) return { success: false, error: "Piece not in deck" };
    if (this.chess.get(square)) return { success: false, error: "Square occupied" };
    if (!this.isReachableByOwnPiece(square, turn)) {
      return { success: false, error: "Cannot summon: Square not reachable by any of your pieces" };
    }

    const rank = parseInt(square[1]);
    if (piece === 'p' && (rank === 1 || rank === 8)) return { success: false, error: "Pawns cannot be summoned on rank 1 or 8" };

    const success = this.chess.put({ type: piece, color: turn }, square);
    if (!success) {
      return { success: false, error: "Placement failed (internal)" };
    }

    if (this.chess.inCheck()) {
      this.chess.remove(square);
      return { success: false, error: "Cannot summon: results in self-check" };
    }

    deck.splice(pieceIndex, 1);
    const fen = this.chess.fen();
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-';
    parts[4] = '0';
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
    if (this.resignedBy || this.isTimeout) return false;
    if (this.chess.inCheck()) return false;
    if (this.chess.moves().length > 0) return false;

    const turn = this.chess.turn();
    const deck = turn === 'w' ? this.whiteDeck : this.blackDeck;

    if (deck.length === 0) return true;

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

    return true;
  }

  private checkGameOver(): boolean {
    if (this.resignedBy || this.isTimeout) return true;
    if (this.isTrueCheckmate()) return true;
    if (this.checkStalemate()) return true;
    if (this.chess.isThreefoldRepetition()) return true;
    if (this.whiteDeck.length === 0 && this.blackDeck.length === 0) {
      if (this.chess.isDraw()) return true;
    }
    return false;
  }

  private isTrueCheckmate(): boolean {
    if (this.resignedBy || this.isTimeout) return false;
    if (!this.chess.isCheckmate()) return false;
    return !this.canSummonToEscape();
  }

  private canSummonToEscape(): boolean {
    const turn = this.chess.turn();
    const deck = turn === 'w' ? this.whiteDeck : this.blackDeck;
    if (deck.length === 0) return false;

    const uniquePieces = Array.from(new Set(deck));
    const fen = this.chess.fen();

    for (const piece of uniquePieces) {
      for (let r = 1; r <= 8; r++) {
        if (piece === 'p' && (r === 1 || r === 8)) continue;
        for (let c = 0; c < 8; c++) {
          const file = 'abcdefgh'[c];
          const square = (file + r) as Square;
          if (this.chess.get(square)) continue;
          if (!isReachableByOwnPiece(this.chess, square, turn)) continue;

          const tempChess = new Chess(fen);
          tempChess.put({ type: piece, color: turn }, square);
          if (!tempChess.inCheck()) return true;
        }
      }
    }
    return false;
  }

  private getWinner(): PieceColor | null {
    if (this.resignedBy) return this.resignedBy === 'w' ? 'b' : 'w';
    if (this.isTimeout) return this.whiteTime <= 0 ? 'b' : 'w';
    if (this.isTrueCheckmate()) return this.chess.turn() === 'w' ? 'b' : 'w';
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
      whiteTime: this.whiteTime,
      blackTime: this.blackTime,
      lastActionTimestamp: this.lastActionTimestamp,
      chat: this.chat,
      isTimeout: this.isTimeout,
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
    if (data.resignedBy) game.resignedBy = data.resignedBy;
    if (data.whiteTime !== undefined) game.whiteTime = data.whiteTime;
    if (data.blackTime !== undefined) game.blackTime = data.blackTime;
    if (data.lastActionTimestamp !== undefined) game.lastActionTimestamp = data.lastActionTimestamp;
    if (data.chat !== undefined) game.chat = data.chat;
    if (data.isTimeout !== undefined) game.isTimeout = data.isTimeout;
    return game;
  }

  public isReachableByOwnPiece(target: Square, color: PieceColor): boolean {
    return isReachableByOwnPiece(this.chess, target, color);
  }
}

export function isReachableByOwnPiece(chess: Chess, target: Square, color: PieceColor): boolean {
  const targetFile = target.charCodeAt(0) - 'a'.charCodeAt(0);
  const targetRank = parseInt(target[1]) - 1;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const fileChar = String.fromCharCode('a'.charCodeAt(0) + c);
      const rankNum = r + 1;
      const sq = (fileChar + rankNum) as Square;
      const piece = chess.get(sq);

      if (!piece || piece.color !== color) continue;
      if (canPieceReach(chess, piece.type, c, r, targetFile, targetRank, piece.color as PieceColor)) {
        return true;
      }
    }
  }
  return false;
}

export function canPieceReach(chess: Chess, type: string, fromX: number, fromY: number, toX: number, toY: number, color: PieceColor): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 0 && dy === 0) return false;

  switch (type) {
    case 'p':
      const direction = color === 'w' ? 1 : -1;
      if (Math.abs(dx) <= 1 && dy === direction) return true;
      return false;
    case 'n':
      return (Math.abs(dx) === 2 && Math.abs(dy) === 1) || (Math.abs(dx) === 1 && Math.abs(dy) === 2);
    case 'k':
      return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
    case 'b':
      if (Math.abs(dx) !== Math.abs(dy)) return false;
      return isPathClear(chess, fromX, fromY, toX, toY);
    case 'r':
      if (dx !== 0 && dy !== 0) return false;
      return isPathClear(chess, fromX, fromY, toX, toY);
    case 'q':
      if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return false;
      return isPathClear(chess, fromX, fromY, toX, toY);
  }
  return false;
}

export function isPathClear(chess: Chess, fromX: number, fromY: number, toX: number, toY: number): boolean {
  const stepX = Math.sign(toX - fromX);
  const stepY = Math.sign(toY - fromY);
  let currX = fromX + stepX;
  let currY = fromY + stepY;

  while (currX !== toX || currY !== toY) {
    const fileChar = String.fromCharCode('a'.charCodeAt(0) + currX);
    const rankNum = currY + 1;
    const sq = (fileChar + rankNum) as Square;
    if (chess.get(sq)) return false;
    currX += stepX;
    currY += stepY;
  }
  return true;
}
