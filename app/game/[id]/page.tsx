import GameInterface from '@/components/GameInterface';

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GameInterface gameId={id} />;
}
