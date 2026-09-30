"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin";
import { confirmManualPayment, OrderError, quoteManualOrder, saveBetaPrice, startManualOrder } from "@/lib/beta-orders";
import { parseUsd } from "@/lib/beta-pricing";
import { log } from "@/lib/log";

export interface BetaActionState { error?: string; message?: string }

export async function betaAdminAction(_previous: BetaActionState, data: FormData): Promise<BetaActionState> {
  if (!(await isAdmin())) return { error: "Sign in as the administrator to manage orders." };
  const action = String(data.get("operation") ?? "");
  const id = String(data.get("id") ?? "");
  let amount = 0;
  if (["price", "quote", "confirm"].includes(action)) {
    try { amount = parseUsd(String(data.get("amount") ?? "")); }
    catch (e) { return { error: (e as Error).message }; }
  }
  if (["price", "quote"].includes(action) && amount > 100_000) return { error: "Estimated token cost must be at most $1,000/hour." };
  try {
    if (action === "price") await saveBetaPrice(String(data.get("plan") ?? ""), amount);
    else if (action === "quote") await quoteManualOrder(id, amount);
    else if (action === "confirm") {
      if (data.get("verified") !== "on") return { error: "Check Wise and confirm you received the payment first." };
      await confirmManualPayment(id, amount, String(data.get("reference") ?? ""));
    } else if (action === "start") await startManualOrder(id);
    else return { error: "Unknown operation." };
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    if (e && typeof e === "object" && "code" in e && e.code === "23505") return { error: "That Wise transaction reference is already assigned to another order." };
    log("error", "Beta order operation failed", { operation: action });
    return { error: "The update failed. Refresh and try again; do not confirm another payment." };
  }
  revalidatePath("/admin"); revalidatePath("/hire"); revalidatePath("/");
  if (id) revalidatePath(`/runs/${id}`);
  return { message: action === "start" ? "Start authorized. The timer begins when a worker picks up the shift."
    : action === "confirm" ? "Payment recorded. The shift remains paused until you start it."
      : action === "price" ? "Published for new orders only. Existing quotes are unchanged." : "Fixed quote saved. Share the order link with the customer." };
}
