"use client";

import GameInterface from '@/components/GameInterface';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function AiPlayContent() {
  const searchParams = useSearchParams();
  const accuracy = parseInt(searchParams.get('accuracy') || '100');

  return <GameInterface gameId="ai" isAi={true} initialAccuracy={accuracy} />;
}

export default function AiPlayPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#1a1a2e',
        color: 'white',
        fontSize: '1.2rem'
      }}>
        분석 로딩 중...
      </div>
    }>
      <AiPlayContent />
    </Suspense>
  );
}
