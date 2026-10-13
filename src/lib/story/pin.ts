/**
 * When a `data-pin="lg"` scene is pinned: large, tall screens, for visitors who have not asked for less motion.
 * Keep this in step with the `[data-pin="lg"]` media query in globals.css, which is what actually pins the stage.
 */
export const PIN_LARGE_QUERY = "(prefers-reduced-motion: no-preference) and (min-width: 64rem) and (min-height: 45rem)";
