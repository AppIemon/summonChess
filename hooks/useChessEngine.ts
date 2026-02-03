import { useState, useEffect, useRef } from 'react';

export const useChessEngine = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    try {
      const worker = new Worker(new URL('./chess-worker.ts', import.meta.url));
      workerRef.current = worker;
      setIsLoaded(true);

      return () => {
        worker.terminate();
      };
    } catch (e) {
      console.error('Failed to start worker:', e);
    }
  }, []);

  const getBestMove = async (fen: string, isAiVsAi: boolean = false, depth?: number): Promise<{ type: 'MOVE' | 'RESIGN'; move?: any; evaluation?: number; depth?: number; variations?: any[] }> => {
    // 1. Check MongoDB Cache
    try {
      // Occasionally skip cache for variety/exploration
      // Higher skip rate for AI vs AI to encourage learning new variations
      const skipChance = isAiVsAi ? 0.3 : 0.1;
      const skipCache = Math.random() < skipChance;

      if (!skipCache && !depth) { // Don't use cache if custom depth is requested
        const resp = await fetch(`/api/ai/best-move?fen=${encodeURIComponent(fen)}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.bestMove) {
            console.log('AI using cached move from MongoDB');
            // Note: Cache currently only stores one move, so variations won't be in cache
            return {
              type: 'MOVE',
              move: data.bestMove.move,
              evaluation: data.bestMove.score,
              depth: data.bestMove.depth,
              variations: [] // Cache doesn't have variations yet
            };
          }
        }
      } else {
        console.log('AI skipping cache for exploration');
      }
    } catch (err) {
      console.warn('Failed to fetch cached AI move:', err);
    }

    // 2. Calculate via Worker if not in cache
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve({ type: 'MOVE', move: null });
        return;
      }

      const handleMessage = async (e: MessageEvent) => {
        workerRef.current?.removeEventListener('message', handleMessage);
        const result = e.data;

        // 3. Save to MongoDB for future use (only if using default depth)
        if (!depth && result.type === 'MOVE' && result.move) {
          try {
            fetch('/api/ai/best-move', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fen,
                move: result.move,
                score: result.evaluation || 0,
                depth: result.depth || 4
              })
            }).catch(err => console.error('Cache save failed:', err));
          } catch (err) {
            // Background task, don't await/block
          }
        }

        resolve(result);
      };

      workerRef.current.addEventListener('message', handleMessage);
      workerRef.current.postMessage({ fen, depth });
    });
  };

  return { getBestMove, isLoaded };
};
