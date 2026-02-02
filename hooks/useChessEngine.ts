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

  const getBestMove = (fen: string): Promise<{ type: 'MOVE' | 'RESIGN'; move?: any }> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve({ type: 'MOVE', move: null });
        return;
      }

      const handleMessage = (e: MessageEvent) => {
        workerRef.current?.removeEventListener('message', handleMessage);
        resolve(e.data);
      };

      workerRef.current.addEventListener('message', handleMessage);
      workerRef.current.postMessage({ fen });
    });
  };

  return { getBestMove, isLoaded };
};
