type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

// Duplicated logic from useChessEngine.ts to be self-contained in the worker
const EMPTY = 0;
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const WHITE = 1, BLACK = -1;
const INF = 100000000;
const PIECE_VALS = [0, 100, 350, 450, 500, 1100, 20000];

interface Move {
  type: 'MOVE' | 'SUMMON';
  from: number;
  to: number;
  piece: number;
  captured: number;
  promo: number;
  enPassant: boolean;
}

const CENTER_BONUS = new Int32Array(64);
for (let i = 0; i < 64; i++) {
  const x = i % 8, y = Math.floor(i / 8);
  CENTER_BONUS[i] = Math.floor((4 - Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5))) * 10);
}

// Transposition Table flags
const TT_EXACT = 0;
const TT_ALPHA = 1; // Upper bound (Fail-low)
const TT_BETA = 2;  // Lower bound (Fail-high)

interface TTEntry {
  hash: bigint;
  depth: number;
  score: number;
  flag: number;
  bestMove: Move | null;
}

const zobristBoard = Array.from({ length: 64 }, () => new BigUint64Array(13));
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
  zobristTurn = nextRand();
  zobristInitialized = true;
}

const TT_SIZE = 1 << 18;
const TT: (TTEntry | null)[] = new Array(TT_SIZE).fill(null);

