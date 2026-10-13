# Motion system

How the landing page tells its story with scroll, and how to extend it. The look and the vocabulary come from
[`UI_DESIGN_SYSTEM_AND_ANIMATION_GUIDE.md`](UI_DESIGN_SYSTEM_AND_ANIMATION_GUIDE.md); this page records what was built in
this repository, where it differs from the guide, and why.

## The idea

The page is a sequence of **chapters**. One scene, the 3D pipeline behind the page, performs them: the camera follows
the story, the agents light up in turn, text-heavy chapters dim the scene. Scroll is the only input.

```
scroll ─► Lenis (smooth) ─► scroll cache ─► StoryDriver ─► target pose ─► 3D scene (eases toward it)
                                              │
                                              ├─► chapterProgress{}  ─► ScrubScene (words, trace)
                                              └─► storyStore (active chapter, tour stop) ─► NavLink, ChapterRail, FloatingCta, AgentExplorer
```

Everything runs on **one clock**, GSAP's ticker, in this order each frame: Lenis, the controllers, the story, the scene.
CSS does the animating wherever it can; JavaScript only flips switches (`data-in`, `--scene-dim`, one number per scene).

## Files

| Path | Role |
| --- | --- |
| `src/app/layout.tsx` | Pre-paint script (carries the CSP nonce), mounts the controllers. |
| `src/components/motion/SmoothScroll.tsx` | Lenis on the GSAP ticker. Routes same-page links through it like a native link (keeps the query string, one history entry per new place, focus moves to the target). Scrollable boxes keep their own wheel (`allowNestedScroll`); a link to another page stops any scroll still easing (`stopInertiaOnNavigate`). Not started under reduced motion. |
| `src/components/motion/PageEffects.tsx` | One controller: observes reveals (re-scanned on every route and whenever markup is added later), makes buttons lean toward the cursor, flashes the scene when a primary button is pressed. The last two are skipped under reduced motion. |
| `src/components/motion/NavVisibility.tsx` | Sets `<html data-nav>` so the header slides away on scroll down and returns on scroll up. |
| `src/components/motion/ScrubScene.tsx` | Scroll-scrubbed markup: `.scrub-word`, `.scrub-draw`, `.scrub-node`. |
| `src/components/motion/Odometer.tsx` | Rolling digits (reveal, and on every change of value). |
| `src/components/SplitText.tsx` | Server-rendered headings whose words or letters rise out of a mask. |
| `src/components/scene/StoryDriver.tsx` | Measures chapters, turns scroll into progress, writes the target pose and the slow store values. |
| `src/components/scene/scene.ts` | The three.js scene. Eases toward the story's pose; no camera logic of its own. |
| `src/lib/story/chapters.ts` | The chapter list and `computeTarget`. Pure. |
| `src/lib/story/poses.ts` | Camera shots (hero, overview, per-agent). Pure. |
| `src/lib/story/sceneState.ts` | Shared plain state: `target`, `live`, `chapterProgress`, `metrics`, `story`. |
| `src/lib/story/tour.ts`, `pin.ts` | Scroll to a tour stop; the media query that decides when a scene is pinned. |
| `src/lib/motion/*` | `math`, `scrollState` (cached scroll), `reveal` (one shared observer), `lenis` (handle). |
| `src/store/storyStore.ts` | Zustand: active chapter and tour stop. Only values that change a few times per page. |
| `src/app/_landing/Statement.tsx` | The pinned, scrubbed sentence built from the four agent taglines. |
| `src/components/ChapterRail.tsx`, `FloatingCta.tsx`, `NavLink.tsx` | Chapter-aware chrome. |

## The convention: `html.js:not(.rm)`

Anything that starts hidden is written under `html.js:not(.rm)`. The pre-paint script in `layout.tsx` sets the classes
before first paint:

| Class | Meaning |
| --- | --- |
| `js` | JavaScript is on, so it is safe to hide something until it reveals. Without JS nothing is ever hidden. |
| `rm` | The visitor asked for reduced motion. Nothing is hidden or animated. |
| `ready` | Hydration finished. If it never arrives, a CSS failsafe shows everything after four seconds. |

The script is inline, so it needs the request's nonce (`x-nonce`, set in `src/proxy.ts`). `<html>` has
`suppressHydrationWarning` because the script edits its class list before React hydrates.

## Chapters

A chapter is a section marked `data-chapter="<id>"`, with a matching entry in `CHAPTERS`. Order in the array is the
story order. Each entry says only where the scene **ends up**; where it **starts** is where the previous chapter ended,
so the camera cannot jump (`tests/story.test.ts` asserts this for every boundary, wide and narrow).

- **Zone and `p`.** A chapter is active from the moment its top passes the middle of the screen. `p` is progress through
  that zone. Zones tile the page.
- **Own progress `q`.** For a pinned scene, progress while the stage is held on screen; for a normal section, progress
  while it crosses the screen. `ScrubScene` and tours read `q` (`chapterProgress[id]`).
- **Easing.** The camera arrives within the first 30% of a zone (`GLIDE_SHARE`); brightness and the lit agent settle
  within the first 20% (`SETTLE_SHARE`). Without that, a long chapter spends half its length with text over a bright scene.
