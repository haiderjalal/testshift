import type { ReactElement } from "react";

import { HOUR_OPTIONS, TRIAL_MINUTES } from "@/lib/plans";

import { FieldError } from "./FieldError";

export type ShiftChoice = "trial" | number;

interface ShiftPickerProps {
  shift: ShiftChoice;
  error?: string;
  onSelect: (shift: ShiftChoice) => void;
}

// The free trial is green and paid hours are neutral, so the two kinds of shift read as different choices.
const paidChip =
  "cursor-pointer rounded-full border border-rule bg-card px-3 py-3 text-center font-mono has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-ink";
const trialChip =
  "block cursor-pointer rounded-full border border-pass/50 px-4 py-3 text-center font-mono text-pass has-checked:border-pass has-checked:bg-pass has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-pass";

/** Shift length as chips, split into a free trial group and a paid hours group. */
export function ShiftPicker({ shift, error, onSelect }: ShiftPickerProps): ReactElement {
  const trial = shift === "trial";
  return (
    <fieldset aria-invalid={Boolean(error)} aria-describedby={error ? "hours-error" : undefined}>
      <legend className="font-medium">Shift length</legend>
      <div className="mt-3 space-y-5">
        <div role="group" aria-labelledby="shift-trial-label">
          <p id="shift-trial-label" className="font-mono text-xs tracking-widest text-pass uppercase">
            Free trial
          </p>
          <label className={`${trialChip} mt-2`}>
            <input
              type="radio"
              name="hours"
              value="trial"
              checked={trial}
              onChange={() => onSelect("trial")}
              className="sr-only"
            />
            {TRIAL_MINUTES} min free
          </label>
        </div>
        <div role="group" aria-labelledby="shift-paid-label">
          <p id="shift-paid-label" className="font-mono text-xs tracking-widest text-graphite uppercase">
            Paid, prepaid through Wise
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {HOUR_OPTIONS.map((h) => (
              <label key={h} className={paidChip}>
                <input
                  type="radio"
                  name="hours"
                  value={h}
                  checked={shift === h}
                  onChange={() => onSelect(h)}
                  className="sr-only"
                />
                {h}h
              </label>
            ))}
          </div>
        </div>
      </div>
      <FieldError id="hours-error" message={error} />
    </fieldset>
  );
}
