import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";
import { z } from "zod/v4";

import { VERSION } from "../version.js";

const PACKAGE_JSON_PATH = fileURLToPath(new URL("../../package.json", import.meta.url));
const SERVER_JSON_PATH = fileURLToPath(new URL("../../server.json", import.meta.url));
const SMITHERY_YAML_PATH = fileURLToPath(new URL("../../smithery.yaml", import.meta.url));
const PUBLIC_REPO_URL = "https://github.com/shipmail-to/shipmail-mcp";

const packageJsonSchema = z.object({
  mcpName: z.string(),
  version: z.string(),
  repository: z.object({ url: z.string() }).optional(),
  bugs: z.object({ url: z.string() }).optional(),
  files: z.array(z.string()).optional(),
});

const serverJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  repository: z.object({ url: z.string() }),
  packages: z.tuple([z.object({ identifier: z.string(), version: z.string() })]),
});

function readSmitheryVersion(): string {
  const match = readFileSync(SMITHERY_YAML_PATH, "utf8").match(
    /^version:\s*["']?([^"'\s]+)["']?$/m,
  );
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

describe("server metadata", () => {
  test("package, runtime, and directory metadata stay aligned", () => {
    const pkg = packageJsonSchema.parse(JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")));
    const server = serverJsonSchema.parse(JSON.parse(readFileSync(SERVER_JSON_PATH, "utf8")));

    expect(pkg.files).toContain("server.json");
    expect(pkg.files).toContain("smithery.yaml");
    expect(pkg.mcpName).toBe("io.github.shipmail-to/shipmail-mcp");
    expect(VERSION).toBe(pkg.version);
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0].version).toBe(pkg.version);
    expect(readSmitheryVersion()).toBe(pkg.version);
    expect(server.packages[0].identifier).toBe("shipmail-mcp");
    expect(server.repository.url).toBe(PUBLIC_REPO_URL);
    expect(pkg.repository?.url).toBe(`git+${PUBLIC_REPO_URL}.git`);
    expect(pkg.bugs?.url).toBe(`${PUBLIC_REPO_URL}/issues`);
  });
});
