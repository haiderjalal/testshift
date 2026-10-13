import Image from "next/image";
import Link from "next/link";

import { SITE } from "@/lib/plans";

interface LogoProps {
  href?: string;
  /** Preload the image. Only the header logo, which is above the fold on every page, should set this. */
  priority?: boolean;
}

/**
 * The TestShift lockup: the S mark and the wordmark, supplied artwork cropped to its bounds.
 * This is the off-white wordmark for dark surfaces; `testshift-logo-dark.png` is the one for light surfaces.
 */
export function Logo({ href = "/", priority = false }: LogoProps) {
  return (
    <Link href={href} aria-label={`${SITE.name} home`} className="logo group flex items-center">
      <Image
        src="/brand/testshift-logo-light.png"
        alt=""
        width={138}
        height={28}
        priority={priority}
        className="h-7 w-auto shrink-0"
      />
    </Link>
  );
}
