type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

const EMPTY = 0;
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const WHITE = 1, BLACK = -1;
const INF = 100000000;
const PIECE_VALS = [0, 100, 350, 450, 500, 1100, 20000];

// Move Packing Utilities (32-bit integer)
// bits 0-5: from (0-63)
// bits 6-11: to (0-63)
// bits 12-14: piece (0-7)
// bits 15-17: promo (0-7)
// bits 18-21: capturedabs (0-15)
// bit 22: enPassant flag
// bit 23: isSummon flag
function packMove(type: 'MOVE' | 'SUMMON', from: number, to: number, piece: number, captured: number, promo: number, enPassant: boolean): number {
  let m = (from & 0x3F);
  m |= (to & 0x3F) << 6;
  m |= (piece & 0x7) << 12;
  m |= (promo & 0x7) << 15;
  m |= (Math.abs(captured) & 0xF) << 18;
  if (enPassant) m |= (1 << 22);
  if (type === 'SUMMON') m |= (1 << 23);
  return m;
}

const getFrom = (m: number) => m & 0x3F;
const getTo = (m: number) => (m >> 6) & 0x3F;
const getPiece = (m: number) => (m >> 12) & 0x7;
const getPromo = (m: number) => (m >> 15) & 0x7;
const getCap = (m: number) => (m >> 18) & 0xF;
const isEP = (m: number) => (m & (1 << 22)) !== 0;
const isSummon = (m: number) => (m & (1 << 23)) !== 0;

const CENTER_BONUS = new Int32Array(64);
for (let i = 0; i < 64; i++) {
  const x = i % 8, y = Math.floor(i / 8);
  CENTER_BONUS[i] = Math.floor((4 - Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5))) * 10);
}

// Transposition Table flags
const TT_EXACT = 0;
const TT_ALPHA = 1; // Upper bound (Fail-low)
const TT_BETA = 2;  // Lower bound (Fail-high)

const TT_SIZE = 1 << 20; // Increased size to 1M entries for better hit rate
const TT_KEYS = new BigUint64Array(TT_SIZE);
const TT_VALS = new Int32Array(TT_SIZE);
const TT_MOVES = new Int32Array(TT_SIZE);
const TT_INFO = new Int32Array(TT_SIZE); // [0-7: depth, 8-15: flag]

const zobristBoard = Array.from({ length: 64 }, () => new BigUint64Array(13));
const zobristReserve = Array.from({ length: 2 }, () => Array.from({ length: 7 }, () => new BigUint64Array(16))); // [Side][PieceType][Count]
let zobristTurn: bigint = 0n;
let zobristInitialized = false;

const ATTACK_DIRS = [[0, 1], [0, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [-1, -1], [1, -1]];
const KNIGHT_DX = [1, 2, 2, 1, -1, -2, -2, -1], KNIGHT_DY = [2, 1, -1, -2, -2, -1, 1, 2];
const KING_DX = [1, 1, 1, 0, 0, -1, -1, -1], KING_DY = [1, 0, -1, 1, -1, 1, 0, -1];

function initZobrist() {
  if (zobristInitialized) return;
  // Use a pseudo-random generator since crypto is not always available in same way or we want it deterministic-ish
  let seed = 123456789n;
  const nextRand = () => {
    seed ^= seed << 13n;
    seed ^= seed >> 7n;
    seed ^= seed << 17n;
    return seed;
  };

  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 13; j++) {
      zobristBoard[i][j] = nextRand();
    }
  }
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 7; j++) {
      for (let k = 0; k < 16; k++) {
        zobristReserve[i][j][k] = nextRand();
      }
    }
  }
  zobristTurn = nextRand();
  zobristInitialized = true;
}


class AiGameState {
  board: Int8Array = new Int8Array(64);
  reserve: Int8Array[] = [new Int8Array(7), new Int8Array(7)];
  kingPos: Int32Array = new Int32Array([-1, -1]); // [White, Black]
  turn: number = WHITE;
  epSquare: number = -1;
  currentHash: bigint = 0n;
  materialScore: number = 0; // Incremental material + PSQT score

  getZobristIdx(p: number) {
    if (p === 0) return 0;
    return p > 0 ? p : Math.abs(p) + 6;
  }

  updateHashSquare(sq: number, oldP: number, newP: number) {
    this.currentHash ^= zobristBoard[sq][this.getZobristIdx(oldP)];
    this.currentHash ^= zobristBoard[sq][this.getZobristIdx(newP)];
  }

