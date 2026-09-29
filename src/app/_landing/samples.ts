import type { AgentId } from "@/lib/agents";

export interface SampleLine {
  status: "pass" | "fail";
  text: string;
  severity?: "minor" | "major" | "critical";
}

/** Illustrative results for a made-up store, used by the landing page's ticker, consoles and HUD. */
export const SAMPLE_SITE = "shop.example.com";

export const SAMPLES: Record<AgentId, SampleLine[]> = {
  dev: [
    { status: "pass", text: "Email field rejects “test@”" },
    { status: "pass", text: "Password field shows a strength hint" },
    { status: "fail", text: "Quantity field accepts −3", severity: "minor" },
    { status: "pass", text: "Newsletter toggle keeps its state" },
    { status: "pass", text: "Every footer link has a destination" },
  ],
  staging: [
    { status: "pass", text: "Search results match “linen shirt”" },
    { status: "pass", text: "Filters update the product count" },
    { status: "fail", text: "Cart total ignores the discount code", severity: "major" },
    { status: "pass", text: "Wishlist survives a page reload" },
  ],
  uat: [
    { status: "pass", text: "New visitor finds and buys a shirt" },
    { status: "fail", text: "Checkout button does nothing on mobile", severity: "major" },
    { status: "pass", text: "Returning customer reorders in 3 steps" },
    { status: "pass", text: "Guest checkout reaches confirmation" },
  ],
  prod: [
    { status: "pass", text: "/ loads in 0.8s" },
    { status: "pass", text: "/pricing loads in 1.1s" },
    { status: "fail", text: "/blog returns HTTP 500", severity: "critical" },
    { status: "pass", text: "Sign-up button opens the form" },
  ],
};
