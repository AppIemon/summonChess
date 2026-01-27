"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './page.module.css'; // We need to create this or use inline

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [matchStatus, setMatchStatus] = useState<string>('');

  // const createGame = async () => { ... } // Removed

  const findMatch = async () => {
    setLoading(true);
    setMatchStatus('상대를 찾는 중...');

    // Generate random player ID if not exists
    let playerId = localStorage.getItem('playerId');
    if (!playerId) {
      playerId = crypto.randomUUID();
      localStorage.setItem('playerId', playerId);
    }

    try {
      // Join Queue
      const joinRes = await fetch('/api/match', {
        method: 'POST',
        body: JSON.stringify({ playerId }),
      });
      const joinData = await joinRes.json();

      if (joinData.status === 'matched') {
        router.push(`/game/${joinData.gameId}`);
        return;
      }

      // Poll
      const poll = setInterval(async () => {
        const checkRes = await fetch(`/api/match?playerId=${playerId}`);
        const checkData = await checkRes.json();

        if (checkData.status === 'matched') {
          clearInterval(poll);
          router.push(`/game/${checkData.gameId}`);
        }
      }, 1000);

    } catch (e) {
      setMatchStatus('매칭 찾기 오류');
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: '20px'
    }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 'bold' }}>소환 체스</h1>
      <p style={{ color: '#666', maxWidth: '600px', textAlign: 'center', wordBreak: 'keep-all' }}>
        기존 체스에 소환 시스템을 더했습니다. 킹 하나로 시작하여 당신의 군대를 전장에 소환하세요.
      </p>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={findMatch}
          disabled={loading}
          style={{
            padding: '15px 30px',
            fontSize: '1.2rem',
            background: '#000',
            color: '#fff',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          {loading && matchStatus ? matchStatus : '온라인 매칭 찾기'}
        </button>
      </div>

      <div style={{ marginTop: '40px', textAlign: 'center', color: '#888', fontSize: '0.9rem' }}>
        <p>규칙:</p>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li>턴: 이동 또는 소환</li>
          <li>기물을 자신의 진영에 소환하세요.</li>
          <li>죽은 기물은 영구적으로 제거됩니다.</li>
          <li>체크메이트로 승리하세요.</li>
        </ul>
      </div>
    </div>
  );
}
