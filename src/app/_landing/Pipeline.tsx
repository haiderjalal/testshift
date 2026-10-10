import { AgentExplorer } from "./AgentExplorer";

/** The pipeline section. The heading renders on the server; the interactive agent tablist is a client island. */
export function Pipeline() {
  return (
    <section id="agents" aria-labelledby="agents-heading" className="relative mx-auto max-w-7xl scroll-mt-24 px-5 py-28 sm:px-8">
      <p className="reveal font-mono text-xs tracking-widest text-graphite uppercase">The pipeline</p>
      <h2
        id="agents-heading"
        className="reveal mt-4 max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl"
      >
        Tested the way real teams ship: dev, staging, UAT, then prod.
      </h2>
      <p className="reveal mt-5 max-w-xl text-lg text-graphite">
        Your shift is split between four agents. Each one owns an environment and a kind of test, and hands over to
        the next. Select one to see what it checks.
      </p>
      <AgentExplorer />
    </section>
  );
}
