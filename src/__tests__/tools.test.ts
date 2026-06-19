import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, test } from "bun:test";
import { ShipMailClient } from "shipmail";

import { registerTools, type ToolRegistrationResult } from "../tools.js";

function setup(selected?: ReadonlySet<string>): {
  server: McpServer;
  client: ShipMailClient;
  result: ToolRegistrationResult;
} {
  const client = new ShipMailClient({
    apiKey: "sk_test",
    baseUrl: "https://shipmail.to/api/v1",
    maxRetries: 0,
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  const result = registerTools(server, client, selected);
  return { server, client, result };
}

describe("registerTools", () => {
  test("registers all known tools when no allowlist is given", () => {
    const { result } = setup();
    expect(result.knownTools.length).toBeGreaterThan(0);
    expect(result.enabledTools).toEqual(result.knownTools);
  });

  test("includes all expected tool names", () => {
    const { result } = setup();
    const expected = [
      "shipmail_status",
      "shipmail_list_domains",
      "shipmail_get_domain",
      "shipmail_create_domain",
      "shipmail_update_domain",
      "shipmail_delete_domain",
      "shipmail_verify_domain",
      "shipmail_search_domains",
      "shipmail_list_mailboxes",
      "shipmail_get_mailbox",
      "shipmail_create_mailbox",
      "shipmail_update_mailbox",
      "shipmail_delete_mailbox",
      "shipmail_list_mailbox_folders",
      "shipmail_create_mailbox_folder",
      "shipmail_update_mailbox_folder",
      "shipmail_delete_mailbox_folder",
      "shipmail_list_mailbox_identities",
      "shipmail_list_mailbox_inbox_messages",
      "shipmail_get_mailbox_inbox_thread",
      "shipmail_update_inbox_message",
      "shipmail_move_inbox_message",
      "shipmail_delete_inbox_message",
      "shipmail_get_mailbox_rules",
      "shipmail_set_mailbox_rules",
      "shipmail_reset_mailbox_password",
      "shipmail_set_auto_reply",
      "shipmail_set_spam_filter",
      "shipmail_create_mailbox_import",
      "shipmail_list_mailbox_imports",
      "shipmail_get_mailbox_import",
      "shipmail_cancel_mailbox_import",
      "shipmail_undo_mailbox_import",
      "shipmail_list_messages",
      "shipmail_get_message",
      "shipmail_send_message",
      "shipmail_reply_to_message",
      "shipmail_list_threads",
      "shipmail_get_thread",
      "shipmail_reply_to_thread",
      "shipmail_list_webhooks",
      "shipmail_get_webhook",
      "shipmail_create_webhook",
      "shipmail_update_webhook",
      "shipmail_delete_webhook",
      "shipmail_rotate_webhook_secret",
      "shipmail_test_webhook",
      "shipmail_list_webhook_deliveries",
      "shipmail_list_suppressions",
      "shipmail_remove_suppression",
    ];
    for (const name of expected) {
      expect(result.knownTools).toContain(name);
    }
  });

  test("every registered tool name is namespaced with shipmail_", () => {
    const { result } = setup();
    for (const name of result.knownTools) {
      expect(name.startsWith("shipmail_")).toBe(true);
    }
  });

  test("filters tools when allowlist is given", () => {
    const { result } = setup(new Set(["shipmail_list_domains", "shipmail_get_thread"]));
    expect(result.enabledTools).toEqual(["shipmail_list_domains", "shipmail_get_thread"]);
    expect(result.knownTools.length).toBeGreaterThan(2);
  });

  test("throws on unknown tool name in allowlist", () => {
    expect(() => setup(new Set(["bogus_tool"]))).toThrow(/Unknown ShipMail MCP tool/);
  });

  test("rejects bare (un-prefixed) tool names in allowlist", () => {
    // Earlier versions used `send_message`; users (and shadow MCP servers) may
    // still refer to the bare names. Make sure they are now rejected so a stale
    // config fails loudly instead of silently registering nothing.
    expect(() => setup(new Set(["send_message"]))).toThrow(/Unknown ShipMail MCP tool/);
  });
});