  loadFen(fen: string) {
    this.board.fill(0);
    this.kingPos[0] = -1;
    this.kingPos[1] = -1;
    this.currentHash = 0n;
    this.reserve[0].fill(0);
    this.reserve[1].fill(0);

    const parts = fen.split(' ');
    let r = 7, c = 0;
    for (const char of parts[0]) {
      if (char === '/') { r--; c = 0; }
      else if (!isNaN(parseInt(char))) { c += parseInt(char); }
      else {
        const lower = char.toLowerCase();
        const type = lower === 'p' ? PAWN : lower === 'n' ? KNIGHT : lower === 'b' ? BISHOP : lower === 'r' ? ROOK : lower === 'q' ? QUEEN : KING;
        const p = (char === char.toUpperCase()) ? type : -type;
        const idx = r * 8 + c;
        this.board[idx] = p;
        this.updateHashSquare(idx, 0, p);
        if (type === KING) {
          this.kingPos[p > 0 ? 0 : 1] = idx;
        }
        c++;
      }
    }
    this.turn = parts[1] === 'w' ? WHITE : BLACK;
    if (this.turn === BLACK) this.currentHash ^= zobristTurn;
    if (parts.length > 3 && parts[3] !== '-') {
      this.epSquare = (parts[3].charCodeAt(0) - 97) + (parseInt(parts[3][1]) - 1) * 8;
    }
    const deckParts = fen.match(/\[(.*?)\]\[(.*?)\]/);
    if (deckParts) {
      const parse = (s: string, side: number) => {
        const rIdx = side === WHITE ? 1 : 0;
        for (const char of s) {
          const l = char.toLowerCase();
          const type = l === 'p' ? PAWN : l === 'n' ? KNIGHT : l === 'b' ? BISHOP : l === 'r' ? ROOK : l === 'q' ? QUEEN : 0;
          if (type) {
            this.reserve[rIdx][type]++;
            this.currentHash ^= zobristReserve[rIdx][type][this.reserve[rIdx][type]];
          }
        }
      };
      parse(deckParts[1], WHITE);
      parse(deckParts[2], BLACK);
    }
    this.recalculateScore();
  }

