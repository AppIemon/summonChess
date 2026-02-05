"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';
import Board from './Board';
import Hand from './Hand';
import { GameState, PieceType, PieceColor, ChatMessage, Action, MoveClassification, MoveAnalysis, GameReviewResults } from '@/lib/game/types';
import styles from './GameInterface.module.css';
import { Chess, Square } from 'chess.js';
import { SummonChessGame } from '@/lib/game/engine';
import { useChessEngine } from '@/hooks/useChessEngine';
import clsx from 'clsx';

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
  isAnalysis?: boolean;
  isAi?: boolean;
  isAiVsAi?: boolean;
  initialAccuracy?: number;
}

const getStandardFen = (fen: string) => {
  if (!fen) return '';
  const mainFen = fen.split(' [')[0];
  const parts = mainFen.split(' ');
  if (parts.length < 2) return mainFen;
  return `${parts[0]} ${parts[1]} - - 0 1`;
};

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
        delay: `${2 + Math.random() * 2}s`,
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
function CheckmateOverlay({
  winner,
  isTimeout,
  isStalemate,
  isCheckmate,
  onAutoClose
}: {
  winner: PieceColor | null,
  isTimeout?: boolean,
  isStalemate?: boolean,
  isCheckmate?: boolean,
  onAutoClose: () => void
}) {
  const isWhiteWinner = winner === 'w';
  const winnerNickname = winner === 'w' ? '백' : (winner === 'b' ? '흑' : '');
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (countdown <= 0) {
      onAutoClose();
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, onAutoClose]);

  const getReason = () => {
    if (isTimeout) return '시간이 모두 소진되었습니다.';
    if (isCheckmate) return '킹이 공격받고 있으며 탈출할 수 없습니다.';
    if (isStalemate) return '더 이상 움직일 수 있는 수가 없습니다. (스테일메이트)';
    if (isStalemate || winner === null) return '무승부입니다.';

    // For resignation, check who won to determine who resigned
    const loser = winner === 'w' ? '흑' : '백';
    return `${loser}이 기권했습니다.`;
  };

  const getTitle = () => {
    if (isStalemate) return '무승부';
    if (isTimeout) return '시간 종료';
    if (isCheckmate) return '체크메이트!';
    if (winner === null) return '무승부';
    return '경기 종료';
  };

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
          <div className={styles.victoryText}>
            {getTitle()}
          </div>
          <div className={`${styles.winnerText} ${winner === 'w' ? styles.winnerWhite : (winner === 'b' ? styles.winnerBlack : '')}`}>
            {isStalemate || winner === null ? '무승부' : `${winnerNickname} 승리`}
          </div>
          <div className={styles.reasonText}>{getReason()}</div>
          <div className={styles.autoCloseText}>{countdown}초 후 보드로 돌아갑니다...</div>
        </div>
      </div>
    </>
  );
}

// Evaluation Bar Component
function EvalBar({ score, depth = 4 }: { score: number | null, depth?: number }) {
  const winChance = score === null ? 0.5 : 1 / (1 + Math.pow(10, -score / 400));
  const whiteHeight = `${winChance * 100}%`;

  let scoreText = '';
  if (score !== null) {
    if (Math.abs(score) > 40000) {
      const MATE_SCORE = 50000;
      const plies = MATE_SCORE - Math.abs(score);
      const moves = Math.ceil(plies / 2);
      scoreText = score > 0 ? `+M${moves}` : `-M${moves}`;
    } else {
      scoreText = (score / 100).toFixed(1);
      if (score > 0) scoreText = '+' + scoreText;
    }
  }

  return (
    <div
      className={styles.evalBarContainer}
      style={{ '--white-percent': whiteHeight } as React.CSSProperties}
    >
      <div className={styles.evalBarBlack}>
        {score !== null && score < 0 && <span className={styles.scoreTextTop}>{scoreText}</span>}
      </div>
      <div className={styles.evalBarWhite}>
        {score !== null && score >= 0 && <span className={styles.scoreTextBottom}>{scoreText}</span>}
      </div>
    </div>
  );
}

