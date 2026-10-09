/** Loaded ONLY by the disposable browser test harness. No configurable API host or auth bypass in production code. */
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "api.github.com") return originalFetch(input, init);
  const token = new Headers(init?.headers).get("Authorization");
  const owner = token === "Bearer fixture-customer-token-901";
  const installations = [{ id: owner ? 905 : 906, app_id: 900, suspended_at: null, account: { login: owner ? "fixture-owner" : "fixture-other" } }];
  if (url.pathname === "/user/installations") return Response.json({ installations });
  if (url.pathname === "/repos/fixture-owner/project") return Response.json({ id: 907, full_name: "fixture-owner/project" });
  if (url.pathname === "/repos/fixture-other/project") return Response.json({ id: 908, full_name: "fixture-other/project" });
  if (url.pathname === "/user/installations/905/repositories" && owner) return Response.json({ repositories: [{ id: 907, full_name: "fixture-owner/project" }] });
  if (url.pathname === "/user/installations/906/repositories" && !owner) return Response.json({ repositories: [{ id: 908, full_name: "fixture-other/project" }] });
  if (url.pathname.endsWith("/permission")) return Response.json({ permission: owner && url.pathname.includes("/fixture-owner/project/") ? "admin" : "read" });
  return Response.json({ message: "Fixture access denied" }, { status: 403 });
};
