import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, test } from "bun:test";
import { ShipMailClient } from "shipmail";

import { registerTools } from "../tools.js";

// Coverage test: every operationId in the public OpenAPI fixture must either be
// registered as an MCP tool or be in the INTENTIONALLY_EXCLUDED list with a
// documented reason. The fixture is copied from https://shipmail.to/openapi.json
// when this public source repo is synced from the private application repo.
// This test catches silent drift when the REST API grows without touching MCP.
//
// Updating this file is the explicit "I considered the MCP surface" gate that
// the MCP package's reviewers were asking for.

const OPENAPI_PATH = fileURLToPath(new URL("../../fixtures/openapi.json", import.meta.url));

const OPERATION_TO_TOOL: Readonly<Record<string, string>> = {
  getStatus: "shipmail_status",
  // Domains
  createDomain: "shipmail_create_domain",
  listDomains: "shipmail_list_domains",
  getDomain: "shipmail_get_domain",
  updateDomain: "shipmail_update_domain",
  deleteDomain: "shipmail_delete_domain",
  verifyDomain: "shipmail_verify_domain",
  searchDomains: "shipmail_search_domains",
  // Mailboxes
  createMailbox: "shipmail_create_mailbox",
  listMailboxes: "shipmail_list_mailboxes",
  getMailbox: "shipmail_get_mailbox",
  updateMailbox: "shipmail_update_mailbox",
  deleteMailbox: "shipmail_delete_mailbox",
  listMailboxFolders: "shipmail_list_mailbox_folders",
  createMailboxFolder: "shipmail_create_mailbox_folder",
  updateMailboxFolder: "shipmail_update_mailbox_folder",
  deleteMailboxFolder: "shipmail_delete_mailbox_folder",
  listMailboxIdentities: "shipmail_list_mailbox_identities",
  listMailboxInboxMessages: "shipmail_list_mailbox_inbox_messages",
  getMailboxInboxThread: "shipmail_get_mailbox_inbox_thread",
  updateMailboxInboxMessage: "shipmail_update_inbox_message",
  moveMailboxInboxMessage: "shipmail_move_inbox_message",
  deleteMailboxInboxMessage: "shipmail_delete_inbox_message",
  getMailboxRules: "shipmail_get_mailbox_rules",
  updateMailboxRules: "shipmail_set_mailbox_rules",
  resetMailboxPassword: "shipmail_reset_mailbox_password",
  updateAutoReply: "shipmail_set_auto_reply",
  updateSpamFilter: "shipmail_set_spam_filter",
  createMailboxImport: "shipmail_create_mailbox_import",
  listMailboxImports: "shipmail_list_mailbox_imports",
  getMailboxImport: "shipmail_get_mailbox_import",
  cancelMailboxImport: "shipmail_cancel_mailbox_import",
  undoMailboxImport: "shipmail_undo_mailbox_import",
  // Messages and threads
  listMessages: "shipmail_list_messages",
  sendMessage: "shipmail_send_message",
  getMessage: "shipmail_get_message",
  replyToMessage: "shipmail_reply_to_message",
  listThreads: "shipmail_list_threads",
  getThread: "shipmail_get_thread",
  replyToThread: "shipmail_reply_to_thread",
  // Webhooks
  createWebhook: "shipmail_create_webhook",
  listWebhooks: "shipmail_list_webhooks",
  getWebhook: "shipmail_get_webhook",
  updateWebhook: "shipmail_update_webhook",
  deleteWebhook: "shipmail_delete_webhook",
  rotateWebhookSecret: "shipmail_rotate_webhook_secret",
  testWebhook: "shipmail_test_webhook",
  listWebhookDeliveries: "shipmail_list_webhook_deliveries",
  // Suppressions
  listSuppressions: "shipmail_list_suppressions",
  removeSuppression: "shipmail_remove_suppression",
};

