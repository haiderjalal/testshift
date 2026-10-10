import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/PageIntro";
import { SiteHeader } from "@/components/SiteHeader";
import { SpotlightCard } from "@/components/SpotlightCard";

export const metadata: Metadata = {
  title: "GitHub testing and CI",
  description: "Plan repository testing and automatic regression checks on every push, with disposable environments for destructive tests.",
  alternates: { canonical: "/github-agent" },
};

const options = [
  { name: "Website shift", status: "Available now", description: "Start with a public URL. Get browser checks, a bug report and replayable Playwright tests. Source-level unit tests require repository access.", href: "/hire", action: "Book a website shift", accent: "var(--color-dev)" },
  { name: "Repository testing", status: "GitHub integration", description: "Sign in with GitHub, install the App on selected repositories, and connect a repository you administer. Add the reviewed workflow to run your unit, integration and browser suites.", href: "/repositories", action: "Connect GitHub repository", accent: "var(--color-staging)" },
  { name: "Continuous QA", status: "Workflow included", description: "Run your approved regression suite on pushes and pull requests in GitHub-hosted runners. The App verifies completed workflow results and publishes a check on the tested commit.", href: "/repositories", action: "Set up GitHub CI", accent: "var(--color-pass)" },
];

// Accents follow the pipeline colours: Dev, Staging, UAT, Prod.
const processSteps = [
  { title: "1. Agree on access and scope", body: "Install the App on selected repositories and connect a repository you administer. It requests code and CI read access and permission to publish checks. Review your test configuration before committing the workflow.", accent: "var(--color-dev)" },
  { title: "2. Build a disposable environment", body: "Use an isolated runner, a fresh test database, synthetic accounts and sandbox email/payment services. Production credentials and customer data stay out of the test environment.", accent: "var(--color-staging)" },
  { title: "3. Run the approved checks", body: "Run lint, types, unit tests, integration tests and browser journeys. Deletion, malformed state, transaction rollback and recovery tests are enabled only for explicitly approved disposable resources.", accent: "var(--color-uat)" },
  { title: "4. Keep evidence and reset", body: "Report passed, failed, blocked and untested checks with traces and reproducible steps. Remove the environment after the run. Promote reviewed tests into a repeatable CI suite.", accent: "var(--color-prod)" },
];

export default function GitHubAgentPage() {
  return <>
    <SiteHeader />
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-12 pb-24 sm:px-8">
      <div className="relative isolate">
        <div aria-hidden className="lab-grid absolute inset-0 -z-10" />
        <PageIntro
          eyebrow="TestShift · GitHub"
          title="Take QA from a website to your code."
          description="Choose a website shift or connect GitHub for regression checks on each push. Repository connections use GitHub sign-in and selected-repository installation. Submitting a link in an onboarding request does not connect your account or start a test run."
        />
      </div>

      <p className="mt-14 font-mono text-xs tracking-widest text-graphite uppercase">Choose a path</p>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {options.map((option, index) => <div key={option.name} className="rise h-full" style={{ ["--d" as string]: index + 1 }}>
          <SpotlightCard accent={option.accent} className="glass glass-strong h-full rounded-3xl p-7">
            <article className="flex h-full flex-col">
              <p className="inline-flex items-center gap-2 font-mono text-xs" style={{ color: option.accent }}>
                <span aria-hidden className="size-2 rounded-full bg-current" />
                {option.status}
              </p>
              <h2 className="mt-4 font-display text-2xl font-semibold">{option.name}</h2>
              <p className="mt-4 flex-1 text-graphite">{option.description}</p>
              <div className="mt-7">
                <Link href={option.href} className="btn-primary min-h-12 w-full px-4 text-center">{option.action}</Link>
              </div>
            </article>
          </SpotlightCard>
        </div>)}
      </div>

      <section aria-labelledby="repo-process" className="mt-20">
        <p className="font-mono text-xs tracking-widest text-graphite uppercase">Process</p>
        <h2 id="repo-process" className="mt-4 font-display text-3xl font-semibold">How repository testing runs</h2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {processSteps.map((step) => <li key={step.title} className="glass glass-strong rounded-3xl p-6">
            <span aria-hidden className="block h-1 w-10 rounded-full" style={{ background: step.accent }} />
            <h3 className="mt-5 font-display text-xl font-semibold">{step.title}</h3>
            <p className="mt-3 text-graphite">{step.body}</p>
          </li>)}
        </ol>
      </section>

      <section aria-labelledby="reviewed-suite" className="glass glass-strong mt-16 rounded-3xl p-7 sm:p-10">
        <h2 id="reviewed-suite" className="font-display text-2xl font-semibold sm:text-3xl">A reviewed suite on every push.</h2>
        <p className="mt-4 max-w-3xl text-graphite">Deterministic checks run in your GitHub workflow. The repository integration executes the commands you configure and reports their outcomes; generating new source-level tests with AI and provisioning arbitrary applications remain separate capabilities. Repository access cannot guarantee every behavior is covered.</p>
        <p className="mt-4 max-w-3xl text-graphite">You do not need to share your GitHub password, personal access token or production database credentials in the form. Destructive testing means changing disposable test data, never deleting your repository or production records.</p>
        <Link href="/repositories" className="btn-primary mt-8 min-h-12 w-full px-6 py-3 text-center sm:w-auto">Connect GitHub and download the workflow →</Link>
      </section>
    </main>
  </>;
}
