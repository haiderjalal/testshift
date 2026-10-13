/**
 * One cached copy of the scroll position. Reading `window.scrollY` inside a per-frame callback forces a layout
 * every frame, so everything that animates with scroll reads `scroll.y` instead. `version` changes on every
 * scroll event, which lets a frame callback return early when nothing moved.
 */
export const scroll = { y: 0, version: 0 };

type Listener = () => void;

const listeners = new Set<Listener>();
let attached = false;

function handleScroll(): void {
  scroll.y = window.scrollY;
  scroll.version += 1;
  listeners.forEach((listener) => listener());
}

/** Starts tracking scroll (once) and optionally subscribes to every scroll event. Returns an unsubscribe. */
export function subscribeToScroll(listener?: Listener): () => void {
  if (!attached) {
    scroll.y = window.scrollY;
    window.addEventListener("scroll", handleScroll, { passive: true });
    attached = true;
  }
  if (listener) listeners.add(listener);
  return () => {
    if (listener) listeners.delete(listener);
  };
}
