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
  ["192.168.0.0", 16],
] as const) {
  privateRanges.addSubnet(net, prefix, "ipv4");
}
// IPv4-mapped IPv6 (::ffff:10.0.0.1) is matched by the IPv4 rules above; adding ::ffff:0:0/96 would block all IPv4.
for (const [net, prefix] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
] as const) {
  privateRanges.addSubnet(net, prefix, "ipv6");
}

/** True when the host resolves only to public addresses, so the tester can't be pointed at internal networks. */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  try {
    const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
    return (
      addresses.length > 0 &&
      addresses.every((a) => !privateRanges.check(a.address, a.family === 6 ? "ipv6" : "ipv4"))
    );
  } catch {
    return false; // unresolvable hosts can't be tested either
  }
}
