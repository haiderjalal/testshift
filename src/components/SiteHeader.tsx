import Link from "next/link";

import { Logo } from "./Logo";
import { MobileMenu, type SiteLink } from "./MobileMenu";
import { NavLink } from "./NavLink";

interface SectionLink extends SiteLink {
  /** The landing-page chapter the link points at, so it can show as current while that chapter is in view. */
  chapter?: string;
}

const SECTION_LINKS: readonly SectionLink[] = [
  { href: "/#agents", label: "Agents", chapter: "agents" },
  { href: "/#coverage", label: "What we test", chapter: "coverage" },
  { href: "/#pricing", label: "Pricing", chapter: "pricing" },
  { href: "/#faq", label: "FAQ", chapter: "faq" },
  { href: "/github-agent", label: "GitHub & CI" },
  { href: "/test-cases", label: "Test cases" },
];

/** Floating glass capsule. It slides away while reading down the page and returns on scroll up (see NavVisibility). */
export function SiteHeader({ showNav = true }: { showNav?: boolean }) {
  return (
    <header className="site-header sticky top-0 z-40 px-3 pt-3 sm:px-5 print:hidden">
      <div className="glass relative mx-auto flex h-13 w-full max-w-7xl items-center justify-between rounded-full px-5 sm:px-7">
        <Logo priority />
        {showNav && (
          <nav aria-label="Main" className="flex items-center gap-2 text-sm whitespace-nowrap lg:gap-7">
            {SECTION_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} chapter={link.chapter} className="hidden text-graphite transition hover:text-ink lg:inline">
                {link.label}
              </NavLink>
            ))}
            <NavLink href="/leaderboard" className="hidden text-graphite transition hover:text-ink lg:inline">
              Leaderboard
            </NavLink>
            <Link href="/hire" className="btn-primary h-9 px-4 text-sm">
              Start free
            </Link>
            <MobileMenu links={[...SECTION_LINKS, { href: "/leaderboard", label: "Leaderboard" }]} />
          </nav>
        )}
        {/* Reading progress: a line along the capsule's bottom edge fills as the page scrolls (CSS scroll timeline). */}
        <span aria-hidden className="scroll-progress pointer-events-none absolute inset-x-8 -bottom-px h-[2px]" />
      </div>
    </header>
  );
}
