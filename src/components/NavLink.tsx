"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useStoryStore } from "@/store/storyStore";

interface NavLinkProps {
  href: string;
  /** The landing-page chapter this link points at. While that chapter is in view the link is marked as current. */
  chapter?: string;
  className?: string;
  children: ReactNode;
}

/** A header link with a gradient underline (see `.nav-link`) that lights up while its chapter is on screen. */
export function NavLink({ href, chapter, className = "", children }: NavLinkProps) {
  const active = useStoryStore((state) => chapter !== undefined && state.activeChapter === chapter);
  return (
    <Link
      href={href}
      data-active={active || undefined}
      aria-current={active ? "location" : undefined}
      className={`nav-link ${className}`}
    >
      {children}
    </Link>
  );
}
