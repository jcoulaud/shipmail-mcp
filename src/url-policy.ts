import { isIP } from "node:net";

// Reject hostnames that resolve to non-public address space, plus a few special-use
// names that should never appear as a webhook target. The MCP layer is the first
// validator the agent sees, so we are strict here. The API also re-validates at
// delivery time.
const PRIVATE_HOST_NAME_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.intranet$/i,
  /\.lan$/i,
  /\.home\.arpa$/i,
];

function ipv4ToOctets(addr: string): readonly number[] | null {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function isPrivateIPv4(addr: string): boolean {
  const octets = ipv4ToOctets(addr);
  if (!octets) return true;
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

function expandIPv6(addr: string): readonly string[] | null {
  const lower = addr.toLowerCase();
  const halves = lower.split("::");
  if (halves.length > 2) return null;

  function explodeMixed(parts: readonly string[]): string[] | null {
    if (parts.length === 0) return [...parts];
    const last = parts[parts.length - 1] ?? "";
    if (!last.includes(".")) return [...parts];
    const o = ipv4ToOctets(last);
    if (!o) return null;
    const hi = (((o[0] ?? 0) << 8) | (o[1] ?? 0)).toString(16);
    const lo = (((o[2] ?? 0) << 8) | (o[3] ?? 0)).toString(16);
    return [...parts.slice(0, -1), hi, lo];
  }

  const leftRaw = halves[0] ?? "";
  const rightRaw = halves[1] ?? "";
  const left = explodeMixed(leftRaw === "" ? [] : leftRaw.split(":"));
  const right = explodeMixed(rightRaw === "" ? [] : rightRaw.split(":"));
  if (!left || !right) return null;

  if (halves.length === 1) {
    if (left.length !== 8) return null;
    return left;
  }

  const fillCount = 8 - (left.length + right.length);
  if (fillCount < 0) return null;
  const filled: string[] = [...left];
  for (let i = 0; i < fillCount; i++) filled.push("0");
  filled.push(...right);
  if (filled.length !== 8) return null;
  return filled;
}

function isPrivateIPv6(addr: string): boolean {
  const segs = expandIPv6(addr);
  if (!segs || segs.length !== 8) return true;
  // ::/128 (unspec) or ::1/128 (loopback)
  if (
    segs[0] === "0" &&
    segs[1] === "0" &&
    segs[2] === "0" &&
    segs[3] === "0" &&
    segs[4] === "0" &&
    segs[5] === "0" &&
    segs[6] === "0" &&
    (segs[7] === "0" || segs[7] === "1")
  ) {
    return true;
  }
  const first = parseInt(segs[0] ?? "0", 16);
  if (Number.isNaN(first)) return true;
  // fc00::/7 unique-local
  if (first >= 0xfc00 && first <= 0xfdff) return true;
  // fe80::/10 link-local
  if (first >= 0xfe80 && first <= 0xfebf) return true;
  // ff00::/8 multicast
  if (first >= 0xff00) return true;
  // 2001:db8::/32 documentation
  if (segs[0] === "2001" && segs[1] === "db8") return true;
  // 64:ff9b::/96 NAT64
  if (segs[0] === "64" && segs[1] === "ff9b") return true;
  // ::ffff:0:0/96 IPv4-mapped — rebuild and check the embedded IPv4
  if (
    segs[0] === "0" &&
    segs[1] === "0" &&
    segs[2] === "0" &&
    segs[3] === "0" &&
    segs[4] === "0" &&
    segs[5] === "ffff"
  ) {
    const hi = parseInt(segs[6] ?? "0", 16);
    const lo = parseInt(segs[7] ?? "0", 16);
    if (Number.isNaN(hi) || Number.isNaN(lo)) return true;
    const v4 = `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIPv4(v4);
  }
  // ::/96 IPv4-compatible (deprecated, treat as private)
  if (
    segs[0] === "0" &&
    segs[1] === "0" &&
    segs[2] === "0" &&
    segs[3] === "0" &&
    segs[4] === "0" &&
    segs[5] === "0"
  ) {
    return true;
  }
  return false;
}

export function isPublicHttpsUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username !== "" || parsed.password !== "") return false;

  let host = parsed.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host.length === 0) return false;
  for (const pattern of PRIVATE_HOST_NAME_PATTERNS) {
    if (pattern.test(host)) return false;
  }

  const kind = isIP(host);
  if (kind === 4) return !isPrivateIPv4(host);
  if (kind === 6) return !isPrivateIPv6(host);

  // Reject all-numeric (decimal-int IPv4 like 2130706433 or 0x7f000001) hosts:
  // browsers/curl resolve these to IPv4 but URL.hostname leaves them as a string.
  if (/^[0-9]+$/.test(host)) return false;
  if (/^0x[0-9a-f]+$/i.test(host)) return false;

  return true;
}
