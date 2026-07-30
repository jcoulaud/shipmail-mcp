#!/usr/bin/env bun

import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { packExtension, v0_4 } from "@anthropic-ai/mcpb";
import { z } from "zod";

const packageSchema = z.object({
  name: z.literal("shipmail-mcp"),
  version: z.string().min(1),
});

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(scriptDirectory, "..");
const distributionDirectory = join(packageDirectory, "distribution", "mcpb");
const manifestSourcePath = join(distributionDirectory, "manifest.json");
const packageMetadata = packageSchema.parse(
  JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8")),
);
const manifest = v0_4.McpbManifestSchema.parse(
  JSON.parse(await readFile(manifestSourcePath, "utf8")),
);

if (manifest.name !== packageMetadata.name || manifest.version !== packageMetadata.version) {
  throw new Error(
    `MCPB manifest ${manifest.name}@${manifest.version} does not match ${packageMetadata.name}@${packageMetadata.version}.`,
  );
}

const outputDirectory = join(packageDirectory, "dist");
const stagingDirectory = join(outputDirectory, ".mcpb-stage");
const serverDirectory = join(stagingDirectory, "server");
const outputPath = join(outputDirectory, "shipmail-mcp.mcpb");

await rm(stagingDirectory, { force: true, recursive: true });
await rm(outputPath, { force: true });
await mkdir(serverDirectory, { recursive: true });

try {
  await cp(manifestSourcePath, join(stagingDirectory, "manifest.json"));
  await cp(join(distributionDirectory, "icon.png"), join(stagingDirectory, "icon.png"));

  const buildResult = await Bun.build({
    entrypoints: [join(packageDirectory, "src", "index.ts")],
    format: "esm",
    naming: "index.js",
    outdir: serverDirectory,
    target: "node",
  });

  if (!buildResult.success) {
    throw new AggregateError(buildResult.logs, "Failed to bundle the Shipmail MCP server.");
  }

  const packed = await packExtension({
    extensionPath: stagingDirectory,
    outputPath,
  });
  if (!packed) {
    throw new Error("MCPB packaging failed.");
  }
} finally {
  await rm(stagingDirectory, { force: true, recursive: true });
}

process.stdout.write(`Built ${outputPath}\n`);
