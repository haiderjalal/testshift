# API testing: what a shift checks, and what it does not

The API phase runs before the browser agents, in its own share of the shift (10% of the time left after mapping). It tests
only the booked site's own API, and only over public addresses. This page lists what it checks, what it stores, what it
will never do, and how it compares with Postman, Swagger and Schemathesis.

## Where the operations come from

1. **Description.** The first OpenAPI 3 or Swagger 2 document found at the usual paths (`/openapi.json`, `/swagger.yaml`,
   `/v3/api-docs` and others), in JSON or YAML. Swagger 2 is converted to OpenAPI 3 internally.
2. **Postman collection.** Optional, pasted at booking. Only each request's method and path survive the import. Headers,
   auth, bodies and query strings are never stored.
   - `{{baseUrl}}`-style URLs resolve when the collection's own variable points at the booked site. Other variables, and
     any address on another site, are skipped and counted.
3. **Several servers.** When a description lists more than one server, the one on the booked site is used.

Reads run first, then reads that take a path value from an earlier list response (`/products` → `/products/{id}`). Writes
run only on an approved test environment with a verified domain, and only on records the shift itself created.

## Checks on each operation

| Check | Applies to | Passes when | Severity when it fails |
|---|---|---|---|
| Status | every sent operation | the response is 2xx | critical for 5xx, otherwise major |
| Documented status | 2xx responses, when the description documents success codes | the code, or its range such as `2XX`, is documented | minor |
| Authentication enforced | operations whose security requirement cannot be met anonymously | an anonymous call is refused with 401 or 403 | critical when an anonymous call gets a 2xx |
| Content type | 2xx responses with a documented JSON body | the response is JSON | major |
| Response schema | 2xx JSON responses with a documented schema | the body matches the schema | major |
| Malformed input | GET operations with path or query parameters | no malformed value causes a 5xx | major |
| Latency | every response | under 2 seconds | minor |
| Reachable | every sent operation | the request got an answer | major |

Notes:

- A **refused anonymous call** passes the authentication check and no other check is judged. A 401 says nothing about the
  body, so the status and schema checks are left out rather than failed. TestShift holds no credentials, so calls that
  carry credentials are not tested.
- **Malformed input** sends type violations for numeric parameters (`abc`, `-1`, `0`, a number past 64-bit range), a broken
  UTF-8 escape, a NUL byte and a 512-character string for text parameters, and `maybe` for booleans. No injection payloads
  are sent. Each operation gets at most 6 probes, and a shift at most 150. Probes run last, on the time the reads and
  writes left over, and a probe that gets no answer counts for neither side.
- **Checks that cannot apply are left out**, never passed. A response schema that AJV cannot read is skipped, and the spec
  review reports it. OpenAPI 3.0 boolean `exclusiveMinimum` and `exclusiveMaximum` are read as numeric bounds.
- The verdict of an operation is the worst failed check. The description review and the browser comparison never change it.

## Spec review

Problems in the description itself, shown as warnings or suggestions. They do not change any result.

| Rule | Level | What it means |
|---|---|---|
| `info-version` | warning | `info.version` is missing |
| `operation-id-unique` | warning | the same `operationId` is used twice |
| `success-response` | warning | an operation documents no 2xx, so its status cannot be checked |
| `path-parameter-declared` | warning | a `{name}` in the path has no declared path parameter |
| `security-scheme` | warning | a security requirement names a scheme the description does not define |
| `response-schema` | warning | a success schema cannot be read, so responses are not validated against it |
| `info-description`, `operation-id`, `operation-description` | suggestion | missing documentation |
| `error-responses` | suggestion | no 4xx, 5xx or default response is documented |
| `parameter-example` | suggestion | a path or required query parameter has no example, so the operation is skipped unless chaining supplies it |
| `request-body-example` | suggestion | a write has no example body, so a write test cannot send one |
| `write-security` | suggestion | a write has no security requirement although the description defines schemes |
| `path-naming` | suggestion | a verb appears in the path, such as `/getProducts` |
| `servers-declared` | suggestion | no servers are declared |

Rules are deliberately few and tied to what a shift can test. They are not a full Spectral ruleset.

## Browser comparison

The crawl records same-origin `fetch` and XHR calls each page makes while it loads. Each call is reduced to a method and
a path: numeric, UUID and long hex segments become `{id}`, and segments that contain an `@` or are longer than 40 characters
become `{value}`. Other segments are kept as the page requested them, as the crawl map already keeps page URLs. Query
strings, headers and bodies are dropped. Framework and build paths (`/_next/`, `/_vercel/`, `/__`, `/static/`) and calls to
other sites are ignored.

