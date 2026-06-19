import { describe, expect, test } from "bun:test";
import type { z } from "zod/v4";

import {
  attachmentInputSchema,
  createDomainInputSchema,
  createMailboxFolderInputSchema,
  createWebhookInputSchema,
  domainVerificationSchema,
  getByIdInputSchema,
  idempotencyKeySchema,
  listMailboxInboxMessagesInputSchema,
  listWebhookDeliveriesInputSchema,
  mailboxFoldersSchema,
  mailboxIdentitiesSchema,
  mailboxRuleSchema,
  mailboxRulesSchema,
  moveInboxMessageInputSchema,
  paginationInputSchema,
  removeSuppressionInputSchema,
  resetPasswordInputSchema,
  sendMessageInputSchema,
  spamFilterInputSchema,
  suppressionSchema,
  updateDomainInputSchema,
  updateInboxMessageInputSchema,
  updateMailboxFolderInputSchema,
  updateMailboxInputSchema,
  updateMailboxRulesInputSchema,
} from "../schemas.js";

describe("idSchema (via getByIdInputSchema)", () => {
  test("accepts valid prefixed id", () => {
    expect(getByIdInputSchema.parse({ id: "mbx_abc123def456" }).id).toBe("mbx_abc123def456");
  });

  test("rejects empty id", () => {
    expect(() => getByIdInputSchema.parse({ id: "" })).toThrow();
  });

  test("rejects path traversal characters", () => {
    expect(() => getByIdInputSchema.parse({ id: "../suppressions/victim@x.com" })).toThrow();
  });

  test("accepts ids up to 100 chars (matches server resourceIdSchema)", () => {
    expect(() => getByIdInputSchema.parse({ id: "a".repeat(100) })).not.toThrow();
  });

  test("rejects ids longer than 100 chars", () => {
    expect(() => getByIdInputSchema.parse({ id: "a".repeat(101) })).toThrow();
  });

  test("rejects whitespace and control chars", () => {
    expect(() => getByIdInputSchema.parse({ id: "abc def" })).toThrow();
    expect(() => getByIdInputSchema.parse({ id: "abc\x00def" })).toThrow();
  });
});

describe("idempotencyKeySchema", () => {
  test("accepts uuid-like keys", () => {
    expect(idempotencyKeySchema.parse("mcp_abc123def456")).toBe("mcp_abc123def456");
  });

  test("rejects CRLF / control-char header-injection sequences", () => {
    expect(() => idempotencyKeySchema.parse("abc\r\nX-Foo: bar")).toThrow();
    expect(() => idempotencyKeySchema.parse("abc\x00def")).toThrow();
    expect(() => idempotencyKeySchema.parse("abc\tdef")).toThrow();
  });

  test("accepts spaces (printable ASCII matches API spec)", () => {
    // The API spec for `Idempotency-Key` is "Printable ASCII, 1-255 characters"
    // which includes 0x20 (space). Mirror that exactly.
    expect(idempotencyKeySchema.parse("abc def")).toBe("abc def");
  });
});

describe("listMailboxInboxMessagesInputSchema", () => {
  test("accepts position pagination and keyword filters", () => {
    const out = listMailboxInboxMessagesInputSchema.parse({
      id: "mbx_abc123",
      folder_role: "inbox",
      position: 10,
      limit: 25,
      has_keyword: "$seen",
    });
    expect(out.position).toBe(10);
    expect(out.has_keyword).toBe("$seen");
  });

  test("rejects ambiguous folder filters", () => {
    expect(() =>
      listMailboxInboxMessagesInputSchema.parse({
        id: "mbx_abc123",
        folder_id: "fld_123",
        folder_role: "inbox",
      }),
    ).toThrow();
  });
});

