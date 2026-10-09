# Firewall rules for owner review — NOT published

Prepared 2026-10-09. This is a local proposal, not a live Vercel draft or active configuration.
The connected Vercel account returned no project matching this repository or its TestShift product name.
No existing production WAF configuration could be identified or inspected. Do not apply these rules to an unrelated project.

| Rule | Conditions (all must match) | Counting key | Proposed limit | Action |
| --- | --- | --- | --- | --- |
| Owner login | Method POST; exact path `/admin/login` | Platform client IP | 30 per 15 minutes | Rate limit, 429 |
| Public forms | Method POST; path is exactly `/hire` or `/custom` | Platform client IP and path | 60 per minute | Rate limit, 429 |
| Owner changes | Method POST; exact path `/admin` | Platform client IP | 60 per minute | Rate limit, 429 |
| Stripe delivery | Method POST; exact path `/api/stripe/webhook` | Platform client IP | 120 per minute | Rate limit, 429 |

Review Stripe throughput/retry expectations before enabling its rule. Do not challenge signed webhook deliveries, and do not use caller-supplied IP headers as the counting key. Static assets and report refreshes are outside these proposed rules. If the hosting plan cannot support all four rules, prioritize public form abuse and retain the existing durable application limiter for login and owner operations.

Owner steps:

1. Identify the actual production project/team and inspect its active firewall rules, managed protections, existing bypass rules, plan limits, and request traffic.
2. Create unpublished rules with the conditions above. Inspect the provider's draft diff, ordering, exceptions, counting windows, and actual traffic impact. Platform rounding/window options may require adapting the proposal.
3. Show the exact staged configuration for review. Publishing requires explicit owner authorization; this audit has not provided it.
4. After authorized publication, check for false positives and confirm rate-limited responses. Keep a rollback draft ready.

The web app already uses atomic Postgres counters, including HTTP 429 and conservative Retry-After headers. These counters work across serverless instances when all instances connect to the same database. They are not an in-memory substitute for a WAF: rejected traffic can still consume app/database resources. Persistent rows are pruned after two days probabilistically; owner monitoring should check cleanup and table growth.

Provider guidance: [Vercel firewall](https://vercel.com/docs/vercel-firewall), [rate limiting](https://vercel.com/kb/guide/add-rate-limiting-vercel). Draft creation does not imply publication or verified production protection.