- A call the description documents is not reported.
- A call it does not document is reported as a suggestion, `undocumented-call`.
- With no description at all, every observed call is reported as untested.

Coverage is what the crawl loaded: calls made after a click or a form submission are not seen.

## What is stored

- Operation rows: method, path (with query, for requests built from the description), status, latency, checks and skip
  reasons.
- Spec review and browser findings: the rule, the message and the location (a method and path).
- Browser calls, normalised as above, inside the crawl map.
- Never: headers, cookies, credentials, request bodies or response bodies from a collection.

## Postman export

`/runs/[id]/postman` downloads a Postman v2.1 collection of the **passing** read operations of a completed shift. Each request
carries two tests: its status, or a refusal of an anonymous call, and the 2-second latency budget. Failing, skipped and
data-changing operations are left out, so the collection never records a bug as expected behaviour. The tests are built from
numbers the shift observed, never from customer text. Run it with Postman or Newman; it is a regression snapshot, so edit the
expectations if the observed behaviour is not the behaviour you want.

## What it does not do

- **No credentials.** Authenticated calls are never made, so protected behaviour beyond "refuses anonymous calls" is untested.
- **No Postman scripts or environments.** Collection test scripts are never executed (running customer JavaScript is not
  safe on the worker), and environment files are not accepted because they usually hold secrets.
- **No scheduled or triggered runs, mock servers, client generation or interactive "try it" requests.** Scheduling is on the
  roadmap; the others are not testing features.
- **No invalid-data acceptance checks.** A lenient API that accepts a bad value is not a defect by itself, so an accepted
  invalid value is not reported.
- **No protocols beyond HTTP.** GraphQL, gRPC and WebSockets are not tested.
- **No other hosts.** A description that points at another site is reported and not tested.
- **No writes outside an approved environment.** A POST, PUT, PATCH or DELETE is listed and skipped there.

## How this compares

| | Postman | Swagger (SwaggerHub, Swagger Editor) | Schemathesis | TestShift |
|---|---|---|---|---|
| Needs a collection, spec or config first | yes, a collection | yes, a description | yes, a description and config | no: finds the description itself |
| What runs against the live API | the requests in your collection, optionally on a schedule | interactive requests from the docs | generated property-based checks | fixed checks, listed above |
| Anonymous access to protected endpoints | no built-in check | no built-in check | yes (`ignored_auth`), with setup | yes, on every shift, no credentials |
| Status codes against the description | through your own test scripts | validation of the description, not responses | yes (`status_code_conformance`) | yes, 2xx codes |
| Server errors on bad input | not built in | not built in | yes (`not_a_server_error`) | yes, bounded malformed-input probes |
| Calls the UI actually makes, compared with the description | no | no | no | yes, the only one of the four that sees browser traffic |
| Writes refused unless the environment is approved | no | no | no | yes, and only on records the test created |
| Runnable test output | yes, collections | code generation | failure reports | yes, passing reads as a Postman collection |
| Spec linting | yes, on import | yes, Spectral rulesets | no | yes, a short rule set |

Sources for the comparison: [Postman OpenAPI import](https://learning.postman.com/docs/postman/collections/working-with-openAPI),
[Postman collection simulation](https://learning.postman.com/docs/collections/running-collections/run-collection-with-simulation),
[SwaggerHub auto-mocking](https://support.smartbear.com/swaggerhub/docs/integrations/api-auto-mocking.html),
[Spectral linting](https://thenewstack.io/improve-the-quality-of-your-apis-with-spectral-linting/),
[Schemathesis checks](https://schemathesis.readthedocs.io/en/stable/reference/checks/).

## Operating notes

- Apply `supabase/migrations/20261022000000_api_findings.sql` before deploying this revision. It adds `runs.api_findings`.
- The probes and the browser comparison are on by default. They use only the booked site, the same public-address guard as
  every other request, and the API phase's time.
- Verified in this revision: unit tests (`npm test`, 203 suite tests plus the GitHub action runner), the TypeScript check,
  project-wide lint, `npm run check`, the production build, and the end-to-end suite (70 passing on desktop and mobile). Also
  checked: a crawl of a fixture site in real Chromium that recorded and compared its API calls, the rendered results
  component, and the export route against a stubbed query layer.
