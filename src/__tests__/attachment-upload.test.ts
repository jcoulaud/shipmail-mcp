import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, test } from "bun:test";
import { ShipmailClient } from "shipmail";

import { stagedAttachmentUploadPreparationOutputSchema } from "../schemas.js";
import { registerTools } from "../tools.js";

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function buildPair(testFetch: TestFetch) {
  const fetchImpl = Object.assign(testFetch, {
    preconnect() {},
  });
  const shipmail = new ShipmailClient({
    apiKey: "sk_test",
    baseUrl: "https://shipmail.to/api/v1",
    maxRetries: 0,
    fetch: fetchImpl,
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, shipmail, new Set(["shipmail_prepare_staged_attachment_upload"]));
  const client = new Client({ name: "test-client", version: "0.0.0" });
  return { server, client };
}

async function connectPair(server: McpServer, client: Client): Promise<void> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
}

describe("local-file attachment upload", () => {
  test("returns the one-time upload contract to the MCP client and the review component", async () => {
    const uploadUrl = "https://shipmail.to/api/v1/staged-attachment-uploads/upload_token";
    const { server, client } = buildPair(async (input, init) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/v1/mailboxes/mbx_123/staged-attachment-upload-tokens");
      expect(init?.method).toBe("POST");
      return Response.json({
        object: "staged_attachment_upload",
        mailbox_id: "mbx_123",
        filename: "invoice.pdf",
        content_type: "application/pdf",
        size: 123,
        sha256: "a".repeat(64),
        upload_url: uploadUrl,
        expires_at: "2026-07-25T22:05:00.000Z",
      });
    });
    await connectPair(server, client);

    const tools = await client.listTools();
    const uploadTool = tools.tools.find(
      (tool) => tool.name === "shipmail_prepare_staged_attachment_upload",
    );
    expect(uploadTool).toBeDefined();
    expect(uploadTool?._meta?.["openai/visibility"]).toBeUndefined();

    const result = await client.callTool({
      name: "shipmail_prepare_staged_attachment_upload",
      arguments: {
        mailbox_id: "mbx_123",
        filename: "invoice.pdf",
        content_type: "application/pdf",
        size: 123,
        sha256: "a".repeat(64),
      },
    });

    expect(result.isError).toBeFalsy();
    const output = stagedAttachmentUploadPreparationOutputSchema.parse(result.structuredContent);
    expect(output.prepared_upload).toMatchObject({
      upload_url: uploadUrl,
      upload_method: "POST",
    });
    expect(result._meta).toMatchObject({ upload_url: uploadUrl });
  });
});
