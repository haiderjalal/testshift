const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * A number whose digits roll like an odometer: on first reveal, and whenever `value` changes. Each digit is a strip
 * from 0 to 9 that slides to its value (see `.odo` in globals.css). The final value is in the markup, so it reads
 * correctly with no JavaScript, and screen readers get the number as plain text.
 */
export function Odometer({ value, className }: { value: number; className?: string }) {
  return (
    <span data-odo="" className={className}>
      <span className="sr-only">{value}</span>
      <span aria-hidden>
        {String(value)
          .split("")
          .map((character, position) =>
            /\d/.test(character) ? (
              <span key={position} className="odo">
                <span className="odo-col" style={{ ["--digit" as string]: Number(character), ["--i" as string]: position }}>
                  {DIGITS.map((digit) => (
                    <span key={digit}>{digit}</span>
                  ))}
                </span>
              </span>
            ) : (
              <span key={position}>{character}</span>
            ),
          )}
      </span>
    </span>
  );
}
