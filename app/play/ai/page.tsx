"use client";

import GameInterface from '@/components/GameInterface';

import { useSearchParams } from 'next/navigation';

export default function AiPlayPage() {
  const searchParams = useSearchParams();
  const accuracy = parseInt(searchParams.get('accuracy') || '100');

  return <GameInterface gameId="ai" isAi={true} initialAccuracy={accuracy} />;
}
