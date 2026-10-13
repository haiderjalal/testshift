# TestShift brand

How the TestShift identity is applied in the site. The reference artwork lives in [`docs/brand/`](brand/):

| File | What it is |
| --- | --- |
| `brand-direction.png` | The brand board: logo, palette, type, header example. Source of truth for the look. |
| `logo-source-light-wordmark.png` | Full-size lockup with an off-white wordmark, for dark backgrounds. Transparent. |
| `logo-source-dark-wordmark.png` | Full-size lockup with a near-black wordmark, for light backgrounds. Transparent. |

The UI approach (glass surfaces, eyebrow pills, two-line headings with one gradient accent, motion rules) follows
[`UI_DESIGN_SYSTEM_AND_ANIMATION_GUIDE.md`](UI_DESIGN_SYSTEM_AND_ANIMATION_GUIDE.md).

## Colour

Tokens live in one place: the `@theme` block in `src/app/globals.css`. Use the token, never the hex.

| Token | Value | Use |
| --- | --- | --- |
| `paper` | `#090D18` | Page background. Also the 3D scene's clear colour (`BACKGROUND` in `scene.ts`). |
| `card`, `raised`, `rule` | `#0F1626`, `#172036`, `#212C45` | Surfaces stepped up from `paper`, and hairlines. |
| `ink` | `#E8EDF6` | Headings and key text. |
| `graphite` | `#8E99AE` | Body copy and labels on dark. |
| `brand` | `#45D4FF` | The accent: eyebrows, focus ring, selection, glows, selected states. |
| `brand-deep` | `#2B8FE6` | The deeper blue of the mark's fold. Gradient end. |
| `--gradient-brand` | `#8FE7FF → #45D4FF → #2B8FE6` | Accent words, the primary button, the reading-progress line. About one per screen. |

The four agent hues (`dev`, `staging`, `uat`, `prod`) are product semantics, not brand colour: each agent owns one.
`dev` shares the brand cyan. `marker` yellow is reserved for flagging bugs, `pass` and `fail` for results.

## Type

- **Familjen Grotesk**: headings (`font-display`) and body (`font-sans`).
- **JetBrains Mono**: labels, eyebrows, code (`font-mono`).

Both load through `next/font` in `src/app/layout.tsx`. Unbounded, the previous display face, was removed.

## Logo and icons

| Asset | Path | Use |
| --- | --- | --- |
| Lockup, light wordmark | `public/brand/testshift-logo-light.png` | Anything on a dark surface. This is what `<Logo />` renders. |
| Lockup, dark wordmark | `public/brand/testshift-logo-dark.png` | Light surfaces: documents, email, print. Not used in the app today. |
| S mark | `public/brand/testshift-mark.png` | Small spaces and avatars. |
| App icons | `src/app/favicon.ico`, `icon.png`, `apple-icon.png` | The S mark on `paper`. Picked up by the Next.js file conventions. |
| Social image | `src/app/opengraph-image.png`, `twitter-image.png` | 1200×630 lockup on `paper`. |

The derivatives were cropped from the masters in `docs/brand/` (tight bounds, near-transparent edge pixels cleared).
Always render the logo through `<Logo />` so the alt text, link and hover glow stay consistent. Do not recolour, stretch or
re-set the wordmark in a font.

## Components

| Piece | Where |
| --- | --- |
| Floating glass capsule header, always visible; links collapse into the menu below `lg` | `src/components/SiteHeader.tsx` |
| `.btn-primary` (gradient fill, dark text), `.eyebrow`, `.text-gradient`, `.glass` | `src/app/globals.css` |
| Section headings: line one white, closing clause in the brand gradient (`SplitText`) | `src/app/_landing/*`, `src/app/page.tsx` |
| Oversized faded wordmark closing the landing page | footer in `src/app/page.tsx`, `.footer-wordmark` |

Gotcha: write only the unprefixed `backdrop-filter` in CSS. With a `-webkit-backdrop-filter` twin after it, the build
dropped both and no glass surface blurred.

## Motion

The guide's motion stack is built: Lenis smooth scroll, GSAP's ticker, Zustand for slow UI state, a scroll-driven story
that directs the 3D scene, a pinned agent tour, a scrubbed statement, a chapter rail and a floating call to action.
Architecture, conventions and fallbacks: [`MOTION.md`](MOTION.md).

Not adopted: React Three Fiber (the scene stays imperative three.js), the CSS-3D carousel, a process timeline and the
rolling button label. `MOTION.md` says why.

## Copy from the brand board, not applied

The board shows the tagline "QA on your schedule. Hourly AI testing. Clear bug reports." and the header button
"Start a shift". The site still says "Four AI agents. One QA shift." and "Start free". Switching means updating the
e2e specs that assert that wording (`tests/e2e/product.spec.ts`, `pricing-outage.spec.ts`).
