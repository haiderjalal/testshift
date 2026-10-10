import { useEffect, useState, type RefObject } from "react";

/**
 * Tracks whether an element is on screen, with a margin so an item counts as "read" only once it
 * sits near the middle of the viewport. Starts false, so the server and first client render agree.
 */
export function useInView<T extends Element>(ref: RefObject<T | null>): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: "-20% 0px -20% 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return inView;
}
