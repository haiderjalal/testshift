"use server";

import { redirect } from "next/navigation";

import { endAdminSession, passwordMatches, startAdminSession } from "@/lib/admin";
import { log } from "@/lib/log";

const FAILED_LOGIN_DELAY_MS = 800;

export async function logIn(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
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
