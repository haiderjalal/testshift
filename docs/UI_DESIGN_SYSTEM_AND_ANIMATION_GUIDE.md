# UI Design System & Animation Playbook

A complete, copy-ready description of how the OmniSolve site looks, is built, and is animated — written so you can
**rebuild the same style of website for a different brand**.

- **Use it three ways:** (1) copy the files listed in [§12](#12-file-map--what-to-copy), (2) follow the recipes in
  [§7](#7-the-animation-system) and [§8](#8-the-3d-engine-optional-module), or (3) paste the prompt in
  [§14](#14-a-prompt-to-give-claude-for-the-new-site) into Claude together with this file.
- **Everything here is from the working code** in this repository (`src/…`). Where a snippet is shortened, the file
  path is given so you can copy the real file.
- **Sections 1–7 are generic** (any brand, any content). **Section 8 (3D globe) is optional** — the design and
  animation system works without it.

## Contents

0. [Stack & install](#0-stack--install)
1. [The look in one page](#1-the-look-in-one-page)
2. [Design tokens](#2-design-tokens)
3. [Typography](#3-typography)
4. [Layout & spacing](#4-layout--spacing)
5. [Surfaces & effects](#5-surfaces--effects)
6. [Component catalog](#6-component-catalog)
7. [The animation system](#7-the-animation-system)
8. [The 3D engine (optional module)](#8-the-3d-engine-optional-module)
9. [Performance rules](#9-performance-rules)
10. [Accessibility rules](#10-accessibility-rules)
11. [Re-skin for a new brand: step by step](#11-re-skin-for-a-new-brand-step-by-step)
12. [File map — what to copy](#12-file-map--what-to-copy)
13. [Gotchas & lessons learned](#13-gotchas--lessons-learned)
14. [A prompt to give Claude for the new site](#14-a-prompt-to-give-claude-for-the-new-site)

---

## 0. Stack & install

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 16** (App Router, Cache Components), React 19, TypeScript strict | Server-first; static markup + tiny client islands |
| Styling | **Tailwind CSS v4** (tokens in CSS `@theme`) + a small amount of hand-written CSS | Tokens live in one CSS file; animations live in CSS |
| Animation | **CSS** for almost everything; **GSAP** (core + `@gsap/react`) for tickers/quickTo; **Lenis** for smooth scroll | CSS is cheapest and runs off the main thread |
| 3D (optional) | **three** + **@react-three/fiber** + **@react-three/drei** + **@react-three/postprocessing** | One persistent canvas behind the page |
| State | **Zustand** (slow UI state only) + plain mutable objects (60 fps state) | Keeps React out of the render loop |
| Forms | React Hook Form + Zod (lazy-loaded) | Same schema client and server |
| Icons / fonts | `lucide-react`, `next/font` (Sora, Inter, Geist Mono) | One icon set; self-hosted fonts |

```bash
npx create-next-app@latest my-site --ts --tailwind --app --src-dir --import-alias "@/*" --use-npm --turbopack
cd my-site
npm i gsap @gsap/react lenis zustand lucide-react clsx tailwind-merge react-hook-form @hookform/resolvers zod
# only if you want the 3D globe / scene:
npm i three @react-three/fiber @react-three/drei @react-three/postprocessing postprocessing
npm i -D @types/three
```

> Next 16 is not the Next you may know. Read `node_modules/next/dist/docs/` for anything surprising
> (e.g. Cache Components forbids `Math.random()` / `new Date()` during render — see [§13](#13-gotchas--lessons-learned)).

Utility used everywhere:

```ts
// src/utils/cn.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

---

## 1. The look in one page

**Mood:** premium, calm, "enterprise-meets-sci-fi". Deep navy-black space, frosted-glass surfaces, one luminous
indigo→teal gradient used sparingly, mono-spaced micro-labels, generous whitespace, and motion that *explains* rather than decorates.

**Ten rules that create the look**

1. **Dark-first.** Page is `#050816` (near-black navy). Light surfaces only where legibility demands it (the form card).
2. **One gradient, used for emphasis only** — the accent line of a heading, the primary button, key lines/glows.
3. **Glass surfaces.** Cards are a faint white gradient + 1px translucent border + backdrop blur + inner top highlight.
4. **Three font voices:** geometric display (Sora) for headings, neutral sans (Inter) for body, mono (Geist Mono) for tiny uppercase labels/numbers.
5. **Eyebrow pills** (`● SERVICES`) above every heading — mono, uppercase, aqua, pill-shaped, glowing dot.
6. **Two-line headings:** line one white, line two gradient ("From strategy / *to production.*").
7. **Big, confident type** (`clamp(2rem, 4.6vw, 3.6rem)` for section titles, up to ~4.3rem in the hero).
8. **Depth, not shadows.** Glows (`box-shadow` in aqua at low alpha), blur, and parallax instead of hard drop shadows.
9. **Rounded everything:** cards `rounded-3xl` (1.5rem), pills `rounded-full`, form card `rounded-[2rem]`.
10. **Motion is a story device:** things appear when you reach them, react to the pointer, and tell the page's one idea.

**Page anatomy (top to bottom):** floating glass navbar → hero (copy left, hero visual right) → a sequence of full-width
"chapters" (each: eyebrow → two-line heading → lead → content) → a closing call-to-action → FAQ + contact (light form card) → footer
with an oversized faded wordmark. A thin dot-rail on the right edge shows chapter progress.

---

## 2. Design tokens

All tokens live in **one file** (`src/app/globals.css`). Change this block and the whole site re-themes.

```css
@import "tailwindcss";

@theme {
  /* surfaces */
  --color-void: #050816;   /* page background */
  --color-deep: #0a1030;
  --color-ink: #0d1538;
  --color-panel: #121b4a;

  /* brand (here: indigo → teal, sampled from the logo) */
  --color-indigo-brand: #15144e;
  --color-glow: #6f72f5;       /* brand dark colour, LIFTED so it reads on dark */
  --color-teal-brand: #0a9ea2;
  --color-teal-ink: #07666a;   /* teal dark enough for TEXT on light surfaces (>= 5:1) */
  --color-teal: #00c1ac;
  --color-aqua: #38e8dc;       /* the accent: eyebrows, links, glows */

  /* text */
  --color-fg: #e8ecf8;
  --color-muted: #a3abcd;      /* body copy on dark (>= 7:1 on void) */
  --color-subtle: #7a83ab;     /* tertiary text (>= 4.5:1) */

  /* type */
  --font-display: var(--font-sora), ui-sans-serif, system-ui, sans-serif;
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;

  /* motion */
  --ease-expo: cubic-bezier(0.16, 1, 0.3, 1);   /* reveals: fast start, long soft landing */
  --ease-smooth: cubic-bezier(0.65, 0, 0.35, 1); /* loops / camera-like moves */

  --shadow-glow: 0 0 60px -10px rgb(56 232 220 / 0.45);
}

:root {
  --gradient-brand: linear-gradient(115deg, #8587ff 0%, #45b6f2 48%, #28ecd2 100%);
  --nav-h: 4.5rem;
  color-scheme: dark;
}
```

Tailwind v4 turns each `--color-*` into utilities automatically: `bg-void`, `text-fg`, `text-muted`, `text-aqua`, `border-aqua/30`, `shadow-glow`, `font-display`, etc.

### Colour usage map

| Token | Use | Notes |
| --- | --- | --- |
| `void` | page + canvas background | the 3D canvas clears to the same colour |
| `fg` | headings, key text | never pure white |
| `muted` | paragraphs, descriptions | keep ≥ 4.5:1 |
| `subtle` | captions, "trusted by" lines | only for non-essential text |
| `aqua` | eyebrow text, links, check marks, glow | the single accent |
| `--gradient-brand` | heading accent line, primary button, bars, ring | max ~1 per screen |
| `glow` | indigo end of gradients, lifted for dark UI | **never use the raw dark brand colour on dark** |
| `teal-ink` | text/asterisks on the light form card | the only "dark teal" |

> **Dark-brand rule:** a logo colour that is dark (here indigo `#15144E`) *vanishes* on a dark page. Lift its lightness
> (the "dark mark" and `--color-glow`), keep hue. This is the first thing to do when re-skinning.

### Rebrand in 5 minutes
Replace these six values, keep everything else: `--color-glow` (brand dark, lifted), `--color-aqua` (accent), `--color-teal-ink`
(accent darkened for light surfaces), the three stops of `--gradient-brand`, `--color-void`/`deep`/`ink`/`panel` (tint toward your hue), and the hard-coded
`rgb(56 232 220 / …)` glows (search for `56 232 220` → your accent as `r g b`).

---

## 3. Typography

Load with `next/font` (self-hosted, no layout shift) in `src/app/layout.tsx`:

```tsx
import { Geist_Mono, Inter, Sora } from "next/font/google";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

<html lang="en" className={`${sora.variable} ${inter.variable} ${geistMono.variable}`} suppressHydrationWarning>
```

| Role | Classes | Size |
| --- | --- | --- |
| Hero H1 | `font-display font-semibold leading-[1.04] text-fg` | `clamp(2.4rem, 4.7vw, 4.3rem)` |
| Section H2 | `font-display font-semibold leading-[1.06] text-balance text-fg` | `clamp(2rem, 4.6vw, 3.6rem)` |
| Card H3 | `font-display text-xl–2xl font-semibold text-fg` | 1.25–1.75rem |
| Lead | `text-lg leading-relaxed text-muted` | 1.125rem |
| Body | `text-[0.95rem] leading-relaxed text-muted` | 0.95rem |
| Eyebrow / label | `eyebrow` utility (mono, uppercase, `0.14em` tracking) | 0.72rem |
| Stat number | `font-display font-semibold leading-none tracking-tight` | `clamp(2.6rem, 6vw, 4.75rem)` |

Global base: headings get `letter-spacing: -0.02em` and `font-family: var(--font-display)`.

---

## 4. Layout & spacing

```css
@utility container-x {
  width: 100%;
  max-width: 78rem;                          /* 1248px */
  margin-inline: auto;
  padding-inline: clamp(1.25rem, 4vw, 2.5rem);
}
```

| Pattern | Classes |
| --- | --- |
| Section | `container-x relative py-24 md:py-36` |
| Section gap (sub-block) | `mt-24 md:mt-32` |
| Card grids | `grid gap-4 sm:grid-cols-2 lg:grid-cols-4` (cards `gap-4`–`gap-6`) |
| Two-column | `grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-20` |
| Hero | `relative flex min-h-svh items-end pt-[44svh] pb-14 md:items-center md:pt-32 md:pb-16` (phone: visual on top, copy below) |
| Heading block | `flex flex-col gap-5` (eyebrow → H2 → lead) |

**Pinned ("sticky") scenes** — the layout trick behind every scroll story. No JS pinning:

```tsx
<section data-chapter="industries" className="relative h-[560vh] motion-reduce:h-auto motion-reduce:py-28">
  <div className="sticky top-0 h-svh motion-reduce:static motion-reduce:h-auto">
    {/* the stage — stays on screen while the wrapper scrolls past */}
  </div>
</section>
```
Wrapper height = how long the scene lasts (e.g. `280vh` for a 2-beat scene, `560vh` for a 5-stop tour). `motion-reduce:` variants collapse it to a normal flow layout.

Responsive approach: **mobile-first**, three breakpoints used in practice — default (phone), `md` (768, hero side-by-side, nav CTAs), `lg` (1024, multi-column grids).

---

## 5. Surfaces & effects

All defined as Tailwind `@utility` / classes in `globals.css`.

```css
/* Frosted glass card */
@utility glass {
  background: linear-gradient(180deg, rgb(255 255 255 / 0.065), rgb(255 255 255 / 0.022));
  border: 1px solid rgb(255 255 255 / 0.09);
  backdrop-filter: blur(16px) saturate(150%);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.07), 0 30px 60px -34px rgb(0 0 0 / 0.7);
}

/* Heavier glass for overlays (mobile menu) */
@utility glass-strong {
  background: linear-gradient(180deg, rgb(15 23 58 / 0.95), rgb(8 12 36 / 0.97));
  border: 1px solid rgb(255 255 255 / 0.1);
  backdrop-filter: blur(24px) saturate(150%);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 40px 80px -30px rgb(0 0 0 / 0.8);
}

/* Gradient text */
@utility text-gradient {
  background-image: var(--gradient-brand);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}

/* Eyebrow pill: ● LABEL */
@utility eyebrow {
  display: inline-flex; align-items: center; gap: 0.55rem;
  padding: 0.4rem 0.85rem; border-radius: 999px;
  border: 1px solid rgb(56 232 220 / 0.28); background: rgb(56 232 220 / 0.07);
  color: var(--color-aqua); font-family: var(--font-mono);
  font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase;
}
.eyebrow::before {
  content: ""; width: 0.4rem; height: 0.4rem; border-radius: 999px;
  background: var(--color-aqua); box-shadow: 0 0 12px var(--color-aqua);
}
```

> ⚠️ **Write only the unprefixed `backdrop-filter`.** Writing `-webkit-backdrop-filter` right after it made the build tooling drop the
> unprefixed one, so glass never blurred in Chrome/Edge. The toolchain adds Safari's prefix itself.

**Cursor spotlight** (card lights up under the pointer; the `--mx/--my` vars are set by the pointer controller, [§7.5](#75-hover-effects)):

```css
.spotlight { position: relative; isolation: isolate; }
.spotlight::before {
  content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit;
  background: radial-gradient(380px circle at var(--mx, 50%) var(--my, 50%), rgb(56 232 220 / 0.16), transparent 62%);
  opacity: 0; transition: opacity 0.35s ease; pointer-events: none;
}
.spotlight:hover::before, .spotlight:focus-within::before { opacity: 1; }
```

**Rotating light-beam border** (featured pricing card — pure CSS, no JS):

```css
@property --beam-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
.beam-border { position: relative; }
.beam-border::after {
  content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1.5px;
  background: conic-gradient(from var(--beam-angle), transparent 0 62%, #6f72f5 74%, #38e8dc 88%, transparent 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  animation: beam-spin 5s linear infinite; pointer-events: none;
}
@keyframes beam-spin { to { --beam-angle: 360deg; } }
```

**Light "paper" card** (only for the contact form — dark text, high contrast): `bg-[#f6f8ff] rounded-[2rem] p-6 sm:p-9 shadow-[0_40px_120px_-30px_rgb(56_232_220/0.35)]`.

**Gradient shimmer** on accent heading words: `.shimmer { background-size: 220% 100%; animation: shimmer 5.5s ease-in-out infinite }` (animates `background-position`).

---

## 6. Component catalog

Each is small, typed, and mostly **server-rendered** (no client JS). Paths are in `src/`.

### 6.1 Button — `components/ui/Button.tsx`
Pill, two variants. The label **rolls up on hover** (two stacked copies, one clipped); arrow nudges; "magnetic" lean is added by `data-magnetic` ([§7.5](#75-hover-effects)).

```tsx
const VARIANT_CLASSES = {
  primary: "text-void bg-[image:var(--gradient-brand)] shadow-glow hover:shadow-[0_0_70px_-6px_rgb(56_232_220/0.7)]",
  ghost: "text-fg glass hover:bg-white/10 hover:border-white/25",
};
const SIZE_CLASSES = { md: "h-11 px-5 text-sm", lg: "h-13 px-7 text-[0.95rem]" };

// base: "group relative inline-flex select-none items-center justify-center gap-2.5 rounded-full font-semibold
//        transition-[box-shadow,background-color,border-color] duration-500 disabled:opacity-60"

function RollingLabel({ children }) {
  return (
    <span className="relative inline-flex overflow-hidden leading-none">
      <span className="block py-0.5 transition-transform duration-500 ease-(--ease-expo) group-hover:-translate-y-full group-focus-visible:-translate-y-full">{children}</span>
      <span aria-hidden="true" className="absolute inset-0 block translate-y-full py-0.5 transition-transform duration-500 ease-(--ease-expo) group-hover:translate-y-0 group-focus-visible:translate-y-0">{children}</span>
    </span>
  );
}
// <a|button data-magnetic> <RollingLabel>{label}</RollingLabel> <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /> </…>
```
Hash links render as plain `<a>` so smooth-scroll can intercept; internal routes use `next/link`.

### 6.2 SectionHeading — `components/shared/SectionHeading.tsx`
Eyebrow → `SplitText` heading (line 2 gradient) → lead. Props: `eyebrow`, `title`, `accent`, `lead`, `align`, `as`, `headingId`.

```tsx
<header className="flex flex-col gap-5 [items-center text-center when centered]">
  <Reveal><span className="eyebrow">{eyebrow}</span></Reveal>
  <SplitText as="h2" id={headingId}
    className="font-display text-[clamp(2rem,4.6vw,3.6rem)] leading-[1.06] font-semibold text-balance text-fg"
    lines={accent ? [{ text: title }, { text: accent, accent: true }] : [{ text: title }]} delay={80} />
  {lead && <Reveal delay={180} as="p" className="max-w-2xl text-lg leading-relaxed text-muted">{lead}</Reveal>}
</header>
```

### 6.3 Cards
- **Standard card:** `glass rounded-3xl p-6 sm:p-7` (wrap in `TiltCard` for tilt + spotlight).
- **Selectable card** (role picker): same + `aria-pressed`, selected → `border-aqua/60 shadow-[0_0_60px_-18px_rgb(56_232_220/0.6)]` and icon tile flips to `bg-aqua text-void`.
- **Featured plan:** `beam-border bg-[linear-gradient(180deg,rgb(40_60_150/0.45),rgb(10_16_48/0.85))] shadow-[0_0_90px_-25px_rgb(56_232_220/0.55)] backdrop-blur-xl` + "Most popular" gradient pill, raised with `lg:-my-5`.
- **Case card:** `CoverArt` (generated SVG constellation, hue per card) on top, chips, link — `glass overflow-hidden rounded-3xl`.
- **Icon tile:** `grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/5 text-aqua`.

### 6.4 Chips / pills
`rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[0.68rem] tracking-[0.06em] text-fg/80`
Accent variant: `border-aqua/25 bg-aqua/8 text-aqua`. Filter pills: active = gradient fill `bg-[image:var(--gradient-brand)] text-void shadow-glow`, inactive = `glass text-muted`.

### 6.5 Navbar — `components/layout/Navbar.tsx`
Floating glass capsule: `fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3` containing `glass flex h-14 max-w-6xl rounded-full`. Behaviours:
- **hides on scroll down, returns on scroll up** (`-translate-y-[130%]`, rAF-throttled scroll listener, 6px dead-zone, hides after 240px);
- **active link** underline (a gradient line that `scale-x-100`s) driven by the story store's `activeChapter`;
- **mobile menu = native `<dialog>`** (`showModal()`): free focus-trap, Escape-to-close, inert background; backdrop styled with `dialog::backdrop`.

### 6.6 Chapter rail — `components/layout/ChapterRail.tsx`
Right-edge column of dots (`xl:block` only): `fixed top-1/2 right-5 -translate-y-1/2`, one dot per chapter, label fades in on hover, active dot glows `shadow-[0_0_14px_rgb(56_232_220/0.9)]`. Anchors link to chapter ids.

### 6.7 Floating contact button — `components/layout/FloatingContact.tsx`
Gradient pill bottom-right; hides itself while the contact section is active (`translate-y-6 opacity-0`). Opens WhatsApp when a number is configured, else scrolls to the form.

### 6.8 Footer — `components/layout/Footer.tsx`
Logo + blurb + link columns, then an **oversized faded wordmark**: `text-gradient text-[clamp(3.2rem,16.4vw,18rem)] font-semibold tracking-tighter opacity-[0.17] [mask-image:linear-gradient(to_bottom,black_25%,transparent_92%)]`.

### 6.9 FAQ — `features/faq/FaqList.tsx`
Native `<details name="faq">` (exclusive accordion, find-in-page friendly, zero JS) + `::details-content` height animation ([CSS in `globals.css`](#7-the-animation-system)). Plus icon rotates 45° when open.

### 6.10 Form (light card) — `features/contact/ContactForm.tsx`
Labels above inputs (never placeholder-only), `aria-invalid` + `aria-describedby` errors with `role="alert"`, field style:
`w-full rounded-xl border bg-white px-4 py-3 text-[0.95rem] text-slate-900 shadow-sm outline-none placeholder:text-slate-500 focus:border-teal-brand focus:shadow-[0_0_0_4px_rgb(10_158_162/0.18)]`.
Submit = primary `Button` with loading spinner; success state = SVG ring sweeps then check draws (`.success-ring/.success-check`).

### 6.11 Other reusable bits
`Odometer` (stats), `DrawOnReveal` + `ShieldIllustration` (SVG that traces itself), `CoverArt` (deterministic generated SVG art), progress bars (`.bar-fill`), process timeline (CSS-var driven).

---

## 7. The animation system

### 7.0 Principles & the timing table

1. **CSS does the animating; JS only flips switches.** Reveals, hovers, SVG draws, bars, odometers = CSS transitions on `transform/opacity`.
2. **Server-render the markup.** Animated text is plain HTML in the first paint (good for LCP, SEO, no layout shift).
3. **One small client controller** (`PageEffects`) powers every decorative interaction by observing/delegating — not one client component per element.
4. **Scroll-scrubbed scenes read one shared state object**, not React state.
5. **Everything has a still version** (reduced motion / no JS / no WebGL).

| Effect | Duration | Easing | Stagger |
| --- | --- | --- | --- |
| Heading words rise | 0.95 s | `--ease-expo` | 38 ms / word |
| Hero letters rise | 0.85 s | `--ease-expo` | 14 ms / letter |
| Block reveal (fade+lift+unblur) | 0.8–1 s | `--ease-expo` | 70 ms / item |
| Odometer digit roll | 1.9 s | `--ease-expo` | 110 ms / digit |
| SVG stroke draw | 1.8 s | `--ease-expo` | 120 ms / stroke |
| Bar fill | 1.9 s | `--ease-expo` (0.3 s delay) | — |
| Button label roll / arrow | 0.5 s | `--ease-expo` | — |
| Card tilt (GSAP quickTo) | 0.6 s | `power3.out` | — |
| Globe camera / state damping | continuous | exponential damp | — |
| Looping accents (shimmer, beam, scroll cue) | 2.2–5.5 s | linear / `--ease-smooth` | — |

### 7.1 The pre-paint switch (the foundation)

A tiny inline script in `<head>` sets two classes **before first paint**:

```tsx
// src/app/layout.tsx
const PRE_PAINT_SCRIPT = `(function(){var d=document.documentElement;d.classList.add('js');try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('rm');}catch(e){}})();`;

<html suppressHydrationWarning>
  <head><script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} /></head>
```

- `html.js` = JavaScript is on → it is now safe to **hide** things for a reveal. Without JS nothing is ever hidden.
- `html.rm` = reduced motion → nothing is hidden or animated.
- `html.ready` (added by `SmoothScroll` after hydration) → proves JS is alive. A CSS **failsafe** un-hides everything after 4 s if it never appears:

```css
html.js:not(.rm):not(.ready) [data-split="view"] .split-unit,
html.js:not(.rm):not(.ready) [data-reveal],
html.js:not(.rm):not(.ready) [data-fragment],
html.js:not(.rm):not(.ready) .scrub-word { animation: failsafe-show 0s 4s forwards; }
@keyframes failsafe-show { to { opacity: 1; transform: none; filter: none; } }
```

**Every "hidden before reveal" rule is written as `html.js:not(.rm) …`.** That one convention is the whole no-JS / reduced-motion / failsafe story.

### 7.2 Server-split text — words & letters rise out of a mask

`components/motion/SplitText.tsx` is a **server component**. It outputs `word → mask → unit` spans with an index variable; CSS animates them.

```tsx
export function SplitText({ as = "span", children, lines, className, id, unit = "words", trigger = "view", delay = 0 }) {
  const resolved = lines ?? [{ text: children ?? "" }];
  const label = resolved.map((l) => l.text).join(" ");
  const isHeading = /^h[1-6]$/.test(as);          // aria-label is only valid on headings
  let index = 0;
  const Component = as as "div";
  return (
    <Component id={id} className={className} data-split={trigger}
      aria-label={isHeading ? label : undefined} style={{ "--d": `${delay}ms` } as CSSProperties}>
      <span aria-hidden={isHeading ? true : undefined}>
        {resolved.map((line, li) => {
          const byChar = unit === "chars" && !line.accent;     // gradient lines always split by WORD
          const words = line.text.split(" ");
          return (
            <Fragment key={li}>
              {li > 0 && <br />}
              {words.map((word, wi) => (
                <Fragment key={wi}>
                  {byChar ? (
                    <span className="split-word">
                      {Array.from(word).map((ch, ci) => (
                        <span key={ci} className="split-mask">
                          <span className="split-unit" style={{ "--i": index++ } as CSSProperties}>{ch}</span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="split-word split-mask">
                      <span className={cn("split-unit", line.accent && "text-gradient shimmer")} style={{ "--i": index++ } as CSSProperties}>{word}</span>
                    </span>
                  )}
                  {wi < words.length - 1 && " "}
                </Fragment>
              ))}
            </Fragment>
          );
        })}
      </span>
    </Component>
  );
}
```

```css
.split-word { display: inline-block; white-space: nowrap; vertical-align: top; }
.split-mask { display: inline-block; overflow: hidden; vertical-align: top;
              padding-bottom: 0.14em; margin-bottom: -0.14em; }  /* room for descenders */
.split-unit { display: inline-block; will-change: transform; }

/* scroll-triggered: hidden until [data-in] appears */
html.js:not(.rm) [data-split="view"]:not([data-in]) .split-unit { transform: translateY(112%) rotate(5deg); opacity: 0; }
html.js:not(.rm) [data-split="view"] .split-unit {
  transition: transform 0.95s var(--ease-expo) calc(var(--d, 0ms) + var(--i, 0) * 38ms),
              opacity 0.6s ease calc(var(--d, 0ms) + var(--i, 0) * 38ms);
}
/* on-load (hero): pure CSS keyframes, starts at first paint — no JS dependency, great for LCP */
html.js:not(.rm) [data-split="load"] .split-unit {
  animation: split-rise 0.85s var(--ease-expo) both;
  animation-delay: calc(var(--d, 0ms) + var(--i, 0) * 14ms);
}
@keyframes split-rise {
  from { transform: translateY(112%) rotate(5deg); opacity: 0; filter: blur(6px); }
  to   { transform: none; opacity: 1; filter: blur(0); }
}
```
Usage: `<SplitText as="h1" unit="chars" trigger="load" delay={120} lines={[{ text: "Enterprise AI and software," }, { text: "built to scale.", accent: true }]} />`

### 7.3 Scroll reveals — one observer for the whole page

`Reveal` is a **server component** that just tags markup; `PageEffects` (client, renders nothing) observes everything.

```tsx
// components/motion/Reveal.tsx  (server)
export function Reveal({ as = "div", children, className, index = 0, delay = 0, id }) {
  const Component = as as "div";
  return <Component id={id} className={className} data-reveal="" style={{ "--i": index, "--d": `${delay}ms` } as CSSProperties}>{children}</Component>;
}
```
```css
html.js:not(.rm) [data-reveal]:not([data-in]) { opacity: 0; transform: translate3d(0, 28px, 0) scale(0.985); filter: blur(8px); }
html.js:not(.rm) [data-reveal] {
  transition: opacity 0.8s ease calc(var(--d, 0ms) + var(--i, 0) * 70ms),
              transform 1s var(--ease-expo) calc(var(--d, 0ms) + var(--i, 0) * 70ms),
              filter 0.8s ease calc(var(--d, 0ms) + var(--i, 0) * 70ms);
}
```
Stagger a list by passing `index={i}` to each `Reveal`.

```ts
// lib/reveal.ts — ONE shared IntersectionObserver
const pending = new Set<Element>();
let observer: IntersectionObserver | null = null;
let sweepQueued = false, sweepAttached = false;

function reveal(el: Element) { el.setAttribute("data-in", ""); pending.delete(el); observer?.unobserve(el); }
function sweepAbove() { sweepQueued = false; pending.forEach((el) => { if (el.getBoundingClientRect().bottom < 0) reveal(el); }); }
function queueSweep() { if (sweepQueued || pending.size === 0) return; sweepQueued = true; requestAnimationFrame(sweepAbove); }

export function observeReveal(el: Element): () => void {
  if (typeof IntersectionObserver === "undefined") { reveal(el); return () => undefined; }
  observer ??= new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting || e.boundingClientRect.bottom < 0) reveal(e.target); }),
    { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
  );
  if (!sweepAttached) { window.addEventListener("scroll", queueSweep, { passive: true }); sweepAttached = true; }
  pending.add(el); observer.observe(el);
  return () => { pending.delete(el); observer?.unobserve(el); };
}
```
The **scroll sweep** is the safety net: an observer never reports an element you jumped *over* (hash-link scroll), so anything already above the viewport is revealed on the next scroll tick — nothing stays invisible when you scroll back up.

### 7.4 The hero entrance (no JS, no blocking preloader)
The H1 letters use the `data-split="load"` keyframes above. Everything else in the hero uses `data-load-fade` with a per-element delay:

```css
html.js:not(.rm) [data-load-fade] { animation: load-fade 1.1s var(--ease-expo) both; animation-delay: var(--d, 0ms); }
@keyframes load-fade { from { opacity: 0; transform: translate3d(0, 22px, 0); filter: blur(8px); } to { opacity: 1; transform: none; filter: blur(0); } }
```
```tsx
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
<p data-load-fade="" style={delay(150)} className="eyebrow">…</p>      {/* 150  */}
<SplitText as="h1" trigger="load" unit="chars" delay={120} … />          {/* 120 → ~1.5 s */}
<p data-load-fade="" style={delay(650)}>lead</p>                          {/* 650  */}
<div data-load-fade="" style={delay(780)}>buttons</div>                   {/* 780  */}
<p data-load-fade="" style={delay(900)}>trust line</p>                    {/* 900  */}
```
Total entrance ≈ 1.5 s. The headline is real text in the first HTML, so it is the LCP and never waits for JS or the 3D scene.

### 7.5 Hover effects

All delegated from **one** pointer listener in `PageEffects` (no per-card component):

```tsx
// components/motion/PageEffects.tsx  (client, renders null) — the pointer part
media.add("(hover: hover) and (pointer: fine)", () => {
  // for the element under the pointer:
  //   [data-tilt]     → quickTo rotationX/rotationY (±data-tilt-max°) + set --mx/--my (spotlight position)
  //   [data-magnetic] → quickTo x/y towards the pointer (strength 0.3)
  // on leave / pointer change → ease back to 0
  document.addEventListener("pointermove", onPointerMove, { passive: true });
});
```
- Tilt uses `gsap.set(el, { transformPerspective: 900 })` and `gsap.quickTo(el, "rotationX"|"rotationY", { duration: 0.6, ease: "power3.out" })`.
- Mouse only (`pointerType === "mouse"`); reduced motion keeps the spotlight but skips rotation/lean.
- Markup side is trivial: `TiltCard` = `<div className="spotlight …" data-tilt data-tilt-max={7}>`; `Button` adds `data-magnetic`.

### 7.6 Scroll-driven stories (the heart of the "wow")

**Goal:** one source of truth for "how far through each chapter is the visitor", read by DOM scenes *and* the 3D scene.

**Step 1 — cache scroll (never read `window.scrollY` per frame):**

```ts
// lib/scrollState.ts
export const scroll = { y: 0, version: 0 };
type Listener = () => void;
const listeners = new Set<Listener>(); let attached = false;
function handleScroll() { scroll.y = window.scrollY; scroll.version += 1; listeners.forEach((l) => l()); }
export function subscribeToScroll(listener?: Listener) {
  if (!attached) { scroll.y = window.scrollY; window.addEventListener("scroll", handleScroll, { passive: true }); attached = true; }
  if (listener) listeners.add(listener);
  return () => { if (listener) listeners.delete(listener); };
}
```

**Step 2 — mark chapters in the DOM** with `data-chapter="id"` (sections / sticky wrappers), in story order.

**Step 3 — the driver** computes each chapter's progress (0..1) every frame (only when something changed):

```tsx
// features/story/StoryDriver.tsx  (client, renders null)
// Boundary rule: a chapter becomes "active" when its TOP passes the viewport CENTRE.
//   flow chapter   : progress while the section crosses the screen
//   sticky chapter : progress while the sticky stage is pinned   (start = top, end = top + height − vh)
const measure = () => { /* getBoundingClientRect of each [data-chapter] → {zoneStart,start,end}; stale = true */ };

const frame = (_t, deltaMs) => {
  const scroll = scrollCache.y;
  if (!stale && scroll === lastScroll && Math.abs(live.scrollVelocity) < 0.0005) return;   // idle = free
  stale = false;
  measured.forEach((c, i) => {
    chapterProgress[c.id] = clamp((scroll - c.start) / Math.max(1, c.end - c.start));
    if (scroll >= c.zoneStart) activePosition = i;
  });
  const active = measured[activePosition];
  computeTarget(active.index, chapterProgress[active.id] ?? 0, target);      // → what the 3D scene wants
  live.scrollVelocity = damp(live.scrollVelocity, ((scroll - lastScroll) / vh) / Math.max(dt, 0.001), 6, dt);
  lastScroll = scroll;
  const store = useStoryStore.getState();
  if (store.activeChapter !== active.id) store.setActiveChapter(active.id);   // low-frequency → React
};
gsap.ticker.add(frame);   // + remeasure on resize / load / fonts.ready / ResizeObserver(body)
```
`chapterProgress` is a plain object: `export const chapterProgress: Record<string, number> = {}`.

**Step 4 — consume it.** Any component reads `chapterProgress.<id>` in a ticker and writes styles **only when the value changed**:

```tsx
// ScrubWords: words light up as the "gap" chapter progresses (opacity 0.56 → 1 per word)
const update = () => {
  const p = chapterProgress[progressKey] ?? 0;
  if (p === lastProgress) return;  lastProgress = p;
  const f = clamp((p - from) / (to - from));
  nodes.forEach((n, i) => { n.style.opacity = String(UNLIT + (1 - UNLIT) * clamp(f * nodes.length - i)); });
};
gsap.ticker.add(update);
```
The same pattern drives: `GapFragments` (chips drift apart), `ServiceCarousel` (ring angle), `IndustryTour` (active card via the store), the 3D globe.

**Pinned tour (industries):** a stepped index turns continuous progress into "stop 0…N−1 with a hold on each":

```ts
// utils/math.ts
export function steppedIndex(progress: number, count: number, hold = 0.62): number {
  const scaled = clamp(progress) * count;
  const base = Math.min(count - 1, Math.floor(scaled));
  const local = scaled - base;
  const move = smoothstep(hold, 1, local);              // hold on a stop, then ease to the next
  return Math.min(count - 1, base + (base < count - 1 ? move : 0));
}
```
All N cards stay in the DOM (SEO + screen readers); the active one is visible (`opacity-100 translate-y-0`), others `opacity-0 translate-y-6 blur-sm pointer-events-none`, with `aria-hidden` on inactive. Under reduced motion `motion-reduce:` classes turn the stack into a normal list.

### 7.7 CSS-3D carousel (cards on a ring)
Layout is **pure CSS** — the server HTML is already correct; JS only sets `--angle`.

```css
.carousel { container-type: inline-size; position: relative; height: 27rem; perspective: 1900px; }
.carousel-ring {
  --w: clamp(15rem, 27cqw, 21rem);  --r: calc(var(--w) * 1.02);
  position: absolute; inset: 0; transform-style: preserve-3d;
  transform: translateZ(calc(var(--r) * -1)) rotateY(calc(var(--angle, 0) * -1deg));
}
.carousel-card {
  --w: clamp(15rem, 27cqw, 21rem);  --r: calc(var(--w) * 1.02);
  position: absolute; top: 50%; left: 50%; width: var(--w); height: 24rem; margin: -12rem 0 0 calc(var(--w) * -0.5);
  transform: rotateY(calc(var(--i) * 60deg)) translateZ(var(--r));     /* 360° / 6 cards = 60° */
  background: linear-gradient(180deg, rgb(16 24 60 / 0.92), rgb(8 12 36 / 0.94));   /* near-opaque */
  backface-visibility: hidden;
}
@container (max-width: 40rem) { .carousel-ring, .carousel-card { --w: min(80cqw, 19rem); } }
@media (prefers-reduced-motion: reduce) {          /* still version: a plain grid */
  .carousel { height: auto; perspective: none; }
  .carousel-ring { position: static; transform: none; display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); }
  .carousel-card { position: static; width: auto; height: auto; margin: 0; transform: none; opacity: 1 !important; }
}
```
```tsx
// each frame (only when progress changed):
const index = steppedIndex(progress, count, 0.55);               // continuous 0…count-1
ring.style.setProperty("--angle", (index * (360 / count)).toFixed(2));
cards.forEach((card, i) => {
  const facing = Math.cos(((i - index) * (360 / count) * Math.PI) / 180);    // 1 = front, −1 = back
  card.style.opacity = (0.12 * smoothstep(0, 0.3, facing) + 0.88 * smoothstep(0, 0.9, facing)).toFixed(3);   // back cards → 0
  card.style.pointerEvents = facing > 0.6 ? "auto" : "none";
});
// card N gets data-active={i === Math.round(index)} → CSS glows it and reveals its CTA
```
Keyboard users get Prev/Next buttons that scroll to the matching progress (`progress_i = (i + 0.3) / count`).

### 7.8 Odometer, bars, SVG draw, progress timeline (all CSS)

**Odometer** — each digit is a strip `0…9`; revealing slides it to the value:
```tsx
<span role="img" aria-label="120+" data-odo=""> {/* final value is in the markup → works without JS */}
  <span aria-hidden="true">
    {/* per digit: */}<span className="odo"><span className="odo-col" style={{ "--digit": 1, "--i": 0 }}><span>0</span>…<span>9</span></span></span>
    {/* non-digit chars rendered as plain spans */}
  </span>
</span>
```
```css
.odo { display: inline-block; height: 1em; overflow: hidden; line-height: 1; vertical-align: top; }
.odo-col { display: flex; flex-direction: column; transform: translateY(calc(var(--digit) * -1em)); }
.odo-col > span { display: block; height: 1em; line-height: 1; }
html.js:not(.rm) [data-odo]:not([data-in]) .odo-col { transform: translateY(0); }
html.js:not(.rm) [data-odo] .odo-col { transition: transform 1.9s var(--ease-expo) calc(var(--i, 0) * 110ms + 150ms); }
```

**Bars** — `<div class="bar-fill" style="--v:0.96">` inside a `Reveal`:
```css
.bar-fill { transform: scaleX(var(--v, 1)); transform-origin: left; }
html.js:not(.rm) [data-reveal]:not([data-in]) .bar-fill { transform: scaleX(0); }
html.js:not(.rm) .bar-fill { transition: transform 1.9s var(--ease-expo) 0.3s; }
```

**SVG line-draw** — give shapes `pathLength="1"` and class `draw`; scale-in dots with `pop`; wrap the SVG in `<div data-draw>`:
```css
.draw { stroke-dasharray: 1; stroke-dashoffset: 0; }
.pop  { transform-box: fill-box; transform-origin: center; }
html.js:not(.rm) [data-draw]:not([data-in]) .draw { stroke-dashoffset: 1; }
html.js:not(.rm) [data-draw] .draw { transition: stroke-dashoffset 1.8s var(--ease-expo) calc(var(--i, 0) * 120ms); }
html.js:not(.rm) [data-draw]:not([data-in]) .pop  { transform: scale(0); opacity: 0; }
html.js:not(.rm) [data-draw] .pop { transition: transform 0.9s var(--ease-expo) calc(0.5s + var(--i, 0) * 90ms), opacity 0.6s ease calc(0.5s + var(--i, 0) * 90ms); }
```

**Process timeline** — a line that draws itself as you scroll, lighting each step. JS writes **one number** (`--p`, 0..1) on scroll; CSS derives the rest:
```ts
const progress = clamp((vh * 0.78 - rect.top) / (rect.height + vh * 0.16));   // 0 when top hits 78% of viewport, 1 when bottom hits 62%
element.style.setProperty("--p", progress.toFixed(3));        // update ONLY on scroll/resize events (subscribeToScroll), never per idle frame
```
```css
/* each step marker (style attr): */
--lit: clamp(0, calc((var(--p) - var(--t) + 0.06) * 9), 1);               /* --t = this step's position 0…1 */
opacity: calc(0.62 + 0.38 * var(--lit));
box-shadow: 0 0 calc(var(--lit) * 40px) calc(var(--lit) * -6px) rgb(56 232 220 / 0.9);
border-color: color-mix(in oklab, #38e8dc calc(var(--lit) * 100%), rgb(255 255 255 / 0.15));
/* the line fill: transform: scaleX(var(--p)) (scaleY on mobile) */
```

**Native accordion height animation** (progressive enhancement — works as instant toggle where unsupported):
```css
.faq-item { interpolate-size: allow-keywords; }
.faq-item::details-content { block-size: 0; overflow: clip; transition: block-size 0.5s var(--ease-expo), content-visibility 0.5s allow-discrete; }
.faq-item[open]::details-content { block-size: auto; }
```

### 7.9 Smooth scroll (Lenis) + anchors

```tsx
// components/layout/SmoothScroll.tsx (client, renders null)
const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, smoothWheel: true });   // momentum only — never hijacks scroll
setLenis(lenis);                                                                       // module-level handle for scrollTo()
gsap.ticker.add((time) => lenis.raf(time * 1000));  gsap.ticker.lagSmoothing(0);
// reduced motion → don't create Lenis. Also: one document click handler turns a[href^="#"] into lenis.scrollTo(el, { offset: -72, duration: 1.6 }) + history.pushState.
```
Add Lenis' recommended base CSS (`html.lenis, html.lenis body { height: auto } .lenis.lenis-smooth { scroll-behavior: auto !important }`).

### 7.10 Reduced motion, no-JS, no-WebGL — the contract

| Situation | What the visitor gets | How |
| --- | --- | --- |
| **No JavaScript** | All content visible and readable; forms render | hidden states exist only under `html.js` |
| **JS but hydration fails** | Everything appears after 4 s | `:not(.ready)` failsafe animation |
| **`prefers-reduced-motion`** | No reveals, no smooth scroll; pinned scenes become stacked lists; globe = one calm frame | `html.rm` + `motion-reduce:` + `@media (prefers-reduced-motion)` |
| **No WebGL** | Static logo backdrop; same layout and content | error boundary → `StaticGlobe` |
| **Touch device** | No tilt/magnet/drag (so scrolling is never captured) | pointer handlers require `pointerType === "mouse"` |

Do **not** apply `animation-duration: .01ms` globally for reduced motion — it makes some effects *more* jarring. Provide a deliberate still version per effect.

---

## 8. The 3D engine (optional module)

A single **fixed, full-viewport `<canvas>`** behind the page; the HTML scrolls over it. The scene changes with the scroll.

```
scroll (Lenis) ─► StoryDriver ─► target (what the chapter wants) ─ damp/frame ─► live ─► GlobeScene (R3F)
                      └─► chapterProgress{} ─► DOM scenes (carousel, scrub words…)
pointer / drag / intro timeline ───────────────────────────────────────────────► live
```
Shared state is in **plain objects** (`features/story/sceneState.ts`) so React never re-renders at 60 fps.

### 8.1 State shape

```ts
// sceneState.ts
export interface SceneTarget {
  camZ: number;  fx: number; fy: number; scale: number;     // camera distance; offset as a FRACTION of viewport w/h; size
  rotX: number; rotY: number; rotZ: number;                  // orientation
  integrity: number;   // 1 = network connected, 0 = scattered
  dim: number;         // global brightness (content chapters dim the scene)
  ringScale: number; ringTiltX: number; ringTiltZ: number; ringOpacity: number;
  focus: number; focusLon: number; focusLat: number;         // highlight a cluster
  spin: number;        // idle spin rad/s
}
export const live: LiveState = { ...BASE_TARGET, assemble: 0, ringDraw: 0, introZ: 2.4, idleAngle: 0, pointerX: 0, pointerY: 0,
                                 dragX: 0, dragY: 0, scrollVelocity: 0, pulse: 0, heroVisibility: 1 };
export const target: SceneTarget = { ...BASE_TARGET };
export const chapterProgress: Record<string, number> = {};
export function firePulse(strength = 1) { live.pulse = Math.max(live.pulse, strength); }   // network-wide flash (e.g. on a button)
```

### 8.2 Chapters = keyframes (the director's script)

Each chapter declares only what **changes** in its `to` pose; its `from` is automatically the previous chapter's `to`, so the camera **never jumps**. Optional `during(p, out, from)` refines (tours, scrubbed values).

```ts
{ id: "gap", mode: "sticky",
  to: { camZ: 3.6, fx: 0.06, scale: 1.12, integrity: 0.1, dim: 0.4, ringScale: 1.25, ringOpacity: 0.55 },
  during: (p, out) => { out.integrity = lerp(1, 0.08, smoothstep(0.08, 0.85, p)); } },    // network falls apart as you scroll

{ id: "industries", mode: "sticky",
  to: { camZ: 4.5, fx: 0.31, scale: 0.94, integrity: 1, dim: 1, focus: 1, /* …end on the last stop… */ },
  during: (p, out, from) => {                                     // reconnect, then tour 5 regions
    out.integrity = lerp(0.08, 1, smoothstep(0, 0.2, p));
    const i = steppedIndex(clamp((p - 0.04) / 0.94), STOPS.length);
    /* lerp lon/lat between STOPS[floor(i)] and STOPS[ceil(i)]; rotY = -lon, rotX = lat*0.85; blend in from `from` over the first 10% */
  } },
```
Resolution (the "never jumps" guarantee):
```ts
const RESOLVED = DEFINITIONS.reduce((acc, def, i) => {
  const prevTo = i === 0 ? BASE_TARGET : acc[i - 1].to;
  const from = { ...prevTo, ...(def.from ?? {}) };
  const to = { ...from, ...def.to };
  acc.push({ id: def.id, mode: def.mode, from, to, during: def.during }); return acc;
}, []);
export function computeTarget(index, progress, out) {
  const c = RESOLVED[index];
  const eased = easeInOutCubic(clamp(progress));
  for (const key of TARGET_KEYS) out[key] = lerp(c.from[key], c.to[key], eased);
  c.during?.(clamp(progress), out, c.from);
}
```
**Test it** (this caught a real bug): for every consecutive pair assert `computeTarget(i, 1) ≈ computeTarget(i+1, 0)`.

### 8.3 The frame loop (kept OUT of React)

```ts
// features/globe/frame.ts — called from useFrame((state, delta) => stepGlobeScene(state, delta, ctx))
export function stepGlobeScene(state, delta, { groups, uniforms, pointer, scratch, bloom, staticMode }) {
  const dt = Math.min(delta, 0.05);
  if (!staticMode) dampLiveState(dt, pointer);                         // live[key] = damp(live[key], target[key], rate[key], dt)

  // responsive placement: offsets are fractions of the visible plane at the globe's depth
  const cameraZ = live.camZ + live.introZ;
  const viewH = 2 * cameraZ * Math.tan(FOV / 2),  viewW = viewH * (size.width / size.height);
  const narrow = 1 - smoothstep(0.62, 1.05, aspect);                    // 0 desktop → 1 phone
  const x = live.fx * viewW * (1 - narrow);
  const y = (live.fy + narrow * 0.27 * live.heroVisibility) * viewH;   // phone: hero globe rides above the copy
  const scale = Math.min(live.scale * (1 - 0.2 * narrow), viewW * (0.55 - 0.13 * narrow));
  groups.root.position.set(x, y, 0);  groups.root.scale.setScalar(scale);
  groups.spin.rotation.set(live.rotX + …, live.rotY + live.idleAngle + …, 0);        // rotate to a longitude: rotY = -lon

  // ONE set of uniform objects shared by every material
  uniforms.uTime.value = clock.elapsedTime;  uniforms.uAssemble.value = live.assemble;  uniforms.uIntegrity.value = live.integrity;
  uniforms.uDim.value = live.dim * (1 - 0.42 * narrow * (1 - live.heroVisibility));
  uniforms.uPointScale.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan(FOV / 2));
  uniforms.uHdr.value = bloom ? 1 : 0.35;
  /* …project tag anchors to screen px for the HTML labels… */
}
```
Why a separate file: React Compiler lint (rightly) forbids mutating hook-returned objects inside components; imperative per-frame work belongs in plain functions.

### 8.4 Materials — a critical gotcha

react-three-fiber **copies** the `uniforms` prop of a `<shaderMaterial>` into the material's own objects, so a shared `{value}` you mutate each frame never reaches the GPU. **Build the materials yourself** and pass them as `material={…}`:

```ts
// features/globe/materials.ts
export function createGlobeMaterial(parameters: ShaderMaterialParameters): ShaderMaterial {
  return new ShaderMaterial({ toneMapped: false, ...parameters });   // the constructor keeps the references
}
export function useDisposeMaterial(m: ShaderMaterial) { useEffect(() => () => m.dispose(), [m]); }

const material = useMemo(() => createGlobeMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false }), [uniforms]);
return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
```

### 8.5 The globe, layer by layer

| Layer | Geometry | Shader idea |
| --- | --- | --- |
| Planet body | opaque sphere r=0.992 | `fresnel = pow(1 − dot(n, v), 2.4)` rim; colour mixes to the page background as `uDim → 0` |
| Continents | ~5–9k `Points` sampled from a 1° land mask (generated by `scripts/build-land-mask.mjs` from Natural Earth via `world-atlas`) | tiny soft discs, teal-biased, twinkle |
| Network nodes | jittered Fibonacci sphere (170–240) as `Points` | glowing discs; HDR core so bloom can bloom |
| Network edges | nearest-neighbour `LineSegments` | alpha by `edgeRandom < threshold(uIntegrity)`; **data packets** = `fract(uTime*speed + rand)` near the edge's 0→1 coordinate |
| Orbit ring | custom tapered tube (`ring.ts`) | draws in via `uDraw`; a "comet" `1 − smoothstep(0, .14, |vT − fract(t*.075)|)` |
| Atmosphere | sphere r×1.16, `BackSide`, additive | `glow = pow(clamp(-n.z / 0.52, 0, 1), 2.8)` |
| Dust | 650–1300 `Points` | slow rotation → parallax |

Core vertex logic shared by nodes/edges/land (`shaders/common.ts`) — intro assembly **and** the "network breaking apart":

```glsl
float easeOutCubic(float x){ float y = 1.0 - clamp(x,0.0,1.0); return 1.0 - y*y*y; }

vec3 displace(vec3 rest, vec3 scatter, vec3 drift, float rand, float driftStrength) {
  float a = easeOutCubic((uAssemble - rand * 0.55) / 0.45);   // each point arrives at its own time
  vec3 p = mix(scatter, rest, a);                               // fly in from far away
  p += drift * sin(uTime * 0.7 + rand * 6.2831) * 0.006;        // idle breathing
  float broken = clamp((1.0 - uIntegrity) * (0.55 + rand * 0.9), 0.0, 1.0);
  p += drift * broken * (0.28 + rand * 0.55) * driftStrength;   // scroll-driven: drift apart
  return p;
}
```
```glsl
// node fragment: soft disc + HDR core. NOTE: write reversed smoothsteps as 1.0 - smoothstep(lo, hi, x) (GLSL leaves edge0>edge1 undefined)
float d = length(gl_PointCoord - 0.5) * 2.0;
float disc = 1.0 - smoothstep(0.78, 1.0, d);   if (disc < 0.01) discard;
float core = 1.0 - smoothstep(0.0, 0.62, d);
vec3 color = mix(brandGradient(vGradient), uColorC, vFocus * 0.55 + uPulse * 0.3);
float intensity = 0.95 + (core * 1.4 + vFocus * 1.1 + uPulse * 0.8) * uHdr;   // uHdr = 0.35 when there is no bloom pass
gl_FragColor = vec4(color * intensity, disc * vArrive * uDim);
#include <colorspace_fragment>        // uniforms hold LINEAR colours (THREE.Color does the sRGB→linear for you)
```
The logo's colour gradient is applied in **screen space** (from the world-space direction), so it stays put while the globe rotates:
`vGradient = clamp(0.5 + 0.5 * dot(worldDir.xy, vec2(0.8, 0.6)), 0.0, 1.0);`

### 8.6 Intro, tiers, fallbacks

- **Intro** (GSAP timeline on `live`): `assemble 0→1` (2.8 s), `ringDraw 0→1` (starts at 1.0 s), `introZ 2.6→0` (camera pulls in). Plays once per session (second visit is 2× faster via `sessionStorage`). **No blocking preloader.**
- **Tiers:** `detectQualityTier()` uses cheap signals only (touch/small screen/cores/memory → `medium`, else `high`) — it does **not** create a probe WebGL context. The canvas is created **empty**, the renderer is inspected (`WEBGL_debug_renderer_info` matching `swiftshader|llvmpipe|software`), and only then is the scene mounted at the right tier. `high` = bloom + more points; `medium` = no bloom. A `PerformanceMonitor` can step `high` down at runtime.
- **No WebGL / context failure:** an error boundary around the canvas flips the store tier to `low` → `StaticGlobe` (the logo image with a CSS glow).
- **Reduced motion:** render **one** frame (`frameloop="demand"`), fade the layer with scroll via a ticker.
- **HTML labels tethered to 3D nodes:** each frame the scene projects anchor points to screen px and writes them to a plain array; a DOM component applies `transform: translate3d(x,y,0)` + opacity from a ticker (real, accessible HTML).
- **Lazy loading:** `const StoryCanvas = dynamic(() => import("./StoryCanvas"), { ssr: false })`, mounted after `requestIdleCallback` → the 268 KB-gz 3D engine never blocks first paint.

---

## 9. Performance rules

1. **LCP = real text in the first HTML.** Never gate the headline behind JS/WebGL.
2. **Lazy-load the heavy stuff** (3D engine, zod, GSAP Flip) — first paint needs none of it.
3. **Static things are server components;** one client controller drives them (hydration cost scales with client components + DOM).
4. **Idle must be free.** Every per-frame function early-returns when nothing changed (`scroll.version`, `lastProgress`).
5. **Never read layout in a loop that also writes styles.** `window.scrollY` / `getBoundingClientRect()` inside a ticker = forced reflow every frame. Cache scroll via events; measure on resize.
6. **Animate only `transform` / `opacity` / `filter`.** Heights via `interpolate-size`/`::details-content` or `scale`.
7. **One WebGL context.** Cap DPR (1–1.75), ≤ ~10 draw calls, instanced/`Points` geometry, no per-frame allocation (reuse vectors).
8. **Deterministic geometry** (seeded PRNG) — same on server and client; required by Cache Components.
9. **Don't ship what you don't use** (we dropped ScrollTrigger and SplitText entirely).
10. **Measure on a real device.** Software-rendered lab runs are the worst case; they are noisy on a busy machine — use CPU profiles (CDP `Profiler`) to find hot functions, Lighthouse medians of ≥3 runs to compare.

## 10. Accessibility rules

- One `<h1>`; headings in order; landmarks (`header/nav/main/footer`); **skip link** first.
- Animated text keeps its real string: headings get `aria-label`, split spans are `aria-hidden`; non-headings keep real DOM text (never `aria-label` on generic `span/p`).
- Decorative canvas = `aria-hidden`; nothing essential only in WebGL.
- **Unlit/dimmed states still meet 4.5:1** (e.g. un-highlighted scrub words at 0.56 opacity).
- Hidden-until-reveal content is still in the DOM; pinned tours keep all items readable (`aria-hidden` only on inactive ones, removed in reduced motion).
- Native elements first: `<details name>`, `<dialog>`, `<button aria-pressed>`.
- Visible focus (`:focus-visible` aqua outline), keyboard alternatives for scroll-driven widgets (carousel prev/next).
- Forms: visible labels, `autocomplete`, `aria-invalid` + `aria-describedby`, `role="alert"` errors.
- Test in CI: `@axe-core/playwright` with tags `wcag2a, wcag2aa, wcag21a, wcag21aa`; **wait ~3 s after scrolling** so entrance transitions don't register as low-opacity text.

---

## 11. Re-skin for a new brand: step by step

**Phase A — theme (≈ 1 hour, no 3D).**
1. `create-next-app`, install deps ([§0](#0-stack--install)).
2. Copy `src/app/globals.css`; edit the tokens ([§2](#rebrand-in-5-minutes)). Pick fonts (display + body + mono) in `layout.tsx`.
3. Copy `components/motion/*` (SplitText, Reveal, Odometer, DrawOnReveal, TiltCard, PageEffects, ScrubWords), `lib/{reveal,scrollState,lenis,gsap}.ts`, `components/layout/SmoothScroll.tsx`, `components/ui/Button.tsx`, `components/shared/SectionHeading.tsx`. Mount `<SmoothScroll />` + `<PageEffects />` in the layout, add the pre-paint script.
4. Write your copy in `src/content/*.ts` (typed, no copy inside components).
5. Build sections from `SectionHeading` + cards + `Reveal` stagger. You now have the full look and all reveal/hover motion.

**Phase B — story scenes (≈ half a day).**
6. Add `features/story/{sceneState,chapters,StoryDriver}`; mark sections with `data-chapter`; decide which are `sticky` (`h-[Nvh]` wrapper + `sticky top-0 h-svh` stage).
7. Build the signature scenes you want: scrubbed statement (`ScrubWords`), pinned tour, 3D carousel, timeline, odometers.
8. Add the right-edge `ChapterRail`, floating button, nav behaviour.

**Phase C — 3D hero (optional, ≈ 1–2 days).**
9. Copy `features/globe/*` and `features/story/*`. Replace the **hero object**: the globe is just "points + lines + a ring". Swap the geometry builders (`geometry/*`) for your logo/shape (a product, a skyline, a molecule, a map…) while keeping the shared uniform / materials / frame-loop architecture.
10. Re-key `chapters.ts` to your story (what should the object *do* in each chapter?). Keep `integrity`, `dim`, `focus`, `pulse` — they are generic "state dials".
11. Run the continuity unit test, then tune on a phone.

**Phase D — hardening.** Unit tests for pure logic, Playwright e2e + axe, reduced-motion + no-JS + no-WebGL checks, Lighthouse medians, real-device test.

**Adapting the story.** The OmniSolve narrative was *scattered → connected → solved*. Pick one metaphor for **your** brand (e.g. "raw data → insight", "fragments → whole product", "cities → network") and let the hero object perform it across 4–6 chapters. One idea, told with motion.

---

## 12. File map — what to copy

**Always (design system + motion kit)**

| Path | Purpose |
| --- | --- |
| `src/app/globals.css` | tokens, utilities, **all CSS animations** (reveals, split text, odometer, draw, bars, carousel, accordion, beam, spotlight) |
| `src/app/layout.tsx` | fonts, metadata, **pre-paint script**, mounts SmoothScroll/PageEffects |
| `src/utils/{cn,math,random}.ts` | class merge; `clamp/lerp/smoothstep/damp/steppedIndex`; seeded PRNG |
| `src/lib/{gsap,lenis,reveal,scrollState}.ts` | GSAP setup; Lenis handle + `scrollToHash`; shared IntersectionObserver; scroll cache |
| `src/components/motion/{SplitText,Reveal,Odometer,DrawOnReveal,TiltCard,ScrubWords,PageEffects}.tsx` | the motion kit |
| `src/components/layout/{SmoothScroll,Navbar,ChapterRail,FloatingContact,Footer}.tsx` | page chrome |
| `src/components/ui/Button.tsx`, `components/shared/{SectionHeading,CoverArt}.tsx` | core UI |
| `src/types/polymorphic.ts` | `MotionTag` type for the `as` prop |

**Scroll stories**

| Path | Purpose |
| --- | --- |
| `src/features/story/{sceneState,chapters,StoryDriver}.ts(x)` | shared state, chapter keyframes, scroll→progress driver |
| `src/features/story/{GapSection,GapFragments}.tsx` | example scrubbed statement scene |
| `src/features/industries/*`, `src/features/services/ServiceCarousel.tsx` | pinned tour, CSS-3D carousel |
| `src/features/team/ProcessTimeline.tsx` | CSS-var scroll timeline |
| `src/store/storyStore.ts` | low-frequency UI state (active chapter, tier, reduced motion, form draft) |

**3D (optional)**

| Path | Purpose |
| --- | --- |
| `src/features/globe/{StoryScene,StoryCanvas,CanvasBoundary,StaticGlobe,detectTier,materials,frame,constants,tagAnchors}.ts(x)` | canvas lifecycle, tiers, fallbacks, frame loop |
| `src/features/globe/components/*` | GlobeScene + layers (network, planet, ring, dust) |
| `src/features/globe/geometry/*`, `data/landMask.ts`, `scripts/build-land-mask.mjs` | procedural geometry + land mask generator |
| `src/features/globe/shaders/*` | GLSL |

**Quality**

| Path | Purpose |
| --- | --- |
| `src/**/*.test.ts` | unit tests (math, schema, chapters continuity, geometry) |
| `e2e/*.spec.ts`, `playwright.config.ts` | story flow, form, API, **axe**, reduced-motion, no-JS |
| `scripts/capture*.mjs` | headless screenshots for review / pitch stills |

---

## 13. Gotchas & lessons learned

| Symptom | Cause | Fix |
| --- | --- | --- |
| 3D layers invisible; uniforms stuck at initial values | R3F copies `uniforms` props | build `ShaderMaterial` yourself, pass `material={…}` ([§8.4](#84-materials--a-critical-gotcha)) |
| Glass cards don't blur in Chrome/Edge | wrote `-webkit-backdrop-filter` after `backdrop-filter` → tooling dropped the unprefixed one | only write `backdrop-filter` |
| Mirrored text of back cards shows through the 3D carousel | `backface-visibility` unreliable with `backdrop-filter` | fade back-facing cards to opacity 0 in JS (and near-opaque backgrounds) |
| Globe jumps between chapters | keyframes inconsistent | `from = previous.to` resolution + continuity unit test |
| Tour stops land ~30° off | idle spin accumulated | unwind `idleAngle` when `spin ≈ 0`; wrap to ±π |
| Big per-frame CPU even when idle | `window.scrollY` read each frame forced layout; tickers rewrote styles | scroll cache + "unchanged → return" in every ticker |
| Slower start after a "cleanup" | built the full high-tier scene before learning the GPU was software | create canvas empty → inspect renderer → mount scene |
| axe: `aria-prohibited-attr` | `aria-label` on `span`/`p` | `role="img"` for odometers; real text for sentences; label only headings |
| axe: contrast on dimmed text | unlit state at 14% opacity | keep ≥ 0.56 opacity for text that is "unlit" |
| `tsc` fails on a fresh clone (`LayoutProps` missing) | Next generates it into git-ignored `.next/` | `"typecheck": "next typegen && tsc --noEmit"` |
| Build error: "unstable value `new Date()`" | Cache Components forbids clock reads during prerender | read it inside a `"use cache"` function |
| `.env.example` not committed | scaffold's `.env*` ignore rule | add `!.env.example` |
| Stale dev server serves broken chunks | old `next start` still on the port after a rebuild | kill the port before restarting |
| Lighthouse mobile LCP "3.7 s" vs 0.6 s observed | simulated throttling model | judge with real throttled runs + CPU profiles; test real devices |

---

## 14. A prompt to give Claude for the new site

Paste this together with this file (and your brand assets + copy):

> I want a new website built in the **same design system and animation style** as the attached guide
> (*UI Design System & Animation Playbook*). Follow it exactly: Next.js 16 + Tailwind v4 tokens in `globals.css`,
> glass surfaces, eyebrow pills, two-line headings with a gradient accent, Sora/Inter/Geist Mono, the pre-paint
> `js`/`rm` classes, **server-split text**, `Reveal` + a single `PageEffects` controller, Lenis smooth scroll, sticky
> "chapters" driven by a `StoryDriver`, and full reduced-motion / no-JS fallbacks.
>
> **Brand:** <name, what the company does, audience>. **Palette:** derive from my logo (attached) — lift any dark brand
> colour so it reads on a dark page; pick one accent. **Story metaphor:** <e.g. "fragments → one platform">.
> **Hero object:** <3D object/idea, or "no 3D">.
> **Pages/sections:** <list>. **Copy:** <attached / placeholders marked `// CONFIRM`>.
>
> Process: first give me a plan and wait for approval. Then build in phases (theme → scenes → 3D → hardening), run
> typecheck/lint/unit/e2e/axe after each, and report real Lighthouse numbers honestly. Do not invent facts, numbers,
> testimonials or contact details — use clearly marked placeholders.

---

*Source of truth: this repository. Related docs: `architecture.md` (how the pieces connect), `decisions.md` (why),
`performance.md` (measured numbers), `content-guide.md` (placeholder checklist).*
