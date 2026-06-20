import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { VERSION } from "../version.js";

const PACKAGE_JSON_PATH = fileURLToPath(
  new URL("../../package.json", import.meta.url),
);
const SERVER_JSON_PATH = fileURLToPath(
  new URL("../../server.json", import.meta.url),
);
const SMITHERY_YAML_PATH = fileURLToPath(
  new URL("../../smithery.yaml", import.meta.url),
);
const PUBLIC_REPO_URL = "https://github.com/jcoulaud/shipmail-mcp";

type PackageJson = {
  readonly version: string;
  readonly repository?: { readonly url?: string };
  readonly bugs?: { readonly url?: string };
  readonly files?: readonly string[];
};

type ServerJson = {
  readonly version: string;
  readonly repository: { readonly url: string };
  readonly packages: readonly [
    { readonly identifier: string; readonly version: string },
  ];
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readSmitheryVersion(): string {
  const match = readFileSync(SMITHERY_YAML_PATH, "utf8").match(
    /^version:\s*["']?([^"'\s]+)["']?$/m,
  );
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

describe("server metadata", () => {
  test("package, runtime, and directory metadata stay aligned", () => {
    const pkg = readJson<PackageJson>(PACKAGE_JSON_PATH);
    const server = readJson<ServerJson>(SERVER_JSON_PATH);

    expect(pkg.files).toContain("server.json");
    expect(VERSION).toBe(pkg.version);
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0].version).toBe(pkg.version);
    expect(readSmitheryVersion()).toBe(pkg.version);
    expect(server.packages[0].identifier).toBe("shipmail-mcp");
    expect(server.repository.url).toBe(PUBLIC_REPO_URL);
    expect(pkg.repository?.url).toBe(`git+${PUBLIC_REPO_URL}.git`);
    expect(pkg.bugs?.url).toBe(`${PUBLIC_REPO_URL}/issues`);
  });
});