describe("inbox message action schemas", () => {
  test("update requires at least one explicit field", () => {
    expect(
      updateInboxMessageInputSchema.parse({
        id: "mbx_abc123",
        message_id: "eml_123",
        read: true,
      }).read,
    ).toBe(true);
    expect(() =>
      updateInboxMessageInputSchema.parse({ id: "mbx_abc123", message_id: "eml_123" }),
    ).toThrow();
  });

  test("move requires one target", () => {
    expect(
      moveInboxMessageInputSchema.parse({
        id: "mbx_abc123",
        message_id: "eml_123",
        target_role: "archive",
      }).target_role,
    ).toBe("archive");
    expect(() =>
      moveInboxMessageInputSchema.parse({
        id: "mbx_abc123",
        message_id: "eml_123",
        target_role: "archive",
        target_folder_id: "fld_123",
      }),
    ).toThrow();
    expect(() =>
      moveInboxMessageInputSchema.parse({ id: "mbx_abc123", message_id: "eml_123" }),
    ).toThrow();
  });
});

describe("removeSuppressionInputSchema", () => {
  test("normalizes email to lowercase trim", () => {
    const out = removeSuppressionInputSchema.parse({ email: "  Foo@Example.COM " });
    expect(out.email).toBe("foo@example.com");
  });

  test("rejects strings with control chars", () => {
    expect(() => removeSuppressionInputSchema.parse({ email: "a@b\x00.com" })).toThrow();
  });

  test("rejects strings exceeding 254 chars", () => {
    const long = "a".repeat(250) + "@b.com";
    expect(() => removeSuppressionInputSchema.parse({ email: long })).toThrow();
  });
});

describe("createWebhookInputSchema", () => {
  test("accepts public https url", () => {
    const out = createWebhookInputSchema.parse({
      url: "https://example.com/hook",
      events: ["message.received"],
    });
    expect(out.url).toBe("https://example.com/hook");
  });

  test("rejects http", () => {
    expect(() =>
      createWebhookInputSchema.parse({
        url: "http://example.com/hook",
        events: ["message.received"],
      }),
    ).toThrow();
  });

  test("rejects localhost", () => {
    expect(() =>
      createWebhookInputSchema.parse({
        url: "https://localhost/hook",
        events: ["message.received"],
      }),
    ).toThrow();
  });

  test("rejects RFC1918 IPs", () => {
    expect(() =>
      createWebhookInputSchema.parse({
        url: "https://10.0.0.1/hook",
        events: ["message.received"],
      }),
    ).toThrow();
    expect(() =>
      createWebhookInputSchema.parse({
        url: "https://192.168.1.1/hook",
        events: ["message.received"],
      }),
    ).toThrow();
    expect(() =>
      createWebhookInputSchema.parse({
        url: "https://172.16.0.1/hook",
        events: ["message.received"],
      }),
    ).toThrow();
  });

  test("rejects link-local", () => {
    expect(() =>
      createWebhookInputSchema.parse({
        url: "https://169.254.169.254/hook",
        events: ["message.received"],
      }),
    ).toThrow();
  });

  test("rejects .internal hosts", () => {
    expect(() =>
      createWebhookInputSchema.parse({
        url: "https://api.internal/hook",
        events: ["message.received"],
      }),
    ).toThrow();
  });
});

describe("domainVerificationSchema", () => {
  test("accepts the full DNS record verification payload", () => {
    const out = domainVerificationSchema.parse({
      all_verified: true,
      records: {
        mx: true,
        spf: true,
        dkim: true,
        dmarc: true,
      },
      outbound_verified: true,
      outbound_error: false,
      existing_spf: null,
      suggested_spf: null,
      conflicting_mx: [],
      dmarc_valid: true,
      dmarc_exact_match: true,
      dmarc_record_value: "v=DMARC1; p=none;",
      dmarc_managed_externally: false,
    });

    expect(out.records.dmarc).toBe(true);
  });
});

