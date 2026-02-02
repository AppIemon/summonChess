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
    this.reserve[0].fill(0);
    this.reserve[1].fill(0);
    this.currentHash = 0n;
    this.epSquare = -1;

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
        if (y + dy >= 0 && y + dy <= 7) {
          mask[(y + dy) * 8 + x] = true;
          if (x > 0) mask[(y + dy) * 8 + x - 1] = true;
          if (x < 7) mask[(y + dy) * 8 + x + 1] = true;
        }
      } else if (p === KNIGHT || p === KING) {
        const dx = p === KNIGHT ? [1, 2, 2, 1, -1, -2, -2, -1] : [1, 1, 1, 0, 0, -1, -1, -1];
        const dy = p === KNIGHT ? [2, 1, -1, -2, -2, -1, 1, 2] : [1, 0, -1, 1, -1, 1, 0, -1];
        for (let k = 0; k < 8; k++) {
          const nx = x + dx[k], ny = y + dy[k];
          if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) mask[ny * 8 + nx] = true;
        }
      } else {
        const dirs = p === BISHOP ? [[-1, 1], [1, 1], [-1, -1], [1, -1]] :
          p === ROOK ? [[0, 1], [0, -1], [-1, 0], [1, 0]] :
            [[0, 1], [0, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [-1, -1], [1, -1]];
        for (const [dx, dy] of dirs) {
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
    if (m.type === 'SUMMON') {
      const rIdx = (this.turn === WHITE) ? 1 : 0;
      this.reserve[rIdx][m.piece]--;
      this.board[m.to] = m.piece * this.turn;
      this.updateHashSquare(m.to, 0, this.board[m.to]);
      this.epSquare = -1;
    } else {
      this.updateHashSquare(m.from, this.board[m.from], 0);
      this.board[m.from] = 0;
      const placed = m.promo ? QUEEN : m.piece;
      if (m.captured && !m.enPassant) {
        this.updateHashSquare(m.to, m.captured, 0);
      }
      if (m.enPassant) {
        const capSq = m.to + (this.turn === WHITE ? -8 : 8);
        this.updateHashSquare(capSq, this.board[capSq], 0);
        this.board[capSq] = 0;
      }
      this.board[m.to] = placed * this.turn;
      this.updateHashSquare(m.to, 0, this.board[m.to]);
      this.epSquare = (m.piece === PAWN && Math.abs(m.from - m.to) === 16) ? (m.from + m.to) / 2 : -1;
    }
    this.turn *= -1;
    this.currentHash ^= zobristTurn;
  }

  undoMove(m: Move, prevState: { ep: number, hash: bigint, reserve: Int8Array[], board: Int8Array }) {
    this.board.set(prevState.board);
    this.reserve[0].set(prevState.reserve[0]);
    this.reserve[1].set(prevState.reserve[1]);
    this.turn *= -1;
    this.epSquare = prevState.ep;
    this.currentHash = prevState.hash;
  }

  captureState() {
    return {
      ep: this.epSquare,
      hash: this.currentHash,
      reserve: [new Int8Array(this.reserve[0]), new Int8Array(this.reserve[1])],
      board: new Int8Array(this.board)
    };
  }

  isInCheck(color: number): boolean {
    let kingPos = -1;
    for (let i = 0; i < 64; i++) {
      if (this.board[i] === KING * color) { kingPos = i; break; }
    }
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
    const nDx = [1, 2, 2, 1, -1, -2, -2, -1], nDy = [2, 1, -1, -2, -2, -1, 1, 2];
    for (let k = 0; k < 8; k++) {
      const nx = x + nDx[k], ny = y + nDy[k];
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
        if (this.board[ny * 8 + nx] === KNIGHT * color) return true;
      }
    }
    // King
    const kDx = [1, 1, 1, 0, 0, -1, -1, -1], kDy = [1, 0, -1, 1, -1, 1, 0, -1];
    for (let k = 0; k < 8; k++) {
      const nx = x + kDx[k], ny = y + kDy[k];
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
        if (this.board[ny * 8 + nx] === KING * color) return true;
      }
    }
    // Sliders
    const dirs = [[0, 1], [0, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [-1, -1], [1, -1]];
    for (let d = 0; d < 8; d++) {
      const dx = dirs[d][0], dy = dirs[d][1];
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

  evaluate(): number {
    let score = 0;

    // 1. Piece Material & Position
    let whiteMaterial = 0;
    let blackMaterial = 0;

    for (let i = 0; i < 64; i++) {
      if (this.board[i] === 0) continue;
      const p = Math.abs(this.board[i]);
      const x = i % 8, y = Math.floor(i / 8);
      const side = this.board[i] > 0 ? WHITE : BLACK;

      let v = PIECE_VALS[p];

      // Promotion bonus
      if (p === PAWN) {
        if ((side === WHITE && y === 6) || (side === BLACK && y === 1)) v += 100;
        if ((side === WHITE && y === 5) || (side === BLACK && y === 2)) v += 30;
      }

      // Center control bonus
      const distToCenter = Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5));
      v += (4 - distToCenter) * 10;

      if (side === WHITE) whiteMaterial += v;
      else blackMaterial += v;
    }

    score = whiteMaterial - blackMaterial;

    // 2. Reserve Material - Slightly higher weight to encourage conservation
    for (let p = 1; p <= 5; p++) {
      score += this.reserve[1][p] * PIECE_VALS[p] * 1.05;
      score -= this.reserve[0][p] * PIECE_VALS[p] * 1.05;
    }

    // 3. Move logic penalty/bonus
    // (Removed expensive mobility check)

    // 4. Check & King Safety
    const whiteInCheck = this.isInCheck(WHITE);
    const blackInCheck = this.isInCheck(BLACK);

    if (whiteInCheck) score -= 150;
    if (blackInCheck) score += 150;

    return this.turn === WHITE ? score : -score;
  }
}

