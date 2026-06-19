import { describe, expect, test } from "bun:test";

import { isPublicHttpsUrl } from "../url-policy.js";

describe("isPublicHttpsUrl", () => {
  describe("scheme & userinfo", () => {
    test("accepts plain https on a public host", () => {
      expect(isPublicHttpsUrl("https://example.com/hook")).toBe(true);
    });

    test("rejects http", () => {
      expect(isPublicHttpsUrl("http://example.com/hook")).toBe(false);
    });

    test("rejects URLs with embedded userinfo", () => {
      expect(isPublicHttpsUrl("https://user:pw@example.com/hook")).toBe(false);
      expect(isPublicHttpsUrl("https://user@example.com/hook")).toBe(false);
    });

    test("rejects malformed URLs", () => {
      expect(isPublicHttpsUrl("not a url")).toBe(false);
      expect(isPublicHttpsUrl("")).toBe(false);
    });
  });

  describe("name-based rejections", () => {
    test("rejects localhost / .local / .internal / .lan / .home.arpa", () => {
      expect(isPublicHttpsUrl("https://localhost/x")).toBe(false);
      expect(isPublicHttpsUrl("https://api.local/x")).toBe(false);
      expect(isPublicHttpsUrl("https://api.internal/x")).toBe(false);
      expect(isPublicHttpsUrl("https://api.lan/x")).toBe(false);
      expect(isPublicHttpsUrl("https://router.home.arpa/x")).toBe(false);
      expect(isPublicHttpsUrl("https://api.localhost/x")).toBe(false);
    });
  });

  describe("IPv4 rejections", () => {
    test("rejects RFC1918 (10/8, 172.16/12, 192.168/16)", () => {
      expect(isPublicHttpsUrl("https://10.0.0.1/x")).toBe(false);
      expect(isPublicHttpsUrl("https://10.255.255.255/x")).toBe(false);
      expect(isPublicHttpsUrl("https://172.16.0.1/x")).toBe(false);
      expect(isPublicHttpsUrl("https://172.31.255.255/x")).toBe(false);
      expect(isPublicHttpsUrl("https://192.168.1.1/x")).toBe(false);
    });

    test("rejects loopback (127/8)", () => {
      expect(isPublicHttpsUrl("https://127.0.0.1/x")).toBe(false);
      expect(isPublicHttpsUrl("https://127.255.255.255/x")).toBe(false);
    });

    test("rejects 0.0.0.0 (this-host)", () => {
      // 0.0.0.0/8 is reserved for "this network"; on most kernels it routes
      // to localhost. The previous regex-only allowlist let this through.
      expect(isPublicHttpsUrl("https://0.0.0.0/x")).toBe(false);
      expect(isPublicHttpsUrl("https://0.1.2.3/x")).toBe(false);
    });

    test("rejects 169.254.0.0/16 link-local (incl. AWS metadata)", () => {
      expect(isPublicHttpsUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
    });

    test("rejects multicast 224.0.0.0/4 and reserved 240.0.0.0/4", () => {
      expect(isPublicHttpsUrl("https://224.0.0.1/x")).toBe(false);
      expect(isPublicHttpsUrl("https://239.255.255.255/x")).toBe(false);
      expect(isPublicHttpsUrl("https://240.0.0.1/x")).toBe(false);
    });

    test("rejects shared address space 100.64.0.0/10 (CGNAT)", () => {
      expect(isPublicHttpsUrl("https://100.64.0.1/x")).toBe(false);
      expect(isPublicHttpsUrl("https://100.127.255.254/x")).toBe(false);
    });

    test("rejects decimal-int and hex-int IPv4 forms", () => {
      // 2130706433 == 127.0.0.1 in 32-bit decimal form. URL.hostname leaves
      // it as-is; browsers/curl resolve it to localhost. Reject any all-digit
      // or 0x-prefixed hostname.
      expect(isPublicHttpsUrl("https://2130706433/x")).toBe(false);
      expect(isPublicHttpsUrl("https://0x7f000001/x")).toBe(false);
    });

    test("accepts genuinely public IPv4", () => {
      expect(isPublicHttpsUrl("https://1.1.1.1/x")).toBe(true);
      expect(isPublicHttpsUrl("https://8.8.8.8/x")).toBe(true);
    });
  });

  describe("IPv6 rejections", () => {
    test("rejects ::1 loopback (bracketed)", () => {
      // URL.hostname returns "[::1]" for IPv6 literals — the previous regex
      // /^::1$/ never matched because of the leading bracket.
      expect(isPublicHttpsUrl("https://[::1]/x")).toBe(false);
    });

    test("rejects :: unspecified", () => {
      expect(isPublicHttpsUrl("https://[::]/x")).toBe(false);
    });

    test("rejects fe80::/10 link-local", () => {
      expect(isPublicHttpsUrl("https://[fe80::1]/x")).toBe(false);
      expect(isPublicHttpsUrl("https://[febf::1]/x")).toBe(false);
    });

    test("rejects fc00::/7 unique-local", () => {
      expect(isPublicHttpsUrl("https://[fc00::1]/x")).toBe(false);
      expect(isPublicHttpsUrl("https://[fdff::1]/x")).toBe(false);
    });

    test("rejects ff00::/8 multicast", () => {
      expect(isPublicHttpsUrl("https://[ff02::1]/x")).toBe(false);
    });

    test("rejects 2001:db8::/32 documentation", () => {
      expect(isPublicHttpsUrl("https://[2001:db8::1]/x")).toBe(false);
    });

    test("rejects 64:ff9b::/96 NAT64", () => {
      expect(isPublicHttpsUrl("https://[64:ff9b::1]/x")).toBe(false);
    });

    test("rejects IPv4-mapped IPv6 ::ffff:x.y.z.w when the embedded v4 is private", () => {
      expect(isPublicHttpsUrl("https://[::ffff:127.0.0.1]/x")).toBe(false);
      expect(isPublicHttpsUrl("https://[::ffff:10.0.0.1]/x")).toBe(false);
      expect(isPublicHttpsUrl("https://[::ffff:0a00:0001]/x")).toBe(false);
      expect(isPublicHttpsUrl("https://[::ffff:7f00:0001]/x")).toBe(false);
    });

    test("rejects ::/96 IPv4-compatible (deprecated)", () => {
      expect(isPublicHttpsUrl("https://[::127.0.0.1]/x")).toBe(false);
      expect(isPublicHttpsUrl("https://[::a]/x")).toBe(false);
    });

    test("accepts genuinely public IPv6", () => {
      expect(isPublicHttpsUrl("https://[2606:4700:4700::1111]/x")).toBe(true);
    });
  });
});
