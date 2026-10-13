import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Familjen_Grotesk, JetBrains_Mono } from "next/font/google";

import { NavVisibility } from "@/components/motion/NavVisibility";
import { PageEffects } from "@/components/motion/PageEffects";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { PipelineScene } from "@/components/scene/PipelineScene";
import { StoryDriver } from "@/components/scene/StoryDriver";
import { SITE } from "@/lib/plans";

import "./globals.css";

// Brand type: Familjen Grotesk for headings and body, JetBrains Mono for labels and code.
const familjen = Familjen_Grotesk({ variable: "--font-familjen", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

/**
 * Runs before first paint and sets the two classes the motion CSS keys on: `js` (hiding things until they reveal is
 * now safe) and `rm` (the visitor asked for reduced motion, so nothing is hidden or animated). Without it, content
 * would flash visible and then hide. See docs/MOTION.md.
 */
const PRE_PAINT_SCRIPT =
  "(function(){var d=document.documentElement;d.classList.add('js');try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('rm');}catch(e){}})();";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: `${SITE.name}: four AI QA agents, by the hour`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  openGraph: { title: `${SITE.name}: four AI QA agents, by the hour`, description: SITE.description, type: "website" },
  twitter: { card: "summary_large_image", title: SITE.name, description: SITE.description },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection(); // Nonces must be generated and rendered for each request.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // The pre-paint script edits the class list before React hydrates, hence suppressHydrationWarning.
    <html
      lang="en"
      className={`${familjen.variable} ${jetbrains.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col overflow-x-clip font-sans">
        {/* Controllers that render nothing. Order matters: they join GSAP's ticker in this order each frame. */}
        <SmoothScroll />
        <PageEffects />
        <NavVisibility />
        <StoryDriver />
        <PipelineScene />
        {children}
      </body>
    </html>
  );
}