describe("update schemas use nullable instead of refine", () => {
  test("update_domain requires explicit catch_all_mailbox_id", () => {
    expect(() => updateDomainInputSchema.parse({ id: "dom_abc" })).toThrow();
    expect(() =>
      updateDomainInputSchema.parse({ id: "dom_abc", catch_all_mailbox_id: null }),
    ).not.toThrow();
    expect(() =>
      updateDomainInputSchema.parse({ id: "dom_abc", catch_all_mailbox_id: "mbx_abc" }),
    ).not.toThrow();
  });

  test("update_mailbox requires explicit display_name", () => {
    expect(() => updateMailboxInputSchema.parse({ id: "mbx_abc" })).toThrow();
    expect(() =>
      updateMailboxInputSchema.parse({ id: "mbx_abc", display_name: null }),
    ).not.toThrow();
    expect(() =>
      updateMailboxInputSchema.parse({ id: "mbx_abc", display_name: "Inbox" }),
    ).not.toThrow();
  });

  test("spam_filter threshold is bounded", () => {
    expect(
      spamFilterInputSchema.parse({ id: "mbx_abc", threshold: 8, idempotency_key: "k" }).threshold,
    ).toBe(8);
    expect(() =>
      spamFilterInputSchema.parse({ id: "mbx_abc", threshold: 15, idempotency_key: "k" }),
    ).toThrow();
  });

  test("reset_password requires a strong enough password", () => {
    expect(
      resetPasswordInputSchema.parse({
        id: "mbx_abc",
        password: "NewPassword1",
        idempotency_key: "k",
      }).password,
    ).toBe("NewPassword1");
    expect(() =>
      resetPasswordInputSchema.parse({
        id: "mbx_abc",
        password: "password",
        idempotency_key: "k",
      }),
    ).toThrow();
  });

  test("mailbox rules use public snake_case fields", () => {
    const rule: z.infer<typeof mailboxRuleSchema> = {
      id: "4f5a9d74-b0f1-49a7-bbfb-1f2af841f5b2",
      name: "VIP",
      enabled: true,
      position: 0,
      match_mode: "all",
      stop: false,
      conditions: [
        {
          type: "group",
          match_mode: "any",
          conditions: [{ type: "from_contains", value: "@example.com" }],
        },
      ],
      actions: [
        { type: "move", target: { kind: "custom", folder_id: "fld_123" } },
        { type: "send_webhook" },
        {
          type: "ai_draft_reply",
          instructions: "Write a concise support reply.",
          reply_mode: "reply",
        },
      ],
    };

    expect(updateMailboxRulesInputSchema.parse({ id: "mbx_abc", rules: [rule] }).rules[0]).toEqual(
      rule,
    );
    expect(
      mailboxRulesSchema.parse({
        object: "mailbox_rules",
        mailbox_id: "mbx_abc",
        address: "hello@example.com",
        rules: [rule],
        folders: [{ id: "fld_123", name: "VIP", parent_id: null, role: null, kind: "custom" }],
      }).rules[0]?.actions,
    ).toEqual([
      { type: "move", target: { kind: "custom", folder_id: "fld_123" } },
      { type: "send_webhook" },
      {
        type: "ai_draft_reply",
        instructions: "Write a concise support reply.",
        reply_mode: "reply",
      },
    ]);
  });

  test("mailbox folders use public snake_case fields", () => {
    expect(
      createMailboxFolderInputSchema.parse({
        id: "mbx_abc",
        name: "VIP",
        parent_id: null,
        idempotency_key: "k",
      }).name,
    ).toBe("VIP");
    expect(
      updateMailboxFolderInputSchema.parse({
        id: "mbx_abc",
        folder_id: "fld_123",
        name: "VIP Clients",
        idempotency_key: "k",
      }).folder_id,
    ).toBe("fld_123");
    expect(() =>
      createMailboxFolderInputSchema.parse({
        id: "mbx_abc",
        name: "Inbox",
        parent_id: null,
        idempotency_key: "k",
      }),
    ).toThrow();
    expect(
      mailboxFoldersSchema.parse({
        object: "mailbox_folders",
        mailbox_id: "mbx_abc",
        address: "hello@example.com",
        data: [
          {
            object: "mailbox_folder",
            id: "fld_123",
            name: "VIP",
            parent_id: null,
            role: null,
            kind: "custom",
            total_emails: 4,
            unread_emails: 1,
            unread_threads: 1,
            sort_order: 20,
          },
        ],
      }).data[0]?.unread_threads,
    ).toBe(1);
  });

  test("mailbox identities use public snake_case fields", () => {
    expect(
      mailboxIdentitiesSchema.parse({
        object: "mailbox_identities",
        mailbox_id: "mbx_abc",
        address: "hello@example.com",
        data: [
          {
            object: "mailbox_identity",
            id: "ident_123",
            name: "Hello",
            email: "hello@example.com",
          },
        ],
      }).data[0]?.email,
    ).toBe("hello@example.com");
  });
});

