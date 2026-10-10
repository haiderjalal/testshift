import type { ReactElement } from "react";

interface FieldErrorProps {
  id: string;
  message?: string;
}

/** Field-level validation message. Keeps `role="alert"` so screen readers announce a rejected field. */
export function FieldError({ id, message }: FieldErrorProps): ReactElement | null {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-sm text-fail">
      {message}
    </p>
  );
}
