import type { Nullable } from "@/shared/lib";
import { isIP } from "node:net";

/**
 * REQUIREMENTS.md § 14. Whether an address is one the link-preview scraper is
 * allowed to dial. Everything private, loopback, link-local, carrier-grade NAT,
 * and multicast is refused — the URL comes out of a message body, so a fetch to
 * `169.254.169.254` is an attacker-chosen request made from inside the deployment.
 *
 * INFO: Pure and separate from the fetch so the ranges can be exercised without a
 * network — the fetch's own DNS resolution is the part that cannot be.
 */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 6) {
    return isPublicIpv6Address(address);
  }

  const [a, b] = address.split(".").map(Number);

  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * WARN: Expanded to hextets rather than matched as text. `::ffff:127.0.0.1` and
 * `::ffff:7f00:1` are the same address, and so are `::1` and `0:0:0:0:0:0:0:1` —
 * a prefix test on the written form passes half of those straight through.
 */
function isPublicIpv6Address(address: string): boolean {
  const hextets = toHextets(address);

  if (!hextets) {
    return false;
  }

  const [first] = hextets;
  const isPrefixedByZeros = (count: number) =>
    hextets.slice(0, count).every((hextet) => hextet === 0);

  // INFO: The IPv4-mapped range carries an IPv4 address, so it is answered by the IPv4 rules rather than by a second copy of them.
  if (isPrefixedByZeros(5) && hextets[5] === 0xffff) {
    const [, , , , , , seventh, eighth] = hextets;

    return isPublicAddress([seventh >> 8, seventh & 0xff, eighth >> 8, eighth & 0xff].join("."));
  }

  // INFO: Loopback and the unspecified address, then unique-local (`fc00::/7`), link-local (`fe80::/10`) and multicast (`ff00::/8`) — the IPv6 counterparts of the IPv4 ranges above.
  return !(
    (isPrefixedByZeros(7) && hextets[7] <= 1) ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00
  );
}

/** The eight 16-bit groups of an IPv6 address, or `null` for a form this cannot read — which the caller treats as private. */
function toHextets(address: string): Nullable<number[]> {
  const [head, tail, ...extra] = address.toLowerCase().split("::");

  if (extra.length > 0) {
    return null;
  }

  const left = expandGroups(head);

  if (tail === undefined) {
    return left.length === 8 ? left : null;
  }

  const right = expandGroups(tail);
  const missing = 8 - left.length - right.length;

  return missing >= 0 ? [...left, ...Array<number>(missing).fill(0), ...right] : null;
}

// INFO: A trailing dotted quad (`::ffff:127.0.0.1`) is legal in the last 32 bits, and it is the form `dns.lookup` answers with.
function expandGroups(part: string): number[] {
  if (!part) {
    return [];
  }

  return part.split(":").flatMap((group) => {
    if (!group.includes(".")) {
      return [parseInt(group, 16)];
    }

    const [a, b, c, d] = group.split(".").map(Number);

    return [(a << 8) | b, (c << 8) | d];
  });
}
