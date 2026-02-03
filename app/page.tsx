"use client";

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import styles from './page.module.css';
import AuthDialog from '@/components/AuthDialog';

interface UserInfo {
  id: string;
  nickname: string;
  elo: number;
  tier: string;
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const [roomCode, setRoomCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [error, setError] = useState('');
  const [initFailed, setInitFailed] = useState(false);

  // Initialize User
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();

        if (data.user) {
          setUserInfo({
            id: data.user.id,
            nickname: data.user.nickname,
            elo: data.user.rating,
            tier: data.user.tier || getTier(data.user.rating)
          });
        } else {
          setUserInfo(null);
          // Check if we should open auth modal automatically
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('auth') === 'true') {
            setIsAuthOpen(true);
          }
        }
      } catch (e) {
        console.error('Auth check failed', e);
        setUserInfo(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const getTier = (elo: number) => {
    if (elo < 1000) return 'BRONZE';
    if (elo < 1500) return 'SILVER';
    if (elo < 2000) return 'GOLD';
    return 'PLATINUM';
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  };

  const handleAuthSuccess = (user: any) => {
    setUserInfo({
      id: user.id,
      nickname: user.nickname,
      elo: user.rating,
      tier: user.tier || getTier(user.rating)
    });
    setIsAuthOpen(false);
  };

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
    if (!userInfo) {
      setIsAuthOpen(true);
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: userInfo.id }),
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

    if (!userInfo) {
      setIsAuthOpen(true);
      return;
    }

    router.push(`/room/${roomCode.trim().toUpperCase()}`);
  };

  const toggleMatchmaking = async () => {
    if (!userInfo) {
      setIsAuthOpen(true);
      return;
    }

    if (isSearching) {
      // Cancel
      setIsSearching(false);
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

        {/* User Stats & Auth */}
        <div className={styles.authWrapper}>
          {userInfo && (
            <div className={styles.userStats}>
              <div className={styles.tierBadge}>{userInfo.tier}</div>
              <div className={styles.userName}>{userInfo.nickname}</div>
              <div className={styles.userElo}>Rating: {userInfo.elo}</div>
              {userInfo.id.length > 30 ? ( // Guest IDs are usually UUIDs
                <button className={styles.loginButton} onClick={() => setIsAuthOpen(true)}>
                  로그인 / 회원가입
                </button>
              ) : (
                <button className={styles.logoutButton} onClick={handleLogout}>
                  로그아웃
                </button>
              )}
            </div>
          )}
        </div>

        <AuthDialog
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
          onSuccess={handleAuthSuccess}
        />

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

              <button
                className={styles.secondaryButton}
                onClick={() => router.push('/play/ai')}
                disabled={loading || isSearching}
              >
                🤖 컴퓨터와 대결
              </button>

              <button
                className={styles.secondaryButton}
                onClick={() => router.push('/analysis')}
                disabled={loading || isSearching}
              >
                🔬 분석 (혼자하기)
              </button>

              <button
                className={styles.secondaryButton}
                onClick={() => router.push('/play/ai-vs-ai')}
                disabled={loading || isSearching}
              >
                📺 AI 관전 모드 (학습)
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
