"use client";

import { useState } from 'react';
import styles from './AuthDialog.module.css';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: any) => void;
}

export default function AuthDialog({ isOpen, onClose, onSuccess }: AuthDialogProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Authentication failed');
      }

      if (mode === 'signup') {
        // After signup, automatically login
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const loginData = await loginRes.json();
        onSuccess(loginData.user);
      } else {
        onSuccess(data.user);
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalContent}>
        <h2 className={styles.title}>
          {mode === 'login' ? '로그인' : '회원가입'}
        </h2>
        <p className={styles.subtitle}>
          {mode === 'login' ? '소환체스의 세계에 오신 것을 환영합니다.' : '새로운 계정을 만들고 기록을 저장하세요.'}
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label htmlFor="username">사용자 아이디</label>
            <input
              id="username"
              type="text"
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="아이디를 입력하세요"
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
            />
          </div>

          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>

        <div className={styles.switchModes}>
          {mode === 'login' ? (
            <>
              계정이 없으신가요?{' '}
              <button className={styles.switchButton} onClick={() => setMode('signup')}>
                회원가입
              </button>
            </>
          ) : (
            <>
              이미 계정이 있으신가요?{' '}
              <button className={styles.switchButton} onClick={() => setMode('login')}>
                로그인
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
