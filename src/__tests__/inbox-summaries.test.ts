import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, test } from "bun:test";
import { ShipMailClient } from "shipmail";

import { toInboxMessageSummaries } from "../inbox-summaries.js";
import { registerTools } from "../tools.js";

// A page of full inbox messages from a real mailbox is multiple megabytes,
// which exceeds MCP host tool-result budgets. The list tool must return
// summaries and leave full bodies to the single-message tool.

const MAILBOX_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const LARGE_BODY = "x".repeat(200_000);

function fullMessagePayload(id: string) {
  return {
    object: "inbox_message_full",
    id,
    thread_id: `thread-${id}`,
    mailbox_id: MAILBOX_ID,
    address: "valerian@example.com",
    folder_ids: ["folder-inbox"],
    keywords: { $seen: true },
    from: [{ name: "Sender", email: "sender@example.com" }],
    to: [{ name: null, email: "valerian@example.com" }],
    subject: `Newsletter ${id}`,
    received_at: "2026-07-20T10:00:00Z",
    preview: "A short preview of the message",
    has_attachment: false,
    size: LARGE_BODY.length,
    cc: null,
    reply_to: null,
    message_id: [`<${id}@example.com>`],
    in_reply_to: null,
    references: null,
    body_values: { "1": { value: LARGE_BODY, is_encoding_problem: false } },
    text_body: [{ part_id: "1", type: "text/plain" }],
    html_body: [{ part_id: "2", type: "text/html" }],
    attachments: [],
  };
}

function inboxMessagesPayload(count: number) {
  return {
    object: "inbox_messages",
    mailbox_id: MAILBOX_ID,
    address: "valerian@example.com",
    data: Array.from({ length: count }, (_, index) => fullMessagePayload(`msg-${index}`)),
    pagination: { limit: count, total: 7334, has_more: true, next_cursor: "cursor-1" },
  };
}

async function buildPair(responder: () => unknown) {
  const shipmail = new ShipMailClient({
    apiKey: "sk_test",
    baseUrl: "https://shipmail.to/api/v1",
    maxRetries: 0,
    fetch: (async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(responder()), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, shipmail, undefined);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("toInboxMessageSummaries", () => {
  test("strips body content and remaps items to the summary object", () => {
    const summaries = toInboxMessageSummaries(inboxMessagesPayload(3) as never);
    expect(summaries.data).toHaveLength(3);
    for (const item of summaries.data) {
      expect(item.object).toBe("inbox_message");
      expect(item).not.toContainKeys(["body_values", "text_body", "html_body", "attachments"]);
      expect(item.preview).toBe("A short preview of the message");
    }
    expect(summaries.pagination.next_cursor).toBe("cursor-1");
  });
});

describe("shipmail_list_mailbox_inbox_messages", () => {
  test("returns summaries small enough for MCP tool-result budgets", async () => {
    const client = await buildPair(() => inboxMessagesPayload(50));
    const result = await client.callTool({
      name: "shipmail_list_mailbox_inbox_messages",
      arguments: { id: MAILBOX_ID, limit: 50 },
    });
    expect(result.isError ?? false).toBe(false);

    const structured = result.structuredContent as {
      inbox_messages: { data: Record<string, unknown>[]; pagination: { total: number } };
    };
    expect(structured.inbox_messages.data).toHaveLength(50);
    expect(structured.inbox_messages.pagination.total).toBe(7334);
    for (const item of structured.inbox_messages.data) {
      expect(item["object"]).toBe("inbox_message");
      expect(item["body_values"]).toBeUndefined();
      expect(item["text_body"]).toBeUndefined();
      expect(item["html_body"]).toBeUndefined();
    }

    // 50 messages whose bodies are ~200KB each must not leak into the result.
    const textContent = result.content as { type: string; text: string }[];
    expect(textContent[0]?.text.length ?? 0).toBeLessThan(100_000);
  });
});
