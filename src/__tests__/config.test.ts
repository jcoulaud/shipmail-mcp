import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { readConfig } from "../config.js";

const ENV_KEYS = [
  "SHIPMAIL_API_KEY",
  "SHIPMAIL_BASE_URL",
  "SHIPMAIL_MCP_TOOLS",
  "SHIPMAIL_ALLOW_INSECURE_BASE_URL",
] as const;

describe("readConfig", () => {
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("throws when SHIPMAIL_API_KEY is missing", () => {
    expect(() => readConfig([])).toThrow(/SHIPMAIL_API_KEY/);
  });

  test("returns minimal config with only api key", () => {
    process.env["SHIPMAIL_API_KEY"] = "sk_test";
    const config = readConfig([]);
    expect(config.apiKey).toBe("sk_test");
    expect(config.baseUrl).toBeUndefined();
    expect(config.selectedTools).toBeUndefined();
  });

  test("--tools overrides SHIPMAIL_MCP_TOOLS env var", () => {
    process.env["SHIPMAIL_API_KEY"] = "sk_test";
    process.env["SHIPMAIL_MCP_TOOLS"] = "list_domains,list_mailboxes";
    const config = readConfig(["--tools", "send_message"]);
    expect(config.selectedTools).toEqual(new Set(["send_message"]));
  });

  test("falls back to env var when --tools not provided", () => {
    process.env["SHIPMAIL_API_KEY"] = "sk_test";
    process.env["SHIPMAIL_MCP_TOOLS"] = "list_domains, list_mailboxes ,";
    const config = readConfig([]);
    expect(config.selectedTools).toEqual(new Set(["list_domains", "list_mailboxes"]));
  });

  test("rejects --tools followed by another flag", () => {
    process.env["SHIPMAIL_API_KEY"] = "sk_test";
    expect(() => readConfig(["--tools", "--other"])).toThrow(/--tools requires/);
  });

  test("rejects --tools at end of argv", () => {
    process.env["SHIPMAIL_API_KEY"] = "sk_test";
    expect(() => readConfig(["--tools"])).toThrow(/--tools requires/);
  });

  test("accepts default https base URL on shipmail.to", () => {
    process.env["SHIPMAIL_API_KEY"] = "sk_test";
    process.env["SHIPMAIL_BASE_URL"] = "https://api.shipmail.to/v1";
    const config = readConfig([]);
    expect(config.baseUrl).toBe("https://api.shipmail.to/v1");
  });

  test("rejects http base URL", () => {
    process.env["SHIPMAIL_API_KEY"] = "sk_test";
    process.env["SHIPMAIL_BASE_URL"] = "http://shipmail.to/api/v1";
    expect(() => readConfig([])).toThrow(/https/);
  });

  test("rejects non-shipmail.to host", () => {
    process.env["SHIPMAIL_API_KEY"] = "sk_test";
    process.env["SHIPMAIL_BASE_URL"] = "https://attacker.example.com/api/v1";
    expect(() => readConfig([])).toThrow(/not allowed/);
  });

  test("allows arbitrary base URL when SHIPMAIL_ALLOW_INSECURE_BASE_URL=1", () => {
    process.env["SHIPMAIL_API_KEY"] = "sk_test";
    process.env["SHIPMAIL_BASE_URL"] = "http://localhost:3000/api/v1";
    process.env["SHIPMAIL_ALLOW_INSECURE_BASE_URL"] = "1";
    const config = readConfig([]);
    expect(config.baseUrl).toBe("http://localhost:3000/api/v1");
  });

  test("rejects malformed base URL", () => {
    process.env["SHIPMAIL_API_KEY"] = "sk_test";
    process.env["SHIPMAIL_BASE_URL"] = "not-a-url";
    expect(() => readConfig([])).toThrow(/not a valid URL/);
  });
});
