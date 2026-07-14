import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, test } from "bun:test";
import { ShipMailClient } from "shipmail";

import { registerTools } from "../tools.js";

// Coverage test: every operationId in the public OpenAPI fixture must either be
// registered as an MCP tool or be in the INTENTIONALLY_EXCLUDED list with a
// documented reason. The fixture is synced from the Shipmail application
// repository so this test catches REST API changes that are missing from MCP.
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
  getDomainDnsRecords: "shipmail_get_domain_dns_records",
  updateDomain: "shipmail_update_domain",
  deleteDomain: "shipmail_delete_domain",
  verifyDomain: "shipmail_verify_domain",
  searchDomains: "shipmail_search_domains",
  // Mailboxes
  createMailbox: "shipmail_create_mailbox",
  listMailboxes: "shipmail_list_mailboxes",
  getMailbox: "shipmail_get_mailbox",
  suspendMailbox: "shipmail_suspend_mailbox",
  resumeMailbox: "shipmail_resume_mailbox",
  createMailboxExport: "shipmail_create_mailbox_export",
  getMailboxExport: "shipmail_get_mailbox_export",
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
  listMailboxForwarding: "shipmail_list_mailbox_forwarding",
  createMailboxForwarding: "shipmail_create_mailbox_forwarding",
  deleteMailboxForwarding: "shipmail_delete_mailbox_forwarding",
  resetMailboxPassword: "shipmail_reset_mailbox_password",
  updateAutoReply: "shipmail_set_auto_reply",
  updateSpamFilter: "shipmail_set_spam_filter",
  createMailboxImport: "shipmail_create_mailbox_import",
  listMailboxImports: "shipmail_list_mailbox_imports",
  getMailboxImport: "shipmail_get_mailbox_import",
  cancelMailboxImport: "shipmail_cancel_mailbox_import",
  undoMailboxImport: "shipmail_undo_mailbox_import",
  injectSandboxInbound: "shipmail_inject_sandbox_inbound",
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
  getWebhookDelivery: "shipmail_get_webhook_delivery",
  replayWebhookDelivery: "shipmail_replay_webhook_delivery",
  // Suppressions
  listSuppressions: "shipmail_list_suppressions",
  removeSuppression: "shipmail_remove_suppression",
  // Audiences and subscribers
  createAudience: "shipmail_create_audience",
  listAudiences: "shipmail_list_audiences",
  getAudience: "shipmail_get_audience",
  updateAudience: "shipmail_update_audience",
  deleteAudience: "shipmail_delete_audience",
  addSubscriber: "shipmail_add_subscriber",
  addSubscribersBatch: "shipmail_add_subscribers_batch",
  listSubscribers: "shipmail_list_subscribers",
  getSubscriber: "shipmail_get_subscriber",
  getSubscriberByEmail: "shipmail_get_subscriber_by_email",
  updateSubscriber: "shipmail_update_subscriber",
  unsubscribeSubscriber: "shipmail_unsubscribe_subscriber",
  resubscribeSubscriber: "shipmail_resubscribe_subscriber",
  removeSubscriber: "shipmail_remove_subscriber",
  // Newsletters
  listNewsletterDomains: "shipmail_list_newsletter_domains",
  createNewsletter: "shipmail_create_newsletter",
  createNewsletterFromChangelog: "shipmail_create_newsletter_from_changelog",
  listNewsletters: "shipmail_list_newsletters",
  getNewsletter: "shipmail_get_newsletter",
  updateNewsletter: "shipmail_update_newsletter",
  listNewsletterAssets: "shipmail_list_newsletter_assets",
  uploadNewsletterAsset: "shipmail_register_newsletter_asset",
  previewNewsletter: "shipmail_preview_newsletter",
  runNewsletterPreflight: "shipmail_run_newsletter_preflight",
  sendNewsletterTest: "shipmail_send_newsletter_test",
  scheduleNewsletter: "shipmail_schedule_newsletter",
  cancelNewsletter: "shipmail_cancel_newsletter",
  resumeNewsletter: "shipmail_resume_newsletter",
  // Calendar
  listCalendarEvents: "shipmail_list_calendar_events",
  createCalendarEvent: "shipmail_create_calendar_event",
  getCalendarEvent: "shipmail_get_calendar_event",
  updateCalendarEvent: "shipmail_update_calendar_event",
  deleteCalendarEvent: "shipmail_delete_calendar_event",
  getCalendarAvailability: "shipmail_get_calendar_availability",
  // Booking pages
  listBookingPages: "shipmail_list_booking_pages",
  createBookingPage: "shipmail_create_booking_page",
  getBookingPage: "shipmail_get_booking_page",
  updateBookingPage: "shipmail_update_booking_page",
  deleteBookingPage: "shipmail_delete_booking_page",
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