  recalculateScore() {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const pVal = this.board[i];
      if (pVal === 0) continue;
      const p = Math.abs(pVal), side = (pVal > 0 ? WHITE : BLACK);
      let v = PIECE_VALS[p] + CENTER_BONUS[i];
      if (p === PAWN) {
        const y = i >> 3;
        if ((side === WHITE && y === 6) || (side === BLACK && y === 1)) v += 100;
        else if ((side === WHITE && y === 5) || (side === BLACK && y === 2)) v += 30;
      }
      score += side * v;
    }
    for (let p = 1; p <= 5; p++) {
      // Use 11/10 to avoid floating point precision issues
      score += Math.floor((this.reserve[1][p] - this.reserve[0][p]) * PIECE_VALS[p] * 11 / 10);
    }
    this.materialScore = score;
  }

  getSummonMask(side: number): Uint8Array {
    const mask = new Uint8Array(64);
    const b = this.board;
    for (let i = 0; i < 64; i++) {
      const pVal = b[i];
      if (pVal === 0) continue;
      if (side === WHITE ? pVal < 0 : pVal > 0) continue;

      const p = pVal > 0 ? pVal : -pVal;
      const x = i & 7, y = i >> 3;
      if (p === PAWN) {
        const ny = y + (side === WHITE ? 1 : -1);
        if (ny >= 0 && ny <= 7) {
          const base = ny << 3;
          mask[base + x] = 1;
          if (x > 0) mask[base + x - 1] = 1;
          if (x < 7) mask[base + x + 1] = 1;
        }
      } else if (p === KNIGHT || p === KING) {
        const dxArr = p === KNIGHT ? KNIGHT_DX : KING_DX;
        const dyArr = p === KNIGHT ? KNIGHT_DY : KING_DY;
        for (let k = 0; k < 8; k++) {
          const nx = x + dxArr[k], ny = y + dyArr[k];
          if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) mask[(ny << 3) + nx] = 1;
        }
      } else {
        const start = p === BISHOP ? 4 : 0, end = p === ROOK ? 4 : 8;
        for (let d = start; d < end; d++) {
          const dx = ATTACK_DIRS[d][0], dy = ATTACK_DIRS[d][1];
          for (let s = 1; s < 8; s++) {
            const nx = x + dx * s, ny = y + dy * s;
            if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break;
            mask[(ny << 3) + nx] = 1;
            if (b[(ny << 3) + nx] !== 0) break;
          }
        }
      }
    }
    return mask;
  }

  generateMoves(): number[] {
    const moves: number[] = [];
    const rIdx = this.turn === WHITE ? 1 : 0;
    const zone = this.getSummonMask(this.turn);
    for (let i = 0; i < 64; i++) {
      if (this.board[i] === EMPTY && zone[i]) {
        for (let p = 1; p <= 5; p++) {
          if (this.reserve[rIdx][p] > 0) {
            if (p === PAWN && ((i >> 3) === 0 || (i >> 3) === 7)) continue;
            moves.push(packMove('SUMMON', -1, i, p, 0, 0, false));
          }
        }
      }
    }
    for (let i = 0; i < 64; i++) {
      const pVal = this.board[i];
      if (pVal === 0 || (this.turn === WHITE && pVal < 0) || (this.turn === BLACK && pVal > 0)) continue;
      const p = Math.abs(pVal);
      const x = i & 7, y = i >> 3;
      if (p === PAWN) {
        const dy = (this.turn === WHITE) ? 1 : -1;
        const targetSq = (y + dy) * 8 + x;
        if (y + dy >= 0 && y + dy <= 7 && this.board[targetSq] === 0) {
          const promo = (y + dy === 0 || y + dy === 7) ? QUEEN : 0;
          moves.push(packMove('MOVE', i, targetSq, p, 0, promo, false));
          if (((this.turn === WHITE && y === 1) || (this.turn === BLACK && y === 6)) && this.board[(y + dy * 2) * 8 + x] === 0) {
            moves.push(packMove('MOVE', i, (y + dy * 2) * 8 + x, p, 0, 0, false));
          }
        }
        for (const dx of [-1, 1]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx <= 7 && ny >= 0 && ny <= 7) {
            const tSq = (ny << 3) + nx;
            const target = this.board[tSq];
            if (target !== 0 && ((this.turn === WHITE && target < 0) || (this.turn === BLACK && target > 0))) {
              const promo = (ny === 0 || ny === 7) ? QUEEN : 0;
              moves.push(packMove('MOVE', i, tSq, p, target, promo, false));
            } else if (this.epSquare === tSq) {
              moves.push(packMove('MOVE', i, this.epSquare, p, 0, 0, true));
            }
          }
        }
      } else if (p === KNIGHT || p === KING) {
        const dxArr = p === KNIGHT ? KNIGHT_DX : KING_DX;
        const dyArr = p === KNIGHT ? KNIGHT_DY : KING_DY;
        for (let k = 0; k < 8; k++) {
          const nx = x + dxArr[k], ny = y + dyArr[k];
          if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
            const tSq = (ny << 3) + nx;
            const target = this.board[tSq];
            if (target === 0 || (this.turn === WHITE && target < 0) || (this.turn === BLACK && target > 0)) {
              moves.push(packMove('MOVE', i, tSq, p, target, 0, false));
            }
          }
        }
      } else {
        const start = p === BISHOP ? 4 : 0, end = p === ROOK ? 4 : 8;
        for (let d = start; d < end; d++) {
          const dx = ATTACK_DIRS[d][0], dy = ATTACK_DIRS[d][1];
          for (let s = 1; s < 8; s++) {
            const nx = x + dx * s, ny = y + dy * s;
            if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break;
            const tSq = (ny << 3) + nx, target = this.board[tSq];
            if (target === 0) moves.push(packMove('MOVE', i, tSq, p, 0, 0, false));
            else {
              if (this.turn === WHITE ? target < 0 : target > 0) moves.push(packMove('MOVE', i, tSq, p, target, 0, false));
              break;
            }
          }
        }
      }
    }
    return moves;
  }

  generateCaptures(): number[] {
    const moves: number[] = [];
    for (let i = 0; i < 64; i++) {
      const pVal = this.board[i];
      if (pVal === 0 || (this.turn === WHITE && pVal < 0) || (this.turn === BLACK && pVal > 0)) continue;
      const p = Math.abs(pVal);
      const x = i & 7, y = i >> 3;
      if (p === PAWN) {
        const dy = (this.turn === WHITE) ? 1 : -1;
        for (const dx of [-1, 1]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx <= 7 && ny >= 0 && ny <= 7) {
            const tSq = (ny << 3) + nx;
            const target = this.board[tSq];
            if (target !== 0 && ((this.turn === WHITE && target < 0) || (this.turn === BLACK && target > 0))) {
              const promo = (ny === 0 || ny === 7) ? QUEEN : 0;
              moves.push(packMove('MOVE', i, tSq, p, target, promo, false));
            } else if (this.epSquare === tSq) {
              moves.push(packMove('MOVE', i, this.epSquare, p, 0, 0, true));
            }
          }
        }
      } else if (p === KNIGHT || p === KING) {
        const dxArr = p === KNIGHT ? KNIGHT_DX : KING_DX;
        const dyArr = p === KNIGHT ? KNIGHT_DY : KING_DY;
        for (let k = 0; k < 8; k++) {
          const nx = x + dxArr[k], ny = y + dyArr[k];
          if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
            const tSq = (ny << 3) + nx;
            const target = this.board[tSq];
            if (target !== 0 && (this.turn === WHITE ? target < 0 : target > 0)) {
              moves.push(packMove('MOVE', i, tSq, p, target, 0, false));
            }
          }
        }
      } else {
        const start = p === BISHOP ? 4 : 0, end = p === ROOK ? 4 : 8;
        for (let d = start; d < end; d++) {
          const dx = ATTACK_DIRS[d][0], dy = ATTACK_DIRS[d][1];
          for (let s = 1; s < 8; s++) {
            const nx = x + dx * s, ny = y + dy * s;
            if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break;
            const tSq = (ny << 3) + nx, target = this.board[tSq];
            if (target !== 0) {
              if (this.turn === WHITE ? target < 0 : target > 0) moves.push(packMove('MOVE', i, tSq, p, target, 0, false));
              break;
            }
          }
        }
      }
    }
    return moves;
  }

  getPieceValueWithPos(p: number, sq: number, side: number): number {
    let v = PIECE_VALS[p] + CENTER_BONUS[sq];
    if (p === PAWN) {
      const y = sq >> 3;
      if ((side === WHITE && y === 6) || (side === BLACK && y === 1)) v += 100;
      else if ((side === WHITE && y === 5) || (side === BLACK && y === 2)) v += 30;
    }
    return v;
  }

  makeMove(m: number) {
    const prevState = {
      ep: this.epSquare,
      hash: this.currentHash,
      score: this.materialScore,
      capP: getCap(m),
      capSq: getTo(m),
      oldKing: -1
    };

    if (isSummon(m)) {
      const rIdx = (this.turn === WHITE) ? 1 : 0, p = getPiece(m), to = getTo(m);
      this.currentHash ^= zobristReserve[rIdx][p][this.reserve[rIdx][p]];
      this.reserve[rIdx][p]--;
      // Incrementally update score for summon: Add piece to board, remove from reserve
      this.materialScore += (this.turn === WHITE ? 1 : -1) * (this.getPieceValueWithPos(p, to, this.turn) - PIECE_VALS[p] * 1.1);

      this.board[to] = p * this.turn;
      this.updateHashSquare(to, 0, this.board[to]);
      this.epSquare = -1;
    } else {
      const from = getFrom(m), to = getTo(m), p = getPiece(m), promo = getPromo(m), moving = this.board[from];
      this.updateHashSquare(from, moving, 0);
      // Update score for leaving from square
      this.materialScore -= (this.turn === WHITE ? 1 : -1) * this.getPieceValueWithPos(p, from, this.turn);

      this.board[from] = 0;
      if (p === KING) { prevState.oldKing = from; this.kingPos[this.turn === WHITE ? 0 : 1] = to; }

      if (isEP(m)) {
        const capSq = to + (this.turn === WHITE ? -8 : 8);
        prevState.capSq = capSq; prevState.capP = this.board[capSq];
        this.updateHashSquare(capSq, prevState.capP, 0);
        // Update score for EP capture
        this.materialScore -= (this.turn === WHITE ? -1 : 1) * this.getPieceValueWithPos(PAWN, capSq, -this.turn);
        this.board[capSq] = 0;
      } else if (prevState.capP) {
        this.updateHashSquare(to, prevState.capP, 0);
        // Update score for normal capture
        this.materialScore -= (this.turn === WHITE ? -1 : 1) * this.getPieceValueWithPos(prevState.capP / -this.turn, to, -this.turn);
      }

      const placed = promo ? (this.turn === WHITE ? QUEEN : -QUEEN) : moving;
      const placedP = Math.abs(placed);
      this.board[to] = placed;
      this.updateHashSquare(to, 0, placed);
      // Update score for landing on to square
      this.materialScore += (this.turn === WHITE ? 1 : -1) * this.getPieceValueWithPos(placedP, to, this.turn);

      this.epSquare = (p === PAWN && Math.abs(from - to) === 16) ? (from + to) >> 1 : -1;
    }
    this.turn *= -1; this.currentHash ^= zobristTurn;
    return prevState;
  }

  undoMove(m: number, prev: any) {
    this.turn *= -1;
    this.currentHash = prev.hash;
    this.epSquare = prev.ep;
    this.materialScore = prev.score;
    if (isSummon(m)) {
      const rIdx = (this.turn === WHITE) ? 1 : 0, p = getPiece(m), to = getTo(m);
      this.board[to] = 0; this.reserve[rIdx][p]++;
    } else {
      const from = getFrom(m), to = getTo(m), p = getPiece(m), promo = getPromo(m);
      if (prev.oldKing !== -1) this.kingPos[this.turn === WHITE ? 0 : 1] = prev.oldKing;
      this.board[from] = promo ? (this.turn === WHITE ? PAWN : -PAWN) : this.board[to];
      this.board[to] = 0; if (prev.capP) this.board[prev.capSq] = prev.capP;
    }
  }

  // Legacy for compatibility during transition
  captureState() { return null; }

  isInCheck(color: number): boolean {
    const kingPos = this.kingPos[color === WHITE ? 0 : 1];
    if (kingPos === -1) return false;
    return this.isSquareAttacked(kingPos, -color);
  }

  isSquareAttacked(sq: number, color: number): boolean {
    const x = sq % 8, y = Math.floor(sq / 8);
    // Pawns
    const dy = color === WHITE ? 1 : -1;
    for (const dx of [-1, 1]) {
      const nx = x - dx, ny = y - dy; // Look back to where an attacker would be
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
        if (this.board[ny * 8 + nx] === PAWN * color) return true;
      }
    }
    // Knights
    for (let k = 0; k < 8; k++) {
      const nx = x + KNIGHT_DX[k], ny = y + KNIGHT_DY[k];
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
        if (this.board[ny * 8 + nx] === KNIGHT * color) return true;
      }
    }
    // King
    for (let k = 0; k < 8; k++) {
      const nx = x + KING_DX[k], ny = y + KING_DY[k];
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
        if (this.board[ny * 8 + nx] === KING * color) return true;
      }
    }
    // Sliders
    for (let d = 0; d < 8; d++) {
      const dx = ATTACK_DIRS[d][0], dy = ATTACK_DIRS[d][1];
      for (let s = 1; s < 8; s++) {
        const nx = x + dx * s, ny = y + dy * s;
        if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break;
        const p = this.board[ny * 8 + nx];
        if (p !== 0) {
          if (p === QUEEN * color) return true;
          if (d < 4 && p === ROOK * color) return true;
          if (d >= 4 && p === BISHOP * color) return true;
          break;
        }
      }
    }
    return false;
  }

  getKingMobility(color: number): number {
    const kp = this.kingPos[color === WHITE ? 0 : 1];
    if (kp === -1) return 0;
    const x = kp % 8, y = Math.floor(kp / 8);
    let mobility = 0;
    for (let i = 0; i < 8; i++) {
      const nx = x + KING_DX[i], ny = y + KING_DY[i];
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
        const targetSq = ny * 8 + nx;
        const p = this.board[targetSq];
        if (p === 0 || (color === WHITE ? p < 0 : p > 0)) {
          if (!this.isSquareAttacked(targetSq, -color)) {
            mobility++;
          }
        }
      }
    }
    return mobility;
  }

  isSquareSummonable(sq: number, side: number): boolean {
    if (this.board[sq] !== 0) return false;
    const x = sq & 7, y = sq >> 3;

    // Pawns
    const dy = (side === WHITE) ? -1 : 1;
    const prevY = y + dy;
    if (prevY >= 0 && prevY <= 7) {
      const base = prevY << 3;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < 8 && this.board[base + nx] === PAWN * side) return true;
      }
    }
    // Knights
    for (let k = 0; k < 8; k++) {
      const nx = x + KNIGHT_DX[k], ny = y + KNIGHT_DY[k];
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && this.board[(ny << 3) + nx] === KNIGHT * side) return true;
    }
    // King
    for (let k = 0; k < 8; k++) {
      const nx = x + KING_DX[k], ny = y + KING_DY[k];
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && this.board[(ny << 3) + nx] === KING * side) return true;
    }
    // Sliders
    for (let d = 0; d < 8; d++) {
      const dx = ATTACK_DIRS[d][0], dyA = ATTACK_DIRS[d][1];
      for (let s = 1; s < 8; s++) {
        const nx = x + dx * s, ny = y + dyA * s;
        if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break;
        const p = this.board[(ny << 3) + nx];
        if (p !== 0) {
          if (p === QUEEN * side || (d < 4 && p === ROOK * side) || (d >= 4 && p === BISHOP * side)) return true;
          break;
        }
      }
    }
    return false;
  }

  evaluate(): number {
    let score = this.materialScore;
    const wk = this.kingPos[0], bk = this.kingPos[1];
    const wkx = wk & 7, wky = wk >> 3, bkx = bk & 7, bky = bk >> 3;

    // King proximity bonus (Pressure on enemy king)
    for (let i = 0; i < 64; i++) {
      const pVal = this.board[i];
      if (pVal === 0) continue;
      const p = Math.abs(pVal), x = i & 7, y = i >> 3, side = (pVal > 0 ? WHITE : BLACK);
      const enemyKingPos = side === WHITE ? bk : wk;
      if (enemyKingPos !== -1) {
        const ekx = enemyKingPos & 7, eky = enemyKingPos >> 3;
        const dist = Math.max(Math.abs(x - ekx), Math.abs(y - eky));
        if (dist <= 2) score += side * (3 - dist) * 20;
      }
    }

    // 2. Tactical Potential using Summon Masks
    const whiteSummonMask = this.getSummonMask(WHITE);
    // Note: getSummonMask uses a shared buffer, so we need to copy or use it before next call
    const whiteMaskCopy = new Uint8Array(whiteSummonMask);
    const blackSummonMask = this.getSummonMask(BLACK);
    // Now blackSummonMask is the shared buffer.

    for (let k = 0; k < 8; k++) {
      const wnx = bkx + KING_DX[k], wny = bky + KING_DY[k];
      if (wnx >= 0 && wnx < 8 && wny >= 0 && wny < 8) {
        const idx = (wny << 3) + wnx;
        if (whiteMaskCopy[idx]) {
          if (this.reserve[1][QUEEN] > 0) score += 120;
          if (this.reserve[1][KNIGHT] > 0) score += 60;
        }
      }
      const bnx = wkx + KING_DX[k], bny = wky + KING_DY[k];
      if (bnx >= 0 && bnx < 8 && bny >= 0 && bny < 8) {
        const idx = (bny << 3) + bnx;
        if (blackSummonMask[idx]) {
          if (this.reserve[0][QUEEN] > 0) score -= 120;
          if (this.reserve[0][KNIGHT] > 0) score -= 60;
        }
      }
    }

    // 3. King Safety & Trap Detection
    const wm = this.getKingMobility(WHITE), bm = this.getKingMobility(BLACK);
    score += (wm - bm) * 35;

    const wCheck = this.isInCheck(WHITE), bCheck = this.isInCheck(BLACK);
    if (wCheck) score -= (wm === 0 ? 8000 : 500);
    if (bCheck) score += (bm === 0 ? 8000 : 500);

    // Trap Detection: Knight Check on Trapped King
    if (bm <= 1 && this.reserve[1][KNIGHT] > 0) {
      for (let k = 0; k < 8; k++) {
        const nx = bkx + KNIGHT_DX[k], ny = bky + KNIGHT_DY[k];
        if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && whiteMaskCopy[(ny << 3) + nx]) { score += 1200; break; }
      }
    }
    if (wm <= 1 && this.reserve[0][KNIGHT] > 0) {
      for (let k = 0; k < 8; k++) {
        const nx = wkx + KNIGHT_DX[k], ny = wky + KNIGHT_DY[k];
        if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && blackSummonMask[(ny << 3) + nx]) { score -= 1200; break; }
      }
    }

    return this.turn === WHITE ? score : -score;
  }
}

