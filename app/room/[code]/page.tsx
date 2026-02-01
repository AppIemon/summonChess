"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface RoomInfo {
  roomCode: string;
  hostId: string;
  guestId?: string;
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

      // If game started, redirect
      if (data.room.status === 'playing' && data.room.gameId) {
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
  const handleJoin = async () => {
    if (!roomCode || !playerId || joining) return;

    setJoining(true);
    try {
      const res = await fetch(`/api/room/${roomCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, action: 'join' })
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || '참가에 실패했습니다.');
      } else {
        setRoom(data.room);
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
  const isJoined = room && (room.hostId === playerId || room.guestId === playerId);

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
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h2 className={styles.title}>방 참가</h2>
          <div className={styles.roomCode}>{roomCode}</div>
          <p className={styles.subtitle}>이 방에 참가하시겠습니까?</p>
          <div className={styles.buttonGroup}>
            <button
              className={styles.primaryButton}
              onClick={handleJoin}
              disabled={joining}
            >
              {joining ? '참가 중...' : '참가하기'}
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

        <div className={styles.playerSection}>
          <h3>플레이어</h3>
          <div className={styles.playerList}>
            <div className={styles.player}>
              <span className={styles.playerIcon}>♔</span>
              <span className={styles.playerName}>
                방장 (백)
                {room.hostId === playerId && <span className={styles.youBadge}>나</span>}
              </span>
              <span className={styles.readyStatus}>✓</span>
            </div>
            <div className={`${styles.player} ${!room.guestId ? styles.empty : ''}`}>
              <span className={styles.playerIcon}>♚</span>
              <span className={styles.playerName}>
                {room.guestId ? (
                  <>
                    게스트 (흑)
                    {room.guestId === playerId && <span className={styles.youBadge}>나</span>}
                  </>
                ) : (
                  '대기 중...'
                )}
              </span>
              {room.guestId && <span className={styles.readyStatus}>✓</span>}
            </div>
          </div>
        </div>

        <div className={styles.buttonGroup}>
          {isHost && (
            <button
              className={styles.primaryButton}
              onClick={handleStart}
              disabled={!room.guestId}
            >
              {room.guestId ? '게임 시작' : '대기 중...'}
            </button>
          )}
          {!isHost && (
            <div className={styles.waitingMessage}>
              <div className={styles.spinner}></div>
              <p>방장이 게임을 시작할 때까지 대기 중...</p>
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
