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

  const getBestMove = async (fen: string, isAiVsAi: boolean = false, accuracy: number = 100, depth?: number): Promise<{ type: 'MOVE' | 'RESIGN'; move?: any; evaluation?: number; depth?: number; variations?: any[] }> => {
    // 1. Check MongoDB Cache
    try {
      // Occasionally skip cache for variety/exploration if accuracy is 100
      const skipChance = (isAiVsAi || accuracy < 100) ? 0.3 : 0.05;
      const skipCache = Math.random() < skipChance;

      if (!skipCache) {
        const url = new URL('/api/ai/best-move', window.location.origin);
        url.searchParams.set('fen', fen);

        const resp = await fetch(url.toString());
        if (resp.ok) {
          const data = await resp.json();
          // If we have a cached move, check if its depth is sufficient
          if (data.bestMove) {
            const requestedDepth = depth || 4; // Default depth is 4 in UI
            if (data.bestMove.depth >= requestedDepth) {
              console.log(`AI using cached move from MongoDB (depth ${data.bestMove.depth} >= ${requestedDepth})`);
              return {
                type: 'MOVE',
                move: data.bestMove.move,
                evaluation: data.bestMove.score,
                depth: data.bestMove.depth,
                variations: []
              };
            }
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

      const requestId = Math.random();

      const handleMessage = async (e: MessageEvent) => {
        if (e.data.requestId === requestId) {
          workerRef.current?.removeEventListener('message', handleMessage);
          const result = e.data;

          // 3. Save to MongoDB for future use (only if 100% accuracy)
          if (accuracy >= 100 && result.type === 'MOVE' && result.move) {
            try {
              fetch('/api/ai/best-move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fen,
                  move: result.move,
                  score: result.evaluation || 0,
                  depth: result.depth || depth || 4
                })
              }).catch(err => console.error('Cache save failed:', err));
            } catch (err) {
              // Background task, don't await/block
            }
          }

          resolve(result);
        }
      };

      workerRef.current.addEventListener('message', handleMessage);
      workerRef.current.postMessage({ fen, accuracy, depth, requestId });
    });
  };

  return { getBestMove, isLoaded };
};