class AiGameState {
  board: Int8Array = new Int8Array(64);
  reserve: Int8Array[] = [new Int8Array(7), new Int8Array(7)];
  kingPos: Int32Array = new Int32Array([-1, -1]); // [White, Black]
  turn: number = WHITE;
  epSquare: number = -1;
  currentHash: bigint = 0n;

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
        for (const char of s) {
          const l = char.toLowerCase();
          const type = l === 'p' ? PAWN : l === 'n' ? KNIGHT : l === 'b' ? BISHOP : l === 'r' ? ROOK : l === 'q' ? QUEEN : 0;
          if (type) this.reserve[side === WHITE ? 1 : 0][type]++;
        }
      };
      parse(deckParts[1], WHITE);
      parse(deckParts[2], BLACK);
    }
  }

  getSummonMask(side: number): boolean[] {
    const mask = new Array(64).fill(false);
    for (let i = 0; i < 64; i++) {
      const pVal = this.board[i];
      if (pVal === 0 || (side === WHITE && pVal < 0) || (side === BLACK && pVal > 0)) continue;
      const p = Math.abs(pVal);
      const x = i % 8, y = Math.floor(i / 8);
      if (p === PAWN) {
        const dy = side === WHITE ? 1 : -1;
        const ny = y + dy;
        if (ny >= 0 && ny <= 7) {
          const base = ny * 8;
          mask[base + x] = true;
          if (x > 0) mask[base + x - 1] = true;
          if (x < 7) mask[base + x + 1] = true;
        }
      } else if (p === KNIGHT || p === KING) {
        const dx = p === KNIGHT ? KNIGHT_DX : KING_DX;
        const dy = p === KNIGHT ? KNIGHT_DY : KING_DY;
        for (let k = 0; k < 8; k++) {
          const nx = x + dx[k], ny = y + dy[k];
          if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) mask[ny * 8 + nx] = true;
        }
      } else {
        const start = p === BISHOP ? 4 : 0;
        const end = p === ROOK ? 4 : 8;
        for (let d = start; d < end; d++) {
          const dx = ATTACK_DIRS[d][0], dy = ATTACK_DIRS[d][1];
          for (let s = 1; s < 8; s++) {
            const nx = x + dx * s, ny = y + dy * s;
            if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break;
            mask[ny * 8 + nx] = true;
            if (this.board[ny * 8 + nx] !== 0) break;
          }
        }
      }
    }
    return mask;
  }

  generateMoves(): Move[] {
    const moves: Move[] = [];
    const rIdx = this.turn === WHITE ? 1 : 0;
    const zone = this.getSummonMask(this.turn);
    for (let i = 0; i < 64; i++) {
      if (this.board[i] === EMPTY && zone[i]) {
        for (let p = 1; p <= 5; p++) {
          if (this.reserve[rIdx][p] > 0) {
            const y = Math.floor(i / 8);
            if (p === PAWN && (y === 0 || y === 7)) continue;
            moves.push({ type: 'SUMMON', from: -1, to: i, piece: p, captured: 0, promo: 0, enPassant: false });
          }
        }
      }
    }
    for (let i = 0; i < 64; i++) {
      const pVal = this.board[i];
      if (pVal === 0 || (this.turn === WHITE && pVal < 0) || (this.turn === BLACK && pVal > 0)) continue;
      const p = Math.abs(pVal);
      const x = i % 8, y = Math.floor(i / 8);
      if (p === PAWN) {
        const dy = (this.turn === WHITE) ? 1 : -1;
        if (y + dy >= 0 && y + dy <= 7 && this.board[(y + dy) * 8 + x] === 0) {
          const promo = (y + dy === 0 || y + dy === 7) ? 1 : 0;
          moves.push({ type: 'MOVE', from: i, to: (y + dy) * 8 + x, piece: p, captured: 0, promo, enPassant: false });
          if ((this.turn === WHITE && y === 1) || (this.turn === BLACK && y === 6)) {
            if (this.board[(y + dy * 2) * 8 + x] === 0) {
              moves.push({ type: 'MOVE', from: i, to: (y + dy * 2) * 8 + x, piece: p, captured: 0, promo: 0, enPassant: false });
            }
          }
        }
        for (const dx of [-1, 1]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx <= 7 && ny >= 0 && ny <= 7) {
            const target = this.board[ny * 8 + nx];
            if (target !== 0 && ((this.turn === WHITE && target < 0) || (this.turn === BLACK && target > 0))) {
              const promo = (ny === 0 || ny === 7) ? 1 : 0;
              moves.push({ type: 'MOVE', from: i, to: ny * 8 + nx, piece: p, captured: target, promo, enPassant: false });
            }
            if (this.epSquare === ny * 8 + nx) {
              moves.push({ type: 'MOVE', from: i, to: this.epSquare, piece: p, captured: 0, promo: 0, enPassant: true });
            }
          }
        }
      } else if (p === KNIGHT || p === KING) {
        const dxArr = p === KNIGHT ? [1, 2, 2, 1, -1, -2, -2, -1] : [1, 1, 1, 0, 0, -1, -1, -1];
        const dyArr = p === KNIGHT ? [2, 1, -1, -2, -2, -1, 1, 2] : [1, 0, -1, 1, -1, 1, 0, -1];
        for (let k = 0; k < 8; k++) {
          const nx = x + dxArr[k], ny = y + dyArr[k];
          if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
            const target = this.board[ny * 8 + nx];
            if (target === 0 || (this.turn === WHITE && target < 0) || (this.turn === BLACK && target > 0)) {
              moves.push({ type: 'MOVE', from: i, to: ny * 8 + nx, piece: p, captured: target, promo: 0, enPassant: false });
            }
          }
        }
      } else {
        const dirs = p === BISHOP ? [[-1, 1], [1, 1], [-1, -1], [1, -1]] :
          p === ROOK ? [[0, 1], [0, -1], [-1, 0], [1, 0]] :
            [[0, 1], [0, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [-1, -1], [1, -1]];
        for (const [dx, dy] of dirs) {
          for (let s = 1; s < 8; s++) {
            const nx = x + dx * s, ny = y + dy * s;
            if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break;
            const target = this.board[ny * 8 + nx];
            if (target === 0) {
              moves.push({ type: 'MOVE', from: i, to: ny * 8 + nx, piece: p, captured: 0, promo: 0, enPassant: false });
            } else {
              if ((this.turn === WHITE && target < 0) || (this.turn === BLACK && target > 0)) {
                moves.push({ type: 'MOVE', from: i, to: ny * 8 + nx, piece: p, captured: target, promo: 0, enPassant: false });
              }
              break;
            }
          }
        }
      }
    }
    return moves;
  }

  makeMove(m: Move) {
    const prevState = {
      ep: this.epSquare,
      hash: this.currentHash,
      capturedPiece: m.captured,
      capturedSq: m.to,
      oldKingPos: -1
    };

    if (m.type === 'SUMMON') {
      const rIdx = (this.turn === WHITE) ? 1 : 0;
      this.reserve[rIdx][m.piece]--;
      this.board[m.to] = m.piece * this.turn;
      this.updateHashSquare(m.to, 0, this.board[m.to]);
      this.epSquare = -1;
    } else {
      this.updateHashSquare(m.from, this.board[m.from], 0);
      const movingPiece = this.board[m.from];
      this.board[m.from] = 0;
      const placed = m.promo ? (this.turn === WHITE ? QUEEN : -QUEEN) : movingPiece;

      if (Math.abs(movingPiece) === KING) {
        prevState.oldKingPos = m.from;
        this.kingPos[this.turn === WHITE ? 0 : 1] = m.to;
      }

      if (m.captured && !m.enPassant) {
        this.updateHashSquare(m.to, m.captured, 0);
      }
      if (m.enPassant) {
        const capSq = m.to + (this.turn === WHITE ? -8 : 8);
        prevState.capturedSq = capSq;
        prevState.capturedPiece = this.board[capSq];
        this.updateHashSquare(capSq, this.board[capSq], 0);
        this.board[capSq] = 0;
      }

      this.board[m.to] = placed;
      this.updateHashSquare(m.to, 0, placed);
      this.epSquare = (Math.abs(movingPiece) === PAWN && Math.abs(m.from - m.to) === 16) ? (m.from + m.to) / 2 : -1;
    }
    this.turn *= -1;
    this.currentHash ^= zobristTurn;
    return prevState;
  }

  undoMove(m: Move, prevState: { ep: number, hash: bigint, capturedPiece: number, capturedSq: number, oldKingPos: number }) {
    this.turn *= -1;
    this.currentHash = prevState.hash;
    this.epSquare = prevState.ep;

    if (m.type === 'SUMMON') {
      const rIdx = (this.turn === WHITE) ? 1 : 0;
      this.reserve[rIdx][m.piece]++;
      this.updateHashSquare(m.to, this.board[m.to], 0);
      this.board[m.to] = 0;
    } else {
      const movingPiece = this.board[m.to];
      this.board[m.to] = 0;

      if (prevState.oldKingPos !== -1) {
        this.kingPos[this.turn === WHITE ? 0 : 1] = prevState.oldKingPos;
      }

      const originalPiece = m.promo ? (this.turn === WHITE ? PAWN : -PAWN) : movingPiece;
      this.board[m.from] = originalPiece;

      if (prevState.capturedPiece) {
        this.board[prevState.capturedSq] = prevState.capturedPiece;
      }
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

  evaluate(): number {
    let score = 0;

    const whiteKingPos = this.kingPos[0];
    const blackKingPos = this.kingPos[1];
    const wkX = whiteKingPos % 8, wkY = Math.floor(whiteKingPos / 8);
    const bkX = blackKingPos % 8, bkY = Math.floor(blackKingPos / 8);

    // 1. Piece Material & Position
    for (let i = 0; i < 64; i++) {
      const pVal = this.board[i];
      if (pVal === 0) continue;
      const p = Math.abs(pVal);
      const x = i % 8, y = Math.floor(i / 8);
      const side = pVal > 0 ? WHITE : BLACK;

      let v = PIECE_VALS[p];

      // Promotion bonus
      if (p === PAWN) {
        if ((side === WHITE && y === 6) || (side === BLACK && y === 1)) v += 100;
        if ((side === WHITE && y === 5) || (side === BLACK && y === 2)) v += 30;
      }

      // Center control bonus
      v += CENTER_BONUS[i];

      // King proximity bonus (Pressure on enemy king)
      if (side === WHITE) {
        const dist = Math.max(Math.abs(x - bkX), Math.abs(y - bkY));
        if (dist <= 2) v += (3 - dist) * 20;
        score += v;
      } else {
        const dist = Math.max(Math.abs(x - wkX), Math.abs(y - wkY));
        if (dist <= 2) v += (3 - dist) * 20;
        score -= v;
      }
    }

    // 2. Reserve Material & Tactical Potential
    const whiteSummonMask = this.getSummonMask(WHITE);
    const blackSummonMask = this.getSummonMask(BLACK);

    for (let p = 1; p <= 5; p++) {
      const wCount = this.reserve[1][p];
      const bCount = this.reserve[0][p];
      score += wCount * PIECE_VALS[p] * 1.1;
      score -= bCount * PIECE_VALS[p] * 1.1;

      // Special Tactical: Queen/Knight in reserve potential
      if (p === QUEEN || p === KNIGHT) {
        // Bonus for potential mating squares
        for (let k = 0; k < 8; k++) {
          const wnx = bkX + KING_DX[k], wny = bkY + KING_DY[k];
          if (wnx >= 0 && wnx < 8 && wny >= 0 && wny < 8 && whiteSummonMask[wny * 8 + wnx]) {
            score += p === QUEEN ? 150 : 80; // Reward being able to summon near enemy king
          }
          const bnx = wkX + KING_DX[k], bny = wkY + KING_DY[k];
          if (bnx >= 0 && bnx < 8 && bny >= 0 && bny < 8 && blackSummonMask[bny * 8 + bnx]) {
            score -= p === QUEEN ? 150 : 80;
          }
        }
      }
    }

    // 3. King Safety & Trap Detection
    const wMobility = this.getKingMobility(WHITE);
    const bMobility = this.getKingMobility(BLACK);

    // Each mobility square is important, but having 0 mobility is catastrophic
    score += (wMobility - bMobility) * 35;
    if (wMobility === 0) score -= 400;
    if (bMobility === 0) score += 400;

    const whiteInCheck = this.isInCheck(WHITE);
    const blackInCheck = this.isInCheck(BLACK);

    if (whiteInCheck) {
      if (wMobility === 0) score -= 8000; // Almost mate
      else score -= 500;
    }
    if (blackInCheck) {
      if (bMobility === 0) score += 8000; // Almost mate
      else score += 500;
    }

    // "99% Win" pattern: Knight Check on Trapped King
    // If black king mobility is 0 or 1, and white can summon or move a knight to check
    if (bMobility <= 1) {
      // Check if any white knight (on board or in reserve) can check black king
      let whiteHasKnightCheck = false;
      // Reserve check
      if (this.reserve[1][KNIGHT] > 0) {
        // Find if any knight move from black king pos hits a white summon square
        for (let k = 0; k < 8; k++) {
          const checkSq = bkX + KNIGHT_DX[k] + (bkY + KNIGHT_DY[k]) * 8;
          if (bkX + KNIGHT_DX[k] >= 0 && bkX + KNIGHT_DX[k] < 8 && bkY + KNIGHT_DY[k] >= 0 && bkY + KNIGHT_DY[k] < 8) {
            if (whiteSummonMask[checkSq]) { whiteHasKnightCheck = true; break; }
          }
        }
      }
      if (whiteHasKnightCheck) score += 1500;
    }

    if (wMobility <= 1) {
      let blackHasKnightCheck = false;
      if (this.reserve[0][KNIGHT] > 0) {
        for (let k = 0; k < 8; k++) {
          const checkSq = wkX + KNIGHT_DX[k] + (wkY + KNIGHT_DY[k]) * 8;
          if (wkX + KNIGHT_DX[k] >= 0 && wkX + KNIGHT_DX[k] < 8 && wkY + KNIGHT_DY[k] >= 0 && wkY + KNIGHT_DY[k] < 8) {
            if (blackSummonMask[checkSq]) { blackHasKnightCheck = true; break; }
          }
        }
      }
      if (blackHasKnightCheck) score -= 1500;
    }

    return this.turn === WHITE ? score : -score;
  }
}

const MATE_SCORE = 50000;

function scoreMove(gs: AiGameState, m: Move, hashM: Move | null, killers: (Move | null)[]): number {
  if (hashM && m.type === hashM.type && m.from === hashM.from && m.to === hashM.to && m.piece === hashM.piece) return 1000000;

  if (m.captured) {
    return 100000 + (PIECE_VALS[Math.abs(m.captured)] * 10) - PIECE_VALS[m.piece];
  }

  // Bonus for summons near the opponent's king (Requested by user)
  if (m.type === 'SUMMON') {
    const oppKingPos = gs.kingPos[gs.turn === WHITE ? 1 : 0];
    const kx = oppKingPos % 8, ky = Math.floor(oppKingPos / 8);
    const tx = m.to % 8, ty = Math.floor(m.to / 8);
    const dist = Math.max(Math.abs(tx - kx), Math.abs(ty - ky));

    // Pattern 1: Queen proximity
    if (dist <= 1) {
      if (m.piece === QUEEN) return 95000; // Extreme priority
      return 90000 + PIECE_VALS[m.piece];
    }

    // Pattern 2: Knight Check on Trapped King
    if (m.piece === KNIGHT) {
      // Check if this summon square checks the king
      const dx = Math.abs(tx - kx), dy = Math.abs(ty - ky);
      if ((dx === 1 && dy === 2) || (dx === 2 && dy === 1)) {
        const mobility = gs.getKingMobility(gs.turn === WHITE ? -1 : 1);
        if (mobility <= 1) return 96000; // Even higher priority than Queen!
        return 85000;
      }
    }

    if (dist <= 2) return 80000 + PIECE_VALS[m.piece];
    return 10000 + PIECE_VALS[m.piece];
  }

  for (let i = 0; i < killers.length; i++) {
    const km = killers[i];
    if (km && m.type === km.type && m.from === km.from && m.to === km.to && m.piece === km.piece) {
      return 9000 - i;
    }
  }

  if (m.promo) return 9500;
  return 0;
}

function quiescence(gs: AiGameState, alpha: number, beta: number): number {
  const standPat = gs.evaluate();
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;

  const moves = gs.generateMoves().filter(m => m.captured !== 0 || m.promo !== 0);
  moves.sort((a, b) => scoreMove(gs, b, null, [null, null]) - scoreMove(gs, a, null, [null, null]));

  for (const m of moves) {
    const prevState = gs.makeMove(m);
    if (gs.isInCheck(gs.turn * -1)) {
      gs.undoMove(m, prevState);
      continue;
    }
    const val = -quiescence(gs, -beta, -alpha);
    gs.undoMove(m, prevState);

    if (val >= beta) return beta;
    if (val > alpha) alpha = val;
  }
  return alpha;
}

const killers: (Move | null)[][] = Array.from({ length: 32 }, () => [null, null]);

const MATE_THRESHOLD = 40000;

function alphaBeta(gs: AiGameState, depth: number, alpha: number, beta: number, ply: number, extensionCount: number = 0): number {
  if (depth <= 0) return quiescence(gs, alpha, beta);

  const hashIdx = Number(gs.currentHash % BigInt(TT_SIZE));
  const entry = TT[hashIdx];
  let hashMove: Move | null = null;
  if (entry && entry.hash === gs.currentHash) {
    let score = entry.score;
    if (score > MATE_THRESHOLD) score -= ply;
    else if (score < -MATE_THRESHOLD) score += ply;

    if (entry.depth >= depth) {
      if (entry.flag === TT_EXACT) return score;
      if (entry.flag === TT_ALPHA && score <= alpha) return alpha;
      if (entry.flag === TT_BETA && score >= beta) return beta;
    }
    hashMove = entry.bestMove;
  }

  // Null Move Pruning
  if (depth >= 3 && !gs.isInCheck(gs.turn) && extensionCount === 0) {
    const prevState = {
      ep: gs.epSquare,
      hash: gs.currentHash,
      turn: gs.turn
    };
    gs.turn *= -1;
    gs.currentHash ^= zobristTurn;
    gs.epSquare = -1;
    const val = -alphaBeta(gs, depth - 3, -beta, -beta + 1, ply + 1, extensionCount);
    gs.turn = prevState.turn;
    gs.currentHash = prevState.hash;
    gs.epSquare = prevState.ep;
    if (val >= beta) return beta;
  }

  const moves = gs.generateMoves();
  if (moves.length === 0) {
    if (gs.isInCheck(gs.turn)) return -MATE_SCORE + ply;
    return 0;
  }

  const layerKillers = killers[depth] || [null, null];
  moves.sort((a, b) => scoreMove(gs, b, hashMove, layerKillers) - scoreMove(gs, a, hashMove, layerKillers));

  let flag = TT_ALPHA;
  let bestVal = -INF;
  let bestM: Move | null = null;
  let moveCount = 0;

  for (const m of moves) {
    const prevState = gs.makeMove(m);

    if (gs.isInCheck(gs.turn * -1)) {
      gs.undoMove(m, prevState);
      continue;
    }

    moveCount++;

    // Check Extension: If this move delivers a check, extend depth (limit 2 extensions)
    let extension = 0;
    const isCheck = gs.isInCheck(gs.turn);
    if (isCheck && extensionCount < 2) {
      extension = 1;
    }

    const val = -alphaBeta(gs, depth - 1 + extension, -beta, -alpha, ply + 1, extensionCount + extension);
    gs.undoMove(m, prevState);

    if (val > bestVal) {
      bestVal = val;
      bestM = m;
    }
    if (val >= beta) {
      let ttScore = val;
      if (ttScore > MATE_THRESHOLD) ttScore += ply;
      else if (ttScore < -MATE_THRESHOLD) ttScore -= ply;

      TT[hashIdx] = { hash: gs.currentHash, depth, score: ttScore, flag: TT_BETA, bestMove: m };
      if (!m.captured && depth < 32) {
        killers[depth][1] = killers[depth][0];
        killers[depth][0] = m;
      }
      return val;
    }
    if (val > alpha) {
      alpha = val;
      flag = TT_EXACT;
    }
  }

  if (moveCount === 0) {
    if (gs.isInCheck(gs.turn)) return -MATE_SCORE + ply;
    return 0;
  }

  let ttScore = bestVal;
  if (ttScore > MATE_THRESHOLD) ttScore += ply;
  else if (ttScore < -MATE_THRESHOLD) ttScore -= ply;
  TT[hashIdx] = { hash: gs.currentHash, depth, score: ttScore, flag, bestMove: bestM };
  return bestVal;
}

function getPV(gs: AiGameState, depth: number): { move: Move, fen: string }[] {
  const pv: { move: Move, fen: string }[] = [];
  const stateStack: any[] = [];
  const visited = new Set<bigint>();

  for (let i = 0; i < depth; i++) {
    if (visited.has(gs.currentHash)) break;
    visited.add(gs.currentHash);

    const hashIdx = Number(gs.currentHash % BigInt(TT_SIZE));
    const entry = TT[hashIdx];

    if (entry && entry.hash === gs.currentHash && entry.bestMove) {
      const move = entry.bestMove;
      const prevState = gs.makeMove(move);
      pv.push({ move, fen: "" });
      stateStack.push({ move, state: prevState });
    } else {
      break;
    }
  }

  for (let i = stateStack.length - 1; i >= 0; i--) {
    gs.undoMove(stateStack[i].move, stateStack[i].state);
  }

  return pv;
}

self.onmessage = (e) => {
  const { fen, depth: requestedDepth, accuracy = 100, requestId } = e.data;
  initZobrist();
  const startTime = Date.now();

  const gs = new AiGameState();
  gs.loadFen(fen);

  const maxSearchDepth = requestedDepth || 6; // Use requested depth or default to 6
  let lastBestMove: Move | null = null;
  let finalVariations: any[] = [];
  const MAX_TIME = 3500; // Hard time limit of 3.5 seconds per search

  for (let d = 1; d <= maxSearchDepth; d++) {
    const currentTime = Date.now();
    if (d > 1 && currentTime - startTime > MAX_TIME * 0.7) break;

    const moves = gs.generateMoves();
    if (moves.length === 0) break;

    // Sort moves based on previous depth or TT
    const hashIdx = Number(gs.currentHash % BigInt(TT_SIZE));
    const entry = TT[hashIdx];
    const hashM = entry?.bestMove || null;
    moves.sort((a, b) => scoreMove(gs, b, hashM, killers[d] || [null, null]) - scoreMove(gs, a, hashM, killers[d] || [null, null]));

    if (d < maxSearchDepth) {
      // Intermediate depths: Just find best move to populate TT and order moves
      alphaBeta(gs, d, -INF, INF, 0);
      continue;
    }

    // Final depth: Full Multi-PV search
    const variations: { move: Move, evaluation: number, pv: Move[] }[] = [];

    for (const m of moves) {
      if (d > 1 && Date.now() - startTime > MAX_TIME) break;

      const prevState = gs.makeMove(m);
      if (gs.isInCheck(gs.turn * -1)) {
        gs.undoMove(m, prevState);
        continue;
      }

      // Use a slightly smaller depth for non-best moves if we are short on time? 
      // No, for review we want consistency.
      const val = -alphaBeta(gs, d - 1, -INF, INF, 1);
      gs.undoMove(m, prevState);

      variations.push({
        move: m,
        evaluation: (gs.turn === 1) ? val : -val,
        pv: [m, ...getPV(gs, d - 1).map(v => v.move)]
      });
    }

    variations.sort((a, b) => {
      if (gs.turn === 1) return b.evaluation - a.evaluation;
      return a.evaluation - b.evaluation;
    });

    if (variations.length > 0) {
      finalVariations = variations;
      lastBestMove = variations[0].move;

      const bestEval = variations[0].evaluation;
      const isWinningMate = (gs.turn === 1 && bestEval > MATE_SCORE - 100) || (gs.turn === -1 && bestEval < -MATE_SCORE + 100);
      if (isWinningMate && d >= 4) break;
    }
  }

  // Pick move based on accuracy at the final depth searched
  let resultMove = lastBestMove;
  let resultEvaluation = 0;
  let resultVariations = finalVariations;

  if (finalVariations.length > 0) {
    resultEvaluation = finalVariations[0].evaluation;

    if (accuracy < 100) {
      const targetLoss = -200 * Math.log(accuracy / 100);
      let minDiff = Infinity;

      for (const v of finalVariations) {
        const loss = (finalVariations[0].evaluation - v.evaluation) * (gs.turn === 1 ? 1 : -1);
        const diff = Math.abs(loss - targetLoss);
        if (diff < minDiff) {
          minDiff = diff;
          resultMove = v.move;
          resultEvaluation = v.evaluation;
        }
      }
    }
  }

  // Final response
  const perspectiveEval = (gs.turn === 1) ? resultEvaluation : -resultEvaluation;

  // If AI is totally lost (mate in sight), it might resign
  if (perspectiveEval < -MATE_SCORE + 1000) {
    self.postMessage({ type: 'RESIGN', requestId });
  } else {
    self.postMessage({
      type: 'MOVE',
      move: resultMove,
      evaluation: resultEvaluation,
      depth: maxSearchDepth,
      variations: resultVariations.slice(0, 10), // Return top 10 variations
      requestId
    });
  }

  console.log(`AI search finished in ${Date.now() - startTime}ms. Depth: ${maxSearchDepth}, Accuracy: ${accuracy}%, Eval: ${resultEvaluation}`);
};
