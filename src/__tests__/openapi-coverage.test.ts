import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, test } from "bun:test";
import { ShipMailClient } from "shipmail";
import { API_KEY_SCOPES } from "shipmail/api-key-scopes";
import { z } from "zod/v4";

import { MCP_CAPABILITIES, MCP_PERMISSION_GROUPS, MCP_TOOL_NAMES } from "../capabilities.js";
import { registerTools } from "../tools.js";

const OPENAPI_PATH = fileURLToPath(new URL("../../fixtures/openapi.json", import.meta.url));

const INTENTIONALLY_EXCLUDED: Readonly<Record<string, string>> = {
  getCapabilities:
    "Capability discovery describes the MCP catalog and cannot itself be an MCP business tool.",
  registerDomain:
    "Domain registration charges a saved payment method and requires explicit pricing, contact, and legal confirmation.",
  downloadMailboxInboxAttachment:
    "Attachment downloads return untrusted binary data that can be large and unsafe to inline into a model transcript.",
  stageMailboxAttachment:
    "Raw binary staging is exposed through SDKs and host components; JSON MCP calls consume only the resulting staged ID.",
  consumeStagedAttachmentUpload:
    "The MCP Apps component uploads raw bytes directly through the prepared single-use URL.",
  createMailboxImportUpload:
    "Import staging returns a presigned URL that requires a raw binary upload outside a JSON MCP tool call.",
};

const operationSchema = z
  .object({
    operationId: z.string().optional(),
    "x-scope": z.string().optional(),
  })
  .passthrough();
const openApiSchema = z.object({
  paths: z.record(
    z.string(),
    z.record(z.string(), z.union([operationSchema, z.array(z.unknown())])),
  ),
});

function readOpenApiOperations(): ReadonlyMap<string, string | undefined> {
  const raw: unknown = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
  const doc = openApiSchema.parse(raw);
  const operations = new Map<string, string | undefined>();
  for (const pathItem of Object.values(doc.paths)) {
    for (const candidate of Object.values(pathItem)) {
      if (Array.isArray(candidate) || candidate.operationId === undefined) continue;
      operations.set(candidate.operationId, candidate["x-scope"]);
    }
  }
  return operations;
}

function getRegisteredToolNames(): readonly string[] {
  const client = new ShipMailClient({
    apiKey: "sm_test",
    baseUrl: "https://shipmail.to/api/v1",
    maxRetries: 0,
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  return registerTools(server, client, new Set(MCP_TOOL_NAMES)).knownTools;
}

describe("OpenAPI, capability registry, and MCP registration", () => {
  test("every OpenAPI operation is registered or explicitly excluded", () => {
    const operations = readOpenApiOperations();
    const operationIds = new Set(MCP_CAPABILITIES.map((capability) => capability.operationId));
    const undocumented: string[] = [];
    for (const operationId of operations.keys()) {
      if (!operationIds.has(operationId) && INTENTIONALLY_EXCLUDED[operationId] === undefined) {
        undocumented.push(operationId);
      }
    }
    expect(undocumented).toEqual([]);
  });

  test("every registered MCP tool has exactly one capability entry", () => {
    const registered = getRegisteredToolNames();
    expect(new Set(registered).size).toBe(registered.length);
    expect(new Set(MCP_TOOL_NAMES).size).toBe(MCP_TOOL_NAMES.length);
    expect([...registered].sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });

  test("every registry scope matches OpenAPI and the public scope catalog", () => {
    const operations = readOpenApiOperations();
    const knownScopes = new Set<string>(API_KEY_SCOPES);
    for (const capability of MCP_CAPABILITIES) {
      if (capability.requiredScope === "public") {
        expect(operations.get(capability.operationId)).toBeUndefined();
      } else {
        expect(knownScopes.has(capability.requiredScope)).toBe(true);
        expect(operations.get(capability.operationId)).toBe(capability.requiredScope);
      }
    }
  });

  test("every permission group contains the scope required by its tools", () => {
    const groups = new Map(MCP_PERMISSION_GROUPS.map((group) => [group.name, group]));
    for (const capability of MCP_CAPABILITIES) {
      if (capability.requiredScope === "public") continue;
      if (capability.requiredScope === "*") {
        throw new Error(`${capability.toolName} must declare a granular required scope`);
      }
      expect(groups.get(capability.permissionGroup)?.scopes).toContain(capability.requiredScope);
    }
  });

  test("registered annotations come from the capability registry", async () => {
    const shipmail = new ShipMailClient({
      apiKey: "sm_test",
      baseUrl: "https://shipmail.to/api/v1",
      maxRetries: 0,
    });
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerTools(server, shipmail, new Set(MCP_TOOL_NAMES));
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    try {
      const registered = new Map(
        (await client.listTools()).tools.map((tool) => [tool.name, tool.annotations]),
      );
      for (const capability of MCP_CAPABILITIES) {
        expect(registered.get(capability.toolName)).toMatchObject(capability.annotations);
      }
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  test("every consequential capability declares idempotency and audit behavior", () => {
    for (const capability of MCP_CAPABILITIES) {
      if (capability.effect === "read") {
        expect(capability.auditAction).toBeNull();
        continue;
      }
      expect(capability.idempotency).not.toBe("none");
      expect(capability.auditAction).toBeString();
    }
  });

  test("explicit exclusions still exist in OpenAPI", () => {
    const operations = readOpenApiOperations();
    for (const operationId of Object.keys(INTENTIONALLY_EXCLUDED)) {
      expect(operations.has(operationId)).toBe(true);
    }
  });
});
