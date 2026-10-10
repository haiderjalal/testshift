import { useEffect, useState } from "react";

interface RotatingIndexOptions {
  enabled: boolean;
  intervalMs: number;
}

/**
 * Steps through `count` items on a timer while `enabled`. The first manual selection pins the index,
 * so autoplay never moves the content out from under a visitor who has taken control.
 */
export function useRotatingIndex(count: number, { enabled, intervalMs }: RotatingIndexOptions) {
  const [index, setIndex] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!enabled || pinned) return;
    const id = window.setInterval(() => setIndex((current) => (current + 1) % count), intervalMs);
    return () => window.clearInterval(id);
  }, [count, enabled, intervalMs, pinned]);

  function select(next: number) {
    setPinned(true);
    setIndex(next);
  }

  return { index, select };
}
