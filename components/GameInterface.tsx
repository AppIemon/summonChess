"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';
import Board from './Board';
import Hand from './Hand';
import { GameState, PieceType, PieceColor, ChatMessage, Action } from '@/lib/game/types';
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

// Timer sub-component for smooth countdown
function TimerDisplay({ seconds, active }: { seconds: number, active: boolean }) {
  const [displaySeconds, setDisplaySeconds] = useState(seconds);

  useEffect(() => {
    setDisplaySeconds(seconds);
  }, [seconds]);

  useEffect(() => {
    if (!active || displaySeconds <= 0) return;

    const interval = setInterval(() => {
      setDisplaySeconds(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [active, displaySeconds]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`${styles.timer} ${displaySeconds <= 30 ? styles.timerLow : ''}`}>
      {formatTime(displaySeconds)}
    </div>
  );
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
function CheckmateOverlay({ winner, isTimeout }: { winner: PieceColor, isTimeout?: boolean }) {
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
          <div className={styles.victoryText}>{isTimeout ? '시간승!' : '체크메이트!'}</div>
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

  // Premoves state
  const [premove, setPremove] = useState<Action | null>(null);

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [lastChatCount, setLastChatCount] = useState(0);

  useEffect(() => {
    setPlayerId(localStorage.getItem('playerId'));
  }, []);

  // Automatic orientation
  useEffect(() => {
    if (gameState && playerId) {
      if (playerId === gameState.whitePlayerId) {
        setMyColor('w');
      } else if (playerId === gameState.blackPlayerId) {
        setMyColor('b');
      }
    }
  }, [gameState?.whitePlayerId, gameState?.blackPlayerId, playerId]);

  // Trigger victory animation
  useEffect(() => {
    const isGameOver = gameState?.isCheckmate || gameState?.isTimeout || (gameState?.winner && !gameState?.isCheckmate);
    if (isGameOver && gameState?.winner && !showVictory) {
      setShowVictory(true);
    }
  }, [gameState?.isCheckmate, gameState?.isTimeout, gameState?.winner, showVictory]);

  // Handle Premove execution
  useEffect(() => {
    if (gameState?.turn === myColor && premove && !gameState.winner) {
      const actionToTry = premove;
      setPremove(null);
      executeAction(actionToTry);
    }
  }, [gameState?.turn, myColor, premove, gameState?.winner]);

  // Scroll chat to bottom
  useEffect(() => {
    if (gameState?.chat && gameState.chat.length > lastChatCount) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setLastChatCount(gameState.chat.length);
    }
  }, [gameState?.chat, lastChatCount]);

  // Reset selection when turn changes (if not premoving)
  useEffect(() => {
    if (gameState?.turn === myColor) {
      setValidTargetSquares([]);
      setSelectedSquare(null);
      setSelectedHandPiece(null);
    }
  }, [gameState?.turn, myColor]);

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <h2>게임을 찾을 수 없습니다</h2>
        <p>게임이 종료되었거나 유효하지 않은 링크입니다.</p>
        <button onClick={() => window.location.href = '/'}>홈으로 돌아가기</button>
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
    if (gameState.winner) return;

    // Handle selection if it's my turn
    if (gameState.turn === myColor) {
      if (selectedHandPiece) {
        if (validTargetSquares.includes(square)) {
          await executeAction({ type: 'summon', piece: selectedHandPiece, square });
        } else {
          setSelectedHandPiece(null);
          setValidTargetSquares([]);
        }
        return;
      }

      if (selectedSquare) {
        if (selectedSquare === square) {
          setSelectedSquare(null);
          setValidTargetSquares([]);
          return;
        }

        if (validTargetSquares.includes(square)) {
          await executeAction({ type: 'move', from: selectedSquare, to: square });
          return;
        }
      }

      // Try selecting a piece on the board
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
    } else {
      // PREMOVE LOGIC
      if (selectedHandPiece) {
        // Summon Premove
        setPremove({ type: 'summon', piece: selectedHandPiece, square });
        setSelectedHandPiece(null);
        setValidTargetSquares([]);
      } else if (selectedSquare) {
        if (selectedSquare === square) {
          setSelectedSquare(null);
          setPremove(null);
          return;
        }
        // Move Premove
        setPremove({ type: 'move', from: selectedSquare, to: square });
        setSelectedSquare(null);
        setValidTargetSquares([]);
      } else {
        // Start premove selection
        import('chess.js').then(({ Chess }) => {
          const chess = new Chess(gameState.fen);
          const piece = chess.get(square as any);
          if (piece && piece.color === myColor) {
            setSelectedSquare(square);
            setSelectedHandPiece(null);
          }
        });
      }
    }
  };

  const handleHandSelect = (piece: PieceType | null) => {
    if (gameState.winner) return;

    if (!piece) {
      setSelectedHandPiece(null);
      setValidTargetSquares([]);
      return;
    }

    setSelectedHandPiece(piece);
    setSelectedSquare(null);

    // If it's my turn, show valid squares
    if (gameState.turn === myColor) {
      Promise.all([
        import('chess.js'),
        import('@/lib/game/engine')
      ]).then(([{ Chess }, { isReachableByOwnPiece }]) => {
        const chess = new Chess(gameState.fen);
        const valid: string[] = [];
        for (let r = 1; r <= 8; r++) {
          for (let c = 0; c < 8; c++) {
            const sq = `${'abcdefgh'[c]}${r}`;
            if (!chess.get(sq as any)) {
              if (!isReachableByOwnPiece(chess, sq as any, myColor)) continue;
              if (piece === 'p' && (r === 1 || r === 8)) continue;
              valid.push(sq);
            }
          }
        }
        setValidTargetSquares(valid);
      });
    } else {
      // Premove summon selection: we don't know valid squares yet (board changes),
      // so we just highlight the whole board or let the user click anywhere.
      setValidTargetSquares([]);
    }
  };

  const executeAction = async (action: any) => {
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
      // Silence errors during premove if they fail
      if (gameState.turn === myColor) {
        try {
          const errData = await res.json();
          console.error('Action failed:', errData.error);
        } catch (e) { }
      }
    }
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    const nickname = localStorage.getItem('nickname') || 'Unknown';
    const text = chatInput;
    setChatInput('');
    await executeAction({ type: 'chat', text, nickname });
  };

  const handleResign = async () => {
    if (!confirm('정말 기권하시겠습니까?')) return;
    await executeAction({ type: 'resign' });
  };

  return (
    <div className={styles.container}>
      {showVictory && gameState.winner && (
        <CheckmateOverlay winner={gameState.winner} isTimeout={gameState.isTimeout} />
      )}

      <div className={styles.header}>
        <h2>소환 체스</h2>
        <div className={styles.status}>
          <span>차례: {gameState.turn === 'w' ? '⚪ 백' : '⚫ 흑'}</span>
          {gameState.isCheck && <span className={styles.check}>⚠️ 체크!</span>}
          {gameState.isCheckmate && <span className={styles.mate}>👑 체크메이트!</span>}
          {gameState.isTimeout && <span className={styles.mate}>⏰ 시간초과!</span>}
          {gameState.isStalemate && <span className={styles.draw}>🤝 스테일메이트</span>}
          {gameState.winner && !gameState.isCheckmate && !gameState.isTimeout && (
            <span className={styles.mate}>🏳️ {gameState.winner === 'w' ? '백' : '흑'} 승리 (기권)</span>
          )}
        </div>
      </div>

      <div className={styles.gameWrapper}>
        <div className={styles.gameLayout}>
          <div className={styles.handWrapper}>
            <TimerDisplay
              seconds={myColor === 'w' ? gameState.blackTime : gameState.whiteTime}
              active={gameState.turn !== myColor && !gameState.winner}
            />
            <Hand
              pieces={myColor === 'w' ? gameState.blackDeck : gameState.whiteDeck}
              color={myColor === 'w' ? 'b' : 'w'}
              onSelect={() => { }}
              selectedPiece={null}
              disabled={true}
              className={styles.opponentHand}
            />
          </div>

          <Board
            fen={gameState.fen}
            onSquareClick={handleSquareClick}
            selectedSquare={selectedSquare}
            validTargetSquares={validTargetSquares}
            orientation={myColor}
            lastMove={gameState.lastMove}
            isCheckmate={gameState.isCheckmate}
            premove={premove as any}
          />

          <div className={styles.handWrapper}>
            <Hand
              pieces={myColor === 'w' ? gameState.whiteDeck : gameState.blackDeck}
              color={myColor}
              onSelect={handleHandSelect}
              selectedPiece={selectedHandPiece}
              disabled={gameState.turn !== myColor && !premove}
              className={styles.myHand}
            />
            <TimerDisplay
              seconds={myColor === 'w' ? gameState.whiteTime : gameState.blackTime}
              active={gameState.turn === myColor && !gameState.winner}
            />
          </div>

          {premove && (
            <div className={styles.premoveNotice}>
              ⚡ 프리무브 예약: {premove.type === 'move' ? `${(premove as any).from}→${(premove as any).to}` : `소환(${(premove as any).piece.toUpperCase()} @ ${(premove as any).square})`}
              <button style={{ marginLeft: 8, color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setPremove(null)}>✖</button>
            </div>
          )}
        </div>

        <div className={styles.chatSidebar}>
          <div className={styles.chatMessages}>
            {gameState.chat.map((msg) => (
              <div key={msg.id} className={`${styles.chatMessage} ${msg.senderId === playerId ? styles.msgMe : styles.msgOther}`}>
                <span className={styles.senderName}>{msg.nickname}</span>
                {msg.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form className={styles.chatInputArea} onSubmit={handleSendChat}>
            <input
              type="text"
              className={styles.chatInput}
              placeholder="메시지 입력..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button type="submit" className={styles.chatSendBtn}>🏹</button>
          </form>
        </div>
      </div>

      <div className={styles.controls}>
        <button onClick={() => setMyColor(myColor === 'w' ? 'b' : 'w')}>🔄 보드 뒤집기</button>
        <button onClick={() => { navigator.clipboard.writeText(window.location.href); alert('링크가 복사되었습니다!'); }}>📋 링크 공유</button>
        <button onClick={() => alert('🎮 시스템 특징\n\n• 10분 타이머 (실시간 동기화)\n• 프리무브: 핸드 기물 소환 및 보드 이동 모두 지원\n• 매드무비 효과: 체크메이트/시간패배 시 극적인 연출\n• 자신의 기물 이동범위 내에만 기물 소환 가능')}>❓ 시스템 정보</button>
        <button className={styles.resignButton} onClick={handleResign}>🏳️ 기권</button>
      </div>
    </div>
  );
}
