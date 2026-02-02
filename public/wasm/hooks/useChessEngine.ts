import { useState, useEffect, useRef } from 'react';

export const useChessEngine = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // We create the worker using the public path since it's likely being served there
    // In a real production app, we might use new Worker(new URL('../chess-worker.ts', import.meta.url))
    // but for this environment, let's try a robust approach.
    try {
      // Create a blob from the worker file content to ensure it's loadable if static serving is tricky
      // But let's first try the standard way if the file exists in public.
      // Actually, since it's .ts, it needs to be compiled. 
      // Next.js handles workers well if we use the URL constructor.

      const worker = new Worker(new URL('../chess-worker.ts', import.meta.url));
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