const MATE_SCORE = 50000;
const MATE_THRESHOLD = 40000;
let searchStartTime = 0;
let searchMAX_TIME = 3500;
let isSearchAborted = false;
const killers: Int32Array = new Int32Array(128); // 2 killers per ply up to 64 ply
const historyHeuristic: Int32Array = new Int32Array(64 * 64); // History heuristic

function scoreMove(gs: AiGameState, m: number, hashM: number, ply: number): number {
  if (m === hashM) return 1000000;
  const captured = getCap(m);
  if (captured) return 100000 + (PIECE_VALS[captured] << 4) - PIECE_VALS[getPiece(m)];

  if (isSummon(m)) {
    const oppKingPos = gs.kingPos[gs.turn === WHITE ? 1 : 0];
    if (oppKingPos === -1) return 10001;
    const kx = oppKingPos % 8, ky = Math.floor(oppKingPos / 8);
    const tx = getTo(m) % 8, ty = Math.floor(getTo(m) / 8);
    const dist = Math.max(Math.abs(tx - kx), Math.abs(ty - ky));

    if (dist <= 1) {
      if (getPiece(m) === QUEEN) return 95000;
      return 90000 + PIECE_VALS[getPiece(m)];
    }
    if (getPiece(m) === KNIGHT) {
      const dx = Math.abs(tx - kx), dy = Math.abs(ty - ky);
      if ((dx === 1 && dy === 2) || (dx === 2 && dy === 1)) {
        return 96000;
      }
    }
    if (dist <= 2) return 80000 + PIECE_VALS[getPiece(m)];
    return 10000 + PIECE_VALS[getPiece(m)];
  }

  if (m === killers[ply << 1] || m === killers[(ply << 1) + 1]) return 9000;
  if (getPromo(m)) return 9500;

  if (!isSummon(m)) {
    return historyHeuristic[getFrom(m) * 64 + getTo(m)];
  }
  return 0;
}

