import { useEffect, useRef } from 'react';

/**
 * Keeps the device screen awake while `active` is true (e.g. while it's the
 * local player's turn), using the standard Screen Wake Lock API. Silently
 * does nothing on browsers that don't support it (mainly iOS Safari, which
 * doesn't implement Wake Lock as of this writing) rather than erroring -
 * there's no meaningful fallback available, so we just degrade gracefully.
 * Automatically re-acquires the lock if the tab regains visibility while
 * still meant to be active (the browser force-releases wake locks whenever
 * the tab is hidden, e.g. the user switches apps briefly).
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<any>(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
      } catch {
        // Request can legitimately fail (e.g. low battery mode on some
        // devices, or the tab isn't visible) - nothing actionable to do.
      }
    }

    acquire();

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && active && !lockRef.current) {
        acquire();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
