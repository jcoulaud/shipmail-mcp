import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, test } from "bun:test";
import { ShipMailClient } from "shipmail";

import { composeMessageWithFileInputSchema, sendMessageInputSchema } from "../schemas.js";
import { registerTools, type ToolRegistrationResult } from "../tools.js";

function setup(allowedTools?: ReadonlySet<string>): {
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
  const result = registerTools(server, client, allowedTools);
  return { server, client, result };
}

describe("registerTools", () => {
  test("registers all known tools for introspection when no policy set is given", () => {
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
      "shipmail_get_domain_dns_records",
      "shipmail_create_domain",
      "shipmail_update_domain",
      "shipmail_delete_domain",
      "shipmail_verify_domain",
      "shipmail_search_domains",
      "shipmail_list_mailboxes",
      "shipmail_get_mailbox",
      "shipmail_list_mailbox_app_passwords",
      "shipmail_create_mailbox_app_password",
      "shipmail_revoke_mailbox_app_password",
      "shipmail_create_mailbox",
      "shipmail_update_mailbox",
      "shipmail_delete_mailbox",
      "shipmail_suspend_mailbox",
      "shipmail_resume_mailbox",
      "shipmail_create_mailbox_export",
      "shipmail_get_mailbox_export",
      "shipmail_list_mailbox_folders",
      "shipmail_get_mailbox_rules",
      "shipmail_set_mailbox_rules",
      "shipmail_create_mailbox_folder",
      "shipmail_update_mailbox_folder",
      "shipmail_delete_mailbox_folder",
      "shipmail_list_mailbox_identities",
      "shipmail_list_mailbox_inbox_messages",
      "shipmail_get_mailbox_inbox_thread",
      "shipmail_reply_to_inbox_message",
      "shipmail_reply_to_inbox_thread",
      "shipmail_update_inbox_message",
      "shipmail_move_inbox_message",
      "shipmail_delete_inbox_message",
      "shipmail_reset_mailbox_password",
      "shipmail_set_auto_reply",
      "shipmail_set_spam_filter",
      "shipmail_create_mailbox_import",
      "shipmail_list_mailbox_imports",
      "shipmail_get_mailbox_import",
      "shipmail_cancel_mailbox_import",
      "shipmail_undo_mailbox_import",
      "shipmail_inject_sandbox_inbound",
      "shipmail_list_messages",
      "shipmail_get_message",
      "shipmail_compose_message_with_file",
      "shipmail_prepare_staged_attachment_upload",
      "shipmail_send_message",
      "shipmail_list_scheduled_messages",
      "shipmail_get_scheduled_message",
      "shipmail_update_scheduled_message",
      "shipmail_cancel_scheduled_message",
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
      "shipmail_list_audiences",
      "shipmail_get_audience",
      "shipmail_create_audience",
      "shipmail_update_audience",
      "shipmail_delete_audience",
      "shipmail_get_audience_feed",
      "shipmail_update_audience_feed",
      "shipmail_rotate_audience_feed",
      "shipmail_revoke_audience_feed",
      "shipmail_list_subscribers",
      "shipmail_get_subscriber",
      "shipmail_get_subscriber_by_email",
      "shipmail_add_subscriber",
      "shipmail_add_subscribers_batch",
      "shipmail_update_subscriber",
      "shipmail_unsubscribe_subscriber",
      "shipmail_resubscribe_subscriber",
      "shipmail_remove_subscriber",
      "shipmail_list_newsletter_domains",
      "shipmail_list_newsletter_assets",
      "shipmail_register_newsletter_asset",
      "shipmail_list_newsletters",
      "shipmail_get_newsletter",
      "shipmail_preview_newsletter",
      "shipmail_create_newsletter",
      "shipmail_create_newsletter_from_changelog",
      "shipmail_update_newsletter",
      "shipmail_run_newsletter_preflight",
      "shipmail_send_newsletter_test",
      "shipmail_schedule_newsletter",
      "shipmail_cancel_newsletter",
      "shipmail_resume_newsletter",
      "shipmail_list_calendar_events",
      "shipmail_get_calendar_event",
      "shipmail_create_calendar_event",
      "shipmail_update_calendar_event",
      "shipmail_delete_calendar_event",
      "shipmail_get_calendar_availability",
      "shipmail_list_booking_pages",
      "shipmail_get_booking_page",
      "shipmail_create_booking_page",
      "shipmail_update_booking_page",
      "shipmail_delete_booking_page",
      "shipmail_consume_partner_mailbox_credential_grant",
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

  test("filters tools to the effective policy set", () => {
    const { result } = setup(
      new Set(["shipmail_list_domains", "shipmail_get_thread", "shipmail_get_newsletter"]),
    );
    expect(result.enabledTools).toEqual([
      "shipmail_list_domains",
      "shipmail_get_thread",
      "shipmail_get_newsletter",
    ]);
    expect(result.knownTools.length).toBeGreaterThan(2);
  });

  test("throws when the effective policy names an unknown tool", () => {
    expect(() => setup(new Set(["bogus_tool"]))).toThrow(/Unknown ShipMail MCP tool/);
  });

  test("rejects bare tool names in the effective policy", () => {
    // Earlier versions used `send_message`; users (and shadow MCP servers) may
    // still refer to the bare names. Make sure they are now rejected so a stale
    // config fails loudly instead of silently registering nothing.
    expect(() => setup(new Set(["send_message"]))).toThrow(/Unknown ShipMail MCP tool/);
  });

  test("keeps base64 attachment bytes out of the send tool schema", () => {
    const shared = {
      mailbox_id: "mbx_123",
      to: ["person@example.com"],
      subject: "Invoice",
      text: "Attached",
    };
    expect(
      sendMessageInputSchema.safeParse({
        ...shared,
        staged_attachment_ids: ["sat_0123456789abcdefghjkmnpq"],
      }).success,
    ).toBe(true);
    expect(
      sendMessageInputSchema.safeParse({
        ...shared,
        attachments: [
          {
            filename: "invoice.pdf",
            content: "JVBERi0x",
            content_type: "application/pdf",
          },
        ],
      }).success,
    ).toBe(false);
  });

  test("declares the complete ChatGPT file input shape", () => {
    const parsed = composeMessageWithFileInputSchema.safeParse({
      mailbox_id: "mbx_123",
      to: ["person@example.com"],
      subject: "Invoice",
      text: "Attached",
      file: {
        download_url: "https://files.example.test/download",
        file_id: "file_123",
        mime_type: "application/pdf",
        file_name: "invoice.pdf",
      },
    });
    expect(parsed.success).toBe(true);
    expect(
      composeMessageWithFileInputSchema.safeParse({
        mailbox_id: "mbx_123",
        to: ["person@example.com"],
        subject: "Invoice",
        text: "Attached",
        file: { file_id: "file_123" },
      }).success,
    ).toBe(false);
  });
});