const INTENTIONALLY_EXCLUDED: Readonly<Record<string, string>> = {
  registerDomain:
    "Domain registration charges a saved payment method and requires explicit pricing/contact/legal confirmation. Should remain off the agent tool surface until a dedicated approval flow exists.",
  downloadMailboxInboxAttachment:
    "Attachment downloads return untrusted binary data that can be large and unsafe to inline into an LLM transcript. Use the REST API or SDK download methods instead.",
  createMailboxImportUpload:
    "File staging returns a presigned URL that needs a raw binary PUT, which an MCP tool cannot perform. Use the REST API or SDK createImportUpload instead.",
};

type OpenApiDoc = {
  readonly paths: Record<string, Record<string, { readonly operationId?: string } | unknown>>;
};

function readOpenApi(): OpenApiDoc {
  const raw = readFileSync(OPENAPI_PATH, "utf8");
  return JSON.parse(raw) as OpenApiDoc;
}

function collectOperationIds(doc: OpenApiDoc): readonly string[] {
  const seen = new Set<string>();
  for (const methods of Object.values(doc.paths)) {
    if (typeof methods !== "object" || methods === null) continue;
    for (const op of Object.values(methods)) {
      if (typeof op !== "object" || op === null) continue;
      const operationId = (op as { operationId?: unknown }).operationId;
      if (typeof operationId === "string" && operationId.length > 0) {
        seen.add(operationId);
      }
    }
  }
  return [...seen].sort();
}

function getMcpToolNames(): readonly string[] {
  const client = new ShipMailClient({
    apiKey: "sk_test",
    baseUrl: "https://shipmail.to/api/v1",
    maxRetries: 0,
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  return registerTools(server, client, undefined).knownTools;
}

describe("OpenAPI ↔ MCP coverage", () => {
  test("every OpenAPI operationId is mapped to an MCP tool or explicitly excluded", () => {
    const doc = readOpenApi();
    const operationIds = collectOperationIds(doc);
    const knownTools = new Set(getMcpToolNames());

    const undocumented: string[] = [];
    for (const operationId of operationIds) {
      const mappedTool = OPERATION_TO_TOOL[operationId];
      if (mappedTool !== undefined) {
        expect(knownTools.has(mappedTool)).toBe(true);
        continue;
      }
      if (INTENTIONALLY_EXCLUDED[operationId] !== undefined) continue;
      undocumented.push(operationId);
    }

    expect(undocumented).toEqual([]);
  });

  test("every claimed MCP mapping points to a registered tool", () => {
    const knownTools = new Set(getMcpToolNames());
    const dangling: string[] = [];
    for (const tool of Object.values(OPERATION_TO_TOOL)) {
      if (!knownTools.has(tool)) dangling.push(tool);
    }
    expect(dangling).toEqual([]);
  });

  test("INTENTIONALLY_EXCLUDED entries actually exist in OpenAPI", () => {
    // Catches stale exclusions: if someone removes registerDomain from
    // OpenAPI, the exclusion entry should be removed too.
    const doc = readOpenApi();
    const operationIds = new Set(collectOperationIds(doc));
    const stale: string[] = [];
    for (const operationId of Object.keys(INTENTIONALLY_EXCLUDED)) {
      if (!operationIds.has(operationId)) stale.push(operationId);
    }
    expect(stale).toEqual([]);
  });

  test("every registered MCP tool corresponds to an OpenAPI operation or is explicitly noted", () => {
    // Reverse direction: if the MCP gains a tool with no OpenAPI counterpart,
    // someone needs to either add the OpenAPI op or document the discrepancy.
    const doc = readOpenApi();
    const operationIds = new Set(collectOperationIds(doc));
    const mappedTools = new Set(Object.values(OPERATION_TO_TOOL));
    const knownTools = getMcpToolNames();

    const orphans: string[] = [];
    for (const tool of knownTools) {
      if (mappedTools.has(tool)) continue;
      orphans.push(tool);
    }

    expect(orphans).toEqual([]);
    // operationIds is already used to validate the forward direction.
    void operationIds;
  });
});