describe("sendMessageInputSchema", () => {
  test("requires html or text", () => {
    expect(() =>
      sendMessageInputSchema.parse({
        mailbox_id: "mbx_abc",
        to: ["user@example.com"],
        subject: "hi",
      }),
    ).toThrow();
  });

  test("normalizes recipient email to lowercase", () => {
    const out = sendMessageInputSchema.parse({
      mailbox_id: "mbx_abc",
      to: ["User@Example.COM"],
      subject: "hi",
      text: "body",
    });
    expect(out.to).toEqual(["user@example.com"]);
  });

  test("normalizes recipient object email", () => {
    const out = sendMessageInputSchema.parse({
      mailbox_id: "mbx_abc",
      to: [{ address: "User@Example.COM", name: "Alice" }],
      subject: "hi",
      text: "body",
    });
    expect(out.to[0]).toEqual({ address: "user@example.com", name: "Alice" });
  });

  test("rejects display name with control chars", () => {
    expect(() =>
      sendMessageInputSchema.parse({
        mailbox_id: "mbx_abc",
        to: [{ address: "u@x.com", name: "evil\x00name" }],
        subject: "hi",
        text: "body",
      }),
    ).toThrow();
  });

  test("rejects subject with control chars / CRLF (header injection)", () => {
    expect(() =>
      sendMessageInputSchema.parse({
        mailbox_id: "mbx_abc",
        to: ["u@x.com"],
        subject: "hi\r\nBcc: spy@evil.com",
        text: "body",
      }),
    ).toThrow();
  });

  test("rejects in_reply_to with CRLF (header injection)", () => {
    expect(() =>
      sendMessageInputSchema.parse({
        mailbox_id: "mbx_abc",
        to: ["u@x.com"],
        subject: "hi",
        text: "body",
        in_reply_to: "<legit@id>\r\nBcc: spy@evil.com",
      }),
    ).toThrow();
  });

  test("rejects references entries with CRLF (header injection)", () => {
    expect(() =>
      sendMessageInputSchema.parse({
        mailbox_id: "mbx_abc",
        to: ["u@x.com"],
        subject: "hi",
        text: "body",
        references: ["<legit@id>", "<evil>\nBcc: spy@evil.com"],
      }),
    ).toThrow();
  });
});

describe("attachmentInputSchema", () => {
  test("accepts a normal attachment", () => {
    const out = attachmentInputSchema.parse({
      filename: "report.pdf",
      content: "AAAA",
      content_type: "application/pdf",
    });
    expect(out.filename).toBe("report.pdf");
  });

  test("rejects path traversal in filename", () => {
    expect(() =>
      attachmentInputSchema.parse({
        filename: "../../../etc/passwd",
        content: "AAAA",
      }),
    ).toThrow();
  });

  test("rejects path separators in filename", () => {
    expect(() => attachmentInputSchema.parse({ filename: "a/b.txt", content: "AAAA" })).toThrow();
    expect(() => attachmentInputSchema.parse({ filename: "a\\b.txt", content: "AAAA" })).toThrow();
  });

  test("rejects control chars in filename", () => {
    expect(() =>
      attachmentInputSchema.parse({ filename: "report\x00.pdf", content: "AAAA" }),
    ).toThrow();
  });

  test("rejects malformed content_type and CRLF injection", () => {
    expect(() =>
      attachmentInputSchema.parse({
        filename: "a.txt",
        content: "AAAA",
        content_type: "not a mime type",
      }),
    ).toThrow();
    expect(() =>
      attachmentInputSchema.parse({
        filename: "a.txt",
        content: "AAAA",
        content_type: "text/plain\r\nX-Header: injected",
      }),
    ).toThrow();
  });
});

