"use client";

import { useActionState } from "react";

import type { VerificationMethod } from "@/lib/ownership";

import { checkDomainOwnership, type OwnershipState } from "./ownership-actions";

export interface OwnershipPanelProps {
  runId: string;
  host: string;
  /** True only while the latest verification is still fresh. */
  verified: boolean;
  verifiedMethod: VerificationMethod | null;
  verificationDays: number;
  token: string;
  dnsName: string | null;
  dnsValue: string;
  fileUrl: string;
}

const METHOD_LABEL: Record<VerificationMethod, string> = { dns: "a DNS record", file: "a file on your site" };

export function OwnershipPanel(props: OwnershipPanelProps) {
  const [state, formAction, pending] = useActionState<OwnershipState, FormData>(checkDomainOwnership, {});
  const verified = state.verified ?? props.verified;
  const method = state.method ?? props.verifiedMethod;

  return (
    <section aria-labelledby="ownership-heading" className="glass space-y-6 rounded-2xl p-6">
      <div className="space-y-2">
        <h2 id="ownership-heading" className="font-display text-xl font-semibold tracking-tight">
          Domain ownership
        </h2>
        <p className="text-graphite">
          Active tests, such as security probes, load tests and write tests, only run on sites you prove you own. Nothing on this list is switched on yet. This check is the gate they will use.
        </p>
      </div>

      <p role="status" className={verified ? "font-medium text-pass" : "font-medium text-marker"}>
        {verified
          ? `Verified with ${method ? METHOD_LABEL[method] : "your site"}. Valid for ${props.verificationDays} days.`
          : `Not verified for ${props.host} yet.`}
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        {props.dnsName && (
          <div className="space-y-2 text-sm">
            <p className="font-medium">Option 1: add a DNS TXT record</p>
            <dl className="space-y-1 font-mono text-xs break-all">
              <div>
                <dt className="text-graphite">Name</dt>
                <dd>{props.dnsName}</dd>
              </div>
              <div>
                <dt className="text-graphite">Value</dt>
                <dd>{props.dnsValue}</dd>
              </div>
            </dl>
          </div>
        )}
        <div className="space-y-2 text-sm">
          <p className="font-medium">Option 2: publish a file</p>
          <p className="text-graphite">
            Serve a plain-text file at <span className="font-mono break-all text-ink">{props.fileUrl}</span> containing only this code:
          </p>
          <p className="font-mono text-xs break-all">{props.token}</p>
        </div>
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-4">
        <input type="hidden" name="runId" value={props.runId} />
        <button disabled={pending} className="btn-primary h-10 disabled:opacity-60">
          {pending ? "Checking…" : "Check now"}
        </button>
        {state.message && !state.verified && <p className="text-sm text-graphite">{state.message}</p>}
      </form>
    </section>
  );
}
