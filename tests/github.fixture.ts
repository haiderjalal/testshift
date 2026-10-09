/** Loaded ONLY by the disposable browser test harness. No configurable API host or auth bypass in production code. */
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "api.github.com") return originalFetch(input, init);
  const token = new Headers(init?.headers).get("Authorization");
  if (url.pathname === "/app/installations/905/access_tokens") return Response.json({ token: "fixture-scoped-generation-token" });
  if (url.pathname === "/installation/token" && init?.method === "DELETE") return new Response(null, { status: 204 });
  const owner = token === "Bearer fixture-customer-token-901";
  const installations = [{ id: owner ? 905 : 906, app_id: 900, suspended_at: null, account: { login: owner ? "fixture-owner" : "fixture-other" } }];
  if (url.pathname === "/user/installations") return Response.json({ installations });
  if (url.pathname === "/repos/fixture-owner/project") return Response.json({ id: 907, full_name: "fixture-owner/project" });
  if (url.pathname === "/repos/fixture-other/project") return Response.json({ id: 908, full_name: "fixture-other/project" });
  if (url.pathname === "/repos/fixture-owner/empty-project") return Response.json({ id: 909, full_name: "fixture-owner/empty-project" });
  if (url.pathname === "/repos/fixture-owner/multiple-workflows") return Response.json({ id: 910, full_name: "fixture-owner/multiple-workflows" });
  if (url.pathname === "/user/installations/905/repositories" && owner) return Response.json({ repositories: [{ id: 907, full_name: "fixture-owner/project" }, { id: 909, full_name: "fixture-owner/empty-project" }, { id: 910, full_name: "fixture-owner/multiple-workflows" }] });
  if (url.pathname === "/user/installations/906/repositories" && !owner) return Response.json({ repositories: [{ id: 908, full_name: "fixture-other/project" }] });
  if (url.pathname.endsWith("/permission")) return Response.json({ permission: owner && /\/fixture-owner\/(project|empty-project|multiple-workflows)\//.test(url.pathname) ? "admin" : "read" });
  const workflow = { id: 911, name: "Project quality checks", path: ".github/workflows/quality-checks.yml", state: "active" };
  if (url.pathname === "/repos/fixture-owner/project/actions/workflows" && owner) return Response.json({ workflows: [workflow] });
  if (url.pathname === "/repos/fixture-owner/project/actions/workflows/911" && owner) return Response.json(workflow);
  if (url.pathname === "/repos/fixture-owner/empty-project/actions/workflows" && owner) return Response.json({ workflows: [] });
  if (url.pathname === "/repos/fixture-owner/multiple-workflows/actions/workflows" && owner) return Response.json({ workflows: [{ ...workflow, id: 912 }, { ...workflow, id: 913, name: "Another test suite", path: ".github/workflows/other.yml" }] });
  return Response.json({ message: "Fixture access denied" }, { status: 403 });
};
