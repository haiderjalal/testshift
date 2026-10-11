# Test case documents

A visitor gives a website link. TestShift crawls the site, writes test cases a person can run by hand, and returns them as
a PDF and a Word file. The files are kept on a private page, and the link is emailed when they are ready.

Nothing in a document is run against the site. The cases describe what to check and what to expect.

## What the visitor does

1. Opens [/test-cases](../src/app/test-cases/page.tsx), gives the site's link, an email address, optional focus notes, and
   confirms they are allowed to have the site described.
2. Lands on `/test-cases/[id]`, which shows the queue or progress and updates by itself every five seconds.
3. When the document is ready, downloads the PDF or the Word file. The same link is emailed, if email is configured.

## How the cases are produced

Each source is labelled in the document, so a reader knows what kind of evidence stands behind each case.

| Source | How it is made | Typical cases |
|---|---|---|
| **Crawl rule** | Read from each page's own structure, with no model involved | Opens and loads; tab title; one main heading; loads within 3 seconds; phone-sized screen; keyboard use; each link; each button; form fields |
| **Accessibility scan** | An automated axe check against the WCAG 2.2 AA rules, one case per rule per page | "Images must have alternate text on /contact" |
| **AI-drafted scenario** | Claude Sonnet 5.5 at low effort reads the crawled pages in batches of five and drafts end-to-end cases | "Pay with an expired card" |

Form fields get boundary and negative cases from the attributes the page declares: `required`, `type` (email, URL, number),
`min` and `max` (just below, at, and just above each limit), `minlength`, `maxlength` and `pattern`. Disabled and read-only
fields are not tested.

Every case has a reference (TC-001), a page, steps, test data where relevant, an expected result, and what the scan
observed. A scenario drafted by the model is kept only if it names a crawled page, has two to ten steps, and has a result
long enough to check. Otherwise it is dropped.

## Limits and cost

Every limit has a default and an environment variable. Each one is validated at startup, so a bad value stops the worker
rather than quietly removing a limit. The variables are listed, commented, in [.env.example](../.env.example).

| Limit | Default | Variable |
|---|---|---|
| Pages crawled per document | 25 | `DOCUMENT_MAX_PAGES` |
| Cases per document | 300 | `DOCUMENT_MAX_CASES` |
| Model spend per document | $1.00 | `DOCUMENT_MAX_AI_USD` (0 turns AI cases off) |
| Documents per visitor per day | 3 | `DOCUMENTS_PER_VISITOR_PER_DAY` |
| Documents per website per day | 2 | `DOCUMENTS_PER_SITE_PER_DAY` |
| Documents for everyone per day | 40 | `MAX_DOCUMENTS_PER_DAY` |

When there are more cases than the cap, the lowest-priority ones are left out, and the document says so. Model spend appears
on the admin dashboard as "Test case documents". The estimate for a full 25-page run is roughly $0.2 of model spend, from
five scenario calls. That figure is calculated from the model's list prices, not yet measured in production, so check the
admin dashboard after the first few documents.

## When things go wrong

- **No page can be loaded** (the site is down, refuses connections, or its name does not resolve): the document is marked
  failed with a message saying what to check. No cases are written.
- **Some pages need a login or refuse automated visits**: they are listed in the scope section and not explored further.
- **The model is unavailable, or the budget is used up**: the document is still delivered, without the AI cases, and the
  scope section says drafting stopped at the cost limit.
- **The worker stops mid-job**: a document whose heartbeat is three minutes old is claimed again and started over, so
  nothing from the earlier attempt survives into the new one.

## Safety and privacy

- The crawl uses the same guarded browser as a shift: public addresses only, the egress proxy, and the same navigation
  rules. The booking form also refuses private hosts and non-standard ports, and credentials in the link.
- Page text, link names and focus notes are data. They are escaped in the PDF and written as plain text in the Word file,
  so a site cannot add markup, scripts or links to a document.
- The PDF is printed with scripts off and every request aborted, so nothing in the markup can load anything while the file
  is made.
- The files are served only for completed documents, with `Cache-Control: private, no-store` and `noindex`. The page URL
  is the only key: it is a random UUID, so treat it as private.
- Logs contain document IDs and counts, never the site address, the email, or the notes.
- Email is required, because the link is delivered there. It is used for nothing else.

## Operating it

1. Apply `supabase/migrations/20261023000000_test_documents.sql`. It creates the document tables and extends `ai_usage`
   with a `document` purpose. The web pages query these tables, so apply it before deploying the web app.
2. Run the document worker as its own process, on the same image as the shift worker:

   ```bash
   npm run documents:worker
   ```

   It needs `DATABASE_URL`, `ANTHROPIC_API_KEY` and the Playwright browser, as the shift worker does. It is separate so a
   long paid shift never waits behind a free document, and a document never delays a shift.
3. Email is sent through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set. Without them the document is still
   written; only the notification is skipped.

## Not decided or not built

- **Pricing and gating are your decision.** The feature is free and capped by the limits above. If you want it paid, the
  natural place is before `createDocumentRequest` in [src/lib/documents/store.ts](../src/lib/documents/store.ts).
- **Retention.** Files and cases are kept until deleted by hand. There is no automatic deletion yet.
- **Logins.** The crawl cannot sign in, so pages behind a login are not described.
- **Interaction.** The crawl records what loads on each page. Steps that need a click or a form submission are described
  only where the scenario drafting infers them. Nothing is executed.
- **Review.** AI-drafted cases can be wrong. The document says so, and it should be reviewed before anyone relies on it.

## What was verified

- Unit tests for the rules, the scenario validation, the limits and the renderers (`tests/documents-rules.test.ts`,
  `tests/documents-render.test.ts`).
- An integration test that runs the real worker job against a database, a browser serving a fixture site, and a mock model
  server (`tests/documents-worker.test.ts`). It covers the cost cap, the per-visitor limit, unreachable sites, and the
  failure message the visitor sees.
- End-to-end tests of the pages, the downloads and the headers, against the built app (`tests/e2e/test-cases.spec.ts`).
- A visual check of the document's print layout (a print-mode screenshot of the same HTML that becomes the PDF) and of the
  web pages, and a check that the pages do not overflow a phone-width screen. The PDF itself was checked by its page count
  and structure, not by viewing it, and the Word file was checked by its package structure, not by opening it in Word.

While verifying, the accessibility scan turned out never to have worked: the rule list was read from the Node side inside a
function sent to the page, so every scan page was reported "could not finish". The rule list is now passed in as an
argument. This also affects the accessibility audit on Lead and Principal shifts, which now produces results.
