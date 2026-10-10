"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { useEffect } from "react";

/** Re-renders the server page every few seconds while a shift is live. */
export function AutoRefresh({ everyMs = 5_000 }: { everyMs?: number }): null {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}

/** Secondary action beside the report's download link, sized to the same 44px touch target. */
export function PrintButton(): ReactElement {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-11 items-center justify-center rounded-full border border-rule px-5 font-medium text-ink transition hover:border-dev hover:text-dev"
    >
      Save as PDF
    </button>
  );
}
