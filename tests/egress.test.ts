import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { after, before, test } from "node:test";
import { resolvePublicAddress, startEgressProxy } from "../worker/egress";

let proxy: Awaited<ReturnType<typeof startEgressProxy>>;
let hits = 0;
const privateServer = createServer((_req, res) => { hits++; res.end("PRIVATE FIXTURE"); });
let privatePort: number;
before(async () => {
  proxy = await startEgressProxy();
  await new Promise<void>((resolve) => privateServer.listen(0, "127.0.0.1", resolve));
  const addr = privateServer.address(); assert.ok(addr && typeof addr === "object"); privatePort = addr.port;
});
after(async () => { await proxy.close(); await new Promise<void>((resolve) => privateServer.close(() => resolve())); });
function throughProxy(path: string, method = "GET"): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(proxy.server, { method, path, timeout: 3_000 }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
    req.on("connect", (res, socket) => { socket.destroy(); resolve(res.statusCode ?? 0); });
    req.on("error", reject); req.on("timeout", () => req.destroy(new Error("timeout"))); req.end();
  });
}
test("proxy prevents HTTP requests to a real private sentinel before any data is sent", async () => {
  for (const host of ["127.0.0.1", "localhost", "2130706433", "0x7f000001", "[::ffff:127.0.0.1]"]) {
    assert.equal(await throughProxy(`http://${host}:${privatePort}/delete-all`), 403);
  }
  assert.equal(hits, 0);
});
test("HTTPS CONNECT cannot tunnel to private infrastructure", async () => {
  assert.equal(await throughProxy(`127.0.0.1:${privatePort}`, "CONNECT"), 403); assert.equal(hits, 0);
});
test("metadata, reserved and IPv6 local destinations are refused", async () => {
  for (const host of ["169.254.169.254", "192.168.1.1", "::1", "64:ff9b:1::a00:1"]) await assert.rejects(resolvePublicAddress(host));
  assert.equal(await resolvePublicAddress("8.8.8.8"), "8.8.8.8");
});
test("proxy rejects malformed and non-HTTP targets", async () => {
  for (const url of ["file:///etc/passwd", "http://user:pass@8.8.8.8/", "/relative"]) assert.equal(await throughProxy(url), 403);
});
