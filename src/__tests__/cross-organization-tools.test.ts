import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, test } from "bun:test";
import { ShipmailClient } from "shipmail";
import { z } from "zod/v4";

import { getMcpCapability } from "../capabilities.js";
import {
  CROSS_ORGANIZATION_LIST_BEHAVIORS,
  type CrossOrganizationGrant,
  registerCrossOrganizationTools,
} from "../cross-organization-tools.js";

const mockDomain = {
  object: "domain",
  id: "dom_123",
  name: "example.com",
  status: "verified",
  managed_by: "external",
  dns_provider: null,
  mx_verified: true,
  spf_verified: true,
  dkim_verified: true,
  dmarc_verified: true,
  dmarc_managed_externally: false,
  outbound_verified: true,
  catch_all_mailbox_id: null,
  verified_at: "2025-01-01T00:00:00Z",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const page = {
  data: [mockDomain],
  pagination: {
    next_cursor: "next_page",
    has_more: true,
    limit: 25,
  },
};

type StubFetch = (...args: Parameters<typeof fetch>) => Promise<Response>;

function stubFetch(handler: StubFetch): typeof fetch {
  return Object.assign(handler, {
    preconnect(_url: string | URL): void {
      // Tests never preconnect; the property keeps the stub aligned with Bun's fetch type.
    },
  });
}

function grant(
  id: string,
  fetchImpl: typeof fetch,
  allowedTools: ReadonlySet<string> = new Set(["shipmail_list_domains"]),
): CrossOrganizationGrant {
  return {
    id,
    name: `Organization ${id}`,
    allowedTools,
    client: new ShipmailClient({
      apiKey: `sm_test_${id}`,
      baseUrl: "https://shipmail.test/api/v1",
      maxRetries: 0,
      fetch: fetchImpl,
    }),
  };
}

async function connectedClient(grants: readonly CrossOrganizationGrant[]) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerCrossOrganizationTools(server, grants);
  // McpServer installs the tools/list handler lazily on the first registration. Keep the handler
  // present so a session with no cross-organization tools can still be asserted as an empty
  // Shipmail catalog.
  server.registerTool("test_marker", {}, async () => ({
    content: [{ type: "text", text: "test" }],
  }));
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

const organizationResultSchema = z.object({
  organizations: z.array(
    z.discriminatedUnion("status", [
      z.object({
        organization: z.object({ id: z.string(), name: z.string() }),
        status: z.literal("ok"),
        data: z.array(z.unknown()),
        pagination: z.object({
          next_cursor: z.string().nullable(),
          has_more: z.boolean(),
          limit: z.number(),
        }),
      }),
      z.object({
        organization: z.object({ id: z.string(), name: z.string() }),
        status: z.literal("error"),
        error: z.object({
          type: z.string(),
          message: z.string(),
          status: z.number().nullable(),
          request_id: z.string().nullable(),
          retryable: z.boolean(),
        }),
      }),
    ]),
  ),
});

describe("cross-organization tool allowlist", () => {
  test("contains only the organization-rooted list operations audited for fan-out", () => {
    expect(CROSS_ORGANIZATION_LIST_BEHAVIORS.map((behavior) => behavior.toolName)).toEqual([
      "shipmail_list_domains_across_organizations",
      "shipmail_list_mailboxes_across_organizations",
      "shipmail_list_webhooks_across_organizations",
      "shipmail_list_suppressions_across_organizations",
      "shipmail_list_newsletters_across_organizations",
      "shipmail_list_newsletter_domains_across_organizations",
      "shipmail_list_newsletter_sender_identities_across_organizations",
      "shipmail_list_newsletter_assets_across_organizations",
      "shipmail_list_audiences_across_organizations",
      "shipmail_list_booking_pages_across_organizations",
    ]);

    for (const behavior of CROSS_ORGANIZATION_LIST_BEHAVIORS) {
      expect(getMcpCapability(behavior.baseToolName)).toMatchObject({
        effect: "read",
        transports: { hostedOAuth: true },
      });
    }
  });

  test("is not registered for a single-organization or direct-key session", async () => {
    const fetchImpl = stubFetch(async () => Response.json(page));
    const { server, client } = await connectedClient([grant("org_a", fetchImpl)]);
    const listed = await client.listTools();
    expect(listed.tools.filter((tool) => tool.name.startsWith("shipmail_"))).toEqual([]);
    await Promise.all([client.close(), server.close()]);
  });

  test("advertises only aggregators whose base tool is allowed by at least one grant", async () => {
    const fetchImpl = stubFetch(async () => Response.json(page));
    const grants = [grant("org_a", fetchImpl), grant("org_b", fetchImpl, new Set())];
    const { server, client } = await connectedClient(grants);
    const listed = await client.listTools();
    const shipmailTools = listed.tools.filter((tool) => tool.name.startsWith("shipmail_"));
    expect(shipmailTools.map((tool) => tool.name)).toEqual([
      "shipmail_list_domains_across_organizations",
    ]);
    expect(shipmailTools[0]?.inputSchema.properties?.["organization_id"]).toBeUndefined();
    expect(shipmailTools[0]?.inputSchema.properties?.["cursor_by_organization"]).toBeDefined();
    await Promise.all([client.close(), server.close()]);
  });
});

describe("cross-organization list execution", () => {
  test("returns every organization, including per-grant permission and API failures", async () => {
    const successFetch = stubFetch(async () => Response.json(page));
    const failedFetch = stubFetch(async () =>
      Response.json(
        {
          error: {
            type: "rate_limit_error",
            message: "Try again later.",
            request_id: "req_limited",
            retry_after: 10,
          },
        },
        { status: 429 },
      ),
    );
    let deniedCalls = 0;
    const deniedFetch = stubFetch(async () => {
      deniedCalls += 1;
      return Response.json(page);
    });
    const grants = [
      grant("org_ok", successFetch),
      grant("org_denied", deniedFetch, new Set()),
      grant("org_failed", failedFetch),
    ];
    const { server, client } = await connectedClient(grants);

    const result = await client.callTool({
      name: "shipmail_list_domains_across_organizations",
      arguments: {},
    });
    const output = organizationResultSchema.parse(result.structuredContent);

    expect(result.isError).toBeFalsy();
    expect(output.organizations.map((section) => section.organization.id)).toEqual([
      "org_ok",
      "org_denied",
      "org_failed",
    ]);
    expect(output.organizations.map((section) => section.status)).toEqual(["ok", "error", "error"]);
    expect(deniedCalls).toBe(0);
    expect(output.organizations[1]).toMatchObject({
      status: "error",
      error: { type: "authorization_error", status: 403 },
    });
    expect(output.organizations[2]).toMatchObject({
      status: "error",
      error: {
        type: "rate_limit_error",
        status: 429,
        request_id: "req_limited",
        retryable: true,
      },
    });
    await Promise.all([client.close(), server.close()]);
  });

  test("uses independent cursors and never runs more than four grant calls concurrently", async () => {
    let active = 0;
    let maximumActive = 0;
    const seenCursors = new Map<string, string | null>();
    const grants = Array.from({ length: 6 }, (_, index) => {
      const id = `org_${index}`;
      const fetchImpl = stubFetch(async (input) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const url = new URL(
          typeof input === "string" || input instanceof URL ? input.toString() : input.url,
        );
        seenCursors.set(id, url.searchParams.get("cursor"));
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return Response.json(page);
      });
      return grant(id, fetchImpl);
    });
    const { server, client } = await connectedClient(grants);

    const result = await client.callTool({
      name: "shipmail_list_domains_across_organizations",
      arguments: {
        limit: 25,
        cursor_by_organization: {
          org_1: "cursor_one",
          org_5: "cursor_five",
        },
      },
    });
    const output = organizationResultSchema.parse(result.structuredContent);

    expect(output.organizations).toHaveLength(6);
    expect(maximumActive).toBe(4);
    expect(seenCursors.get("org_0")).toBeNull();
    expect(seenCursors.get("org_1")).toBe("cursor_one");
    expect(seenCursors.get("org_5")).toBe("cursor_five");
    await Promise.all([client.close(), server.close()]);
  });

  test("does not expose untrusted internal upstream messages", async () => {
    const failedFetch = stubFetch(async () =>
      Response.json(
        {
          error: {
            type: "internal_error",
            message: "database_url=postgres://secret@private/db",
            request_id: "req_safe",
          },
        },
        { status: 500 },
      ),
    );
    const grants = [grant("org_a", failedFetch), grant("org_b", failedFetch)];
    const { server, client } = await connectedClient(grants);

    const result = await client.callTool({
      name: "shipmail_list_domains_across_organizations",
      arguments: {},
    });
    const serialized = JSON.stringify(result.structuredContent);

    expect(serialized).not.toContain("postgres://");
    expect(serialized).toContain("req_safe");
    await Promise.all([client.close(), server.close()]);
  });
});
