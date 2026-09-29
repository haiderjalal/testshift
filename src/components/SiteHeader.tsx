import Link from "next/link";

import { SITE } from "@/lib/plans";

export function SiteHeader({ showNav = true }: { showNav?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 print:hidden sm:px-8">
      <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <span aria-hidden className="grid size-6 place-items-center rounded-md bg-ink font-mono text-xs text-paper">
          ✓
        </span>
        {SITE.name}
      </Link>
      {showNav && (
        <nav aria-label="Main" className="flex items-center gap-1 text-sm sm:gap-6">
          <Link href="/#how-it-works" className="hidden text-graphite hover:text-ink sm:inline">
            How it works
          </Link>
          <Link href="/#pricing" className="hidden text-graphite hover:text-ink sm:inline">
            Pricing
          </Link>
          <Link href="/#faq" className="hidden text-graphite hover:text-ink sm:inline">
            FAQ
          </Link>
          <Link href="/hire" className="rounded-full bg-ink px-4 py-2 font-medium text-paper hover:bg-ink/85">
            Book a shift
          </Link>
        </nav>
      )}
    </header>
  );
}
