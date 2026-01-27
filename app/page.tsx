"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './page.module.css'; // We need to create this or use inline

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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

      <button
        onClick={createGame}
        disabled={loading}
        style={{
          padding: '15px 30px',
          fontSize: '1.2rem',
          background: '#000',
          color: '#fff',
          borderRadius: '8px',
          transition: 'transform 0.1s'
        }}
      >
        {loading ? 'Creating...' : 'Create New Game'}
      </button>

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