function quiescence(gs: AiGameState, alpha: number, beta: number, ply: number = 0): number {
  if ((ply & 31) === 0 && Date.now() - searchStartTime > searchMAX_TIME) {
    isSearchAborted = true;
    return 0;
  }

  const standPat = gs.evaluate();
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;

  const moves = gs.generateCaptures();
  moves.sort((a, b) => scoreMove(gs, b, 0, 0) - scoreMove(gs, a, 0, 0));

  for (const m of moves) {
    const prevState = gs.makeMove(m);
    if (gs.isInCheck(gs.turn * -1)) {
      gs.undoMove(m, prevState);
      continue;
    }
    const val = -quiescence(gs, -beta, -alpha, ply + 1);
    gs.undoMove(m, prevState);

    if (isSearchAborted) return 0;
    if (val >= beta) return beta;
    if (val > alpha) alpha = val;
  }
  return alpha;
}

function alphaBeta(gs: AiGameState, depth: number, alpha: number, beta: number, ply: number, extensionCount: number = 0): number {
  if (depth <= 0) return quiescence(gs, alpha, beta, ply);

  if ((ply & 15) === 0 && Date.now() - searchStartTime > searchMAX_TIME) {
    isSearchAborted = true;
    return 0;
  }

  const hashIdx = Number(gs.currentHash & BigInt(TT_SIZE - 1));
  let hashMove = 0;
  if (TT_KEYS[hashIdx] === gs.currentHash) {
    let score = TT_VALS[hashIdx];
    if (score > MATE_THRESHOLD) score -= ply;
    else if (score < -MATE_THRESHOLD) score += ply;

    if ((TT_INFO[hashIdx] >> 8) >= depth) {
      const flag = TT_INFO[hashIdx] & 0xFF;
      if (flag === TT_EXACT) return score;
      if (flag === TT_ALPHA && score <= alpha) return alpha;
      if (flag === TT_BETA && score >= beta) return beta;
    }
    hashMove = TT_MOVES[hashIdx];
  }

  // Null Move Pruning
  if (depth >= 3 && !gs.isInCheck(gs.turn) && extensionCount === 0) {
    const prevState = { ep: gs.epSquare, hash: gs.currentHash, turn: gs.turn };
    gs.turn *= -1; gs.currentHash ^= zobristTurn; gs.epSquare = -1;
    const val = -alphaBeta(gs, depth - 3, -beta, -beta + 1, ply + 1, extensionCount);
    gs.turn = prevState.turn; gs.currentHash = prevState.hash; gs.epSquare = prevState.ep;
    if (val >= beta) return beta;
  }

  const moves = gs.generateMoves();
  if (moves.length === 0) {
    if (gs.isInCheck(gs.turn)) return -MATE_SCORE + ply;
    return 0;
  }

  moves.sort((a, b) => scoreMove(gs, b, hashMove, ply) - scoreMove(gs, a, hashMove, ply));

  let flag = TT_ALPHA, bestVal = -INF, bestM = 0, moveCount = 0;

  for (const m of moves) {
    const prevState = gs.makeMove(m);
    if (gs.isInCheck(gs.turn * -1)) {
      gs.undoMove(m, prevState); continue;
    }
    moveCount++;

    let val: number;
    let extension = 0;
    const isCheck = gs.isInCheck(gs.turn);
    if (isCheck && extensionCount < 2) extension = 1;

    if (moveCount === 1) {
      val = -alphaBeta(gs, depth - 1 + extension, -beta, -alpha, ply + 1, extensionCount + extension);
    } else {
      // Late Move Reductions (LMR)
      if (depth >= 3 && moveCount > 4 && !isCheck && !getCap(m) && !getPromo(m)) {
        val = -alphaBeta(gs, depth - 2, -alpha - 1, -alpha, ply + 1, extensionCount);
        if (val > alpha) val = -alphaBeta(gs, depth - 1 + extension, -beta, -alpha, ply + 1, extensionCount + extension);
      } else {
        val = -alphaBeta(gs, depth - 1 + extension, -beta, -alpha, ply + 1, extensionCount + extension);
      }
    }

    gs.undoMove(m, prevState);

    if (isSearchAborted) return 0;

    if (val > bestVal) { bestVal = val; bestM = m; }
    if (val >= beta) {
      let ts = val;
      if (ts > MATE_THRESHOLD) ts += ply; else if (ts < -MATE_THRESHOLD) ts -= ply;
      TT_KEYS[hashIdx] = gs.currentHash; TT_VALS[hashIdx] = ts; TT_MOVES[hashIdx] = m;
      TT_INFO[hashIdx] = (depth << 8) | TT_BETA;
      if (!getCap(m)) {
        killers[(ply << 1) + 1] = killers[ply << 1];
        killers[ply << 1] = m;
      }
      return val;
    }
    if (val > alpha) {
      alpha = val;
      flag = TT_EXACT;
      if (!getCap(m) && !isSummon(m)) {
        historyHeuristic[getFrom(m) * 64 + getTo(m)] += depth * depth;
      }
    }
  }

  if (moveCount === 0) {
    if (gs.isInCheck(gs.turn)) return -MATE_SCORE + ply;
    return 0;
  }

  let ts = bestVal;
  if (ts > MATE_THRESHOLD) ts += ply; else if (ts < -MATE_THRESHOLD) ts -= ply;
  TT_KEYS[hashIdx] = gs.currentHash; TT_VALS[hashIdx] = ts; TT_MOVES[hashIdx] = bestM;
  TT_INFO[hashIdx] = (depth << 8) | flag;
  return bestVal;
}

