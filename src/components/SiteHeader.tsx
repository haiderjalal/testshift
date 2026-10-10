import Link from "next/link";

import { Logo } from "./Logo";
import { MobileMenu, type SiteLink } from "./MobileMenu";

const SECTION_LINKS: readonly SiteLink[] = [
  { href: "/#agents", label: "Agents" },
  { href: "/#coverage", label: "What we test" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/github-agent", label: "GitHub & CI" },
];

export function SiteHeader({ showNav = true }: { showNav?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-rule/60 bg-paper/60 backdrop-blur-xl print:hidden">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
        <Logo />
        {showNav && (
          <nav aria-label="Main" className="flex items-center gap-2 text-sm sm:gap-7">
            {SECTION_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hidden text-graphite transition hover:text-ink sm:inline">
                {link.label}
              </Link>
            ))}
            <Link href="/leaderboard" className="hidden px-3 text-graphite transition hover:text-ink sm:inline sm:px-0">
              Leaderboard
            </Link>
            <Link href="/hire" className="btn-primary h-9 px-4 text-sm">
              Start free
            </Link>
            <MobileMenu links={[...SECTION_LINKS, { href: "/leaderboard", label: "Leaderboard" }]} />
          </nav>
        )}
      </div>
      {/* Reading progress: the header's bottom edge fills as the page scrolls (CSS scroll timeline). */}
      <span aria-hidden className="scroll-progress pointer-events-none absolute inset-x-0 -bottom-px h-[2px]" />
    </header>
  );
}
