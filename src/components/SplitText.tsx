import { Fragment } from "react";

/**
 * Renders text one span per character so each can animate in (see `.char` in globals.css).
 * Screen readers get the plain text once; the character spans are hidden from them.
 */
export function SplitText({ text, color, offset = 0 }: { text: string; color?: string; offset?: number }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split(" ").map((word, w, words) => {
          const start = offset + words.slice(0, w).join(" ").length + (w > 0 ? 1 : 0);
          return (
            // Words stay unbroken; the space between them sits outside so lines can wrap there.
            <Fragment key={w}>
              <span className="inline-block whitespace-nowrap">
                {word.split("").map((ch, i) => (
                  <span key={i} className="char" style={{ ["--i" as string]: start + i, ["--char-color" as string]: color }}>
                    {ch}
                  </span>
                ))}
              </span>
              {w < words.length - 1 && " "}
            </Fragment>
          );
        })}
      </span>
    </>
  );
}
