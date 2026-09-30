"use server";

import { redirect } from "next/navigation";

import { endAdminSession, passwordMatches, startAdminSession } from "@/lib/admin";
import { log } from "@/lib/log";
import { allow, clientKey } from "@/lib/rateLimit";

const FAILED_LOGIN_DELAY_MS = 800;
// Per visitor, per 15 minutes. No site-wide limit: that would let anyone lock the owner out. The 16-character
// minimum on ADMIN_PASSWORD is what makes guessing infeasible.
const ATTEMPTS_PER_IP = 10;
const WINDOW_SECONDS = 900;

export async function logIn(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  if (!(await allow(`login:${await clientKey()}`, ATTEMPTS_PER_IP, WINDOW_SECONDS))) {
    log("warn", "Admin login rate limit hit");
    return { error: "Too many attempts. Wait 15 minutes and try again." };
  }
  if (!passwordMatches(password)) {
    // Slow down guessing; the password itself is never logged.
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    log("warn", "Failed admin login");
    return { error: "That password is not right." };
  }
  await startAdminSession();
  redirect("/admin");
}

export async function logOut(): Promise<void> {
  await endAdminSession();
  redirect("/admin/login");
}
