import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches right now, and keeps matching as the window changes. The server render
 * assumes it does not match, so the first client render agrees with the server and the real answer follows hydration.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
