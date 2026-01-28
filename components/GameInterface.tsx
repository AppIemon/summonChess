"use client";

import React, { useState, useEffect } from 'react';
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

export default function GameInterface({ gameId }: GameInterfaceProps) {
  const { data: gameState, mutate, error } = useSWR<GameState>(
    `/api/game/${gameId}`,
    fetcher,
    { refreshInterval: 1000 }
  );

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<PieceType | null>(null);
  const [validTargetSquares, setValidTargetSquares] = useState<string[]>([]);
  const [myColor, setMyColor] = useState<PieceColor>('w'); // Default to White perspective

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
      <div className={styles.container} style={{ justifyContent: 'center', height: '100vh' }}>
        <h2>게임을 찾을 수 없습니다</h2>
        <p>게임이 종료되었거나 유효하지 않은 링크입니다.</p>
        <button onClick={() => window.location.href = '/'} style={{ marginTop: '20px', padding: '10px 20px' }}>
          홈으로 돌아가기
        </button>
      </div>
    );
  }
  if (!gameState) return <div>로딩 중...</div>;

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
        // Deselect
        setSelectedHandPiece(null);
        setValidTargetSquares([]);
      }
      return;
    }

    // If we have a selected board square
    if (selectedSquare) {
      // If clicked same square, deselect
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setValidTargetSquares([]);
        return;
      }

      // If clicked a valid move target, execute move
      if (validTargetSquares.includes(square)) {
        await executeAction({
          type: 'move',
          from: selectedSquare,
          to: square,
        });
        return;
      }

      // If clicked another friendly piece, select it
      // How do we know it's friendly? Check FEN or use logic?
      // We can use a helper or check if square is in "moves" source?
      // Actually, we should check if the square has a piece of current turn color.
      // But we assume `onSquareClick` handles selection logic.
      // Let's rely on standard selection flow:
      // If I click a square, and it's my piece, select it.
    }

    // Try to select the clicked square
    // We need to know if there is a piece there.
    // We can call API to get valid moves? Or compute locally?
    // Using `chess.js` locally is better for UI responsiveness.
    // But we only have `fen` in `gameState`.
    // We can instantiate `Chess` temporarily to check moves.
    // Or just simple check:
    // ...
    // Note: We need to know if the click was on a piece.
    // Let's fetch valid moves from API? No, expensive.
    // Using chess.js on client side is best.

    // We assume we can import chess.js logic or duplicate it.
    // For now, let's assume we use chess.js instance.
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

      const minRank = 1;
      const maxRank = 8;

      for (let r = minRank; r <= maxRank; r++) {
        for (let c = 0; c < 8; c++) {
          const file = 'abcdefgh'[c];
          const sq = `${file}${r}`;
          const currentPiece = chess.get(sq as any);

          if (!currentPiece) {
            // Check reachability
            if (!isReachableByOwnPiece(chess, sq as any, turn)) {
              continue;
            }

            // Pawn restriction
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
      <div className={styles.header}>
        <h2>소환 체스</h2>
        <div className={styles.status}>
          차례: {gameState.turn === 'w' ? '백' : '흑'}
          {gameState.isCheck && <span className={styles.check}> 체크!</span>}
          {gameState.isCheckmate && <span className={styles.mate}> 체크메이트! 승자: {gameState.winner === 'w' ? '백' : '흑'}</span>}
          {gameState.isStalemate && <span className={styles.draw}> 스테일메이트</span>}
          {gameState.winner && !gameState.isCheckmate && <span className={styles.mate}> 승자: {gameState.winner === 'w' ? '백' : '흑'} (기권)</span>}
        </div>
      </div>

      <div className={styles.gameLayout}>
        {/* Opponent Hand (Black usually, unless flipped) */}
        <Hand
          pieces={myColor === 'w' ? gameState.blackDeck : gameState.whiteDeck}
          color={myColor === 'w' ? 'b' : 'w'}
          onSelect={() => { }} // Can't select opponent pieces
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
        <button onClick={() => setMyColor(myColor === 'w' ? 'b' : 'w')}>보드 뒤집기</button>
        <button onClick={() => navigator.clipboard.writeText(window.location.href)}>링크 공유</button>
        <button onClick={() => alert('가이드:\n- 턴마다 이동 또는 소환.\n- 자신의 진영에 소환.\n- 체크메이트로 승리.')}>도움말</button>
        <button onClick={handleResign} style={{ backgroundColor: '#ff4444', color: 'white' }}>기권</button>
      </div>
    </div>
  );
}
