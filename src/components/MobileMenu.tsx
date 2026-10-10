"use client";

import Link from "next/link";
import { useState } from "react";

export interface SiteLink {
  href: string;
  label: string;
}

/** Phone navigation: the section links are hidden behind this button below the sm breakpoint. */
export function MobileMenu({ links }: { links: readonly SiteLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((value) => !value)}
        className="rounded-full border border-rule px-3.5 py-1.5 text-sm text-graphite transition hover:text-ink"
      >
        {open ? "Close" : "Menu"}
      </button>
      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="glass absolute top-full right-0 mt-3 flex w-56 flex-col gap-1 rounded-2xl p-2 shadow-2xl shadow-black/50"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-graphite transition hover:bg-raised hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
