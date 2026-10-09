/** Customer requirements for AI test generation. Pure: the model call lives in worker/ai.ts. */

export const MAX_REQUIREMENTS_CHARS = 8_000;
export const MAX_GENERATED_TESTS = 12;

/**
 * Plain text only: control characters are removed, line endings normalised, and anything that could close the
 * prompt's delimiter tag is stripped. Returns null when nothing usable is left.
 */
export function cleanRequirements(raw: string): string | null {
  const text = raw
    .replace(/\r\n?/g, "\n")
    // Keep line breaks and tabs; drop every other control character, including NUL and escape codes.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<\/?requirements\b[^>]*>/gi, "")
    .trim();
  if (!text) return null;
  return text.slice(0, MAX_REQUIREMENTS_CHARS);
}
