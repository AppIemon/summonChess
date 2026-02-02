"use client";

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import styles from './page.module.css';

interface UserInfo {
  id: string;
  nickname: string;
  elo: number;
  tier: string;
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [roomCode, setRoomCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [error, setError] = useState('');

  // Initialize User
  useEffect(() => {
    const initUser = async () => {
      let id = localStorage.getItem('playerId');
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('playerId', id);
      }

      try {
        const res = await fetch('/api/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: id }),
        });
        const data = await res.json();
        if (data.success) {
          setUserInfo(data.user);
        }
      } catch (e) {
        console.error('Failed to sync user', e);
      }
    };
    initUser();
  }, []);

  // Matchmaking Polling
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (isSearching && userInfo) {
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/matchmaking?playerId=${userInfo.id}`);
          const data = await res.json();

          if (data.status === 'matched' && data.roomCode) {
            router.push(`/room/${data.roomCode}`);
          }
        } catch (e) {
          console.error('Poll error', e);
        }
      }, 2000);
    }

    return () => clearInterval(pollInterval);
  }, [isSearching, userInfo, router]);

  const handleCreateRoom = async () => {
    if (!userInfo) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: userInfo.id }), // Nickname handled by server
      });

      const data = await res.json();
      if (data.success && data.roomCode) {
        router.push(`/room/${data.roomCode}`);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (e) {
      setError('방 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = () => {
    if (!roomCode.trim()) {
      setError('방 코드를 입력해주세요.');
      return;
    }
    router.push(`/room/${roomCode.trim().toUpperCase()}`);
  };

  const toggleMatchmaking = async () => {
    if (!userInfo) return;

    if (isSearching) {
      // Cancel
      setIsSearching(false);
      // Ideally call API to cancel
    } else {
      // Start
      setIsSearching(true);
      try {
        await fetch('/api/matchmaking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: userInfo.id }),
        });
      } catch (e) {
        setError('매칭 시작 실패');
        setIsSearching(false);
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.logo}>♔♚</div>
          <h1 className={styles.title}>소환 체스</h1>
          <p className={styles.subtitle}>
            ELO 시스템 & 랭크 매치 도입!
          </p>
        </div>

        {/* User Stats */}
        {userInfo && (
          <div className={styles.userStats}>
            <div className={styles.tierBadge}>{userInfo.tier}</div>
            <div className={styles.userName}>{userInfo.nickname}</div>
            <div className={styles.userElo}>Rating: {userInfo.elo}</div>
          </div>
        )}

        {/* Action Buttons */}
        <div className={styles.actions}>
          {/* Matchmaking Button */}
          <button
            className={`${styles.primaryButton} ${isSearching ? styles.searching : ''}`}
            onClick={toggleMatchmaking}
            disabled={!userInfo || loading}
          >
            {isSearching ? (
              <>
                <span className={styles.spinner}></span>
                매칭 중... (취소)
              </>
            ) : (
              <>
                <span className={styles.buttonIcon}>⚔️</span>
                랜덤 매칭
              </>
            )}
          </button>

          {!showJoinInput ? (
            <div className={styles.subActions}>
              <button
                className={styles.secondaryButton}
                onClick={handleCreateRoom}
                disabled={loading || isSearching}
              >
                방 만들기
              </button>

              <button
                className={styles.secondaryButton}
                onClick={() => setShowJoinInput(true)}
                disabled={loading || isSearching}
              >
                방 참가하기
              </button>
            </div>
          ) : (
            <div className={styles.joinSection}>
              <input
                type="text"
                className={styles.roomInput}
                placeholder="코드 입력"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
              />
              <div className={styles.joinButtons}>
                <button
                  className={styles.primaryButton}
                  onClick={handleJoinRoom}
                >
                  참가
                </button>
                <button
                  className={styles.cancelButton}
                  onClick={() => {
                    setShowJoinInput(false);
                    setRoomCode('');
                    setError('');
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