describe("createDomainInputSchema", () => {
  test("accepts a valid domain name", () => {
    expect(() => createDomainInputSchema.parse({ name: "example.com" })).not.toThrow();
    expect(() => createDomainInputSchema.parse({ name: "mail.example.co.uk" })).not.toThrow();
  });

  test("rejects names that are not domain-shaped", () => {
    expect(() => createDomainInputSchema.parse({ name: "not a domain" })).toThrow();
    expect(() => createDomainInputSchema.parse({ name: "evil.com\r\nX-Header: x" })).toThrow();
    expect(() => createDomainInputSchema.parse({ name: "example" })).toThrow();
    expect(() => createDomainInputSchema.parse({ name: "-bad.com" })).toThrow();
    expect(() => createDomainInputSchema.parse({ name: "bad-.com" })).toThrow();
  });
});

describe("paginationInputSchema cursor", () => {
  test("accepts a base64-ish cursor", () => {
    expect(() =>
      paginationInputSchema.parse({ cursor: "eyJhYmMiOiJkZWYifQ==", limit: 25 }),
    ).not.toThrow();
  });

  test("rejects cursors with control chars", () => {
    expect(() =>
      paginationInputSchema.parse({ cursor: "abc\r\nX-Header: x", limit: 25 }),
    ).toThrow();
  });

  test("rejects cursors with whitespace", () => {
    expect(() => paginationInputSchema.parse({ cursor: "abc def", limit: 25 })).toThrow();
  });
});

describe("idempotencyKeySchema", () => {
  test("accepts up to 255 printable ASCII (matches API spec)", () => {
    const long = "x".repeat(255);
    expect(idempotencyKeySchema.parse(long)).toBe(long);
  });

  test("rejects 256 chars", () => {
    expect(() => idempotencyKeySchema.parse("x".repeat(256))).toThrow();
  });
});

describe("listWebhookDeliveriesInputSchema", () => {
  test("accepts known status and event_type enums", () => {
    expect(() =>
      listWebhookDeliveriesInputSchema.parse({
        id: "whk_abc",
        status: "delivered",
        event_type: "message.received",
        limit: 25,
      }),
    ).not.toThrow();
  });

  test("rejects unknown status values", () => {
    expect(() =>
      listWebhookDeliveriesInputSchema.parse({ id: "whk_abc", status: "bogus", limit: 25 }),
    ).toThrow();
  });

  test("rejects unknown event_type values", () => {
    expect(() =>
      listWebhookDeliveriesInputSchema.parse({
        id: "whk_abc",
        event_type: "message.zomg",
        limit: 25,
      }),
    ).toThrow();
  });
});

describe("suppressionSchema", () => {
  test("accepts the three OpenAPI reasons", () => {
    for (const reason of ["hard_bounce", "complaint", "manual"] as const) {
      expect(() =>
        suppressionSchema.parse({
          object: "suppression",
          email_address: "u@example.com",
          reason,
          created_at: "2026-01-01T00:00:00Z",
        }),
      ).not.toThrow();
    }
  });

  test("rejects reasons outside the OpenAPI enum (parity guard)", () => {
    expect(() =>
      suppressionSchema.parse({
        object: "suppression",
        email_address: "u@example.com",
        reason: "spam",
        created_at: "2026-01-01T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("createWebhookInputSchema (SSRF coverage via publicHttpsUrlSchema)", () => {
  test("rejects bracketed IPv6 loopback (regression for previous SSRF gap)", () => {
    expect(() =>
      createWebhookInputSchema.parse({
        url: "https://[::1]/hook",
        events: ["message.received"],
      }),
    ).toThrow();
  });

  test("rejects 0.0.0.0", () => {
    expect(() =>
      createWebhookInputSchema.parse({
        url: "https://0.0.0.0/hook",
        events: ["message.received"],
      }),
    ).toThrow();
  });

  test("rejects IPv4-mapped IPv6 to private space", () => {
    expect(() =>
      createWebhookInputSchema.parse({
        url: "https://[::ffff:127.0.0.1]/hook",
        events: ["message.received"],
      }),
    ).toThrow();
  });

  test("rejects decimal-int IPv4 hostnames", () => {
    expect(() =>
      createWebhookInputSchema.parse({
        url: "https://2130706433/hook",
        events: ["message.received"],
      }),
    ).toThrow();
  });
});
