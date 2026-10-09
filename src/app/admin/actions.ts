"use server";

import { redirect } from "next/navigation";
import { actionRequest } from "@/lib/action-security";

import { endAdminSession, passwordMatches, startAdminSession } from "@/lib/admin";
import { log } from "@/lib/log";
import { allow, clientKey } from "@/lib/rateLimit";

const FAILED_LOGIN_DELAY_MS = 800;
// Per visitor, per 15 minutes. No site-wide limit: that would let anyone lock the owner out. The 16-character
// minimum on ADMIN_PASSWORD is what makes guessing infeasible.
const ATTEMPTS_PER_IP = 10;
const WINDOW_SECONDS = 900;

export async function logIn(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const requestId = await actionRequest(formData);
  if (!requestId) return { error: "Request rejected. Refresh and try again." };
  const password = String(formData.get("password") ?? "");
  let allowed = false;
  try { allowed = await allow(`login:${await clientKey()}`, ATTEMPTS_PER_IP, WINDOW_SECONDS); }
  catch { log("error", "Login limiter unavailable", { requestId }); return { error: "Sign in is temporarily unavailable." }; }
  if (!allowed) {
    log("warn", "Admin login rate limit hit", { requestId });
    return { error: "Too many attempts. Wait 15 minutes and try again." };
  }
  if (!passwordMatches(password)) {
    // Slow down guessing; the password itself is never logged.
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    log("warn", "Failed admin login", { requestId });
    return { error: "That password is not right." };
  }
  await startAdminSession();
  redirect("/admin");
}

export async function logOut(): Promise<void> {
  if (!(await actionRequest())) return;
  await endAdminSession();
  redirect("/admin/login");
}
