import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, test } from "bun:test";
import { ShipMailClient } from "shipmail";

import { registerTools } from "../tools.js";

type CapturedRequest = {
  readonly url: URL;
  readonly method: string;
  readonly headers: Headers;
  readonly body: unknown;
};

function appPassword(extra: Record<string, unknown> = {}) {
  return {
    object: "mailbox_app_password",
    id: "appwd_0123456789abcdefghjkmnpq",
    mailbox_id: "mbx_0123456789abcdefghjkmnpq",
    name: "Desktop mail",
    state: "active",
    purpose: "operator_client",
    expires_at: "2026-10-01T00:00:00.000Z",
    allowed_cidrs: ["203.0.113.0/24"],
    last_used_at: null,
    created_at: "2026-07-15T00:00:00.000Z",
    revoked_at: null,
    ...extra,
  };
}

async function buildPair(captured: CapturedRequest[]) {
  const shipmail = new ShipMailClient({
    apiKey: "sm_live_test",
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
      if (request.method === "DELETE") return new Response(null, { status: 204 });
      if (
        request.method === "GET" &&
        request.url.pathname.endsWith("/partner/mailbox-credential-grants")
      ) {
        return Response.json({
          object: "list",
          data: [
            {
              object: "partner_mailbox_credential_grant",
              id: "pcg_0123456789abcdefghjkmnpq",
              partner_organization_id: "pco_0123456789abcdefghjkmnpq",
              organization_id: "org_0123456789abcdefghjkmnpq",
              organization_name: "Marketstead operator",
              external_reference: "operator_123",
              operator_email: "owner@example.com",
              mailbox_id: "mbx_0123456789abcdefghjkmnpq",
              mailbox_address: "hello@example.com",
              disclosure_version: "2026-07-14",
              expires_at: "2026-07-16T15:10:00.000Z",
              consented_at: "2026-07-16T15:00:00.000Z",
            },
          ],
        });
      }
      if (request.url.pathname.includes("/partner/mailbox-credential-grants/")) {
        return Response.json(
          appPassword({
            purpose: "partner_embedded_webmail",
            secret: "partner-secret-once",
            operator_notified: true,
          }),
          { status: 201 },
        );
      }
      if (request.method === "POST") {
        return Response.json(appPassword({ secret: "operator-secret-once" }), { status: 201 });
      }
      return Response.json({ object: "list", data: [appPassword()] });
    }) as typeof fetch,
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, shipmail, undefined);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("mailbox app-password MCP tools", () => {
  test("lists, creates, revokes, and consumes a partner grant", async () => {
    const captured: CapturedRequest[] = [];
    const client = await buildPair(captured);
    const mailboxId = "mbx_0123456789abcdefghjkmnpq";
    const appPasswordId = "appwd_0123456789abcdefghjkmnpq";
    const tools = await client.listTools();
    expect(
      tools.tools.find((tool) => tool.name === "shipmail_create_mailbox_app_password")?.annotations
        ?.idempotentHint,
    ).toBe(false);
    expect(
      tools.tools.find((tool) => tool.name === "shipmail_consume_partner_mailbox_credential_grant")
        ?.annotations?.idempotentHint,
    ).toBe(false);

    const listed = await client.callTool({
      name: "shipmail_list_mailbox_app_passwords",
      arguments: { id: mailboxId },
    });
    const created = await client.callTool({
      name: "shipmail_create_mailbox_app_password",
      arguments: {
        id: mailboxId,
        name: "Desktop mail",
        expires_at: "2026-10-01T00:00:00.000Z",
        allowed_cidrs: ["203.0.113.0/24"],
      },
    });
    const revoked = await client.callTool({
      name: "shipmail_revoke_mailbox_app_password",
      arguments: { id: mailboxId, app_password_id: appPasswordId },
    });
    const grants = await client.callTool({
      name: "shipmail_list_partner_mailbox_credential_grants",
      arguments: {},
    });
    const consumed = await client.callTool({
      name: "shipmail_consume_partner_mailbox_credential_grant",
      arguments: {
        grant_id: "pcg_0123456789abcdefghjkmnpq",
        name: "Marketstead webmail",
      },
    });

    expect(listed.isError).toBeFalsy();
    expect(created.isError).toBeFalsy();
    expect(revoked.isError).toBeFalsy();
    expect(grants.isError).toBeFalsy();
    expect(consumed.isError).toBeFalsy();
    expect(captured.map((request) => `${request.method} ${request.url.pathname}`)).toEqual([
      `GET /api/v1/mailboxes/${mailboxId}/app-passwords`,
      `POST /api/v1/mailboxes/${mailboxId}/app-passwords`,
      `DELETE /api/v1/mailboxes/${mailboxId}/app-passwords/${appPasswordId}`,
      "GET /api/v1/partner/mailbox-credential-grants",
      "POST /api/v1/partner/mailbox-credential-grants/pcg_0123456789abcdefghjkmnpq/consume",
    ]);
    expect(captured[1]?.headers.get("Idempotency-Key")).toBeNull();
    expect(captured[1]?.body).toEqual({
      name: "Desktop mail",
      expires_at: "2026-10-01T00:00:00.000Z",
      allowed_cidrs: ["203.0.113.0/24"],
    });
    expect(captured[4]?.headers.get("Idempotency-Key")).toBeNull();
    expect(
      (created.structuredContent as { app_password?: { secret?: string } }).app_password?.secret,
    ).toBe("operator-secret-once");
    expect(
      (consumed.structuredContent as { credential?: { operator_notified?: boolean } }).credential
        ?.operator_notified,
    ).toBe(true);
  });
});
