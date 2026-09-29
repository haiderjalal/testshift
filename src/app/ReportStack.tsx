const LAYERS = [
  { label: "Playwright suite", tone: "bg-ink text-paper" },
  { label: "Bug report", tone: "bg-card" },
  { label: "Real-browser runs", tone: "bg-card" },
  { label: "Test plan", tone: "bg-card" },
];

function LayerContent({ label }: { label: string }) {
  if (label === "Playwright suite") {
    return (
      <pre className="font-mono text-[9px] leading-4 text-paper/80">
        {`test("checkout on mobile", async ({ page }) => {\n  await page.goto("/cart");\n  await page.locator("role=button").click();\n  await expect(page).toHaveURL(/checkout/);\n});`}
      </pre>
    );
  }
  if (label === "Bug report") {
    return (
      <div className="space-y-2">
        <p className="font-mono text-[9px] font-semibold text-fail uppercase">✗ Major</p>
        <div className="h-2.5 w-4/5 rounded-sm bg-marker" />
        <div className="h-2 w-3/5 rounded-sm bg-rule" />
        <div className="h-10 rounded-md bg-paper" />
      </div>
    );
  }
  if (label === "Real-browser runs") {
    return (
      <ul className="space-y-1.5 font-mono text-[9px]">
        {["✓", "✓", "✗", "✓", "✓"].map((mark, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={mark === "✗" ? "text-fail" : "text-pass"}>{mark}</span>
            <span className="h-1.5 flex-1 rounded-sm bg-rule" />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ol className="space-y-1.5 font-mono text-[9px] text-graphite">
      {[1, 2, 3, 4, 5].map((n) => (
        <li key={n} className="flex items-center gap-2">
          {n}
          <span className="h-1.5 flex-1 rounded-sm bg-rule" />
        </li>
      ))}
    </ol>
  );
}

/** The deliverable as an exploded isometric stack; the layers separate as it scrolls into view. */
export function ReportStack() {
  return (
    <div className="stack-scene relative mx-auto h-[26rem] w-full max-w-md" aria-hidden>
      <div className="absolute top-[58%] left-1/2 h-52 w-80 -translate-x-1/2 -translate-y-1/2">
        <div className="stack relative size-full">
          {LAYERS.map((layer, i) => (
            <div
              key={layer.label}
              style={{ ["--i" as string]: LAYERS.length - 1 - i }}
              className={`stack-layer rounded-xl border border-rule p-4 shadow-[0_20px_40px_-24px_rgba(14,23,38,0.5)] ${layer.tone}`}
            >
              <p className="mb-3 text-[10px] font-semibold tracking-wide uppercase opacity-70">{layer.label}</p>
              <LayerContent label={layer.label} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
