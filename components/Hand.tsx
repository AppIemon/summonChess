import React from 'react';
import styles from './Hand.module.css';
import { ChessPieces } from './ChessPieces';
import { PieceType, PieceColor } from '@/lib/game/types';
import clsx from 'clsx';

interface HandProps {
  pieces: PieceType[];
  color: PieceColor;
  onSelect: (piece: PieceType | null) => void;
  selectedPiece: PieceType | null;
  className?: string;
  disabled?: boolean;
}

export default function Hand({
  pieces = [],
  color,
  onSelect,
  selectedPiece,
  className,
  disabled
}: HandProps) {
  if (!pieces) return null;

  // Group pieces by type
  const counts = pieces.reduce((acc, p) => {
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {} as Record<PieceType, number>);

  const uniquePieces = Object.keys(counts) as PieceType[];
  // Sort order: P, N, B, R, Q (strength)
  const strengthOrder: PieceType[] = ['p', 'n', 'b', 'r', 'q'];
  uniquePieces.sort((a, b) => strengthOrder.indexOf(a) - strengthOrder.indexOf(b));

  return (
    <div className={clsx(styles.hand, className)}>
      {uniquePieces.map((type) => {
        const PieceComponent = ChessPieces[color][type];
        return (
          <div
            key={type}
            className={clsx(styles.item, {
              [styles.selected]: selectedPiece === type,
            })}
            onClick={() => !disabled && onSelect(selectedPiece === type ? null : type)}
          >
            <PieceComponent
              className={clsx(
                styles.piece,
                color === 'w' ? styles.pieceWhite : styles.pieceBlack
              )}
            />
            <span className={styles.count}>{counts[type]}</span>
          </div>
        );
      })}
      {uniquePieces.length === 0 && <span className={styles.emptyDeck}>빈 덱</span>}
    </div>
  );
}
