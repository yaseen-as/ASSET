import { useEffect, useRef } from 'react';

interface PollingOptions {
  enabled?: boolean;
  immediate?: boolean;
}

export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  { enabled = true, immediate = true }: PollingOptions = {},
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer || document.visibilityState !== 'visible') return;
      timer = setInterval(() => {
        callbackRef.current();
      }, intervalMs);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
        start();
      } else {
        stop();
      }
    };

    if (immediate && document.visibilityState === 'visible') {
      callbackRef.current();
    }
    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs, immediate]);
}
