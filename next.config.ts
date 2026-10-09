import type { NextConfig } from "next";

// Baseline security headers for every page. A product that audits other sites' headers should pass its own audit.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: { serverActions: { bodySizeLimit: "32kb" }, proxyClientMaxBodySize: "32kb" },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Shift links are private: never leak them to other sites through the Referer header.
      { source: "/runs/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/repositories/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/api/github/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
