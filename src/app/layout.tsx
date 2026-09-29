import type { Metadata } from "next";
import { Familjen_Grotesk, JetBrains_Mono, Unbounded } from "next/font/google";

import { PipelineScene } from "@/components/scene/PipelineScene";
import { SITE } from "@/lib/plans";

import "./globals.css";

const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"] });
const familjen = Familjen_Grotesk({ variable: "--font-familjen", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: `${SITE.name}: four AI QA agents, by the hour`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  openGraph: { title: `${SITE.name}: four AI QA agents, by the hour`, description: SITE.description, type: "website" },
  twitter: { card: "summary", title: SITE.name, description: SITE.description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${unbounded.variable} ${familjen.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-clip font-sans">
        <PipelineScene />
        {children}
      </body>
    </html>
  );
}
