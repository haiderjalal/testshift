import type { PlanId } from "./plans";

export const TOKEN_MARKUP = 10;
export const BETA_CONTACT = { wiseTag: "@haiderj23", email: "haiderjalaldressify@gmail.com" } as const;
export type BetaPrices = Partial<Record<PlanId, number>>; // quoted hourly USD cents
export const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Parse money without float rounding, exponent notation or silently accepting partial cents. */
export function parseUsd(value: string): number {
  if (!/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter a USD amount with at most two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents <= 0) throw new Error("Amount must be greater than zero.");
  return cents;
}

export function quoteFromCost(costCents: number, minutes: number) {
  if (!Number.isInteger(costCents) || costCents < 1 || costCents > 100_000) throw new Error("Estimated token cost must be $0.01–$1,000 per hour.");
  if (!Number.isInteger(minutes) || minutes < 60 || minutes > 480 || minutes % 60) throw new Error("Choose 1–8 whole hours.");
  return { hourlyCents: costCents * TOKEN_MARKUP, totalCents: costCents * TOKEN_MARKUP * (minutes / 60) };
}
