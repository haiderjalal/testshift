import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { getDomain } from "tldts";

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
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3], // multicast and reserved (224/4 + 240/4)
] as const) {
  privateRanges.addSubnet(net, prefix, "ipv4");
}
// IPv4-mapped IPv6 (::ffff:10.0.0.1) is matched by the IPv4 rules above; adding ::ffff:0:0/96 would block all IPv4.
for (const [net, prefix] of [
  ["::", 96], // unspecified, loopback and IPv4-compatible
  ["64:ff9b::", 96], // NAT64: embeds an IPv4 address
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23], // special-purpose (including Teredo and benchmarking)
  ["2001:db8::", 32],
  ["3fff::", 20],
  ["2002::", 16], // 6to4: embeds an IPv4 address
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = isIP(host) ? [{ address: host }] : await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DNS timeout")), 5_000); }),
    ]);
    return addresses.length > 0 && addresses.every((a) => !isPrivateIp(a.address));
  } catch {
    return false; // unresolvable hosts can't be tested either
  } finally { clearTimeout(timer); }
}

/**
 * The registrable domain of a host, used as the "one free trial per website" key: shop.example.com,
 * www.example.com and example.com. share one trial. Private hosting suffixes isolate tenants.
 */
export function siteKey(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(host.replace(/^\[|\]$/g, ""))) return host;
  return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

/** One free trial per mailbox: case, dots in Gmail addresses and "+tags" don't make a new address. */
export function emailKey(email: string): string {
  const [local = "", domain = ""] = email.toLowerCase().trim().split("@");
  const base = local.split("+")[0];
  const gmail = domain === "gmail.com" || domain === "googlemail.com";
  return `${gmail ? base.replace(/\./g, "") : base}@${gmail ? "gmail.com" : domain}`;
}
