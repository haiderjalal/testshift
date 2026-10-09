import { createServer, request as httpRequest, type OutgoingHttpHeaders } from "node:http";
import { connect, type Socket } from "node:net";

import { resolvePublicAddress } from "@/lib/outbound";

export { resolvePublicAddress };

/** Local forward proxy used ONLY by the test browser. Redirects establish fresh, checked connections. */
export async function startEgressProxy(): Promise<{ server: string; close: () => Promise<void> }> {
  const sockets = new Set<Socket>();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "");
      if (url.protocol !== "http:" || url.username || url.password) throw new Error("Unsupported destination");
      const address = await resolvePublicAddress(url.hostname);
      if (request.destroyed) return;
      const headers: OutgoingHttpHeaders = { ...request.headers, host: url.host };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      const upstream = httpRequest({ hostname: address, port: url.port || 80, method: request.method,
        path: url.pathname + url.search, headers, agent: false, timeout: 30_000 }, (incoming) => {
        response.writeHead(incoming.statusCode ?? 502, incoming.headers);
        incoming.pipe(response);
      });
      upstream.on("timeout", () => upstream.destroy(new Error("Upstream timeout")));
      upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end("Test browser could not reach this destination."); });
      response.on("close", () => upstream.destroy());
      request.pipe(upstream);
    } catch {
      response.writeHead(403, { "content-type": "text/plain", "x-testshift-network-blocked": "1" });
      response.end("Test browser network policy refused this destination.");
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.setTimeout(45_000, () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("connect", async (request, client, head) => {
    try {
      const target = new URL(`https://${request.url}`);
      if (target.username || target.password || target.pathname !== "/" || target.search || target.hash) throw new Error("Invalid tunnel");
      const address = await resolvePublicAddress(target.hostname);
      if (client.destroyed) return;
      const upstream = connect({ host: address, port: Number(target.port || 443) });
      sockets.add(upstream);
      upstream.on("close", () => sockets.delete(upstream));
      upstream.setTimeout(30_000, () => upstream.destroy());
      upstream.on("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on("error", () => client.destroy());
      client.on("error", () => upstream.destroy());
      client.on("close", () => upstream.destroy());
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    }
  });
  // Plaintext websocket upgrades fail closed. WSS tunnels use the same checked CONNECT path.
  server.on("upgrade", (_request, socket) => socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"));
  server.on("clientError", (_error, socket) => socket.destroy());
  server.maxConnections = 64;
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Proxy did not bind");
  return { server: `http://127.0.0.1:${address.port}`, close: async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  } };
}
