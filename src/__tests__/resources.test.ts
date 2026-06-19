import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, test } from "bun:test";
import { ShipMailClient } from "shipmail";

import { registerResources } from "../resources.js";

type StubFetch = (...args: Parameters<typeof fetch>) => Promise<Response>;

function buildPair(fetchImpl: StubFetch) {
  const shipmail = new ShipMailClient({
    apiKey: "sk_test",
    baseUrl: "https://api.test/v1",
    maxRetries: 0,
    fetch: fetchImpl as typeof fetch,
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerResources(server, shipmail);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  return { server, client };
}

async function connectPair(server: McpServer, client: Client) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
}

function textContent(result: Awaited<ReturnType<Client["readResource"]>>): string {
  const first = result.contents[0];
  if (!first || !("text" in first)) {
    throw new Error("expected text resource content");
  }
  return first.text;
}

describe("MCP resources", () => {
  test("lists mailbox inbox, folders, identities, and rules resource templates", async () => {
    const { server, client } = buildPair(async () => Response.json({}));
    await connectPair(server, client);

    const result = await client.listResourceTemplates();
    const templates = result.resourceTemplates.map((template) => template.uriTemplate);

    expect(templates).toContain("shipmail://mailboxes/{id}/folders");
    expect(templates).toContain("shipmail://mailboxes/{id}/identities");
    expect(templates).toContain("shipmail://mailboxes/{id}/rules");
    expect(templates).toContain("shipmail://mailboxes/{id}/inbox/messages");
    expect(templates).toContain("shipmail://mailboxes/{id}/inbox/threads/{thread_id}");
  });

  test("reads mailbox rules as sanitized JSON", async () => {
    const calls: URL[] = [];
    const { server, client } = buildPair(async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      expect(url.pathname).toBe("/v1/mailboxes/mbx_123/rules");
      return Response.json({
        object: "mailbox_rules",
        mailbox_id: "mbx_123",
        address: "support@example.com",
        rules: [],
        folders: [],
      });
    });
    await connectPair(server, client);

    const result = await client.readResource({
      uri: "shipmail://mailboxes/mbx_123/rules",
    });

    expect(calls).toHaveLength(1);
    expect(JSON.parse(textContent(result))).toEqual({
      object: "mailbox_rules",
      mailbox_id: "mbx_123",
      address: "support@example.com",
      rules: [],
      folders: [],
    });
  });

  test("reads the first page of mailbox inbox messages", async () => {
    const calls: URL[] = [];
    const { server, client } = buildPair(async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      expect(url.pathname).toBe("/v1/mailboxes/mbx_123/inbox/messages");
      expect(url.searchParams.get("limit")).toBe("25");
      return Response.json({
        object: "inbox_messages",
        mailbox_id: "mbx_123",
        address: "support@example.com",
        data: [],
        pagination: {
          position: 0,
          limit: 25,
          total: 0,
          has_more: false,
          next_position: null,
        },
      });
    });
    await connectPair(server, client);

    const result = await client.readResource({
      uri: "shipmail://mailboxes/mbx_123/inbox/messages",
    });

    expect(calls).toHaveLength(1);
    expect(JSON.parse(textContent(result))).toEqual({
      object: "inbox_messages",
      mailbox_id: "mbx_123",
      address: "support@example.com",
      data: [],
      pagination: {
        position: 0,
        limit: 25,
        total: 0,
        has_more: false,
        next_position: null,
      },
    });
  });
});
