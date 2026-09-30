import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { adminConfigured, isAdmin, MIN_PASSWORD_LENGTH } from "@/lib/admin";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Admin sign-in", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-24">
      <p className="font-mono text-xs tracking-widest text-graphite uppercase">TestShift · owner only</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Admin dashboard</h1>
      {adminConfigured() ? (
        <LoginForm />
      ) : (
        <p className="mt-6 rounded-xl border border-rule bg-card p-4 text-graphite">
          Set <code className="font-mono text-ink">ADMIN_PASSWORD</code> in <code className="font-mono text-ink">.env.local</code>{" "}
          to a password of at least {MIN_PASSWORD_LENGTH} characters to turn the dashboard on, then restart the server.
        </p>
      )}
    </main>
  );
}