function getPV(gs: AiGameState, depth: number): number[] {
  const pv: number[] = [];
  const visited = new Set<bigint>();
  for (let i = 0; i < depth; i++) {
    if (visited.has(gs.currentHash)) break;
    visited.add(gs.currentHash);
    const hIdx = Number(gs.currentHash & BigInt(TT_SIZE - 1));
    if (TT_KEYS[hIdx] === gs.currentHash && TT_MOVES[hIdx]) {
      const m = TT_MOVES[hIdx]; pv.push(m); gs.makeMove(m);
    } else break;
  }
  // Simplified undo for PV (or just leave as is since we only use it for display)
  return pv;
}

const unpack = (m: number) => {
  if (!m) return null;
  return {
    type: isSummon(m) ? 'SUMMON' : 'MOVE',
    from: isSummon(m) ? -1 : getFrom(m),
    to: getTo(m),
    piece: ['', 'p', 'n', 'b', 'r', 'q', 'k'][getPiece(m)] as PieceType,
    captured: getCap(m),
    promo: getPromo(m) ? 'q' : '',
    enPassant: isEP(m)
  };
};

self.onmessage = (e) => {
  const { fen, depth: requestedDepth, accuracy = 100, requestId } = e.data;
  if (!zobristInitialized) initZobrist();
  searchStartTime = Date.now();
  searchMAX_TIME = 3500;
  isSearchAborted = false;

  const gs = new AiGameState(); gs.loadFen(fen);
  const maxSearchDepth = requestedDepth || 6;
  let lastBestMove = 0, finalVariations: any[] = [];

  // Clear history for new search
  historyHeuristic.fill(0);

  for (let d = 1; d <= maxSearchDepth; d++) {
    if (d > 1 && Date.now() - searchStartTime > searchMAX_TIME * 0.7) break;
    const val = alphaBeta(gs, d, -INF, INF, 0);
    if (isSearchAborted) break;

    // Always check for a best move at each completed depth
    const hIdx = Number(gs.currentHash & BigInt(TT_SIZE - 1));
    if (TT_KEYS[hIdx] === gs.currentHash && TT_MOVES[hIdx]) {
      lastBestMove = TT_MOVES[hIdx];
      const tempGs = new AiGameState(); tempGs.loadFen(fen);
      finalVariations = [{
        move: unpack(lastBestMove),
        evaluation: (gs.turn === 1) ? val : -val,
        pv: getPV(tempGs, d).map(unpack)
      }];
    }
  }

  const resultEvaluation = finalVariations[0]?.evaluation || 0;
  if (resultEvaluation < -MATE_SCORE + 1000) {
    self.postMessage({ type: 'RESIGN', requestId });
  } else {
    self.postMessage({
      type: 'MOVE',
      move: unpack(lastBestMove),
      evaluation: resultEvaluation,
      depth: maxSearchDepth,
      variations: finalVariations,
      requestId
    });
  }
};
