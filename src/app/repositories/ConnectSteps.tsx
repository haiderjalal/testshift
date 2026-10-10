import type { ReactElement } from "react";

type StepState = "done" | "current" | "upcoming";

interface ConnectStepsProps {
  signedIn: boolean;
  installed: boolean;
  connected: boolean;
}

interface ConnectStep {
  label: string;
  detail: string;
  state: StepState;
}

const STATE_LABEL: Record<StepState, string> = { done: "Done", current: "Current step", upcoming: "Upcoming" };

/**
 * The server only knows sign-in, installation and whether a connection exists. Repository, workflow and
 * consent are chosen inside the form, so those steps stay "current" or "upcoming" until a connection exists.
 */
function buildSteps({ signedIn, installed, connected }: ConnectStepsProps): ConnectStep[] {
  const installation: StepState = installed || connected ? "done" : signedIn ? "current" : "upcoming";
  const repository: StepState = connected ? "done" : installed ? "current" : "upcoming";
  const later: StepState = connected ? "done" : "upcoming";
  return [
    { label: "Sign in", detail: "Authorize with GitHub", state: signedIn ? "done" : "current" },
    { label: "Installation", detail: "Install the App on selected repositories", state: installation },
    { label: "Repository", detail: "Paste a repository you administer", state: repository },
    { label: "Test workflow", detail: "Choose the workflow that runs your tests", state: later },
    { label: "Consent", detail: "Confirm access and test scope", state: later },
    { label: "Connect", detail: "Verify with GitHub and connect", state: later },
  ];
}

/** Visible six-step connect sequence. The current step also carries aria-current for assistive tech. */
export function ConnectSteps(props: ConnectStepsProps): ReactElement {
  const steps = buildSteps(props);
  return (
    <ol aria-label="Connection steps" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {steps.map((step, index) => {
        const current = step.state === "current";
        return (
          <li
            key={step.label}
            aria-current={current ? "step" : undefined}
            className={`rounded-2xl border p-4 ${current ? "border-dev bg-raised" : "border-rule bg-card/60"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-graphite">{String(index + 1).padStart(2, "0")}</span>
              <span
                className={`font-mono text-xs ${step.state === "done" ? "text-pass" : current ? "text-dev" : "text-graphite"}`}
              >
                {STATE_LABEL[step.state]}
              </span>
            </div>
            <p className="mt-3 font-semibold">{step.label}</p>
            <p className="mt-1 text-sm text-graphite">{step.detail}</p>
          </li>
        );
      })}
    </ol>
  );
}
