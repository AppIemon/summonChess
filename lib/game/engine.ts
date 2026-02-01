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
    this.chess = new Chess(fen || '4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    const defaultDeck: PieceType[] = ['q', 'r', 'r', 'b', 'b', 'n', 'n', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'];
    this.whiteDeck = whiteDeck ? [...whiteDeck] : [...defaultDeck];
    this.blackDeck = blackDeck ? [...blackDeck] : [...defaultDeck];
    this.whitePlayerId = whitePlayerId;
    this.blackPlayerId = blackPlayerId;
    this.lastActionTimestamp = Date.now();
  }

  public getState(): GameState {
    const isGameOver = this.checkGameOver();
    const isDraw = (this.whiteDeck.length === 0 && this.blackDeck.length === 0) ? this.chess.isDraw() : this.chess.isThreefoldRepetition();

    // Calculate actual time remaining since last action
    let currentWhiteTime = this.whiteTime;
    let currentBlackTime = this.blackTime;
    let currentIsTimeout = this.isTimeout;

    if (!isGameOver) {
      const now = Date.now();
      const elapsed = (now - this.lastActionTimestamp) / 1000;
      if (this.chess.turn() === 'w') {
        currentWhiteTime = Math.max(0, this.whiteTime - elapsed);
        if (currentWhiteTime <= 0) currentIsTimeout = true;
      } else {
        currentBlackTime = Math.max(0, this.blackTime - elapsed);
        if (currentBlackTime <= 0) currentIsTimeout = true;
      }
    }

    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      whiteDeck: [...this.whiteDeck],
      blackDeck: [...this.blackDeck],
      isCheck: this.chess.inCheck(),
      isCheckmate: this.isTrueCheckmate(),
      isDraw: isDraw,
      isStalemate: this.checkStalemate(),
      winner: this.calculateWinner(currentIsTimeout, currentWhiteTime, currentBlackTime),
      history: this.chess.history(),
      lastMove: this.lastMove,
      whitePlayerId: this.whitePlayerId,
      blackPlayerId: this.blackPlayerId,
      whiteTime: Math.floor(currentWhiteTime),
      blackTime: Math.floor(currentBlackTime),
      isTimeout: currentIsTimeout,
      chat: [...this.chat],
    };
  }

  private calculateWinner(isTimeout: boolean, whiteTime: number, blackTime: number): PieceColor | null {
    if (this.resignedBy) return this.resignedBy === 'w' ? 'b' : 'w';
    if (isTimeout) return whiteTime <= 0 ? 'b' : 'w';
    if (this.isTrueCheckmate()) return this.chess.turn() === 'w' ? 'b' : 'w';
    return null;
  }

  public getValidMoves(square: Square) {
    return this.chess.moves({ square, verbose: true });
  }

  public executeAction(action: Action & { playerId?: string }, playerId?: string): { success: boolean, error?: string } {
    const turn = this.chess.turn();
    const effectivePlayerId = playerId || action.playerId;

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

    if (this.checkGameOver()) return { success: false, error: "Game Over" };

    const now = Date.now();
    const elapsed = (now - this.lastActionTimestamp) / 1000;

    // Official timer update on action
    if (turn === 'w') {
      this.whiteTime = Math.max(0, this.whiteTime - elapsed);
      if (this.whiteTime <= 0) this.isTimeout = true;
    } else {
      this.blackTime = Math.max(0, this.blackTime - elapsed);
      if (this.blackTime <= 0) this.isTimeout = true;
    }
    this.lastActionTimestamp = now;

    if (this.isTimeout) return { success: false, error: "Time out" };

    // Player validation
    if (effectivePlayerId) {
      if (turn === 'w' && this.whitePlayerId && effectivePlayerId !== this.whitePlayerId && action.type !== 'resign') {
        return { success: false, error: `Not White's turn` };
      } else if (turn === 'b' && this.blackPlayerId && effectivePlayerId !== this.blackPlayerId && action.type !== 'resign') {
        return { success: false, error: `Not Black's turn` };
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
        return { success: false, error: "Invalid move" };
      }
    } else if (action.type === 'summon') {
      return this.summonPiece(action.piece, action.square as Square);
    } else if (action.type === 'resign') {
      if (effectivePlayerId === this.whitePlayerId) this.resignedBy = 'w';
      else if (effectivePlayerId === this.blackPlayerId) this.resignedBy = 'b';
      else this.resignedBy = turn;
      return { success: true };
    }
    return { success: false, error: "Invalid action" };
  }

  private summonPiece(piece: PieceType, square: Square): { success: boolean, error?: string } {
    const turn = this.chess.turn();
    const deck = turn === 'w' ? this.whiteDeck : this.blackDeck;
    const pieceIndex = deck.indexOf(piece);

    if (pieceIndex === -1) return { success: false, error: "Piece not in deck" };
    if (this.chess.get(square)) return { success: false, error: "Square occupied" };
    if (!isReachableByOwnPiece(this.chess, square, turn)) return { success: false, error: "Square not reachable" };

    const rank = parseInt(square[1]);
    if (piece === 'p' && (rank === 1 || rank === 8)) return { success: false, error: "Invalid pawn rank" };

    if (!this.chess.put({ type: piece, color: turn }, square)) return { success: false, error: "Put failed" };
    if (this.chess.inCheck()) {
      this.chess.remove(square);
      return { success: false, error: "Results in self-check" };
    }

    deck.splice(pieceIndex, 1);
    const fen = this.chess.fen();
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-';
    parts[4] = '0';
    if (turn === 'b') parts[5] = (parseInt(parts[5]) + 1).toString();

    this.chess.load(parts.join(' '));
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

    for (let r = 1; r <= 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = (String.fromCharCode(97 + c) + r) as Square;
        if (!this.chess.get(sq) && isReachableByOwnPiece(this.chess, sq, turn)) {
          if (deck.some(p => p !== 'p' || (r !== 1 && r !== 8))) return false;
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
    return this.whiteDeck.length === 0 && this.blackDeck.length === 0 && this.chess.isDraw();
  }

  private isTrueCheckmate(): boolean {
    return this.chess.isCheckmate() && !this.canSummonToEscape();
  }

  private canSummonToEscape(): boolean {
    const turn = this.chess.turn();
    const deck = turn === 'w' ? this.whiteDeck : this.blackDeck;
    if (deck.length === 0) return false;

    const fen = this.chess.fen();
    const pieces = Array.from(new Set(deck));

    for (const piece of pieces) {
      for (let r = 1; r <= 8; r++) {
        if (piece === 'p' && (r === 1 || r === 8)) continue;
        for (let c = 0; c < 8; c++) {
          const sq = (String.fromCharCode(97 + c) + r) as Square;
          if (!this.chess.get(sq) && isReachableByOwnPiece(this.chess, sq, turn)) {
            const temp = new Chess(fen);
            temp.put({ type: piece, color: turn }, sq);
            if (!temp.inCheck()) return true;
          }
        }
      }
    }
    return false;
  }

  public serialize(): any {
    return {
      fen: this.chess.fen(), whiteDeck: this.whiteDeck, blackDeck: this.blackDeck,
      whitePlayerId: this.whitePlayerId, blackPlayerId: this.blackPlayerId,
      resignedBy: this.resignedBy, whiteTime: this.whiteTime, blackTime: this.blackTime,
      lastActionTimestamp: this.lastActionTimestamp, chat: this.chat, isTimeout: this.isTimeout,
    };
  }

  static deserialize(data: any): SummonChessGame {
    const game = new SummonChessGame(data.fen, data.whiteDeck, data.blackDeck, data.whitePlayerId, data.blackPlayerId);
    if (data.resignedBy) game.resignedBy = data.resignedBy;
    if (data.whiteTime !== undefined) game.whiteTime = data.whiteTime;
    if (data.blackTime !== undefined) game.blackTime = data.blackTime;
    if (data.lastActionTimestamp !== undefined) game.lastActionTimestamp = data.lastActionTimestamp;
    if (data.chat !== undefined) game.chat = data.chat;
    if (data.isTimeout !== undefined) game.isTimeout = data.isTimeout;
    return game;
  }
}

export function isReachableByOwnPiece(chess: Chess, target: Square, color: PieceColor): boolean {
  const tx = target.charCodeAt(0) - 97, ty = parseInt(target[1]) - 1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = (String.fromCharCode(97 + c) + (r + 1)) as Square;
      const p = chess.get(sq);
      if (p && p.color === color && canPieceReach(chess, p.type, c, r, tx, ty, color)) return true;
    }
  }
  return false;
}

