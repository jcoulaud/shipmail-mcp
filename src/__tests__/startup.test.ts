import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, spyOn, test } from "bun:test";
import { type CapabilitiesResponse, ShipMailClient } from "shipmail";

import { MCP_CAPABILITY_VERSION, MCP_TOOL_NAMES } from "../capabilities.js";
import { createShipMailMcpServer } from "../server.js";
import { resolveAllowedTools } from "../startup.js";

function capabilitiesResponse(
  capabilityVersion: string,
  allowedMcpTools: readonly string[],
): CapabilitiesResponse {
  return {
    capability_version: capabilityVersion,
    scopes: [],
    constraints: {
      mailbox_ids: null,
      domain_ids: null,
      audience_ids: null,
      allowed_recipient_addresses: null,
      allowed_recipient_domains: null,
    },
    allowed_mcp_tools: allowedMcpTools,
    transactional_recipient_budget: {
      unlimited: true,
      limit: null,
      used: 0,
      remaining: null,
      window_hours: 24,
    },
    undo_hold_seconds: 0,
  };
}

function clientWithResponse(response: CapabilitiesResponse): ShipMailClient {
  return new ShipMailClient({
    apiKey: "sm_test",
    baseUrl: "https://shipmail.to/api/v1",
    maxRetries: 0,
    fetch: Object.assign(async () => Response.json(response), {
      preconnect(_url: string | URL): void {},
    }),
  });
}

describe("MCP startup capability discovery", () => {
  test("keeps capability filtering and missing-tool warnings unchanged on success", async () => {
    const warnings: string[] = [];
    const client = clientWithResponse(
      capabilitiesResponse(MCP_CAPABILITY_VERSION, [
        "shipmail_status",
        "shipmail_list_domains",
        "shipmail_future_tool",
      ]),
    );

    const allowedTools = await resolveAllowedTools(client, (warning) => warnings.push(warning));

    expect([...allowedTools]).toEqual(["shipmail_status", "shipmail_list_domains"]);
    expect(warnings).toEqual([
      "ShipMail allows tools not implemented by this shipmail-mcp version: shipmail_future_tool. Upgrade to use them.",
    ]);
  });

  test("starts with every local tool and warns when capabilities cannot be fetched", async () => {
    const failingClient = new ShipMailClient({
      apiKey: "invalid",
      baseUrl: "https://shipmail.to/api/v1",
      maxRetries: 0,
      fetch: Object.assign(
        async (): Promise<Response> => {
          throw new Error("Invalid or expired\nAPI key");
        },
        { preconnect(_url: string | URL): void {} },
      ),
    });
    const stderrWrite = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const allowedTools = await resolveAllowedTools(failingClient);
      expect(stderrWrite).toHaveBeenCalledTimes(1);
      expect(stderrWrite).toHaveBeenCalledWith(
        "Could not fetch ShipMail capabilities (Invalid or expired API key). The tool list is unverified and calls may fail.\n",
      );

      const server = createShipMailMcpServer(
        { apiKey: "invalid", baseUrl: undefined, organizationId: undefined },
        allowedTools,
      );
      const client = new Client({ name: "test-client", version: "0.0.0" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
      try {
        const registeredTools = (await client.listTools()).tools.map((tool) => tool.name).sort();
        expect(registeredTools).toEqual([...MCP_TOOL_NAMES].sort());
      } finally {
        await Promise.all([client.close(), server.close()]);
      }
    } finally {
      stderrWrite.mockRestore();
    }
  });

  test("still rejects a successfully fetched incompatible capability version", async () => {
    const client = clientWithResponse(capabilitiesResponse("999.0", ["shipmail_status"]));

    await expect(resolveAllowedTools(client)).rejects.toThrow(
      "ShipMail capability version 999.0 is incompatible with this shipmail-mcp version.",
    );
  });
});
