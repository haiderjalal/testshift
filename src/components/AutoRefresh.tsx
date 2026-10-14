"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { useEffect } from "react";

/**
 * Re-renders the server page every few seconds while a job is still running. Hidden tabs skip the refresh, and a tab
 * that returns to the foreground refreshes at once, so no open tab keeps re-rendering the server in the background.
 */
export function AutoRefresh({ everyMs = 5_000 }: { everyMs?: number }): ReactElement | null {
  const router = useRouter();
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refreshWhenVisible, everyMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router, everyMs]);
  return null;
}
