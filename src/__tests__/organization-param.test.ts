import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, test } from "bun:test";
import { ShipmailClient } from "shipmail";

import { registerTools } from "../tools.js";

// A connection covering several organizations must advertise organization_id on its tools, or the
// model has no way to discover how to disambiguate a call. The first implementation spread Zod
// object schemas instead of extending them, which silently added the parameter to nothing; only a
// real tools/list over a transport caught it, so this asserts against the advertised schema.
async function listTools(organizationIds: readonly string[]) {
  const orgs = organizationIds.map((id) => ({ id, name: `Org ${id}` }));
  const shipmail = new ShipmailClient({
    apiKey: "sk_test",
    baseUrl: "https://shipmail.to/api/v1",
    maxRetries: 0,
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, shipmail, undefined, orgs);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  return tools;
}

type ListedTool = Awaited<ReturnType<typeof listTools>>[number];

const takesInput = (tool: ListedTool): boolean =>
  Object.keys(tool.inputSchema?.properties ?? {}).length > 0;

describe("organization_id tool parameter", () => {
  test("is advertised on every input-taking tool for a multi-organization connection", async () => {
    const tools = await listTools(["org_a", "org_b"]);
    expect(tools.length).toBeGreaterThan(0);

    const missing = tools
      .filter(takesInput)
      .filter((tool) => !tool.inputSchema?.properties?.["organization_id"]);
    expect(missing.map((tool) => tool.name)).toEqual([]);
  });

  test("names the available organizations so the model can pick one", async () => {
    const tools = await listTools(["org_a", "org_b"]);
    const withParam = tools.find((tool) => tool.inputSchema?.properties?.["organization_id"]);
    const organizationSchema = withParam?.inputSchema?.properties?.["organization_id"];
    const description =
      typeof organizationSchema === "object" &&
      organizationSchema !== null &&
      "description" in organizationSchema &&
      typeof organizationSchema.description === "string"
        ? organizationSchema.description
        : undefined;
    expect(description).toContain("org_a");
    expect(description).toContain("org_b");
  });

  test("keeps the tool's own arguments intact alongside the injected one", async () => {
    const tools = await listTools(["org_a", "org_b"]);
    const getMailbox = tools.find((tool) => tool.name === "shipmail_get_mailbox");
    const props = Object.keys(getMailbox?.inputSchema?.properties ?? {});
    expect(props).toContain("organization_id");
    // Extending must not drop the schema it extended.
    expect(props.length).toBeGreaterThan(1);
  });

  // Single-organization connections have nothing to disambiguate, so the parameter would be noise.
  test("is absent for a single-organization connection", async () => {
    const tools = await listTools(["org_only"]);
    const withParam = tools.filter((tool) => tool.inputSchema?.properties?.["organization_id"]);
    expect(withParam).toEqual([]);
  });

  test("is absent when no organizations are supplied (direct API key sessions)", async () => {
    const tools = await listTools([]);
    const withParam = tools.filter((tool) => tool.inputSchema?.properties?.["organization_id"]);
    expect(withParam).toEqual([]);
  });
});

describe("organizations reported by shipmail_status", () => {
  // The router's ambiguity error names organization ids; status is what turns them into names,
  // and it is available on every profile so a caller is never stuck.
  test("status advertises an organizations field", async () => {
    const tools = await listTools(["org_a", "org_b"]);
    const status = tools.find((tool) => tool.name === "shipmail_status");
    expect(status).toBeDefined();
  });

  test("no standalone organization-listing tool is registered", async () => {
    const tools = await listTools(["org_a", "org_b"]);
    expect(tools.find((tool) => tool.name === "shipmail_list_organizations")).toBeUndefined();
  });
});
