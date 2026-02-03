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
      v += CENTER_BONUS[i];

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

function scoreMove(gs: AiGameState, m: Move, hashM: Move | null, killers: (Move | null)[]): number {
  if (hashM && m.type === hashM.type && m.from === hashM.from && m.to === hashM.to && m.piece === hashM.piece) return 100000;

  if (m.captured) {
    return 10000 + (PIECE_VALS[Math.abs(m.captured)] * 10) - PIECE_VALS[m.piece];
  }

  for (let i = 0; i < killers.length; i++) {
    const km = killers[i];
    if (km && m.type === km.type && m.from === km.from && m.to === km.to && m.piece === km.piece) {
      return 9000 - i;
    }
  }

  if (m.promo) return 8000;
  if (m.type === 'SUMMON') return 1000;
  return 0;
}

function quiescence(gs: AiGameState, alpha: number, beta: number): number {
  const standPat = gs.evaluate();
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;

  const moves = gs.generateMoves().filter(m => m.captured !== 0 || m.promo !== 0);
  // Basic MVV/LVA for quiescence sorting
  moves.sort((a, b) => {
    const scoreA = a.captured ? (PIECE_VALS[Math.abs(a.captured)] * 10 - PIECE_VALS[a.piece]) : 0;
    const scoreB = b.captured ? (PIECE_VALS[Math.abs(b.captured)] * 10 - PIECE_VALS[b.piece]) : 0;
    return scoreB - scoreA;
  });

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

const killers: (Move | null)[][] = Array.from({ length: 20 }, () => [null, null]);

function alphaBeta(gs: AiGameState, depth: number, alpha: number, beta: number): number {
  if (depth <= 0) return quiescence(gs, alpha, beta);

  const hashIdx = Number(gs.currentHash % BigInt(TT_SIZE));
  const entry = TT[hashIdx];
  let hashMove: Move | null = null;
  if (entry && entry.hash === gs.currentHash) {
    if (entry.depth >= depth) {
      if (entry.flag === TT_EXACT) return entry.score;
      if (entry.flag === TT_ALPHA && entry.score <= alpha) return alpha;
      if (entry.flag === TT_BETA && entry.score >= beta) return beta;
    }
    hashMove = entry.bestMove;
  }

  const moves = gs.generateMoves();
  if (moves.length === 0) {
    if (gs.isInCheck(gs.turn)) return -MATE_SCORE - depth;
    return 0;
  }

  // Sort moves using hash move and killers
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
    const val = -alphaBeta(gs, depth - 1, -beta, -alpha);
    gs.undoMove(m, prevState);

    if (val > bestVal) {
      bestVal = val;
      bestM = m;
    }
    if (val >= beta) {
      TT[hashIdx] = { hash: gs.currentHash, depth, score: val, flag: TT_BETA, bestMove: m };
      // Update killers
      if (!m.captured) {
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
    if (gs.isInCheck(gs.turn)) return -MATE_SCORE - depth;
    return 0;
  }

  TT[hashIdx] = { hash: gs.currentHash, depth, score: bestVal, flag, bestMove: bestM };
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

  // Undo moves to restore state
  for (let i = stateStack.length - 1; i >= 0; i--) {
    gs.undoMove(stateStack[i].move, stateStack[i].state);
  }

  return pv;
}

self.onmessage = (e) => {
  const { fen } = e.data;
  initZobrist();
  console.log('AI starting search for FEN:', fen);
  const startTime = Date.now();

  const gs = new AiGameState();
  gs.loadFen(fen);

  const maxDepth = 4;
  let lastBestMove: Move | null = null;
  let finalVariations: any[] = [];

  for (let d = 1; d <= maxDepth; d++) {
    const moves = gs.generateMoves();
    if (moves.length === 0) break;

    // Use results from previous depth for ordering
    const hashIdx = Number(gs.currentHash % BigInt(TT_SIZE));
    const entry = TT[hashIdx];
    const hashM = entry?.bestMove || null;
    moves.sort((a, b) => scoreMove(gs, b, hashM, killers[d] || [null, null]) - scoreMove(gs, a, hashM, killers[d] || [null, null]));

    const variations: { move: Move, evaluation: number, pv: Move[] }[] = [];

    for (const m of moves) {
      const prevState = gs.makeMove(m);
      if (gs.isInCheck(gs.turn * -1)) {
        gs.undoMove(m, prevState);
        continue;
      }

      const val = -alphaBeta(gs, d - 1, -INF, INF);
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
      lastBestMove = variations[0].move;
      finalVariations = variations.slice(0, 5);
    }

    console.log(`Depth ${d} finished. Best move:`, lastBestMove);
  }

  const topVariations = finalVariations;
  const bestM = lastBestMove;
  const maxVal = topVariations[0]?.evaluation || 0;
  const perspectiveMaxVal = (gs.turn === 1) ? maxVal : -maxVal;

  if (!bestM && finalVariations.length === 0) {
    if (gs.isInCheck(gs.turn)) {
      self.postMessage({ type: 'RESIGN' });
    } else {
      self.postMessage({ type: 'MOVE', move: null });
    }
    return;
  }

  // Resignation check
  if (perspectiveMaxVal < -MATE_SCORE + 100) {
    self.postMessage({ type: 'RESIGN' });
  } else {
    self.postMessage({
      type: 'MOVE',
      move: bestM,
      evaluation: topVariations[0]?.evaluation,
      depth: maxDepth,
      variations: topVariations
    });
  }

  console.log(`AI search finished in ${Date.now() - startTime}ms.`);
};
