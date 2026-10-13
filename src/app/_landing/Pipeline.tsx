import { SplitText } from "@/components/SplitText";

import { AgentExplorer } from "./AgentExplorer";

/** The pipeline section. The heading renders on the server; the interactive agent tablist is a client island. */
export function Pipeline() {
  return (
    <section id="agents" data-chapter="agents" aria-labelledby="agents-heading" className="relative mx-auto max-w-7xl scroll-mt-24 px-5 py-28 sm:px-8">
      <p data-reveal="" className="eyebrow">The pipeline</p>
      <SplitText
        as="h2"
        id="agents-heading"
        className="mt-4 max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl"
        lines={[{ text: "Tested the way real teams ship:" }, { text: "dev, staging, UAT, then prod.", accent: true }]}
      />
      <p data-reveal="" className="mt-5 max-w-xl text-lg text-graphite">
        Your shift is split between four agents. Each one owns an environment and a kind of test, and hands over to
        the next. Select one to see what it checks.
      </p>
      <AgentExplorer />
    </section>
  );
}
