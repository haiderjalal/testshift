import type { ReactNode } from "react";

interface PageIntroProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

/**
 * Opening block for inner pages: a mono eyebrow, the page heading and a short lede. Every page uses it, so
 * headers keep the same rhythm as the landing sections.
 */
export function PageIntro({ eyebrow, title, description, children }: PageIntroProps) {
  return (
    <div className="max-w-3xl">
      {eyebrow && <p className="rise font-mono text-xs tracking-widest text-graphite uppercase">{eyebrow}</p>}
      <h1
        className="rise mt-4 font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-5xl"
        style={{ ["--d" as string]: 1 }}
      >
        {title}
      </h1>
      {description && (
        <div className="rise mt-5 text-lg leading-relaxed text-graphite" style={{ ["--d" as string]: 2 }}>
          {description}
        </div>
      )}
      {children}
    </div>
  );
}
