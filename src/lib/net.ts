import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const privateRanges = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3], // multicast and reserved (224/4 + 240/4)
] as const) {
  privateRanges.addSubnet(net, prefix, "ipv4");
}
// IPv4-mapped IPv6 (::ffff:10.0.0.1) is matched by the IPv4 rules above; adding ::ffff:0:0/96 would block all IPv4.
for (const [net, prefix] of [
  ["::", 96], // unspecified, loopback and IPv4-compatible
  ["64:ff9b::", 96], // NAT64: embeds an IPv4 address
  ["2002::", 16], // 6to4: embeds an IPv4 address
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateRanges.addSubnet(net, prefix, "ipv6");
}

/** True for loopback, private, link-local, carrier NAT, multicast and reserved addresses. */
export function isPrivateIp(address: string): boolean {
  const family = isIP(address);
  return family === 0 || privateRanges.check(address, family === 6 ? "ipv6" : "ipv4");
}

/** True when the host resolves only to public addresses, so the tester can't be pointed at internal networks. */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  try {
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateIp(a.address));
  } catch {
    return false; // unresolvable hosts can't be tested either
  }
}

// Second-level labels that sit under a country code (example.co.uk, example.com.au).
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "ac", "edu", "ne", "or"]);

/**
 * The registrable domain of a host, used as the "one free trial per website" key: shop.example.com,
 * www.example.com and example.com. share one trial. ponytail: a heuristic, not the public suffix list;
 * swap in `tldts` if suffixes like github.io need per-site trials.
 */
export function siteKey(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(host.replace(/^\[|\]$/g, ""))) return host;
  const labels = host.split(".");
  const take = labels.length >= 3 && labels.at(-1)?.length === 2 && SECOND_LEVEL.has(labels.at(-2) ?? "") ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** One free trial per mailbox: case, dots in Gmail addresses and "+tags" don't make a new address. */
export function emailKey(email: string): string {
  const [local = "", domain = ""] = email.toLowerCase().trim().split("@");
  const base = local.split("+")[0];
  const gmail = domain === "gmail.com" || domain === "googlemail.com";
  return `${gmail ? base.replace(/\./g, "") : base}@${gmail ? "gmail.com" : domain}`;
}
