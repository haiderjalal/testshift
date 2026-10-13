import { Fragment, type CSSProperties } from "react";

interface SplitLine {
  text: string;
  /** Brand-gradient shimmer. Accent lines always split by word, so each word keeps its whole gradient. */
  accent?: boolean;
  /** A solid colour for the line, for a heading that needs a semantic hue instead of the gradient. */
  color?: string;
}

interface SplitTextProps {
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  lines: readonly SplitLine[];
  className?: string;
  id?: string;
  /** Rise word by word (default) or letter by letter. */
  unit?: "words" | "chars";
  /** "view" reveals when it scrolls into view. "load" animates on first paint with pure CSS, for the hero headline. */
  trigger?: "view" | "load";
  /** Milliseconds before the first unit starts. */
  delay?: number;
  /** Added to every unit's stagger index, so a second SplitText next to the first continues its rhythm. */
  offset?: number;
}

/**
 * Text whose words or letters rise out of a mask. It renders on the server: the text is in the first HTML, so
 * it is the same for search engines, for no-JS visitors and for the largest-contentful-paint measurement.
 * The CSS is in globals.css (`.split-*`). Screen readers get the plain text once; the pieces are hidden from them.
 */
export function SplitText({
  as: Tag = "span",
  lines,
  className,
  id,
  unit = "words",
  trigger = "view",
  delay = 0,
  offset = 0,
}: SplitTextProps) {
  const label = lines.map((line) => line.text).join(" ");
  let index = offset;

  return (
    <Tag id={id} className={className} data-split={trigger} style={{ "--d": `${delay}ms` } as CSSProperties}>
      <span className="sr-only">{label}</span>
      <span aria-hidden>
        {lines.map((line, lineIndex) => {
          const byChar = unit === "chars" && !line.accent;
          const unitClass = line.accent ? "split-unit text-gradient shimmer" : "split-unit";
          const words = line.text.split(" ");
          return (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {words.map((word, wordIndex) => (
                <Fragment key={wordIndex}>
                  {byChar ? (
                    <span className="split-word">
                      {Array.from(word).map((character, characterIndex) => (
                        <span key={characterIndex} className="split-mask">
                          <span className={unitClass} style={{ "--i": index++, color: line.color } as CSSProperties}>
                            {character}
                          </span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="split-word split-mask">
                      <span className={unitClass} style={{ "--i": index++, color: line.color } as CSSProperties}>
                        {word}
                      </span>
                    </span>
                  )}
                  {wordIndex < words.length - 1 && " "}
                </Fragment>
              ))}
            </Fragment>
          );
        })}
      </span>
    </Tag>
  );
}
