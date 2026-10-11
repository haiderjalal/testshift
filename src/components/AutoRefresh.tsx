"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { useEffect } from "react";

/** Re-renders the server page every few seconds while a job is still running. */
export function AutoRefresh({ everyMs = 5_000 }: { everyMs?: number }): ReactElement | null {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
