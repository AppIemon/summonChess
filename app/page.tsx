"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './page.module.css'; // We need to create this or use inline

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [matchStatus, setMatchStatus] = useState<string>('');

  const createGame = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/game', { method: 'POST' });
      const data = await res.json();
      router.push(`/game/${data.id}`);
    } catch (e) {
      alert('Failed to create game');
      setLoading(false);
    }
  };

  const findMatch = async () => {
    setLoading(true);
    setMatchStatus('Looking for opponent...');

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
      setMatchStatus('Error finding match');
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
      <h1 style={{ fontSize: '3rem', fontWeight: 'bold' }}>SUMMON CHESS</h1>
      <p style={{ color: '#666', maxWidth: '600px', textAlign: 'center' }}>
        Classic Chess with a twist. Start with only Kings. Summon your army to the battlefield.
      </p>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={createGame}
          disabled={loading}
          style={{
            padding: '15px 30px',
            fontSize: '1.2rem',
            background: '#333',
            color: '#fff',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          Pass & Play
        </button>
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
          {loading && matchStatus ? matchStatus : 'Find Online Match'}
        </button>
      </div>

      <div style={{ marginTop: '40px', textAlign: 'center', color: '#888', fontSize: '0.9rem' }}>
        <p>Rules:</p>
        <ul style={{ listStyle: 'none' }}>
          <li>Turn: Move or Summon</li>
          <li>Summon pieces from your deck to your side of the board.</li>
          <li>Dead pieces are gone forever.</li>
          <li>Checkmate to win.</li>
        </ul>
      </div>
    </div>
  );
}
