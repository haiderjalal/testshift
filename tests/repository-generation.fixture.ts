import type { SourceSnapshot } from "../src/lib/github/source";
import type { GeneratedSuite } from "../src/lib/github/generated-suite";

export const snapshot: SourceSnapshot = {
  repository: "owner/project", branch: "main", sha: "a".repeat(40), treeSha: "b".repeat(40), stack: "vite", manager: "npm",
  files: [{ path: "src/cart.ts", content: `export function subtotal(prices: number[]) { if (prices.some(p => p < 0)) throw new Error('Negative price'); return prices.reduce((a,b) => a+b,0); }
export function checkout(prices: number[], discount: number) { if (discount < 0 || discount > 1) throw new Error('Invalid discount'); return subtotal(prices) * (1-discount); }` }],
  inventory: { totalFiles: 4, eligibleFiles: 3, analyzedFiles: 1, omittedFiles: 3, paths: ["src/cart.ts"], exclusions: "Synthetic fixture" },
};
export const proposal: GeneratedSuite = {
  summary: "Verify basket arithmetic and validation, checkout collaboration, and the observable browser checkout result.", gaps: ["Synthetic pilot only; no real payment or login coverage."],
  cases: [
    { name: "Subtotal rejects negative prices", category: "unit", source: "src/cart.ts", verifies: "Empty baskets return zero and negative prices are rejected." },
    { name: "Checkout combines subtotal and discount", category: "integration", source: "src/cart.ts", verifies: "Discount is applied to multiple basket items and invalid discounts are rejected." },
    { name: "Browser checkout displays discounted total", category: "e2e", source: "src/cart.ts", verifies: "Clicking checkout displays the expected discounted basket total." },
  ],
  files: [
    { path: ".testshift/generated/unit/cart.test.ts", content: `import { test, expect } from 'vitest'; import { subtotal } from '../../../src/cart';
test('empty basket and sum', () => { expect(subtotal([])).toBe(0); expect(subtotal([20,30])).toBe(50); });
test('reject negative price', () => { expect(() => subtotal([-1])).toThrow('Negative price'); });` },
    { path: ".testshift/generated/integration/checkout.test.ts", content: `import { test, expect } from 'vitest'; import { checkout } from '../../../src/cart';
test('subtotal and discount collaborate', () => { expect(checkout([20,30], 0.2)).toBe(40); expect(checkout([20],1)).toBe(0); });
test('invalid discount rejected', () => { expect(() => checkout([20],1.1)).toThrow('Invalid discount'); });` },
    { path: ".testshift/generated/e2e/checkout.spec.ts", content: `import { test, expect } from '@playwright/test';
test('checkout displays discounted basket', async ({ page }) => { await page.goto('/'); await page.getByRole('button', {name: 'Checkout'}).click(); await expect(page.getByRole('status')).toHaveText('Total: 40'); });` },
  ],
};
