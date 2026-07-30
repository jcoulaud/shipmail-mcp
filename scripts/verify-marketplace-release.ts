#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SERVER_NAME = "io.github.shipmail-to/shipmail-mcp";
const SMITHERY_NAME = "shipmail-to/shipmail-mcp";
const REGISTRY_URL =
  "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.shipmail-to%2Fshipmail-mcp&limit=100";
const SMITHERY_URL = `https://api.smithery.ai/servers/${encodeURIComponent(SMITHERY_NAME)}`;
const SERVER_CARD_URL = "https://shipmail.to/.well-known/mcp/server-card.json";
const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 10_000;

type RegistryResponse = {
  servers?: Array<{
    server?: { name?: string; version?: string };
    _meta?: {
      "io.modelcontextprotocol.registry/official"?: {
        status?: string;
        isLatest?: boolean;
      };
    };
  }>;
};

type SmitheryResponse = {
  qualifiedName?: string;
  displayName?: string;
  remote?: boolean;
  iconUrl?: string;
  tools?: unknown[] | null;
  resources?: unknown[] | null;
  prompts?: unknown[] | null;
  connections?: Array<{ type?: string; deploymentUrl?: string }>;
};

type ServerCardResponse = {
  tools?: unknown[];
  resources?: unknown[];
  prompts?: unknown[];
};

const packageMetadata = JSON.parse(
  await readFile(resolve(import.meta.dir, "..", "package.json"), "utf8"),
) as { version: string };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "shipmail-mcp-release-verifier/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

async function verifyRegistry(): Promise<void> {
  const registry = await fetchJson<RegistryResponse>(REGISTRY_URL);
  const release = registry.servers?.find(
    ({ server }) =>
      server?.name === SERVER_NAME &&
      server.version === packageMetadata.version,
  );
  const metadata =
    release?._meta?.["io.modelcontextprotocol.registry/official"];

  if (!release || metadata?.status !== "active" || metadata.isLatest !== true) {
    throw new Error(
      `MCP Registry does not report ${SERVER_NAME}@${packageMetadata.version} as the latest active release.`,
    );
  }
}

async function verifySmithery(): Promise<void> {
  const expectedIcon = await readFile(
    resolve(import.meta.dir, "..", "distribution", "mcpb", "icon.png"),
  );
  const serverCard = await fetchJson<ServerCardResponse>(SERVER_CARD_URL);
  if ((serverCard.tools?.length ?? 0) < 100) {
    throw new Error(
      `Shipmail's public server card exposes only ${serverCard.tools?.length ?? 0} tools.`,
    );
  }
  if ((serverCard.resources?.length ?? 0) < 1) {
    throw new Error("Shipmail's public server card exposes no resources.");
  }
  if ((serverCard.prompts?.length ?? 0) < 1) {
    throw new Error("Shipmail's public server card exposes no prompts.");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const server = await fetchJson<SmitheryResponse>(SMITHERY_URL);
      const httpConnection = server.connections?.find(
        ({ type, deploymentUrl }) => type === "http" && Boolean(deploymentUrl),
      );

      if (server.qualifiedName !== SMITHERY_NAME) {
        throw new Error(
          `Unexpected Smithery server name: ${server.qualifiedName ?? "missing"}.`,
        );
      }
      if (server.displayName !== "Shipmail") {
        throw new Error(
          `Unexpected Smithery display name: ${server.displayName ?? "missing"}.`,
        );
      }
      if (server.remote !== true || !httpConnection) {
        throw new Error(
          "Smithery has not activated the hosted HTTP connection yet.",
        );
      }
      if ((server.tools?.length ?? 0) < 1) {
        throw new Error("Smithery exposes no tools.");
      }
      if ((server.resources?.length ?? 0) < 1) {
        throw new Error("Smithery exposes no resources.");
      }
      if ((server.prompts?.length ?? 0) < 1) {
        throw new Error("Smithery exposes no prompts.");
      }
      if (!server.iconUrl) {
        throw new Error("Smithery exposes no icon URL.");
      }

      const iconResponse = await fetch(server.iconUrl, {
        headers: { "User-Agent": "shipmail-mcp-release-verifier/1.0" },
      });
      if (!iconResponse.ok) {
        throw new Error(`Smithery icon returned ${iconResponse.status}.`);
      }
      const actualIcon = Buffer.from(await iconResponse.arrayBuffer());
      if (!actualIcon.equals(expectedIcon)) {
        throw new Error(
          "Smithery icon does not match the white-background Shipmail logo.",
        );
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await Bun.sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

await Promise.all([verifyRegistry(), verifySmithery()]);
console.log(
  `Verified ${SERVER_NAME}@${packageMetadata.version} in the MCP Registry and ${SMITHERY_NAME} on Smithery.`,
);
