# Beta billing: Wise, fixed hourly quotes and manual starts

## Customer flow

1. Choose a plan and 1, 2, 3, 4, 6 or 8 hours. This is prepaid, pay-as-needed time—not a subscription or postpaid token meter.
2. Submit the order. A published hourly price is saved permanently on that order. If the plan has no published estimate, the order waits for an individual quote. No testing time starts yet.
3. Email **haiderjalaldressify@gmail.com** using the order page's prefilled link. It includes the order ID, website, plan, hours and quoted total, if available.
4. The owner confirms scope and sends a Wise payment link manually. Wise tag: **@haiderj23**. Customers should email first rather than sending an unreferenced transfer.
5. Customer pays and replies with the transaction reference. This does not automatically confirm anything in TestShift.
6. Owner verifies the payment in Wise, records it in `/admin`, completes onboarding and separately clicks **Start shift**. The order enters the queue; the timer begins when a worker claims it. Queue waiting time is not purchased testing time.

The 20-minute free trial remains automatic and free, subject to existing abuse limits. Paid orders never bypass manual approval, even in development. No Wise API, bank access or automatic payment-link generation was added; only the owner can verify that money arrived.

## Set the 10× rate

Open `/admin` → **Beta hourly pricing · 10× token cost**. Enter estimated AI token cost per hour, in USD, separately for each plan. Publishing computes the customer hourly rate using integer cents:

`customer hourly cents = estimated token hourly cents × 10`

Example only: $1.00 estimated AI cost/hour → $10.00/hour → a two-hour quote of $20.00. Cost inputs have two decimal places and must be $0.01–$1,000/hour. This is an example, not a measured $1/hour benchmark.

Rates are deliberately not seeded from the small synthetic-agent evaluation. Its roughly $0.055 cost cannot establish a full hourly workload. Unpublished tiers show **By quote** and allow a paused quote request; the admin can set that order's estimate and save its fixed quote. Publishing a tier later does not change existing orders, including unquoted requests.

The admin displays sample-based suggestions only from completed, non-trial runs booked for at least an hour with at least 50 minutes of observed testing time. It divides logged cost by observed duration, not purchased time, and excludes short development/trial runs. These remain estimates using configured model prices, not reconciled provider invoices. Review several representative sites before publishing a rate; budgets and sparse coverage can bias cost downward.

The **10× hourly quote calculator** is a what-if tool. It does not publish rates. Its 90% token-only margin excludes hosting, Wise fees, refunds, support and differences between estimated and actual model usage.

## Admin operations

- **Save fixed quote:** only for an unquoted pending Wise order. Once saved, a quote cannot be repriced through the application.
- **Confirm Wise payment:** requires the exact quoted USD amount, a 3–120 character Wise transaction reference and explicit confirmation that you checked Wise. A reference cannot be reused across orders (case-insensitive). Partial payments or fee differences must be resolved manually first.
- **Start shift:** only after payment confirmation. It queues the already-purchased duration, without changing the quote or adding time.
- Duplicate confirmations and start retries do not double-credit time or restart finished work. Database transactions lock each order; constraints prevent unpaid Wise orders from becoming runnable.
- Confirmed-payment totals use stored receipt amounts and confirmation timestamps. Unpaid orders and historical runs without receipt amounts no longer count as inferred revenue. This is an operational receipts view, not a full accounting/refund ledger.

Public order pages do not expose the Wise transaction reference. Admin actions re-check the signed admin session on every mutation. Merely knowing the private order link or Server Action identifier cannot confirm payment or start a shift.

Cancellation, refunds, payment adjustments, currency conversion, receipt uploads and balance top-ups are not automated in this beta. Do not overwrite a paid quote to resolve a payment disagreement; reconcile it with the customer outside the app.

## AI budget

The paid worker's default estimated spend allowance is 10% of the order's stored quote (`QA_AI_REVENUE_FRACTION=0.1`), matching its estimated token-cost allowance. Global future price changes do not alter an existing run's budget. Trials retain their separate $2 default allowance.

This is a cost guard, not a guarantee of actual invoiced cost or complete coverage for the booked duration. Provider errors and durable reservation limitations from the QA audit still apply. If the allowance is exhausted, results must show untested gaps rather than fabricate coverage. Decide credit/refund treatment with each beta customer.

## Configuration and rollout

1. Back up and apply all pending migrations through `20261007000000_manual_beta_orders.sql` on staging, then the intended database. The migration does not rewrite old run prices, claim historical payments or activate old pending orders.
2. Deploy matching web and worker revisions. Home/booking pricing is request-time data; the build does not need to query the new pricing table.
3. Keep `STRIPE_ENABLED=0`. Existing Stripe code is retained for future work; even if explicitly enabled later, it cannot confirm a Wise order. The beta booking path always creates Wise orders, and order-page GET requests never confirm payment.
4. Set `QA_AI_REVENUE_FRACTION=0.1` if an older environment explicitly sets 0.25. Configure normal database, admin and model credentials. Stripe credentials are unnecessary.
5. Confirm access to the onboarding Gmail inbox. Direct customer email links do not use Resend. Resend remains optional for automated outgoing report emails; using a Gmail address to log into Resend does not verify a sending domain or test inbox access.
6. Publish reviewed per-plan estimates, or onboard initial orders by individual quote. Send a manual payment link, verify the transfer, confirm payment, then start one staging shift.

Contact constants are in `src/lib/beta-pricing.ts`. No real payment, customer email, production migration or deployment was performed during implementation.

## Verification

Database regressions cover cent arithmetic, tampered/stale price submissions, immutable order quotes, exact-amount confirmation, receipt reuse, unpaid starts, idempotent starts, migration reapplication, Stripe isolation and receipt-based revenue. Desktop/mobile browser tests cover the complete customer/order/admin flow, including a start action replayed without an admin cookie. All use disposable database fixtures and no real transfers.
