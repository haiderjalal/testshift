"use client";

import type { ReactElement } from "react";

export { AutoRefresh } from "@/components/AutoRefresh";

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
