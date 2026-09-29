"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">This page didn&apos;t load.</h1>
      <p className="mt-3 text-graphite">Something failed on our side. Try again, and if it keeps happening, email support.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 self-start rounded-full bg-ink px-6 py-3 font-medium text-paper hover:bg-ink/85"
      >
        Try again
      </button>
    </main>
  );
}
