import React from 'react';
import styles from './Board.module.css';
import { ChessPieces } from './ChessPieces';
import { PieceType, PieceColor } from '@/lib/game/types';
import clsx from 'clsx';

interface BoardProps {
  fen: string;
  onSquareClick: (square: string) => void;
  selectedSquare: string | null;
  validTargetSquares: string[];
  orientation?: 'w' | 'b';
  lastMove?: { from: string; to: string } | null;
  isCheckmate?: boolean;
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
  isCheckmate = false,
}: BoardProps) {
  const board = fenToBoard(fen);

  const renderSquares = () => {
    const squares = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        let rankIndex = r;
        let fileIndex = c;

        if (orientation === 'b') {
          rankIndex = 7 - r;
          fileIndex = 7 - c;
        }

        const piece = board[rankIndex][fileIndex];
        const rankLabel = 8 - rankIndex;
        const fileLabel = String.fromCharCode(97 + fileIndex);
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

            {PieceComponent && (
              <PieceComponent
                className={clsx(
                  styles.piece,
                  piece?.color === 'w' ? styles.pieceWhite : styles.pieceBlack
                )}
              />
            )}
          </div>
        );
      }
    }
    return squares;
  };

  return (
    <div className={clsx(styles.board, { [styles.checkmateBoard]: isCheckmate })}>
      {renderSquares()}
    </div>
  );
}
