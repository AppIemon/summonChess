"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [error, setError] = useState('');

  // Get or create player ID
  const getPlayerId = () => {
    let id = localStorage.getItem('playerId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('playerId', id);
    }
    return id;
  };

  // Create a new room
  const createRoom = async () => {
    setLoading(true);
    setError('');

    try {
      const playerId = getPlayerId();
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });

      if (!res.ok) {
        throw new Error('Failed to create room');
      }

      const data = await res.json();
      if (data.success && data.roomCode) {
        router.push(`/room/${data.roomCode}`);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (e) {
      console.error('Create room error:', e);
      setError('방 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Join existing room
  const joinRoom = () => {
    if (!roomCode.trim()) {
      setError('방 코드를 입력해주세요.');
      return;
    }

    setError('');
    router.push(`/room/${roomCode.trim().toUpperCase()}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Logo & Title */}
        <div className={styles.header}>
          <div className={styles.logo}>♔♚</div>
          <h1 className={styles.title}>소환 체스</h1>
          <p className={styles.subtitle}>
            기존 체스에 소환 시스템을 더했습니다.<br />
            킹 하나로 시작하여 당신의 군대를 전장에 소환하세요.
          </p>
        </div>

        {/* Action Buttons */}
        <div className={styles.actions}>
          {!showJoinInput ? (
            <>
              <button
                className={styles.primaryButton}
                onClick={createRoom}
                disabled={loading}
              >
                {loading ? (
                  <span className={styles.buttonLoading}>
                    <span className={styles.spinner}></span>
                    방 생성 중...
                  </span>
                ) : (
                  <>
                    <span className={styles.buttonIcon}>➕</span>
                    방 만들기
                  </>
                )}
              </button>

              <button
                className={styles.secondaryButton}
                onClick={() => setShowJoinInput(true)}
                disabled={loading}
              >
                <span className={styles.buttonIcon}>🚪</span>
                방 참가하기
              </button>
            </>
          ) : (
            <div className={styles.joinSection}>
              <input
                type="text"
                className={styles.roomInput}
                placeholder="방 코드 입력 (예: ABC123)"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              />
              <div className={styles.joinButtons}>
                <button
                  className={styles.primaryButton}
                  onClick={joinRoom}
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

        {/* Error Message */}
        {error && <p className={styles.error}>{error}</p>}

        {/* Rules */}
        <div className={styles.rules}>
          <h3>게임 규칙</h3>
          <ul>
            <li>
              <span className={styles.ruleIcon}>♟️</span>
              턴마다 이동 또는 소환 중 하나를 선택
            </li>
            <li>
              <span className={styles.ruleIcon}>✨</span>
              자신의 기물이 도달할 수 있는 빈 칸에 소환 가능
            </li>
            <li>
              <span className={styles.ruleIcon}>💀</span>
              잡힌 기물은 영구적으로 제거됨
            </li>
            <li>
              <span className={styles.ruleIcon}>👑</span>
              체크메이트로 승리
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
