import { test, expect } from "@playwright/test";

test("Wise beta order locks its quote, confirms payment separately, and requires admin start", async ({ page, context, playwright }, info) => {
  await page.goto("/hire?plan=junior&hours=2&url=https%3A%2F%2F8.8.8.8%2F");
  await page.getByLabel("Email for the report").fill(`beta-${info.project.name}@example.com`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Request 2-hour shift · $20.00" }).click();
  await expect(page).toHaveURL(/\/runs\/[\da-f-]+$/);
  const orderUrl = page.url(); const id = orderUrl.split("/").at(-1)!;
  await expect(page.getByRole("heading", { name: "Awaiting Wise payment" })).toBeVisible();
  await expect(page.getByText("@haiderj23", { exact: true })).toBeVisible();
  const contact = page.getByRole("link", { name: "haiderjalaldressify@gmail.com" });
  expect(await contact.getAttribute("href")).toContain(`mailto:haiderjalaldressify@gmail.com?subject=TestShift%20beta%20order%20${id}`);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await page.goto(`${orderUrl}?session_id=cs_fake`);
  await expect(page.getByRole("heading", { name: "Awaiting Wise payment" })).toBeVisible();

  const customer = await context.newPage();
  await customer.goto(orderUrl);
  await page.goto("/admin/login");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password-12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const pricing = page.getByRole("article", { name: "Junior QA beta pricing", exact: true });
  await pricing.getByLabel("Estimated token cost per hour (USD)").fill("1.50");
  await pricing.getByRole("button", { name: "Publish Junior QA rate" }).click();
  await expect(pricing.getByText("Published: $15.00/hour", { exact: true })).toBeVisible();
  await customer.reload();
  await expect(customer.getByText("$20.00 USD total · $10.00/hour · 2 hours", { exact: true })).toBeVisible();
  // Restore the fixture's published rate; the order remains unchanged either way.
  await pricing.getByLabel("Estimated token cost per hour (USD)").fill("1.00");
  await pricing.getByRole("button", { name: "Publish Junior QA rate" }).click();
  await expect(pricing.getByText("Published: $10.00/hour", { exact: true })).toBeVisible();

  const order = page.getByRole("article", { name: `Order ${id}`, exact: true });
  await order.getByLabel("Received amount (USD)").fill("10.00");
  await order.getByLabel("Wise transaction reference").fill(`WISE-beta-${info.project.name}`);
  await order.getByRole("checkbox").check();
  await order.getByRole("button", { name: "Confirm Wise payment" }).click();
  await expect(order.getByRole("alert")).toContainText("must match");
  await order.getByLabel("Received amount (USD)").fill("20.00");
  await order.getByRole("button", { name: "Confirm Wise payment" }).click();
  await expect(order.getByText(/Payment confirmed — not started/)).toBeVisible();
  await customer.reload();
  await expect(customer.getByRole("heading", { name: "Payment confirmed — waiting for manual start" })).toBeVisible();
  await expect(customer.getByRole("progressbar")).toHaveCount(0);

  // Replay the exact start action with no session cookie: knowing an action/order ID is not authorization.
  const anonymous = await playwright.request.newContext();
  await page.route("**/admin", async (route) => {
    const headers = Object.fromEntries(Object.entries(await route.request().allHeaders()).filter(([key]) => key.toLowerCase() !== "cookie"));
    await route.fulfill({ response: await anonymous.fetch(route.request(), { headers: { ...headers, cookie: "" }, maxRedirects: 0 }) });
  });
  try {
    await order.getByRole("button", { name: "Start shift", exact: true }).click();
    await expect(order.getByRole("alert")).toContainText("Sign in as the administrator");
    await customer.reload();
    await expect(customer.getByRole("heading", { name: "Payment confirmed — waiting for manual start" })).toBeVisible();
  } finally { await page.unroute("**/admin"); await anonymous.dispose(); }
  await order.getByRole("button", { name: "Start shift", exact: true }).click();
  await expect(order).toHaveCount(0);
  await customer.reload();
  await expect(customer.getByText("Your agents are clocking in…")).toBeVisible();
  await expect(customer.getByRole("progressbar")).toHaveCount(0); // test harness never starts a worker
  await customer.close();
});

test("an unpublished plan accepts a quote request without inventing a price", async ({ page }, info) => {
  await page.goto("/hire?plan=lead&hours=1&url=https%3A%2F%2F8.8.8.8%2F");
  await page.getByLabel("Email for the report").fill(`quote-beta-${info.project.name}@example.com`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Request 1-hour shift quote" }).click();
  await expect(page.getByRole("heading", { name: "Your order is waiting for a quote" })).toBeVisible();
  const url = page.url(); const id = url.split("/").at(-1)!;
  await page.goto("/admin/login");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password-12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const order = page.getByRole("article", { name: `Order ${id}`, exact: true });
  await expect(order.getByRole("button", { name: "Start shift", exact: true })).toHaveCount(0);
  await order.getByLabel("Estimated token cost per hour (USD)").fill("3.00");
  await order.getByRole("button", { name: "Save fixed quote" }).click();
  await expect(order.getByText("Fixed quote: $30.00 ($30.00/hour)", { exact: true })).toBeVisible();
  await page.goto(url);
  await expect(page.getByText("$30.00 USD total · $30.00/hour · 1 hour", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Awaiting Wise payment" })).toBeVisible();
});