const MATE_SCORE = 50000;

function scoreMove(gs: AiGameState, m: Move): number {
  if (m.type === 'SUMMON') return 20; // Slightly higher base for summons
  let score = 0;

  // Captures: MVV/LVA
  if (m.captured) {
    score = 1000 + (PIECE_VALS[Math.abs(m.captured)] * 10) - PIECE_VALS[m.piece];
  }

  // Promotions
  if (m.promo) score += 900;

  // Prioritize Checks in move ordering
  const prevState = gs.captureState();
  gs.makeMove(m);
  if (gs.isInCheck(gs.turn * -1)) {
    score += 1500;
  }
  gs.undoMove(m, prevState);

  return score;
}

function quiescence(gs: AiGameState, alpha: number, beta: number): number {
  const standPat = gs.evaluate();
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;

  const moves = gs.generateMoves().filter(m => m.captured !== 0 || m.promo !== 0);
  moves.sort((a, b) => scoreMove(gs, b) - scoreMove(gs, a));

  for (const m of moves) {
    const prevState = gs.captureState();
    gs.makeMove(m);
    const val = -quiescence(gs, -beta, -alpha);
    gs.undoMove(m, prevState);

    if (val >= beta) return beta;
    if (val > alpha) alpha = val;
  }
  return alpha;
}

function alphaBeta(gs: AiGameState, depth: number, alpha: number, beta: number): number {
  if (depth === 0) return quiescence(gs, alpha, beta);

  const hashIdx = Number(gs.currentHash % BigInt(TT_SIZE));
  const entry = TT[hashIdx];
  if (entry && entry.hash === gs.currentHash && entry.depth >= depth) {
    if (entry.flag === TT_EXACT) return entry.score;
    if (entry.flag === TT_ALPHA && entry.score <= alpha) return alpha;
    if (entry.flag === TT_BETA && entry.score >= beta) return beta;
  }

  const moves = gs.generateMoves();
  if (moves.length === 0) {
    // If in check and no moves, it's checkmate
    if (gs.isInCheck(gs.turn)) return -MATE_SCORE - depth;
    return 0; // Stalemate
  }

  moves.sort((a, b) => scoreMove(gs, b) - scoreMove(gs, a));

  let flag = 1;
  let bestVal = -INF;
  let bestM: Move | null = null;

  for (const m of moves) {
    const prevState = gs.captureState();
    gs.makeMove(m);

    if (gs.isInCheck(gs.turn * -1)) {
      gs.undoMove(m, prevState);
      continue;
    }

    const val = -alphaBeta(gs, depth - 1, -beta, -alpha);
    gs.undoMove(m, prevState);

    if (val > bestVal) {
      bestVal = val;
      bestM = m;
    }
    if (val >= beta) {
      TT[hashIdx] = { hash: gs.currentHash, depth, score: val, flag: TT_BETA, bestMove: m };
      return val;
    }
    if (val > alpha) {
      alpha = val;
      flag = TT_EXACT;
    }
  }

  TT[hashIdx] = { hash: gs.currentHash, depth, score: bestVal, flag, bestMove: bestM };
  return bestVal;
}

self.onmessage = (e) => {
  const { fen } = e.data;
  initZobrist();
  console.log('AI starting search for FEN:', fen);
  const startTime = Date.now();

  const gs = new AiGameState();
  gs.loadFen(fen);

  const depth = 4; // Increased from 3 to 4 as requested
  let alpha = -INF;
  let beta = INF;

  const moves = gs.generateMoves();
  console.log(`AI found ${moves.length} legal moves`);
  if (moves.length === 0) {
    self.postMessage({ type: 'MOVE', move: null });
    return;
  }

  // Pre-sort moves
  moves.sort((a, b) => scoreMove(gs, b) - scoreMove(gs, a));

  let bestM = moves[0];
  let maxVal = -INF;

  for (const m of moves) {
    const prevState = gs.captureState();
    gs.makeMove(m);

    if (gs.isInCheck(gs.turn * -1)) {
      gs.undoMove(m, prevState);
      continue;
    }

    const val = -alphaBeta(gs, depth - 1, -beta, -alpha);
    gs.undoMove(m, prevState);

    if (val > maxVal) {
      maxVal = val;
      bestM = m;
    }
    alpha = Math.max(alpha, val);
  }

  if (maxVal === -INF) {
    // No legal moves - checkmate or stalemate
    if (gs.isInCheck(gs.turn)) {
      self.postMessage({ type: 'RESIGN' });
    } else {
      self.postMessage({ type: 'MOVE', move: null });
    }
    return;
  }

  const bestMoveStr = bestM.type === 'SUMMON' ? `SUMMON ${bestM.piece} to ${bestM.to}` : `MOVE ${bestM.from}->${bestM.to}`;
  console.log(`AI search finished. Best move: ${bestMoveStr}. Score: ${maxVal}. Time: ${Date.now() - startTime}ms`);

  // Resignation check
  if (maxVal < -MATE_SCORE + 100) {
    self.postMessage({ type: 'RESIGN' });
  } else {
    // Convert score to standard "White perspective" score
    // maxVal is always relative to the side to move (gs.turn)
    // If turn is White, positive maxVal means White is winning.
    // If turn is Black, positive maxVal means Black is winning.
    // We want positive = White advantage, negative = Black advantage.

    // However, traditionally engines return score relative to side to move. 
    // But UI usually wants relative to White or "Absolute Advantage".
    // Let's return standard "White is positive" score.
    const standardScore = (gs.turn === 1 /* WHITE */) ? maxVal : -maxVal;

    self.postMessage({ type: 'MOVE', move: bestM, evaluation: standardScore });
  }
};
