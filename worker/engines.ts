import { chromium, firefox, webkit, type Browser } from "playwright";

import type { EngineId } from "@/lib/compat";
import { errorMessage, log } from "@/lib/log";

import { registerEgressBrowser } from "./browser";

// Chromium: loopback must go through the checked proxy, and QUIC/WebRTC UDP would otherwise skip it.
const CHROMIUM_ARGS = ["--proxy-bypass-list=<-loopback>", "--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"];
// Firefox skips proxies for localhost unless told otherwise, and HTTP/3 and WebRTC use UDP that can bypass the proxy.
const FIREFOX_PREFS = {
  "network.proxy.allow_hijacking_localhost": true,
  "network.http.http3.enable": false,
  "media.peerconnection.enabled": false,
};

/**
 * Starts one engine behind the checked proxy. Every engine gets the same network policy, and an engine's
 * browser is registered so its contexts are checked for private addresses like Chromium's are.
 */
export async function launchEngine(engine: EngineId, proxyServer: string): Promise<Browser> {
  const proxy = { server: proxyServer };
  const browser =
    engine === "chromium"
      ? await chromium.launch({ proxy, args: CHROMIUM_ARGS })
      : engine === "webkit"
        ? await webkit.launch({ proxy })
        : await firefox.launch({ proxy, firefoxUserPrefs: FIREFOX_PREFS });
  registerEgressBrowser(browser, proxyServer);
  return browser;
}

/**
 * Engines beyond Chromium, from QA_ENGINES (for example "chromium,webkit"). Off by default: an operator turns
 * one on only after scripts/check-engines.ts passes on the machine that runs the worker.
 */
export function extraEngines(): EngineId[] {
  const configured = (process.env.QA_ENGINES ?? "chromium").split(",").map((name) => name.trim());
  return configured.filter((name): name is EngineId => name === "firefox" || name === "webkit");
}

/** Starts the configured extra engines. One that fails to start is logged and skipped, never fatal. */
export async function launchExtraEngines(proxyServer: string): Promise<Map<EngineId, Browser>> {
  const started = new Map<EngineId, Browser>();
  for (const engine of extraEngines()) {
    try {
      started.set(engine, await launchEngine(engine, proxyServer));
    } catch (e) {
      log("warn", "Browser engine did not start; skipping it", { engine, error: errorMessage(e) });
    }
  }
  return started;
}
