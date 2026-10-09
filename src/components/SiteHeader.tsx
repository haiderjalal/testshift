import Link from "next/link";

import { Logo } from "./Logo";

export function SiteHeader({ showNav = true }: { showNav?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-rule/60 bg-paper/55 backdrop-blur-xl print:hidden">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
        <Logo />
        {showNav && (
          <nav aria-label="Main" className="flex items-center gap-1 text-sm sm:gap-7">
            <Link href="/#agents" className="hidden text-graphite transition hover:text-ink sm:inline">
              Agents
            </Link>
            <Link href="/#coverage" className="hidden text-graphite transition hover:text-ink sm:inline">
              What we test
            </Link>
            <Link href="/#pricing" className="hidden text-graphite transition hover:text-ink sm:inline">
              Pricing
            </Link>
            <Link href="/#faq" className="hidden text-graphite transition hover:text-ink sm:inline">
              FAQ
            </Link>
            <Link href="/github-agent" className="hidden text-graphite transition hover:text-ink sm:inline">
              GitHub & CI
            </Link>
            <Link href="/leaderboard" className="px-3 text-graphite transition hover:text-ink sm:px-0">
              Leaderboard
            </Link>
            <Link href="/hire" className="btn-primary h-9 px-4 text-sm">
              Start free
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
