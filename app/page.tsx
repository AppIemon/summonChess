"use client";

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [error, setError] = useState('');

  // Load saved nickname
  useEffect(() => {
    const savedNickname = localStorage.getItem('nickname');
    if (savedNickname) {
      setNickname(savedNickname);
    }
  }, []);

  // Get or create player ID
  const getPlayerId = () => {
    let id = localStorage.getItem('playerId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('playerId', id);
    }
    return id;
  };

  // Save nickname
  const saveNickname = (name: string) => {
    localStorage.setItem('nickname', name);
  };

  // Create a new room
  const createRoom = async () => {
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');
    saveNickname(nickname.trim());

    try {
      const playerId = getPlayerId();
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, nickname: nickname.trim() }),
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
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }
    if (!roomCode.trim()) {
      setError('방 코드를 입력해주세요.');
      return;
    }

    saveNickname(nickname.trim());
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

        {/* Nickname Input */}
        <div className={styles.nicknameSection}>
          <label className={styles.nicknameLabel}>닉네임</label>
          <input
            type="text"
            className={styles.nicknameInput}
            placeholder="닉네임 입력"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={12}
          />
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
              <span className={styles.ruleIcon}>👑</span>
              게임 초기 세팅은 킹만 남기고 모두 버립니다. 빠진 모든 기물들은 소환 가능합니다.
            </li>
            <li>
              <span className={styles.ruleIcon}>♟️</span>
              자신의 차례에 기물을 소환하거나 이동할 수 있습니다.
            </li>
            <li>
              <span className={styles.ruleIcon}>✨</span>
              자신의 기물이 닿는 칸에만 소환 가능합니다. 폰은 1·8랭크 불가.
            </li>
            <li>
              <span className={styles.ruleIcon}>💀</span>
              잡힌 기물은 다시 소환할 수 없습니다.
            </li>
            <li>
              <span className={styles.ruleIcon}>🏆</span>
              체크메이트로 승리하세요!
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