// Variations View Component
function VariationsView({ variations, depth }: { variations: any[], depth: number }) {
  if (!variations || variations.length === 0) return null;

  const formatMove = (m: any) => {
    if (!m) return '';
    if (typeof m === 'string') return m;
    if (m.type === 'SUMMON' || m.type === 'summon') {
      const typeNames: any = { 1: '', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K', 'p': '', 'n': 'N', 'b': 'B', 'r': 'R', 'q': 'Q', 'k': 'K' };
      const piece = m.piece in typeNames ? typeNames[m.piece] : m.piece;
      const to = typeof m.to === 'number' ? `${'abcdefgh'[m.to % 8]}${Math.floor(m.to / 8) + 1}` : m.square;
      return `${piece}@${to}`;
    } else {
      const from = typeof m.from === 'number' ? `${'abcdefgh'[m.from % 8]}${Math.floor(m.from / 8) + 1}` : m.from;
      const to = typeof m.to === 'number' ? `${'abcdefgh'[m.to % 8]}${Math.floor(m.to / 8) + 1}` : m.to;
      return `${from}${to}`;
    }
  };

  const getEvalText = (score: number) => {
    if (Math.abs(score) > 40000) {
      const MATE_SCORE = 50000;
      const plies = MATE_SCORE - Math.abs(score);
      const moves = Math.ceil(plies / 2);
      return score > 0 ? `+M${moves}` : `-M${moves}`;
    }
    const val = (score / 100).toFixed(1);
    return score > 0 ? `+${val}` : val;
  };

  return (
    <div className={styles.variationsContainer}>
      <div className={styles.variationsHeader}>상위 수순 (깊이 {depth})</div>
      <div className={styles.variationsList}>
        {variations.slice(0, 3).map((v, i) => (
          <div key={i} className={styles.variationItem}>
            <span className={clsx(styles.variationEval, v.evaluation >= 0 ? styles.evalPos : styles.evalNeg)}>
              {getEvalText(v.evaluation)}
            </span>
            <div className={styles.variationMoves}>
              {v.pv.slice(0, 5).map((m: any, j: number) => (
                <span key={j} className={styles.variationMove}>
                  {j % 2 === 0 ? `${Math.floor(j / 2) + 1}.` : ''} {formatMove(m)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Variations Modal Component
function VariationsModal({ move, onClose }: { move: MoveAnalysis, onClose: () => void }) {
  const formatMove = (m: any) => {
    if (!m) return '';
    if (typeof m === 'string') return m;
    if (m.type === 'SUMMON' || m.type === 'summon') {
      const typeNames: any = { 1: '', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K', 'p': '', 'n': 'N', 'b': 'B', 'r': 'R', 'q': 'Q', 'k': 'K' };
      const piece = m.piece in typeNames ? typeNames[m.piece] : m.piece;
      const to = typeof m.to === 'number' ? `${'abcdefgh'[m.to % 8]}${Math.floor(m.to / 8) + 1}` : m.square;
      return `${String(piece).toUpperCase()}@${to}`;
    } else {
      const from = typeof m.from === 'number' ? `${'abcdefgh'[m.from % 8]}${Math.floor(m.from / 8) + 1}` : m.from;
      const to = typeof m.to === 'number' ? `${'abcdefgh'[m.to % 8]}${Math.floor(m.to / 8) + 1}` : m.to;
      return `${from}${to}`;
    }
  };

  const getEvalText = (score: number) => {
    if (Math.abs(score) > 40000) {
      const MATE_SCORE = 50000;
      const plies = MATE_SCORE - Math.abs(score);
      const moves = Math.ceil(plies / 2);
      return score > 0 ? `+M${moves}` : `-M${moves}`;
    }
    const val = (score / 100).toFixed(1);
    return score > 0 ? `+${val}` : val;
  };

  return (
    <div className={styles.undoOverlay} onClick={onClose} style={{ zIndex: 3000 }}>
      <div className={styles.undoCard} onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <h3>수순 보기</h3>
        <div style={{ margin: '20px 0', textAlign: 'left' }}>
          <div style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #eee' }}>
            <strong>최선의 수:</strong> <span style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: '#95bb4a' }}>{move.bestMove}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {move.variations?.slice(0, 3).map((v, i) => (
              <div key={i} style={{ background: '#f8f9fa', padding: '12px', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <strong>변화수 {i + 1}</strong>
                  <span className={clsx(v.evaluation >= 0 ? styles.evalPos : styles.evalNeg)} style={{ fontWeight: 'bold' }}>
                    {getEvalText(v.evaluation)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {v.pv.map((m: any, j: number) => (
                    <span key={j} style={{
                      background: '#fff',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      border: '1px solid #ddd',
                      fontFamily: 'monospace',
                      color: '#333'
                    }}>
                      {j % 2 === 0 ? `${Math.floor(j / 2) + 1}.` : ''} {formatMove(m)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <button className={styles.navBtn} onClick={onClose} style={{ width: '100%', marginTop: '10px' }}>닫기</button>
      </div>
    </div>
  );
}

// Review Helper Functions
const getClassificationIcon = (c: MoveClassification) => {
  switch (c) {
    case 'brilliant': return '!!';
    case 'great': return '!';
    case 'best': return '⭐';
    case 'excellent': return '👍';
    case 'good': return '✔️';
    case 'inaccuracy': return '?!';
    case 'mistake': return '?';
    case 'blunder': return '??';
    case 'forced': return '□';
    case 'miss': return '✕';
    default: return '';
  }
};

const getClassificationText = (c: MoveClassification) => {
  switch (c) {
    case 'brilliant': return '탁월합니다';
    case 'great': return '매우 좋은 수';
    case 'best': return '최선';
    case 'excellent': return '굉장히 좋습니다';
    case 'good': return '좋습니다';
    case 'inaccuracy': return '부정확함';
    case 'mistake': return '실수';
    case 'blunder': return '블런더';
    case 'forced': return '강제';
    case 'miss': return '놓친 수';
    default: return '';
  }
};

const getClassificationColor = (c: MoveClassification) => {
  switch (c) {
    case 'brilliant': return '#1baca6';
    case 'great': return '#5c8bb0';
    case 'best': return '#95bb4a';
    case 'excellent': return '#96bc4b';
    case 'good': return '#96bc4b';
    case 'inaccuracy': return '#f0c15c';
    case 'mistake': return '#e6912c';
    case 'blunder': return '#b33430';
    case 'forced': return '#769656';
    case 'miss': return '#da1e8a';
    default: return '#888';
  }
};

const calculateAccuracy = (bestEval: number, playedEval: number, turn: PieceColor) => {
  const MATE_THRESHOLD = 40000;
  // If both are mate scores, count as 100% accuracy (don't penalize mate in 3 vs mate in 2)
  if (Math.abs(bestEval) > MATE_THRESHOLD && Math.abs(playedEval) > MATE_THRESHOLD) {
    if ((bestEval > 0 && playedEval > 0) || (bestEval < 0 && playedEval < 0)) return 100;
  }

  const perspective = turn === 'w' ? 1 : -1;
  const diff = Math.max(0, (bestEval - playedEval) * perspective);
  return Math.round(Math.max(0, Math.min(100, 100 * Math.exp(-0.005 * diff))));
};

const formatMoveActionShort = (m: any) => {
  if (!m) return '';
  if (typeof m === 'string') return m;
  if (m.type === 'SUMMON' || m.type === 'summon') {
    const typeNames: any = { 1: '', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K', 'p': '', 'n': 'N', 'b': 'B', 'r': 'R', 'q': 'Q', 'k': 'K' };
    const piece = m.piece in typeNames ? typeNames[m.piece] : (m.piece || '');
    const to = typeof m.to === 'number' ? `${'abcdefgh'[m.to % 8]}${Math.floor(m.to / 8) + 1}` : (m.square || m.to);
    const pieceStr = piece === '' ? 'P' : String(piece).toUpperCase();
    return `${pieceStr}@${to}`;
  }
  const from = typeof m.from === 'number' ? `${'abcdefgh'[m.from % 8]}${Math.floor(m.from / 8) + 1}` : m.from;
  const to = typeof m.to === 'number' ? `${'abcdefgh'[m.to % 8]}${Math.floor(m.to / 8) + 1}` : m.to;
  return `${from}${to}${m.promotion ? m.promotion : ''}`;
};

export default function GameInterface({ gameId, isAnalysis = false, isAi = false, isAiVsAi = false, initialAccuracy = 100 }: GameInterfaceProps) {
  const { data: serverGameState, mutate, error } = useSWR<GameState>(
    (isAnalysis || isAi) ? null : `/api/game/${gameId}`,
    fetcher,
    { refreshInterval: 1000 }
  );

  const [localGame, setLocalGame] = useState<SummonChessGame | null>(null);
  const [localGameState, setLocalGameState] = useState<GameState | null>(null);
  const { getBestMove, isLoaded: aiLoaded } = useChessEngine();

  useEffect(() => {
    if (isAnalysis || isAi) {
      const game = new SummonChessGame();
      setLocalGame(game);
      setLocalGameState(game.getState());
      if (isAi) {
        const col = Math.random() < 0.5 ? 'w' : 'b';
        setMyColor(col);
        setBoardOrientation(col);
      } else {
        setMyColor('w');
        setBoardOrientation('w');
      }
    }
  }, [isAnalysis, isAi]);

  const gameState = (isAnalysis || isAi) ? localGameState : serverGameState;

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<PieceType | null>(null);
  const [validTargetSquares, setValidTargetSquares] = useState<string[]>([]);
  const [myColor, setMyColor] = useState<PieceColor>('w'); // Player's actual color/side
  const [boardOrientation, setBoardOrientation] = useState<PieceColor>('w'); // Current board view orientation
  const [showVictory, setShowVictory] = useState(false);
  const [victoryShown, setVictoryShown] = useState(false);

  // Evaluation Bar State
  const [showEvalBar, setShowEvalBar] = useState(isAi || isAiVsAi || isAnalysis);
  const [showVariations, setShowVariations] = useState(isAnalysis);
  const [evalScore, setEvalScore] = useState<number | null>(null);
  const [evalDepth, setEvalDepth] = useState<number>(4);
  const [evalVariations, setEvalVariations] = useState<any[]>([]);

  // Premoves state
  const [premove, setPremove] = useState<Action | null>(null);

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<{
    winner: PieceColor | null;
    isTimeout?: boolean;
    isStalemate?: boolean;
    isCheckmate?: boolean;
    isDraw?: boolean;
  } | null>(null);
  const [lastChatCount, setLastChatCount] = useState(0);

  // Tab state
  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'hands' | 'menu' | 'review'>('chat');
  const historyEndRef = useRef<HTMLDivElement>(null);
  const gameHistoryRef = useRef<{ fen: string, move: any, color: PieceColor }[]>([])

  const [username, setUsername] = useState<string>('Unknown');

  // Game Review State
  const [reviewProgress, setReviewProgress] = useState<{ current: number, total: number } | null>(null);
  const [reviewResults, setReviewResults] = useState<GameReviewResults | null>(null);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [shownVariationsIndex, setShownVariationsIndex] = useState<number | null>(null);
  const isReviewingRef = useRef(false);

  // AI Difficulty (Brain Usage / Accuracy 10-100)
  const [aiDifficulty, setAiDifficulty] = useState<number>(initialAccuracy);

  useEffect(() => {
    if (activeTab === 'review' && reviewResults && reviewIndex !== null) {
      setShowVariations(true);
      setShowEvalBar(true);
    }
  }, [activeTab, reviewResults, reviewIndex]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.user) {
          setPlayerId(data.user.id);
          setUsername(data.user.nickname);
        }
      } catch (e) {
        console.error('Auth check in GameInterface failed:', e);
      }
    };
    checkAuth();
  }, []);

  // Update effect to scroll history
  useEffect(() => {
    if (activeTab === 'history' && gameState?.history) {
      historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameState?.history, activeTab]);

  const executeAction = async (action: any, aiMoveObj?: any) => {
    // Record history for AI learning (only for moves and summons)
    if (gameState && (action.type === 'move' || action.type === 'summon')) {
      gameHistoryRef.current.push({
        fen: gameState.fen,
        move: aiMoveObj || action,
        color: gameState.turn
      });
    }

    if ((isAnalysis || isAi) && localGame) {
      if (action.type === 'undo_request') {
        localGame.undo();
        setLocalGameState(localGame.getState());
        return;
      }
      const res = localGame.executeAction(action);
      if (res.success) {
        setLocalGameState(localGame.getState());
        setSelectedSquare(null);
        setSelectedHandPiece(null);
        setValidTargetSquares([]);
      } else {
        console.error('Local Action Failed:', res.error);
        if (!aiMoveObj) alert(`작업 실패: ${res.error}`);
      }
      return;
    }

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
      if (gameState && gameState.turn === myColor) {
        try {
          const errData = await res.json();
          console.error('Action failed:', errData.error);
        } catch (e) { }
      }
    }
  };

  // Bot Logic Removed

  // Spectator status
  const isSpectator = useMemo(() => {
    if (isAnalysis || isAi) return false;
    if (!gameState || !playerId) return false;
    return playerId !== gameState.whitePlayerId && playerId !== gameState.blackPlayerId;
  }, [gameState, playerId, isAnalysis, isAi]);

  // Automatic orientation
  useEffect(() => {
    if (gameState && playerId && !isSpectator) {
      if (playerId === gameState.whitePlayerId) {
        setMyColor('w');
        setBoardOrientation('w');
      } else if (playerId === gameState.blackPlayerId) {
        setMyColor('b');
        setBoardOrientation('b');
      }
    }
  }, [gameState?.whitePlayerId, gameState?.blackPlayerId, playerId, isSpectator]);

  // Trigger victory animation and report result
  useEffect(() => {
    const isGameOver = !!(gameState?.isCheckmate || gameState?.isTimeout || gameState?.isStalemate || gameState?.isDraw || gameState?.winner);

    if (isGameOver) {
      if (!victoryShown) {
        setFinalResult({
          winner: gameState.winner,
          isTimeout: gameState.isTimeout,
          isStalemate: gameState.isStalemate,
          isCheckmate: gameState.isCheckmate,
          isDraw: gameState.isDraw
        });
        setShowVictory(true);
        setVictoryShown(true);

        // Report result for AI learning
        if ((isAi || isAiVsAi) && gameHistoryRef.current.length > 0) {
          fetch('/api/ai/report-game-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              history: gameHistoryRef.current,
              winner: gameState.winner
            })
          }).catch(err => console.error('Failed to report game result:', err));
        }

        // Auto-restart is now handled by a separate useEffect for better reliability
      }
    } else {
      // Reset shown state when game is not over (e.g. after a reset)
      if (victoryShown) {
        setVictoryShown(false);
        setFinalResult(null);
      }
      // Reset history on new game
      if (gameState && gameState.history && gameState.history.length === 0) {
        gameHistoryRef.current = [];
      }
    }
  }, [gameState?.isCheckmate, gameState?.isTimeout, gameState?.isStalemate, gameState?.isDraw, gameState?.winner, isAi, isAiVsAi, victoryShown]);

  // Separate Auto-restart effect for AI vs AI mode to ensure it's not canceled by state updates
  useEffect(() => {
    if (!isAiVsAi) return;

    const isGameOver = !!(localGameState?.isCheckmate || localGameState?.isTimeout || localGameState?.isStalemate || localGameState?.isDraw || localGameState?.winner);

    if (isGameOver) {
      const timer = setTimeout(() => {
        const game = new SummonChessGame();
        setLocalGame(game);
        setLocalGameState(game.getState());
        gameHistoryRef.current = [];
        setShowVictory(false);
        setVictoryShown(false);
        setFinalResult(null);
        setEvalScore(null);
        setEvalVariations([]);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isAiVsAi, localGameState?.isCheckmate, localGameState?.isTimeout, localGameState?.isStalemate, localGameState?.isDraw, localGameState?.winner]);

  // Handle AI turn
  useEffect(() => {
    const isAiTurn = isAiVsAi || (isAi && localGameState?.turn !== myColor);

    const isGameOver = !!(localGameState?.isCheckmate || localGameState?.isTimeout || localGameState?.isStalemate || localGameState?.isDraw || localGameState?.winner);

    if (aiLoaded && localGame && localGameState && isAiTurn && !isGameOver) {
      const handleAiMove = async () => {
        // Check if the game ended before AI started thinking
        const isGameOverBefore = !!(localGameState?.isCheckmate || localGameState?.isTimeout || localGameState?.isStalemate || localGameState?.isDraw || localGameState?.winner);
        if (isGameOverBefore) return;

        // Force depth 6 for AI vs AI to ensure consistency with review
        const targetDepth = isAiVsAi ? 6 : undefined;
        const result: any = await getBestMove(localGameState.fen, isAiVsAi, aiDifficulty, targetDepth);
        console.log('AI Result Received:', result);

        // Check if the game ended while AI was thinking (e.g., opponent resigned)
        const currentLocalGameState = localGame.getState();
        const isGameOverAfter = !!(currentLocalGameState?.isCheckmate || currentLocalGameState?.isTimeout || currentLocalGameState?.isStalemate || currentLocalGameState?.isDraw || currentLocalGameState?.winner);
        if (isGameOverAfter) return;

        if (result.evaluation !== undefined) {
          setEvalScore(result.evaluation);
          setEvalDepth(result.depth || 4);
          if (result.variations) setEvalVariations(result.variations);
        }

        if (result.type === 'RESIGN') {
          executeAction({ type: 'resign' });
          return;
        }

        const bestMove = result.move;
        if (bestMove && bestMove.to !== -1) {
          console.log('AI Attempting Move:', bestMove);
          const typeMap: Record<number, PieceType> = { 1: 'p', 2: 'n', 3: 'b', 4: 'r', 5: 'q', 6: 'k' };
          const toSquare = `${'abcdefgh'[bestMove.to % 8]}${Math.floor(bestMove.to / 8) + 1}`;

          if (bestMove.type === 'SUMMON') {
            executeAction({ type: 'summon', piece: typeMap[bestMove.piece], square: toSquare } as Action, bestMove);
          } else {
            const fromSquare = `${'abcdefgh'[bestMove.from % 8]}${Math.floor(bestMove.from / 8) + 1}`;
            executeAction({ type: 'move', from: fromSquare, to: toSquare } as Action, bestMove);
          }
        }
      };

      const timer = setTimeout(handleAiMove, isAiVsAi ? 100 : 200);
      return () => clearTimeout(timer);
    }
  }, [isAi, aiLoaded, localGameState?.turn, myColor, isAiVsAi]);

  // Handle Analysis Evaluation
  useEffect(() => {
    if (isAnalysis && aiLoaded && localGameState && !localGameState.winner) {
      const runEval = async () => {
        const result = await getBestMove(localGameState.fen);
        if (result.evaluation !== undefined) {
          setEvalScore(result.evaluation);
          setEvalDepth(result.depth || 4);
          if (result.variations) setEvalVariations(result.variations);
        }
      };
      runEval();
    }
  }, [isAnalysis, aiLoaded, localGameState?.fen]);

  // Handle Review Evaluation
  useEffect(() => {
    if (activeTab === 'review' && aiLoaded && reviewResults) {
      const runReviewAiLogic = async () => {
        // Find current FEN
        const currentFen = reviewIndex === -1 ? reviewResults.fens[0] : reviewResults.fens[reviewIndex! + 1];

        // Always run evaluation for the current position in review mode
        const result: any = await getBestMove(currentFen, false, 100, 6);

        if (result.evaluation !== undefined) {
          setEvalScore(result.evaluation);
          if (result.variations) setEvalVariations(result.variations);
        }
      };

      const timer = setTimeout(runReviewAiLogic, 500);
      return () => clearTimeout(timer);
    }
  }, [activeTab, aiLoaded, reviewIndex, reviewResults]);

  // Auto-start/continue review
  useEffect(() => {
    if (activeTab === 'review' && !isReviewingRef.current && gameState?.history?.length) {
      const currentMovesCount = reviewResults?.moves.length || 0;
      if (currentMovesCount < gameState.history.length) {
        handleStartReview(currentMovesCount > 0);
      }
    }
  }, [gameState?.history?.length, activeTab, !!reviewResults]);

  // Handle Premove execution
  useEffect(() => {
    if (!isSpectator && gameState?.turn === myColor && premove && !gameState.winner) {
      const actionToTry = premove;
      setPremove(null);
      executeAction(actionToTry);
    }
  }, [gameState?.turn, myColor, premove, gameState?.winner, isSpectator]);

  // Scroll chat to bottom
  useEffect(() => {
    if (gameState?.chat && gameState.chat.length > lastChatCount) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setLastChatCount(gameState.chat.length);
    }
  }, [gameState?.chat, lastChatCount]);

  // Reset selection when turn changes
  useEffect(() => {
    if (isAnalysis || (!isSpectator && gameState?.turn === myColor)) {
      setValidTargetSquares([]);
      setSelectedSquare(null);
      setSelectedHandPiece(null);
    }
  }, [gameState?.turn, myColor, isSpectator, isAnalysis]);

  // Error handling: Only show full error screen if we don't have existing state and it's a definitive error
  const isFetchingInitial = !gameState && !error;
  const isErrorDefinitive = error && (!gameState || error.status === 404);

  if (isErrorDefinitive) {
    return (
      <div className={styles.errorContainer}>
        <h2>{error.status === 404 ? '게임을 찾을 수 없습니다' : '통신 오류가 발생했습니다'}</h2>
        <p>게임이 종료되었거나 유효하지 않은 링크입니다.</p>
        <button onClick={() => window.location.href = '/'}>홈으로 돌아가기</button>
      </div>
    );
  }

  if (isFetchingInitial) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>게임을 불러오는 중...</p>
      </div>
    );
  }

  // If we reach here, we have a gameState but maybe a background error
  const connectionLost = !!(error && gameState);

  if (!gameState) return null; // Should be handled by isFetchingInitial above, but for TS completeness

  const handleSquareClick = async (square: string) => {
    const isGameOver = gameState.winner || gameState.isStalemate || gameState.isDraw || gameState.isTimeout;

    if (activeTab === 'review') return;

    if (isGameOver || isSpectator) return;

    if (isAnalysis || gameState.turn === myColor) {
      if (selectedHandPiece) {
        if (validTargetSquares.includes(square)) {
          await executeAction({ type: 'summon', piece: selectedHandPiece, square } as Action);
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
          await executeAction({ type: 'move', from: selectedSquare, to: square } as Action);
          return;
        }
      }

      import('chess.js').then(({ Chess }) => {
        const chess = new Chess(getStandardFen(gameState.fen));
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
      if (selectedHandPiece) {
        setPremove({ type: 'summon', piece: selectedHandPiece, square } as Action);
        setSelectedHandPiece(null);
        setValidTargetSquares([]);
      } else if (selectedSquare) {
        if (selectedSquare === square) {
          setSelectedSquare(null);
          setPremove(null);
          return;
        }
        setPremove({ type: 'move', from: selectedSquare, to: square } as Action);
        setSelectedSquare(null);
        setValidTargetSquares([]);
      } else {
        import('chess.js').then(({ Chess }) => {
          const chess = new Chess(getStandardFen(gameState.fen));
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
    const isGameOver = gameState.winner || gameState.isStalemate || gameState.isDraw || gameState.isTimeout;

    if (activeTab === 'review') return;

    if (isGameOver || isSpectator) return;

    if (!piece) {
      setSelectedHandPiece(null);
      setValidTargetSquares([]);
      return;
    }

    setSelectedHandPiece(piece);
    setSelectedSquare(null);

    if (isAnalysis || gameState.turn === myColor) {
      Promise.all([
        import('chess.js'),
        import('@/lib/game/engine')
      ]).then(([{ Chess }, { isReachableByOwnPiece }]) => {
        const chess = new Chess(getStandardFen(gameState.fen));
        const valid: string[] = [];
        for (let r = 1; r <= 8; r++) {
          for (let c = 0; c < 8; c++) {
            const sq = `${'abcdefgh'[c]}${r}`;
            if (!chess.get(sq as any)) {
              // In analysis, use current turn; in game, use myColor
              const col = isAnalysis ? gameState.turn : myColor;
              if (!isReachableByOwnPiece(chess, sq as any, col)) continue;
              if (piece === 'p' && (r === 1 || r === 8)) continue;
              valid.push(sq);
            }
          }
        }
        setValidTargetSquares(valid);
      });
    } else {
      setValidTargetSquares([]);
    }
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    const nickname = username || 'Unknown';
    const text = chatInput;
    setChatInput('');
    await executeAction({ type: 'chat', text, nickname } as Action);
  };

  const handleResign = async () => {
    if (isSpectator) return;
    if (!confirm('정말 기권하시겠습니까?')) return;
    await executeAction({ type: 'resign' } as Action);
  };

  const handleReturnToLobby = async () => {
    if (isAnalysis || isAi) {
      window.location.href = '/';
      return;
    }

    try {
      if (gameState?.roomCode) {
        await fetch(`/api/room/${gameState.roomCode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, action: 'reset' })
        });
        window.location.href = `/room/${gameState.roomCode}`;
      } else {
        window.location.href = '/';
      }
    } catch (e) {
      window.location.href = '/';
    }
  };

  const handleQuit = async () => {
    if (isAnalysis || isAi) {
      window.location.href = '/';
      return;
    }

    if (gameState?.roomCode) {
      try {
        await fetch(`/api/room/${gameState.roomCode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, action: 'leave' }),
        });
      } catch (e) {
        console.error('Failed to leave room:', e);
      }
    }
    window.location.href = '/';
  };

  const opponentColor = myColor === 'w' ? 'b' : 'w';
  const opponentDeck = myColor === 'w' ? gameState.blackDeck : gameState.whiteDeck;
  const myDeck = myColor === 'w' ? gameState.whiteDeck : gameState.blackDeck;
  const opponentTime = myColor === 'w' ? gameState.blackTime : gameState.whiteTime;
  const myTime = myColor === 'w' ? gameState.whiteTime : gameState.blackTime;

  const handleUndoRequest = async () => {
    await executeAction({ type: 'undo_request' } as Action);
  };

  const handleUndoResponse = async (accept: boolean) => {
    await executeAction({ type: 'undo_response', accept } as Action);
  };

  const handleCopyNotation = () => {
    if (!gameState?.history) return;

    let notation = '';
    for (let i = 0; i < gameState.history.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = gameState.history[i];
      const blackMove = gameState.history[i + 1] || '';
      notation += `${moveNum}. ${whiteMove} ${blackMove}\n`;
    }

    navigator.clipboard.writeText(notation.trim());
    alert('기보가 복사되었습니다!');
  };

  const handleStartReview = async (isAppend = false) => {
    if (isReviewingRef.current) return;
    if (!gameState?.history || gameState.history.length === 0) return;

    const startIndex = (isAppend && reviewResults) ? reviewResults.moves.length : 0;
    if (isAppend && startIndex >= gameState.history.length) return;

    isReviewingRef.current = true;
    setReviewProgress({ current: startIndex, total: gameState.history.length });

    if (!isAppend) {
      setReviewResults(null);
      setReviewIndex(null);
    }

    // Create or continue a temporary game to replay history
    const lastFen = (isAppend && reviewResults) ? reviewResults.fens[reviewResults.fens.length - 1] : undefined;
    const reviewGame = new SummonChessGame(lastFen);

    const analyzedMoves: MoveAnalysis[] = (isAppend && reviewResults) ? [...reviewResults.moves] : [];
    const positions: string[] = (isAppend && reviewResults) ? [...reviewResults.fens] : [reviewGame.getState().fen];

    for (let i = startIndex; i < gameState.history.length; i++) {
      const moveStr = gameState.history[i];
      const turn = reviewGame.getState().turn;
      const fenBefore = reviewGame.getState().fen;

      const engineResult = await getBestMove(fenBefore, false, 100, 6);
      const bestEval = engineResult.evaluation || 0;
      const bestMoveStr = engineResult.move ? formatMoveActionShort(engineResult.move) : '';
      const topVars = engineResult.variations || [];

      let playedEval = bestEval;
      let playedAction: Action | null = null;
      let toSquare = '';

      if (moveStr.includes('@')) {
        const [pStr, sq] = moveStr.split('@');
        toSquare = sq;
        playedAction = { type: 'summon', piece: pStr.toLowerCase() as PieceType, square: sq } as Action;
      } else {
        const tempChess = new Chess(getStandardFen(fenBefore));
        try {
          const move = tempChess.move(moveStr);
          toSquare = move.to;
          playedAction = { type: 'move', from: move.from, to: move.to, promotion: move.promotion } as Action;
        } catch (e) {
          console.error("Failed to parse history move:", moveStr);
        }
      }

      let stateAfter = reviewGame.getState();
      if (playedAction) {
        reviewGame.executeAction(playedAction);
        stateAfter = reviewGame.getState();
        positions.push(stateAfter.fen);

        const playedMoveStr = formatMoveActionShort(playedAction);
        if (stateAfter.isCheckmate) {
          const MATE_VAL = 50000;
          playedEval = turn === 'w' ? MATE_VAL : -MATE_VAL;
        } else if (playedMoveStr === bestMoveStr) {
          playedEval = bestEval;
        } else {
          const matchedVar = engineResult.variations?.find(v => formatMoveActionShort(v.move) === playedMoveStr);
          if (matchedVar) {
            playedEval = matchedVar.evaluation;
          } else {
            const nextRes = await getBestMove(stateAfter.fen, false, 100, 6);
            playedEval = nextRes.evaluation !== undefined ? nextRes.evaluation : bestEval;
          }
        }
      }

      const perspective = turn === 'w' ? 1 : -1;
      const loss = (bestEval - playedEval) * perspective;
      let classification: MoveClassification = 'best';

      const legalActionsCount = reviewGame.getLegalActionsCount();
      const isForced = legalActionsCount === 1;

      if (isForced) {
        classification = 'forced';
      } else if (loss < 20) {
        const beforeScore = bestEval * perspective;
        const afterScore = playedEval * perspective;
        const sortedVars = engineResult.variations?.sort((a, b) => (b.evaluation - a.evaluation) * perspective) || [];
        const secondBestEval = sortedVars.length > 1 ? sortedVars[1].evaluation : (bestEval - 500 * perspective);
        const secondBestLoss = Math.abs(bestEval - secondBestEval);

        if (loss < 10) {
          if (afterScore > beforeScore + 100 && beforeScore < 200 && secondBestLoss > 150) classification = 'brilliant';
          else if (secondBestLoss > 100 && afterScore > 50) classification = 'great';
          else classification = 'best';
        } else classification = 'best';
      } else if (loss < 50) classification = 'excellent';
      else if (loss < 120) classification = 'good';
      else {
        const bestAdvantage = bestEval * perspective;
        const playedAdvantage = playedEval * perspective;
        if (bestAdvantage > 200 && playedAdvantage < 50 && !stateAfter.isCheckmate) classification = 'miss';
        else if (loss < 300) classification = 'inaccuracy';
        else if (loss < 600) classification = 'mistake';
        else {
          if (bestAdvantage < -600 && !stateAfter.isCheckmate) classification = 'mistake';
          else classification = 'blunder';
        }
      }

      let moveAccuracy = calculateAccuracy(bestEval, playedEval, turn);
      if (classification === 'brilliant' || classification === 'great' || classification === 'best' || stateAfter.isCheckmate) {
        moveAccuracy = 100;
      }

      analyzedMoves.push({
        move: moveStr,
        classification,
        evaluation: playedEval,
        bestMove: bestMoveStr,
        accuracy: moveAccuracy,
        color: turn,
        toSquare,
        variations: topVars
      });

      // Update state incrementally for "natural" feel
      const wMoves = analyzedMoves.filter(m => m.color === 'w');
      const bMoves = analyzedMoves.filter(m => m.color === 'b');
      const wAccTotal = wMoves.reduce((acc, m) => acc + m.accuracy, 0);
      const bAccTotal = bMoves.reduce((acc, m) => acc + m.accuracy, 0);

      setReviewResults({
        whiteAccuracy: wMoves.length > 0 ? wAccTotal / wMoves.length : 100,
        blackAccuracy: bMoves.length > 0 ? bAccTotal / bMoves.length : 100,
        moves: [...analyzedMoves],
        fens: [...positions]
      });

      setReviewProgress({ current: i + 1, total: gameState.history.length });
    }

    isReviewingRef.current = false;
    setReviewProgress(null);
    if (!isAppend) {
      setReviewIndex(analyzedMoves.length - 1);
    }
  };


  const renderControls = () => {
    return (
      <>
        {isAi && !isAiVsAi && (
          <div className={styles.difficultyControl}>
            <h3>AI 뇌 사용량 ({aiDifficulty}%)</h3>
            <div className={styles.sliderContainer}>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={aiDifficulty}
                onChange={(e) => setAiDifficulty(parseInt(e.target.value))}
                className={styles.difficultySlider}
                disabled={true}
              />
              <div className={styles.sliderLabels}>
                <span>10% (초보)</span>
                <span>100% (천재)</span>
              </div>
            </div>
            <p className={styles.difficultyDesc}>
              {aiDifficulty <= 30 && "컴퓨터가 아주 단순한 실수를 자주 합니다."}
              {aiDifficulty > 30 && aiDifficulty <= 70 && "컴퓨터가 적당한 지능으로 대결합니다."}
              {aiDifficulty > 70 && aiDifficulty < 100 && "컴퓨터가 꽤 날카로운 수를 둡니다."}
              {aiDifficulty === 100 && "컴퓨터가 최선을 다해 승리를 노립니다."}
            </p>
          </div>
        )}
        {(isAi || isAiVsAi || isAnalysis || (gameState && (gameState.winner || gameState.isDraw))) && (
          <button
            className={activeTab === 'review' ? styles.activeControl : ''}
            onClick={() => setActiveTab('review')}
          >
            🔍 게임 리뷰
          </button>
        )}
        <button onClick={() => setBoardOrientation(boardOrientation === 'w' ? 'b' : 'w')}>🔄 보드 뒤집기</button>
        {!isAnalysis && <button onClick={handleUndoRequest} disabled={!!gameState.undoRequest || gameState.history.length === 0}>↩️ 무르기</button>}
        {isAnalysis && <button onClick={handleUndoRequest} disabled={gameState.history.length === 0}>↩️ 무르기</button>}
        {!isAnalysis && <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/room/${gameId}`); alert('링크가 복사되었습니다!'); }}>📋 링크 공유</button>}
        <button onClick={handleCopyNotation}>📝 기보 복사</button>
        <button onClick={() => alert('🎮 조작 가이드\n\n• 왼쪽: 소환 가능한 기물 목록 (클릭 후 보드에 소환)\n• 중앙: 체스 보드 및 타이머\n• 오른쪽: 실시간 채팅\n• 프리무브: 상대 차례에 예약 가능')}>❓ 가이드</button>
        {!isAnalysis && !gameState.winner && !isAiVsAi && !isSpectator && (
          <button className={styles.resignButton} onClick={handleResign}>🏳️ 기권</button>
        )}
        {(isAnalysis || gameState.winner || isSpectator) && (
          <button onClick={isSpectator ? handleQuit : handleReturnToLobby}>
            🚪 {isAnalysis ? '그만하기' : (isSpectator ? '나가기' : '대기실로')}
          </button>
        )}
        {isAi && !isAiVsAi && (
          <button onClick={() => {
            if (confirm('게임을 재시작하시겠습니까?')) {
              const newGame = new SummonChessGame();
              setLocalGame(newGame);
              setLocalGameState(newGame.getState());
              setReviewResults(null);
              setReviewProgress(null);
              setReviewIndex(null);
              setReviewIndex(null);
              // setIsAnalysis(false) is not available as it is a prop. 
              // For AI mode restart, resetting localGame is sufficient.
              setShowVictory(false);
              setFinalResult(null);
            }
          }}>🔄 재시작</button>
        )}
      </>
    );
  };

  return (
    <div className={styles.container}>
      {showVictory && finalResult && (
        <CheckmateOverlay
          winner={finalResult.winner}
          isTimeout={finalResult.isTimeout}
          isStalemate={finalResult.isStalemate}
          isCheckmate={finalResult.isCheckmate}
          onAutoClose={() => setShowVictory(false)}
        />
      )}

      {gameState.undoRequest && gameState.undoRequest.status === 'pending' && (
        <div className={styles.undoOverlay}>
          <div className={styles.undoCard}>
            <h3>무르기 요청</h3>
            <p>{gameState.undoRequest.from === 'w' ? '백' : '흑'}이 무르기를 요청했습니다.</p>
            {gameState.undoRequest.from !== (isAnalysis ? gameState.turn : myColor) ? (
              <div className={styles.undoButtons}>
                <button className={styles.confirmBtn} onClick={() => handleUndoResponse(true)}>수락</button>
                <button className={styles.declineBtn} onClick={() => handleUndoResponse(false)}>거절</button>
              </div>
            ) : (
              <p className={styles.waitingUndo}>상대의 응답을 기다리는 중...</p>
            )}
          </div>
        </div>
      )}

      <div className={styles.header}>
        <h2>소환 체스</h2>
        {connectionLost && (
          <div style={{ color: '#e74c3c', fontSize: '0.8rem', fontWeight: 'bold' }}>
            🛰️ 연결 상태 불안정 (재연결 시도 중...)
          </div>
        )}
        <div className={styles.status}>
          {isSpectator && <span className={styles.spectatingBadge}>👀 관전 중</span>}
          {isAiVsAi && <span className={styles.spectatingBadge}>🤖 AI vs AI (학습 중)</span>}
          <span>차례: {gameState.turn === 'w' ? '⚪ 백' : '⚫ 흑'}</span>
          {gameState.isCheck && <span className={styles.check}>⚠️ 체크!</span>}
          {gameState.isCheckmate && <span className={styles.mate}>👑 체크메이트!</span>}
          {gameState.isTimeout && <span className={styles.mate}>⏰ 시간초과!</span>}
          {gameState.isStalemate && <span className={styles.draw}>🤝 스테일메이트</span>}
          {gameState.winner && !gameState.isCheckmate && !gameState.isTimeout && (
            <span className={styles.mate}>🏳️ {gameState.resignedBy === 'w' ? '백' : (gameState.resignedBy === 'b' ? '흑' : (gameState.winner === 'b' ? '백' : '흑'))} 기권</span>
          )}
        </div>
      </div>

      <div className={styles.mainLayout}>
        {/* Left Sidebar: Hand / Summons */}
        <div className={styles.leftSidebar}>
          <div className={styles.sidebarSection}>
            <h3>{isAnalysis || isSpectator ? (myColor === 'w' ? '백 기물' : '흑 기물') : '나의 기물'}</h3>
            <Hand
              pieces={activeTab === 'review' && reviewResults && reviewIndex !== null
                ? (SummonChessGame.parseExtendedFen(reviewIndex === -1 ? reviewResults.fens[0] : reviewResults.fens[reviewIndex + 1]).whiteDeck || [])
                : (myColor === 'w' ? gameState.whiteDeck : gameState.blackDeck)}
              color={myColor}
              onSelect={handleHandSelect}
              selectedPiece={selectedHandPiece}
              disabled={isSpectator || activeTab === 'review' || (gameState.turn !== myColor && !isAnalysis)}
            />
          </div>
          <div className={styles.sidebarSection}>
            <h3>{isAnalysis || isSpectator ? (opponentColor === 'w' ? '백 기물' : '흑 기물') : '상대 기물'}</h3>
            <Hand
              pieces={activeTab === 'review' && reviewResults && reviewIndex !== null
                ? (SummonChessGame.parseExtendedFen(reviewIndex === -1 ? reviewResults.fens[0] : reviewResults.fens[reviewIndex + 1]).blackDeck || [])
                : (opponentColor === 'w' ? gameState.whiteDeck : gameState.blackDeck)}
              color={opponentColor}
              onSelect={handleHandSelect}
              selectedPiece={selectedHandPiece}
              disabled={isSpectator || activeTab === 'review' || (gameState.turn !== opponentColor && !isAnalysis) || !isAnalysis}
            />
          </div>
        </div>

        {/* Center: Board + Timers */}
        <div className={styles.centerArea}>
          <div className={styles.timerBar}>
            <TimerDisplay
              seconds={isSpectator ? gameState.blackTime : opponentTime}
              active={!isAnalysis && !gameState.winner && (isSpectator ? gameState.turn === 'b' : gameState.turn !== myColor)}
            />
          </div>

          <div className={styles.boardWrapper}>
            {((isAi || isAiVsAi || isAnalysis) || activeTab === 'review') && showEvalBar && showVariations && (
              <VariationsView
                variations={activeTab === 'review' && reviewResults && reviewIndex !== null && reviewIndex >= 0
                  ? reviewResults.moves[reviewIndex].variations || []
                  : evalVariations}
                depth={activeTab === 'review' ? 6 : evalDepth}
              />
            )}
            <Board
              fen={activeTab === 'review' && reviewResults && reviewIndex !== null
                ? (reviewIndex === -1 ? reviewResults.fens[0] : reviewResults.fens[reviewIndex + 1])
                : gameState.fen}
              onSquareClick={handleSquareClick}
              selectedSquare={selectedSquare}
              validTargetSquares={validTargetSquares}
              orientation={boardOrientation}
              lastMove={activeTab === 'review' && reviewResults && reviewIndex !== null ? (
                reviewIndex >= 0 ? { from: '', to: reviewResults.moves[reviewIndex].toSquare } : null
              ) : gameState.lastMove}
              isCheckmate={activeTab === 'review' && reviewResults && reviewIndex !== null && reviewIndex >= 0 && reviewResults.fens[reviewIndex + 1].includes('mate') ? true : gameState.isCheckmate}
              premove={premove as any}
              annotations={activeTab === 'review' && reviewResults && reviewIndex !== null && reviewIndex >= 0 ? {
                [reviewResults.moves[reviewIndex].toSquare]: {
                  icon: getClassificationIcon(reviewResults.moves[reviewIndex].classification),
                  color: getClassificationColor(reviewResults.moves[reviewIndex].classification),
                  class: reviewResults.moves[reviewIndex].classification
                }
              } : null}
            />
            {((isAi || isAiVsAi || isAnalysis) || activeTab === 'review') && showEvalBar && (
              <EvalBar
                score={activeTab === 'review' && reviewResults && reviewIndex !== null
                  ? (reviewIndex === -1 ? 0 : reviewResults.moves[reviewIndex].evaluation)
                  : evalScore}
                depth={activeTab === 'review' ? 6 : evalDepth}
              />
            )}
          </div>

          <div className={styles.timerBar}>
            <TimerDisplay
              seconds={isSpectator ? gameState.whiteTime : myTime}
              active={!isAnalysis && !gameState.winner && (isSpectator ? gameState.turn === 'w' : gameState.turn === myColor)}
            />
          </div>

          {premove && (
            <div className={styles.premoveNotice}>
              <span>⚡ 프리무브: {premove.type === 'move' ? `${(premove as any).from}→${(premove as any).to}` : `소환(${(premove as any).piece.toUpperCase()}@${(premove as any).square})`}</span>
              <button onClick={() => setPremove(null)}>✖</button>
            </div>
          )}
        </div>

        {/* Right Sidebar: Chat & History */}
        <div className={styles.rightSidebar}>
          <div className={styles.tabHeader}>
            <button
              className={`${styles.tabButton} ${activeTab === 'chat' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              💬 채팅
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === 'history' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('history')}
            >
              📜 기보
            </button>
            <button
              className={`${styles.tabButton} ${styles.mobileOnly} ${activeTab === 'hands' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('hands')}
            >
              ♟️ 기물
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === 'review' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('review')}
            >
              🔍 리뷰
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === 'menu' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('menu')}
            >
              ⚙️ 기타
            </button>
          </div>

          <div className={styles.tabContent}>
            {activeTab === 'chat' ? (
              <div className={styles.chatContainer}>
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
            ) : activeTab === 'history' ? (
              <div className={styles.historyContainer}>
                <div className={styles.historyList}>
                  {gameState.history && gameState.history.length > 0 ? (
                    gameState.history.map((move, index) => {
                      const isWhite = index % 2 === 0;
                      const moveNum = Math.floor(index / 2) + 1;
                      return (
                        <div key={index} className={styles.historyItem}>
                          {isWhite && <span className={styles.moveNum}>{moveNum}.</span>}
                          <span className={isWhite ? styles.moveWhite : styles.moveBlack}>{move}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.emptyHistory}>아직 기록된 수가 없습니다.</div>
                  )}
                  <div ref={historyEndRef} />
                </div>
              </div>
            ) : activeTab === 'hands' ? (
              <div className={styles.handTabContainer}>
                <div className={styles.sidebarSection}>
                  <h3>{isAnalysis || isSpectator ? (myColor === 'w' ? '백 기물' : '흑 기물') : '나의 기물'}</h3>
                  <Hand
                    pieces={myDeck}
                    color={myColor}
                    onSelect={handleHandSelect}
                    selectedPiece={selectedHandPiece}
                    disabled={isSpectator || (gameState.turn !== myColor && !isAnalysis)}
                  />
                </div>
                <div className={styles.sidebarSection}>
                  <h3>{isAnalysis || isSpectator ? (opponentColor === 'w' ? '백 기물' : '흑 기물') : '상대 기물'}</h3>
                  <Hand
                    pieces={opponentDeck}
                    color={opponentColor}
                    onSelect={handleHandSelect}
                    selectedPiece={selectedHandPiece}
                    disabled={isSpectator || (gameState.turn !== opponentColor && !isAnalysis) || !isAnalysis}
                  />
                </div>
              </div>
            ) : activeTab === 'review' ? (
              <div className={styles.reviewContainer}>
                {!reviewResults && !reviewProgress ? (
                  <div className={styles.reviewProgress}>
                    <h3>분석 준비 중...</h3>
                  </div>
                ) : reviewProgress && (!reviewResults || reviewResults.moves.length === 0) ? (
                  <div className={styles.reviewProgress}>
                    <h3>분석 시작...</h3>
                    <p>{reviewProgress.current} / {reviewProgress.total}</p>
                  </div>
                ) : (
                  <>
                    <div className={styles.reviewHeader}>
                      <div className={styles.accuracyRow}>
                        <div className={`${styles.accuracyBox} ${styles.accuracyWhite}`}>
                          <span className={styles.accuracyValue}>{Math.round(reviewResults?.whiteAccuracy || 0)}%</span>
                          <span className={styles.accuracyLabel}>백 정확도</span>
                        </div>
                        <div className={`${styles.accuracyBox} ${styles.accuracyBlack}`}>
                          <span className={styles.accuracyValue}>{Math.round(reviewResults?.blackAccuracy || 0)}%</span>
                          <span className={styles.accuracyLabel}>흑 정확도</span>
                        </div>
                      </div>
                      {reviewProgress && (
                        <div className={styles.miniProgress}>
                          분석 중... ({reviewProgress.current}/{reviewProgress.total})
                        </div>
                      )}
                    </div>
                    <div className={styles.reviewMoves}>
                      {reviewResults?.moves.map((move: MoveAnalysis, i: number) => (
                        <div
                          key={i}
                          className={clsx(
                            styles.reviewMoveItem,
                            reviewIndex === i && styles.selectedReviewMove,
                            move.color === 'w' ? styles.whiteMove : styles.blackMove
                          )}
                          onClick={() => setReviewIndex(i)}
                        >
                          <div className={`${styles.classificationIcon} ${styles['icon_' + move.classification]}`}>
                            {getClassificationIcon(move.classification)}
                          </div>
                          <div className={styles.moveInfo}>
                            <div className={styles.moveMain}>
                              <span className={styles.moveName}>{Math.floor(i / 2) + 1}. {move.move}</span>
                              <span className={styles.moveClassLabel} style={{ color: getClassificationColor(move.classification) }}>
                                {getClassificationText(move.classification)}
                              </span>
                            </div>
                            {move.classification !== 'best' && move.classification !== 'brilliant' && move.classification !== 'forced' && (
                              <button
                                className={styles.showVarsBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShownVariationsIndex(i);
                                }}
                              >
                                수순보기
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className={styles.reviewNav}>
                      <button
                        className={styles.navBtn}
                        disabled={reviewIndex === null || reviewIndex < 0}
                        onClick={() => setReviewIndex(prev => (prev !== null ? (prev === -1 ? -1 : prev - 1) : -1))}
                      >
                        이전
                      </button>
                      <div className={styles.navInfo}>
                        {reviewIndex !== null ? (reviewIndex === -1 ? "시작" : `${reviewIndex + 1} / ${reviewResults?.moves.length}`) : "-"}
                      </div>
                      <button
                        className={styles.navBtn}
                        disabled={reviewIndex === null || reviewIndex >= (reviewResults?.moves.length || 0) - 1}
                        onClick={() => setReviewIndex(prev => (prev !== null ? Math.min((reviewResults?.moves.length || 0) - 1, prev + 1) : 0))}
                      >
                        다음
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.menuTabContainer}>
                <div className={styles.mobileControls}>
                  {renderControls()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      {isAnalysis && (
        <div className={styles.analysisTools}>
          <input
            type="text"
            placeholder="FEN 입력..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const target = e.target as HTMLInputElement;
                try {
                  const newGame = new SummonChessGame(target.value);
                  setLocalGame(newGame);
                  setLocalGameState(newGame.getState());
                  target.value = '';
                } catch (e) {
                  alert('올바르지 않은 FEN입니다.');
                }
              }
            }}
          />
          <button onClick={() => {
            if (gameState) {
              const fullFen = SummonChessGame.toExtendedFen(getStandardFen(gameState.fen), gameState.whiteDeck, gameState.blackDeck);
              navigator.clipboard.writeText(fullFen);
              alert('현재 FEN이 복사되었습니다.');
            }
          }}>현재 FEN 복사</button>
        </div>
      )}
      {shownVariationsIndex !== null && reviewResults && (
        <VariationsModal
          move={reviewResults.moves[shownVariationsIndex]}
          onClose={() => setShownVariationsIndex(null)}
        />
      )}
    </div>
  );
}
