import React from 'react';
import styles from './Board.module.css';
import { ChessPieces } from './ChessPieces';
import { PieceType, PieceColor } from '@/lib/game/types';
import clsx from 'clsx'; // Assuming usage even if vanilla css, clsx helps with class composition.
// If clsx not installed, I'll use template strings. I installed it.

interface BoardProps {
  fen: string;
  onSquareClick: (square: string) => void;
  selectedSquare: string | null;
  validTargetSquares: string[]; // for moves or summons
  orientation?: 'w' | 'b';
  lastMove?: { from: string; to: string } | null;
}

// FEN Parser helper
function fenToBoard(fen: string) {
  const [placement] = fen.split(' ');
  const rows = placement.split('/');
  const board: ({ type: PieceType; color: PieceColor } | null)[][] = [];

  for (const row of rows) {
    const boardRow: ({ type: PieceType; color: PieceColor } | null)[] = [];
    for (const char of row) {
      if (isNaN(parseInt(char))) {
        const color = char === char.toUpperCase() ? 'w' : 'b';
        const type = char.toLowerCase() as PieceType;
        boardRow.push({ type, color });
      } else {
        const emptyCount = parseInt(char);
        for (let i = 0; i < emptyCount; i++) {
          boardRow.push(null);
        }
      }
    }
    board.push(boardRow);
  }
  return board;
}

export default function Board({
  fen,
  onSquareClick,
  selectedSquare,
  validTargetSquares,
  orientation = 'w',
  lastMove,
}: BoardProps) {
  const board = fenToBoard(fen); // 8x8 (Rank 8 to 1)

  // Determine squares to render based on orientation
  // Default: Rank 8 (index 0) to Rank 1 (index 7).
  // If Black orientation: Rank 1 (index 7) to Rank 8 (index 0).
  // Also Files: A-H vs H-A.

  const renderSquares = () => {
    const squares = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        // Map visual row/col to actual board indices
        // Board array: row 0 is Rank 8. col 0 is File a.

        let rankIndex = r;
        let fileIndex = c;

        if (orientation === 'b') {
          rankIndex = 7 - r;
          fileIndex = 7 - c;
        }

        const piece = board[rankIndex][fileIndex];
        const rankLabel = 8 - rankIndex; // 8, 7, ... 1
        const fileLabel = String.fromCharCode(97 + fileIndex); // a, b, ... h
        const squareId = `${fileLabel}${rankLabel}`;

        const isLight = (rankIndex + fileIndex) % 2 === 0;
        const isSelected = selectedSquare === squareId;
        const isTarget = validTargetSquares.includes(squareId);
        const isLastMoveFrom = lastMove?.from === squareId;
        const isLastMoveTo = lastMove?.to === squareId;

        const PieceComponent = piece
          ? ChessPieces[piece.color][piece.type]
          : null;

        squares.push(
          <div
            key={squareId}
            className={clsx(styles.square, isLight ? styles.white : styles.black, {
              [styles.selected]: isSelected || isLastMoveFrom || isLastMoveTo,
            })}
            onClick={() => onSquareClick(squareId)}
          >
            {/* Coordinate Labels */}
            {fileIndex === 0 && orientation === 'w' && (
              <span className={clsx(styles.label, styles.rankLabel)}>{rankLabel}</span>
            )}
            {fileIndex === 7 && orientation === 'b' && (
              <span className={clsx(styles.label, styles.rankLabel)}>{rankLabel}</span>
            )}

            {rankIndex === 7 && orientation === 'w' && (
              <span className={clsx(styles.label, styles.fileLabel)}>{fileLabel}</span>
            )}
            {rankIndex === 0 && orientation === 'b' && (
              <span className={clsx(styles.label, styles.fileLabel)}>{fileLabel}</span>
            )}

            {isTarget && !piece && <div className={styles.highlight} />}
            {isTarget && piece && <div className={styles.highlightCapture} />}

            {PieceComponent && <PieceComponent className={styles.piece} />}
          </div>
        );
      }
    }
    return squares;
  };

  return <div className={styles.board}>{renderSquares()}</div>;
}
