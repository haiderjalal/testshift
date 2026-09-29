"use client";

import { useEffect, useState } from "react";

import { formatClock, ShiftLog, type LogEntry } from "@/components/ShiftLog";

const SHIFT_SECONDS = 2 * 3600;
const FIRST_VISIBLE = 4;

const EXAMPLE_LINES: (Omit<LogEntry, "time"> & { at: number })[] = [
  { id: "1", at: 6, status: "info", text: "Exploring shop.example.com: 14 pages found" },
  { id: "2", at: 192, status: "pass", text: "Home page loads in 0.9s" },
  { id: "3", at: 460, status: "pass", text: "Search finds results for “linen shirt”" },
  { id: "4", at: 663, status: "fail", text: "Checkout button does nothing on mobile", tag: "major" },
  { id: "5", at: 927, status: "pass", text: "Sign-up rejects an invalid email" },
  { id: "6", at: 1192, status: "fail", text: "Contact form sends an empty message", tag: "minor" },
  { id: "7", at: 1458, status: "pass", text: "Cart keeps its items after a reload" },
  { id: "8", at: 1725, status: "pass", text: "Keyboard users can reach every menu link" },
  { id: "9", at: 1869, status: "running", text: "Testing: password reset flow" },
];
const SAMPLE = EXAMPLE_LINES.map((e) => ({ ...e, time: formatClock(e.at * 1000) }));

/** Example shift log for the hero, replaying one line at a time. */
export function DemoLog() {
  const [visible, setVisible] = useState(FIRST_VISIBLE);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Two extra ticks hold the finished log on screen before it replays.
    const timer = setInterval(() => setVisible((n) => (n >= SAMPLE.length + 2 ? FIRST_VISIBLE : n + 1)), 1600);
    return () => clearInterval(timer);
  }, []);

  const entries = SAMPLE.slice(0, Math.min(visible, SAMPLE.length));
  const now = entries[entries.length - 1].at;

  return (
    <figure className="rounded-2xl border border-rule bg-card shadow-[0_1px_0_#dde1e7,0_24px_48px_-24px_rgba(14,23,38,0.25)]">
      <div className="border-b border-rule px-5 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-semibold">Shift log</p>
          <p className="font-mono text-xs tabular-nums text-graphite">
            <span className="text-ink">{formatClock(now * 1000)}</span> / {formatClock(SHIFT_SECONDS * 1000)}
          </p>
        </div>
        <p className="mt-0.5 font-mono text-xs text-graphite">shop.example.com · Senior QA · example</p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-rule" aria-hidden>
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-700"
            style={{ width: `${(now / SHIFT_SECONDS) * 100}%` }}
          />
        </div>
      </div>
      <div className="h-[22.5rem] overflow-hidden px-5 py-1" aria-live="off">
        <ShiftLog entries={entries} animate />
      </div>
      <figcaption className="sr-only">
        Example of a live shift log: each line is a test the AI tester ran, with failures highlighted.
      </figcaption>
    </figure>
  );
}