function canPieceReach(chess: Chess, type: string, fx: number, fy: number, tx: number, ty: number, color: PieceColor): boolean {
  const dx = tx - fx, dy = ty - fy;
  if (dx === 0 && dy === 0) return false;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  switch (type) {
    case 'p': return adx <= 1 && dy === (color === 'w' ? 1 : -1);
    case 'n': return (adx === 2 && ady === 1) || (adx === 1 && ady === 2);
    case 'k': return adx <= 1 && ady <= 1;
    case 'b': return adx === ady && isPathClear(chess, fx, fy, tx, ty);
    case 'r': return (dx === 0 || dy === 0) && isPathClear(chess, fx, fy, tx, ty);
    case 'q': return (adx === ady || dx === 0 || dy === 0) && isPathClear(chess, fx, fy, tx, ty);
  }
  return false;
}

function isPathClear(chess: Chess, fx: number, fy: number, tx: number, ty: number): boolean {
  const sx = Math.sign(tx - fx), sy = Math.sign(ty - fy);
  let cx = fx + sx, cy = fy + sy;
  while (cx !== tx || cy !== ty) {
    if (chess.get((String.fromCharCode(97 + cx) + (cy + 1)) as Square)) return false;
    cx += sx; cy += sy;
  }
  return true;
}
