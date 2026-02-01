"use client";

import React, { useState, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import Board from './Board';
import Hand from './Hand';
import { GameState, PieceType, PieceColor } from '@/lib/game/types';
import styles from './GameInterface.module.css';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error: any = new Error('An error occurred while fetching the data.');
    error.info = await res.json();
    error.status = res.status;
    throw error;
  }
  return res.json();
};

interface GameInterfaceProps {
  gameId: string;
}

// Confetti component for victory celebration
function Confetti({ count = 50 }: { count?: number }) {
  const confettiPieces = useMemo(() => {
    const pieces = [];
    const colors = ['#FFD700', '#667eea', '#a78bfa', '#f472b6', '#34d399', '#fbbf24'];

    for (let i = 0; i < count; i++) {
      pieces.push({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 2}s`,
        duration: `${2 + Math.random() * 2}s`,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: `${6 + Math.random() * 8}px`,
      });
    }
    return pieces;
  }, [count]);

  return (
    <div className={styles.confettiContainer}>
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className={styles.confetti}
          style={{
            left: piece.left,
            backgroundColor: piece.color,
            width: piece.size,
            height: piece.size,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}

// Checkmate Victory Overlay
function CheckmateOverlay({ winner }: { winner: PieceColor }) {
  const isWhiteWinner = winner === 'w';

  return (
    <>
      <Confetti count={60} />
      <div className={styles.checkmateOverlay}>
        <div className={styles.flashEffect} />

        <div className={styles.burstContainer}>
          <div className={`${styles.burst} ${styles.burst1}`} />
          <div className={`${styles.burst} ${styles.burst2}`} />
          <div className={`${styles.burst} ${styles.burst3}`} />
        </div>

        <div className={styles.victoryContent}>
          <div className={styles.crown}>👑</div>
          <div className={styles.victoryText}>체크메이트!</div>
          <div className={`${styles.winnerText} ${isWhiteWinner ? styles.winnerWhite : styles.winnerBlack}`}>
            {isWhiteWinner ? '백 승리' : '흑 승리'}
          </div>
        </div>
      </div>
    </>
  );
}

export default function GameInterface({ gameId }: GameInterfaceProps) {
  const { data: gameState, mutate, error } = useSWR<GameState>(
    `/api/game/${gameId}`,
    fetcher,
    { refreshInterval: 1000 }
  );

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<PieceType | null>(null);
  const [validTargetSquares, setValidTargetSquares] = useState<string[]>([]);
  const [myColor, setMyColor] = useState<PieceColor>('w');
  const [showVictory, setShowVictory] = useState(false);

  // Automatic orientation
  useEffect(() => {
    if (gameState) {
      const playerId = localStorage.getItem('playerId');
      if (playerId === gameState.whitePlayerId) {
        setMyColor('w');
      } else if (playerId === gameState.blackPlayerId) {
        setMyColor('b');
      }
    }
  }, [gameState?.whitePlayerId, gameState?.blackPlayerId]);

  // Trigger victory animation on checkmate
  useEffect(() => {
    if (gameState?.isCheckmate && gameState?.winner && !showVictory) {
      setShowVictory(true);
    }
  }, [gameState?.isCheckmate, gameState?.winner, showVictory]);

  // Reset selection when turn changes
  useEffect(() => {
    if (gameState) {
      setValidTargetSquares([]);
      setSelectedSquare(null);
      setSelectedHandPiece(null);
    }
  }, [gameState?.turn]);

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <h2>게임을 찾을 수 없습니다</h2>
        <p>게임이 종료되었거나 유효하지 않은 링크입니다.</p>
        <button onClick={() => window.location.href = '/'}>
          홈으로 돌아가기
        </button>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>로딩 중...</p>
      </div>
    );
  }

  const handleSquareClick = async (square: string) => {
    // If we have a selected hand piece, try to summon
    if (selectedHandPiece) {
      if (validTargetSquares.includes(square)) {
        await executeAction({
          type: 'summon',
          piece: selectedHandPiece,
          square,
        });
      } else {
        setSelectedHandPiece(null);
        setValidTargetSquares([]);
      }
      return;
    }

    // If we have a selected board square
    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setValidTargetSquares([]);
        return;
      }

      if (validTargetSquares.includes(square)) {
        await executeAction({
          type: 'move',
          from: selectedSquare,
          to: square,
        });
        return;
      }
    }

    // Try to select the clicked square
    import('chess.js').then(({ Chess }) => {
      const chess = new Chess(gameState.fen);
      const piece = chess.get(square as any);

      if (piece && piece.color === gameState.turn) {
        setSelectedSquare(square);
        const moves = chess.moves({ square: square as any, verbose: true });
        setValidTargetSquares(moves.map(m => m.to));
        setSelectedHandPiece(null);
      } else {
        setSelectedSquare(null);
        setValidTargetSquares([]);
      }
    });
  };

  const handleHandSelect = (piece: PieceType | null) => {
    if (!piece) {
      setSelectedHandPiece(null);
      setValidTargetSquares([]);
      return;
    }

    if (gameState.turn !== myColor) {
      return;
    }

    setSelectedHandPiece(piece);
    setSelectedSquare(null);

    const turn = gameState.turn;
    const valid: string[] = [];

    Promise.all([
      import('chess.js'),
      import('@/lib/game/engine')
    ]).then(([{ Chess }, { isReachableByOwnPiece }]) => {
      const chess = new Chess(gameState.fen);

      for (let r = 1; r <= 8; r++) {
        for (let c = 0; c < 8; c++) {
          const file = 'abcdefgh'[c];
          const sq = `${file}${r}`;
          const currentPiece = chess.get(sq as any);

          if (!currentPiece) {
            if (!isReachableByOwnPiece(chess, sq as any, turn)) {
              continue;
            }

            if (piece === 'p') {
              if (r === 1 || r === 8) continue;
            }
            valid.push(sq);
          }
        }
      }
      setValidTargetSquares(valid);
    });
  };

  const executeAction = async (action: any) => {
    const playerId = localStorage.getItem('playerId');
    const res = await fetch(`/api/game/${gameId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...action, playerId }),
    });
    if (res.ok) {
      const data = await res.json();
      mutate(data.state);
      setSelectedSquare(null);
      setSelectedHandPiece(null);
      setValidTargetSquares([]);
    } else {
      try {
        const errData = await res.json();
        alert(errData.error || '유효하지 않은 이동입니다');
      } catch (e) {
        alert('유효하지 않은 이동입니다');
      }
    }
  };

  const handleResign = async () => {
    if (!confirm('정말 기권하시겠습니까?')) return;
    await executeAction({ type: 'resign' });
  };

  return (
    <div className={styles.container}>
      {/* Victory Overlay */}
      {showVictory && gameState.winner && (
        <CheckmateOverlay winner={gameState.winner} />
      )}

      <div className={styles.header}>
        <h2>소환 체스</h2>
        <div className={styles.status}>
          차례: {gameState.turn === 'w' ? '⚪ 백' : '⚫ 흑'}
          {gameState.isCheck && <span className={styles.check}>⚠️ 체크!</span>}
          {gameState.isCheckmate && <span className={styles.mate}>👑 체크메이트!</span>}
          {gameState.isStalemate && <span className={styles.draw}>🤝 스테일메이트</span>}
          {gameState.winner && !gameState.isCheckmate && (
            <span className={styles.mate}>🏳️ {gameState.winner === 'w' ? '백' : '흑'} 승리 (기권)</span>
          )}
        </div>
      </div>

      <div className={styles.gameLayout}>
        {/* Opponent Hand */}
        <Hand
          pieces={myColor === 'w' ? gameState.blackDeck : gameState.whiteDeck}
          color={myColor === 'w' ? 'b' : 'w'}
          onSelect={() => { }}
          selectedPiece={null}
          disabled={true}
          className={styles.opponentHand}
        />

        <Board
          fen={gameState.fen}
          onSquareClick={handleSquareClick}
          selectedSquare={selectedSquare}
          validTargetSquares={validTargetSquares}
          orientation={myColor}
          lastMove={gameState.lastMove}
          isCheckmate={gameState.isCheckmate}
        />

        {/* My Hand */}
        <Hand
          pieces={myColor === 'w' ? gameState.whiteDeck : gameState.blackDeck}
          color={myColor}
          onSelect={handleHandSelect}
          selectedPiece={selectedHandPiece}
          disabled={gameState.turn !== myColor}
          className={styles.myHand}
        />
      </div>

      <div className={styles.controls}>
        <button onClick={() => setMyColor(myColor === 'w' ? 'b' : 'w')}>
          🔄 보드 뒤집기
        </button>
        <button onClick={() => {
          navigator.clipboard.writeText(window.location.href);
          alert('링크가 복사되었습니다!');
        }}>
          📋 링크 공유
        </button>
        <button onClick={() => alert('🎮 게임 규칙\n\n• 턴마다 이동 또는 소환 중 하나를 선택\n• 자신의 기물이 도달할 수 있는 빈 칸에 소환 가능\n• 폰은 1랭크/8랭크에 소환 불가\n• 체크메이트로 승리!')}>
          ❓ 도움말
        </button>
        <button className={styles.resignButton} onClick={handleResign}>
          🏳️ 기권
        </button>
      </div>
    </div>
  );
}
