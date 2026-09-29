"use client";

import { useRef, type PointerEvent } from "react";

import { DemoLog } from "./DemoLog";

const MAX_TILT_DEG = 6;

/** The page the tester is reading: a wireframe site with a scanner sweeping it and one flagged element. */
function BrowserMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-card shadow-[0_30px_60px_-30px_rgba(14,23,38,0.35)]">
      <div className="flex items-center gap-1.5 border-b border-rule px-3 py-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2 rounded-full bg-rule" />
        ))}
        <span className="ml-3 flex-1 rounded-full bg-paper px-3 py-0.5 font-mono text-[10px] text-graphite">
          shop.example.com/checkout
        </span>
      </div>
      <div className="relative space-y-3 p-4" style={{ ["--scan-distance" as string]: "210px" }}>
        <div className="h-4 w-2/5 rounded bg-rule" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="aspect-square rounded-md bg-paper" />
              <div className="h-2 w-3/4 rounded bg-rule" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className="h-2 w-1/3 rounded bg-rule" />
          <div className="flag rounded-md border-2 border-dashed border-fail px-3 py-1 font-mono text-[10px] font-semibold text-fail">
            Checkout
          </div>
        </div>
        <div className="scan-line pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-marker/35 to-transparent">
          <div className="absolute inset-x-0 bottom-1/2 h-px bg-ink/30" />
        </div>
      </div>
    </div>
  );
}

/** The finding, lifted off the page toward the viewer. */
function BugTicket() {
  return (
    <div className="float rounded-xl border border-rule bg-card p-4 shadow-[0_24px_50px_-20px_rgba(14,23,38,0.45)]">
      <p className="font-mono text-[10px] font-semibold tracking-wider text-fail uppercase">✗ Major · mobile</p>
      <p className="mt-1.5 text-sm font-semibold">
        <span className="marker">Checkout button does nothing</span>
      </p>
      <ol className="mt-2 list-decimal space-y-0.5 pl-4 font-mono text-[10px] text-graphite">
        <li>Add any item to the cart</li>
        <li>Open the cart on a phone</li>
        <li>Tap “Checkout”</li>
      </ol>
    </div>
  );
}

/** Hero scene in three depth layers that tilts toward the mouse. */
export function HeroScene() {
  const rig = useRef<HTMLDivElement>(null);

  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || !rig.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    rig.current.style.setProperty("--tilt-x", `${x * MAX_TILT_DEG * 2}deg`);
    rig.current.style.setProperty("--tilt-y", `${-y * MAX_TILT_DEG * 2}deg`);
  }

  function reset() {
    rig.current?.style.removeProperty("--tilt-x");
    rig.current?.style.removeProperty("--tilt-y");
  }

  return (
    <div className="scene lg:py-10" onPointerMove={tilt} onPointerLeave={reset}>
      <div className="scene-enter">
        <div ref={rig} className="scene-rig">
          <div className="layer-back" aria-hidden>
            <BrowserMock />
          </div>
          <div className="layer-mid">
            <DemoLog />
          </div>
          <div className="layer-front" aria-hidden>
            <BugTicket />
          </div>
        </div>
      </div>
    </div>
  );
}
