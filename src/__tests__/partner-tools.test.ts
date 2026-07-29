import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, test } from "bun:test";
import { ShipMailClient } from "shipmail";

import { registerTools } from "../tools.js";

type CapturedRequest = {
  readonly url: URL;
  readonly method: string;
  readonly headers: Headers;
  readonly body: unknown;
};

function partnerOrganization() {
  return {
    object: "partner_organization",
    id: "pch_0123456789abcdefghjkmnpq",
    organization_id: "00000000-0000-4000-8000-000000000123",
    name: "Operator",
    external_reference: "operator_123",
    owner_email: "owner@example.com",
    owner_user_id: null,
    status: "pending_owner",
    data_classification: "internal_test",
    mailbox_limit: 3,
    delegated_permissions: ["domains:read"],
    owner_accepted_at: null,
    activated_at: null,
    suspended_at: null,
    disconnected_at: null,
    created_at: "2026-07-14T00:00:00.000Z",
    updated_at: "2026-07-14T00:00:00.000Z",
  };
}

async function buildPair(captured: CapturedRequest[]) {
  const shipmail = new ShipMailClient({
    apiKey: "sm_live_partner",
    baseUrl: "https://shipmail.to/api/v1",
    maxRetries: 0,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const request = {
        url: new URL(String(input)),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      };
      captured.push(request);
      return Response.json(
        {
          ...partnerOrganization(),
          ownership_invitation: {
            object: "partner_ownership_invitation",
            owner_email: "owner@example.com",
            email_sent: true,
            expires_at: "2026-07-21T00:00:00.000Z",
          },
        },
        { status: 201 },
      );
    }) as typeof fetch,
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, shipmail, undefined);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("partner MCP tools", () => {
  test("creates a child and preserves invitation status", async () => {
    const captured: CapturedRequest[] = [];
    const client = await buildPair(captured);
    const result = await client.callTool({
      name: "shipmail_create_partner_organization",
      arguments: {
        name: "Operator",
        external_reference: "operator_123",
        owner_email: "owner@example.com",
        mailbox_limit: 3,
        data_classification: "internal_test",
        idempotency_key: "operator-123",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(captured[0]?.url.pathname).toBe("/api/v1/partner/organizations");
    expect(captured[0]?.method).toBe("POST");
    expect(captured[0]?.headers.get("Idempotency-Key")).toBe("operator-123");
    expect(captured[0]?.body).toEqual({
      name: "Operator",
      external_reference: "operator_123",
      owner_email: "owner@example.com",
      mailbox_limit: 3,
      data_classification: "internal_test",
    });
    const structured = result.structuredContent as {
      organization?: { ownership_invitation?: { email_sent?: boolean } };
    };
    expect(structured.organization?.ownership_invitation?.email_sent).toBe(true);
  });
});
