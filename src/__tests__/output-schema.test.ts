import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, test } from "bun:test";
import { ShipMailClient } from "shipmail";

import { registerTools } from "../tools.js";

// End-to-end test that the runtime outputSchema validation is wired up:
// when the upstream API returns a payload that does not match the declared
// MCP outputSchema, the tool MUST surface an error to the LLM client rather
// than forwarding the unvalidated content. This is the architect's "advertised
// but never enforced" gap; this test guards against regression.

type StubFetch = (...args: Parameters<typeof fetch>) => Promise<Response>;

function buildPair(fetchImpl: StubFetch) {
  const shipmail = new ShipMailClient({
    apiKey: "sk_test",
    baseUrl: "https://shipmail.to/api/v1",
    maxRetries: 0,
    fetch: fetchImpl as typeof fetch,
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, shipmail, undefined);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  return { server, client };
}

async function connectPair(server: McpServer, client: Client) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
}

function jsonFetch(payload: unknown, status = 200): StubFetch {
  return async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
}

function getTextContent(content: unknown): string {
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error("expected at least one content block");
  }
  const first = content[0] as { type?: string; text?: string };
  if (first.type !== "text" || typeof first.text !== "string") {
    throw new Error("expected first content block to be text");
  }
  return first.text;
}

describe("runtime outputSchema enforcement", () => {
  test("rejects upstream payload that does not match declared output schema", async () => {
    // shipmail_status expects { status: { status, version, time, request_id } }.
    // Hand it a payload that is missing every field the schema requires.
    const { server, client } = buildPair(jsonFetch({ ok: true, garbage: "data" }));
    await connectPair(server, client);

    const result = await client.callTool({ name: "shipmail_status", arguments: {} });

    expect(result.isError).toBe(true);
    const text = getTextContent(result.content);
    expect(text).toMatch(/unexpected response shape/);
    // The schema-violation marker is stripped before reaching the LLM.
    expect(text).not.toContain("[mcp.schema_violation]");
  });

  test("forwards a well-formed upstream payload through the schema", async () => {
    const valid = {
      status: "ok",
      version: "0.0.1",
      time: "2026-05-09T00:00:00Z",
      request_id: "req_abc",
    };
    const { server, client } = buildPair(jsonFetch(valid));
    await connectPair(server, client);

    const result = await client.callTool({ name: "shipmail_status", arguments: {} });

    expect(result.isError).toBeFalsy();
    const sc = (result.structuredContent ?? {}) as { status?: typeof valid };
    expect(sc.status).toEqual(valid);
  });

  test("schema violation does not leak the malformed payload to the LLM", async () => {
    // Defense-in-depth: even when the upstream returns secret-looking content
    // mixed with a wrong shape, the error path must not echo the payload back.
    const malformed = {
      api_key: "shipmail_test_key_should_never_leak",
      database_url: "postgres://user:pw@private.host/db",
      stack: "Error: ...",
    };
    const { server, client } = buildPair(jsonFetch(malformed));
    await connectPair(server, client);

    const result = await client.callTool({ name: "shipmail_status", arguments: {} });
    const text = getTextContent(result.content);

    expect(text).not.toContain("shipmail_test_key_should_never_leak");
    expect(text).not.toContain("postgres://");
    expect(text).not.toContain("user:pw");
  });
});
