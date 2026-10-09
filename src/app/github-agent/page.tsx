import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "GitHub testing and CI",
  description: "Plan repository testing and automatic regression checks on every push, with disposable environments for destructive tests.",
  alternates: { canonical: "/github-agent" },
};

const options = [
  { name: "Website shift", status: "Available now", description: "Start with a public URL. Get browser checks, a bug report and replayable Playwright tests. Source-level unit tests require repository access.", href: "/hire", action: "Book a website shift" },
  { name: "Repository testing", status: "GitHub integration", description: "Sign in with GitHub, install the App on selected repositories, and connect a repository you administer. Add the reviewed workflow to run your unit, integration and browser suites.", href: "/repositories", action: "Connect GitHub repository" },
  { name: "Continuous QA", status: "Workflow included", description: "Run your approved regression suite on pushes and pull requests in GitHub-hosted runners. The App verifies completed workflow results and publishes a check on the tested commit.", href: "/repositories", action: "Set up GitHub CI" },
];

export default function GitHubAgentPage() {
  return <>
    <SiteHeader />
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-12 pb-24 sm:px-8">
      <p className="font-mono text-xs tracking-widest text-dev uppercase">TestShift · GitHub</p>
      <h1 className="mt-4 max-w-4xl font-display text-4xl font-semibold tracking-tight sm:text-6xl">Take QA from a website to your code.</h1>
      <p className="mt-6 max-w-3xl text-lg text-graphite">Choose a website shift or connect GitHub for regression checks on each push. Repository connections use GitHub sign-in and selected-repository installation. Submitting a link in an onboarding request does not connect your account or start a test run.</p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {options.map((option) => <article key={option.name} className="flex flex-col rounded-2xl border border-rule bg-card/80 p-7">
          <p className="font-mono text-xs text-dev">{option.status}</p>
          <h2 className="mt-4 font-display text-2xl font-semibold">{option.name}</h2>
          <p className="mt-4 flex-1 text-graphite">{option.description}</p>
          <Link href={option.href} className="btn-primary mt-7 min-h-12 px-4 text-center">{option.action}</Link>
        </article>)}
      </div>
      <section aria-labelledby="repo-process" className="mt-16">
        <h2 id="repo-process" className="font-display text-3xl font-semibold">How repository testing runs</h2>
        <ol className="mt-6 grid gap-5 sm:grid-cols-2">
          {[
            ["1. Agree on access and scope", "Install the App on selected repositories and connect a repository you administer. It requests code and CI read access and permission to publish checks. Review your test configuration before committing the workflow."],
            ["2. Build a disposable environment", "Use an isolated runner, a fresh test database, synthetic accounts and sandbox email/payment services. Production credentials and customer data stay out of the test environment."],
            ["3. Run the approved checks", "Run lint, types, unit tests, integration tests and browser journeys. Deletion, malformed state, transaction rollback and recovery tests are enabled only for explicitly approved disposable resources."],
            ["4. Keep evidence and reset", "Report passed, failed, blocked and untested checks with traces and reproducible steps. Remove the environment after the run. Promote reviewed tests into a repeatable CI suite."],
          ].map(([title, body]) => <li key={title} className="rounded-2xl border border-rule bg-card/70 p-6"><h3 className="font-display text-xl font-semibold">{title}</h3><p className="mt-3 text-graphite">{body}</p></li>)}
        </ol>
      </section>
      <section className="mt-12 rounded-2xl border border-rule bg-card/80 p-7">
        <h2 className="font-display text-2xl font-semibold">A reviewed suite on every push.</h2>
        <p className="mt-4 max-w-3xl text-graphite">Deterministic checks run in your GitHub workflow. The repository integration executes the commands you configure and reports their outcomes; generating new source-level tests with AI and provisioning arbitrary applications remain separate capabilities. Repository access cannot guarantee every behavior is covered.</p>
        <p className="mt-4 max-w-3xl text-graphite">You do not need to share your GitHub password, personal access token or production database credentials in the form. Destructive testing means changing disposable test data, never deleting your repository or production records.</p>
        <Link href="/repositories" className="mt-5 inline-block font-medium underline underline-offset-4">Connect GitHub and download the workflow →</Link>
      </section>
    </main>
  </>;
}
