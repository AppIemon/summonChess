"use client";

import GameInterface from '@/components/GameInterface';

export default function AiVsAiPage() {
  return <GameInterface gameId="ai-vs-ai" isAi={true} isAiVsAi={true} />;
}