- **`during`.** Optional refinement while inside a chapter: a sideways sway that is zero at both ends, the agent tour,
  the statement's glow.
- **Dials.** The scene is driven by a `Pose`: camera position, look-at, `dim`, and `focus` (a float, so a tour glides
  between agents). Add a dial in `poses.ts`, `sceneState.ts` and the scene's tick.

Pages that are not part of the story still point the scene with `<html data-stage="…">` (`StageSync`, used by the live
shift page); `stagePose` turns the name into a pose. Outside the landing page the scene is capped at `BACKDROP_DIM`.

### Pinned scenes

```html
<section data-chapter="agents">
  <div data-pin="lg" style="--pin-height: 420vh; --pin-top: 5.5rem">   <!-- tall wrapper -->
    <div data-pin-stage>…</div>                                         <!-- sticks while the wrapper scrolls past -->
  </div>
</section>
```

No scroll-jacking: the stage is `position: sticky` and the story reads the wrapper's geometry. `data-pin="lg"` pins
only on large, tall screens (`PIN_LARGE_QUERY`, mirrored in `globals.css`); a plain `data-pin` pins on any screen at
least 38rem tall, so a short landscape phone or a heavily zoomed window gets a normal section instead of a clipped
stage. Pinning needs `html.js` and no reduced-motion request, and the driver asks the CSS whether the stage is
sticky, so layout and logic cannot disagree.

### The agent tour

On large screens `AgentExplorer` is pinned: scroll steps Dev → Prod (`steppedIndex`, a hold on each stop) and the camera
flies to each agent. Picking a tab scrolls to that stop (`scrollToTourStop`). Everywhere else (phones, short windows,
reduced motion) nothing is pinned: it auto-advances while on screen until a visitor picks an agent, and the camera
follows the tab (`setAgentOverride`).

## Fallbacks

| Situation | What the visitor gets |
| --- | --- |
| No JavaScript | All content visible; nothing hidden, nothing pinned. |
| Hydration fails | Everything appears after four seconds (failsafe). |
| `prefers-reduced-motion` | No smooth scroll, no reveals, no pinning, no header sliding, no leaning buttons. The scene draws one frame per pose change and cuts instead of flying. The statement reads in full. |
| No WebGL | The CSS gradient background; same layout and content. three.js logs its own console error. |
| Touch | No leaning buttons. Scrolling is native, never captured. |

## Accessibility notes

- Animated headings keep their real text once (`sr-only`); the pieces are `aria-hidden`.
- Dimmed ("unlit") scrubbed words keep contrast: `0.56` opacity for ink, `0.8` for coloured agent names, because a hue at
  56% falls below 4.5:1. `tests/e2e/motion.spec.ts` runs axe on the statement in its dimmest state.
- The floating call to action is `inert` while hidden. The chapter rail is a real `<nav>` of links.

## Dependencies

| Package | Why | Not used |
| --- | --- | --- |
| `gsap` (core) | The shared ticker; the scene's intro. | `@gsap/react`: plain effects are enough, and the React Compiler prefers them. |
| `lenis` | Momentum scrolling. | |
| `zustand` | The few values React must hear about. | |

Not adopted from the guide: React Three Fiber (the scene stays imperative three.js, which it already was), the CSS-3D
carousel and a process timeline (no content here needs them), delegated card tilt (`SpotlightCard` already does it), and
the rolling button label (`.btn-primary` has 28 call sites with plain text).

## Gotchas

- **`data-chapter` is for sections only.** The active chapter is on `<html data-active-chapter>`. Using the same
  attribute on `<html>` made the driver measure the document as a chapter.
- **Lenis honours `scroll-margin-top`.** Do not add your own anchor offset on top; declare `scroll-mt-*` on the section.
- **Write only the unprefixed `backdrop-filter`.** With a `-webkit-` twin after it the build dropped both.
- **Unlayered CSS beats Tailwind utilities.** A `box-shadow` in `.glass` would override every `shadow-*` class.
- **The e2e server runs the production build** (`next start`). Run `npm run build` before `npm run test:e2e`, or the
  tests exercise old code.
- **`StageSync` must clear `data-stage` when it unmounts,** or the scene stays on that agent's shot on every page after.
- **Float32 does not round-trip most decimals.** Comparing a stored `Float32Array` value with the number it came from
  (2.6, 0.45) is never equal, which made the reduced-motion scene redraw every frame. Use `Float64Array` for change checks.
- **Never force-lose a WebGL context on a canvas that is still on the page.** React Strict Mode re-runs effects on the
  same canvas, and a lost context cannot be reused. The scene only releases it when the canvas has left the document.
- **Animation frames pause in a hidden browser pane.** To check scroll-driven motion, drive a headless browser with real
  wheel events; teleporting with `scrollTo` fights smooth scrolling.

## Tests

- `tests/story.test.ts`: math, `steppedIndex`, chapter continuity at every boundary, continuity inside every chapter,
  the tour, the agent override, stage poses.
- `tests/e2e/motion.spec.ts`: the system starts, anchors, the pinned tour and tab-to-stop, the header, axe on the landing
  page with motion on, and the reduced-motion layout. Existing specs run with reduced motion and cover the plain page.
