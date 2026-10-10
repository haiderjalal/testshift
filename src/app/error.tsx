"use client";

import type { ReactElement } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  // retry() re-fetches the failed server render; reset() only re-renders the cached tree and can hit the same error.
  retry: () => void;
}

export default function ErrorPage({ retry }: ErrorPageProps): ReactElement {
  return (
    <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-24 sm:px-8">
      <div aria-hidden className="lab-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem]" />
      <div className="glass glass-strong rise rounded-3xl p-8 sm:p-12">
        <span aria-hidden className="grid size-14 place-items-center rounded-2xl border border-fail/40 font-mono text-2xl text-fail">
          ✗
        </span>
        <h1 className="rise mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl" style={{ ["--d" as string]: 1 }}>
          This page didn&apos;t load.
        </h1>
        <p className="rise mt-4 text-lg text-graphite" style={{ ["--d" as string]: 2 }}>
          Something failed on our side. Try again, and if it keeps happening, email support.
        </p>
        <button type="button" onClick={retry} className="btn-primary rise mt-8 h-11" style={{ ["--d" as string]: 3 }}>
          Try again
        </button>
      </div>
    </main>
  );
}
