"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface Spectator {
  id: string;
  nickname: string;
  elo?: number;
  tier?: string;
}

interface RoomInfo {
  roomCode: string;
  hostId: string;
  hostNickname: string;
  hostElo?: number;
  guestId?: string;
  guestNickname?: string;
  guestElo?: number;
  spectators: Spectator[];
  gameId?: string;
  status: 'waiting' | 'playing' | 'finished';
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState<string>('');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState<string>('');
  const [joining, setJoining] = useState(false);

  // Get room code from params
  useEffect(() => {
    params.then(p => setRoomCode(p.code.toUpperCase()));
  }, [params]);

  // Initialize player ID
  useEffect(() => {
    let id = localStorage.getItem('playerId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('playerId', id);
    }
    setPlayerId(id);
  }, []);

  // Fetch room status
  const fetchRoom = useCallback(async () => {
    if (!roomCode) return;

    try {
      const res = await fetch(`/api/room/${roomCode}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('방을 찾을 수 없습니다.');
          return;
        }
        throw new Error('Failed to fetch room');
      }

      const data = await res.json();
      setRoom(data.room);
      setIsHost(data.room.hostId === playerId);

      // If already playing and I am a player or spectator, redirect
      const isPlayer = data.room.hostId === playerId || data.room.guestId === playerId;
      const isSpectator = data.room.spectators.some((s: Spectator) => s.id === playerId);

      if (data.room.status === 'playing' && data.room.gameId && (isPlayer || isSpectator)) {
        router.push(`/game/${data.room.gameId}`);
      }
    } catch (e) {
      console.error('Fetch room error:', e);
    }
  }, [roomCode, playerId, router]);

  // Initial fetch and polling
  useEffect(() => {
    if (!roomCode || !playerId) return;

    fetchRoom();
    const interval = setInterval(fetchRoom, 1500);
    return () => clearInterval(interval);
  }, [roomCode, playerId, fetchRoom]);

  // Join room
  const handleJoin = async (asSpectator = false) => {
    if (!roomCode || !playerId || joining) return;

    setJoining(true);
    try {
      const res = await fetch(`/api/room/${roomCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, action: 'join', asSpectator }) // Nickname handled by server
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || '참가에 실패했습니다.');
      } else {
        setRoom(data.room);
        // If joined as spectator while playing, redirect immediately
        if (asSpectator && data.room.status === 'playing' && data.room.gameId) {
          router.push(`/game/${data.room.gameId}`);
        }
      }
    } catch (e) {
      setError('서버 연결에 실패했습니다.');
    } finally {
      setJoining(false);
    }
  };

  // Start game (host only)
  const handleStart = async () => {
    if (!roomCode || !playerId) return;

    try {
      const res = await fetch(`/api/room/${roomCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, action: 'start' })
      });

      const data = await res.json();
      if (data.success && data.gameId) {
        router.push(`/game/${data.gameId}`);
      } else {
        setError(data.error || '게임 시작에 실패했습니다.');
      }
    } catch (e) {
      setError('서버 연결에 실패했습니다.');
    }
  };

  // Leave room
  const handleLeave = async () => {
    if (!roomCode || !playerId) return;

    try {
      await fetch(`/api/room/${roomCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, action: 'leave' })
      });
    } catch (e) {
      console.error('Leave error:', e);
    }
    router.push('/');
  };

  // Not yet joined
  const isJoined = room && (
    room.hostId === playerId ||
    room.guestId === playerId ||
    room.spectators.some(s => s.id === playerId)
  );

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h2 className={styles.errorTitle}>오류</h2>
          <p className={styles.errorMessage}>{error}</p>
          <button className={styles.button} onClick={() => router.push('/')}>
            홈으로
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.spinner}></div>
          <p>방 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // Not joined yet - show join button
  if (!isJoined) {
    const isPlaying = room.status === 'playing';
    const isFull = !!room.guestId;

    const handleCopyCode = () => {
      navigator.clipboard.writeText(roomCode);
      alert('방 코드가 복사되었습니다!');
    };

    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h2 className={styles.title}>{isPlaying ? '관전하기' : '방 참가'}</h2>
          <div className={styles.roomCode}>{roomCode}</div>
          <p className={styles.subtitle}>
            <strong>{room.hostNickname}</strong>님의 방입니다
            {room.hostElo && <span className={styles.eloBadge}> ({room.hostElo})</span>}
            {isPlaying && <span className={styles.playingBadge}>게임 중</span>}
          </p>
          <div className={styles.buttonGroup}>
            <button
              className={styles.secondaryButton}
              onClick={handleCopyCode}
            >
              초대 코드 복사
            </button>
            {isHost && !isFull && !room.guestId && (
              <button
                className={styles.secondaryButton}
                onClick={async () => {
                  if (!confirm('AI 상대를 추가하시겠습니까?')) return;
                  try {
                    const res = await fetch(`/api/room/${roomCode}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ playerId, action: 'addBot' })
                    });
                    if (!res.ok) alert('AI 추가 실패');
                  } catch (e) {
                    alert('오류 발생');
                  }
                }}
              >
                🤖 AI 추가
              </button>
            )}
            {!isPlaying && !isFull && (
              <button
                className={styles.primaryButton}
                onClick={() => handleJoin(false)}
                disabled={joining}
              >
                {joining ? '참가 중...' : '플레이어로 참여'}
              </button>
            )}
            <button
              className={isPlaying || isFull ? styles.primaryButton : styles.secondaryButton}
              onClick={() => handleJoin(true)}
              disabled={joining}
            >
              {joining ? '참가 중...' : '관전자로 참여'}
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push('/')}>
              취소
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2 className={styles.title}>대기실</h2>

        <div className={styles.roomCodeSection}>
          <p className={styles.label}>방 코드</p>
          <div className={styles.roomCode}>{roomCode}</div>
          <button
            className={styles.copyButton}
            onClick={() => {
              navigator.clipboard.writeText(roomCode);
              alert('방 코드가 복사되었습니다!');
            }}
          >
            📋 복사
          </button>
        </div>

        <div className={styles.colorNotice}>
          🎲 색상은 게임 시작 시 랜덤 배정됩니다
        </div>

        <div className={styles.playerSection}>
          <h3>플레이어</h3>
          <div className={styles.playerList}>
            <div className={styles.player}>
              <span className={styles.playerIcon}>👤</span>
              <div className={styles.playerInfo}>
                <span className={styles.playerName}>
                  {room.hostNickname}
                  {room.hostId === playerId && <span className={styles.youBadge}>나</span>}
                  <span className={styles.hostBadge}>방장</span>
                </span>
                {room.hostElo && <span className={styles.playerElo}>Rating: {room.hostElo}</span>}
              </div>
              <span className={styles.readyStatus}>✓</span>
            </div>
            <div className={`${styles.player} ${!room.guestId ? styles.empty : ''}`}>
              <span className={styles.playerIcon}>👤</span>
              <div className={styles.playerInfo}>
                <span className={styles.playerName}>
                  {room.guestId ? (
                    <>
                      {room.guestNickname || '플레이어'}
                      {room.guestId === playerId && <span className={styles.youBadge}>나</span>}
                    </>
                  ) : (
                    '대기 중...'
                  )}
                </span>
                {room.guestId && room.guestElo && <span className={styles.playerElo}>Rating: {room.guestElo}</span>}
              </div>
              {room.guestId && <span className={styles.readyStatus}>✓</span>}
            </div>
          </div>
        </div>

        {room.spectators.length > 0 && (
          <div className={styles.spectatorSection}>
            <h3>관전자 ({room.spectators.length})</h3>
            <div className={styles.spectatorList}>
              {room.spectators.map(s => (
                <div key={s.id} className={styles.spectator}>
                  {s.nickname} ({s.elo || 400})
                  {s.id === playerId && <span className={styles.youBadge}>나</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.buttonGroup}>
          {isHost && (
            <button
              className={styles.primaryButton}
              onClick={handleStart}
              disabled={!room.guestId}
            >
              {room.guestId ? '🎮 게임 시작' : '대기 중...'}
            </button>
          )}
          {isHost && !room.guestId && (
            <button
              className={styles.secondaryButton}
              onClick={async () => {
                if (!confirm('AI 상대를 추가하시겠습니까?')) return;
                try {
                  const res = await fetch(`/api/room/${roomCode}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playerId, action: 'addBot' })
                  });
                  if (!res.ok) {
                    const data = await res.json();
                    alert(data.error || 'AI 추가 실패');
                  }
                } catch (e) {
                  alert('오류 발생');
                }
              }}
            >
              🤖 AI 추가
            </button>
          )}
          {!isHost && room.status === 'waiting' && room.guestId === playerId && (
            <div className={styles.waitingMessage}>
              <div className={styles.spinner}></div>
              <p>방장이 게임을 시작할 때까지 대기 중...</p>
            </div>
          )}
          {room.spectators.some(s => s.id === playerId) && (
            <div className={styles.waitingMessage}>
              <p>관전자로 대기 중입니다...</p>
            </div>
          )}
          <button className={styles.secondaryButton} onClick={handleLeave}>
            나가기
          </button>
        </div>
      </div>
    </div>
  );
}

