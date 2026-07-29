import { describe, expect, test } from "bun:test";

import {
  audienceFeedSchema,
  bookingPageSchema,
  createBookingPageInputSchema,
  createDomainInputSchema,
  createMailboxFolderInputSchema,
  createMailboxInputSchema,
  createNewsletterFromChangelogInputSchema,
  createNewsletterInputSchema,
  createWebhookInputSchema,
  domainVerificationSchema,
  getByIdInputSchema,
  idempotencyKeySchema,
  injectSandboxInboundInputSchema,
  listMailboxInboxMessagesInputSchema,
  listWebhookDeliveriesInputSchema,
  mailboxFoldersSchema,
  mailboxIdentitiesSchema,
  mailboxRulesSchema,
  messageSchema,
  moveInboxMessageInputSchema,
  newsletterDomainSchema,
  newsletterSchema,
  paginationInputSchema,
  removeSuppressionInputSchema,
  resetPasswordInputSchema,
  scheduleNewsletterInputSchema,
  sendMessageInputSchema,
  sendNewsletterTestInputSchema,
  spamFilterInputSchema,
  suppressionSchema,
  updateAudienceFeedInputSchema,
  updateBookingPageInputSchema,
  updateDomainInputSchema,
  updateInboxMessageInputSchema,
  updateMailboxFolderInputSchema,
  updateMailboxInputSchema,
  updateMailboxRulesInputSchema,
  updateNewsletterInputSchema,
} from "../schemas.js";

describe("messageSchema", () => {
  test("preserves tracked inbox rule disposition", () => {
    const message = messageSchema.parse({
      object: "message",
      id: "msg_123",
      mailbox_id: "mbx_456",
      thread_id: "thr_789",
      source_rfc_message_id: "<inbound@example.com>",
      delivered_rfc_message_id: null,
      client_reference: null,
      metadata: {},
      headers: [],
      subject: "Invoice",
      from_address: "sender@example.com",
      to_addresses: [{ address: "billing@example.com" }],
      cc_addresses: null,
      bcc_addresses: null,
      attachments: null,
      source: "inbound",
      mode: "live",
      status: "delivered",
      rule_disposition: {
        matched_rule_ids: ["rule_invoices", "rule_priority"],
        stop_rule_id: "rule_priority",
      },
      scheduled_at: null,
      created_at: "2026-07-27T10:00:00Z",
      updated_at: "2026-07-27T10:00:00Z",
    });

    expect(message.rule_disposition).toEqual({
      matched_rule_ids: ["rule_invoices", "rule_priority"],
      stop_rule_id: "rule_priority",
    });
  });
});

describe("booking page schemas", () => {
  test("accept conferencing providers and null clearing", () => {
    const page = bookingPageSchema.parse({
      object: "booking_page",
      id: "bkp_1",
      mailbox: "hello@example.com",
      slug: "intro",
      url: "https://shipmail.to/book/example.com/intro",
      name: "Intro",
      description: null,
      duration_minutes: 30,
      availability_days: [1, 2, 3, 4, 5],
      window_start_minutes: 540,
      window_end_minutes: 1020,
      timezone: "America/New_York",
      buffer_minutes: 0,
      minimum_notice_minutes: 0,
      max_advance_days: 30,
      conferencing_provider: "zoom",
      active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(page.conferencing_provider).toBe("zoom");
    expect(
      createBookingPageInputSchema.parse({
        name: "Intro",
        mailbox: "hello@example.com",
        slug: "intro",
        duration_minutes: 30,
        availability_days: [1, 2, 3, 4, 5],
        window_start_minutes: 540,
        window_end_minutes: 1020,
        timezone: "America/New_York",
        conferencing_provider: "google_meet",
      }).conferencing_provider,
    ).toBe("google_meet");
    expect(
      updateBookingPageInputSchema.parse({
        id: "bkp_1",
        conferencing_provider: null,
      }).conferencing_provider,
    ).toBeNull();
    expect(() =>
      updateBookingPageInputSchema.parse({
        id: "bkp_1",
        conferencing_provider: "teams",
      }),
    ).toThrow();
  });
});

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

describe("mailbox rule schemas", () => {
  test("accepts deterministic nested rules", () => {
    const rules = mailboxRulesSchema.parse({
      object: "mailbox_rules",
      mailbox_id: "mbx_123",
      address: "hello@example.com",
      rules: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "Invoices",
          enabled: true,
          position: 0,
          match_mode: "all",
          stop: true,
          conditions: [
            {
              type: "group",
              match_mode: "any",
              conditions: [
                { type: "subject_contains", value: "invoice" },
                { type: "has_attachment" },
              ],
            },
          ],
          actions: [{ type: "move", target: { kind: "custom", folder_id: "fld_billing" } }],
        },
      ],
      folders: [
        {
          id: "fld_billing",
          name: "Billing",
          parent_id: null,
          role: null,
          kind: "custom",
        },
      ],
    });
    expect(rules.rules[0]?.name).toBe("Invoices");
  });

  test("accepts webhook actions and rejects removed AI actions", () => {
    const base = {
      id: "mbx_123",
      rules: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "Invalid",
          enabled: true,
          position: 0,
          match_mode: "all",
          stop: false,
          conditions: [{ type: "has_attachment" }],
          actions: [{ type: "send_webhook" }],
        },
      ],
    };
    expect(updateMailboxRulesInputSchema.parse(base).rules[0]?.actions).toEqual([
      { type: "send_webhook" },
    ]);
    expect(() =>
      updateMailboxRulesInputSchema.parse({
        ...base,
        rules: [{ ...base.rules[0], actions: [{ type: "ai_draft_reply" }] }],
      }),
    ).toThrow();
    expect(() =>
      updateMailboxRulesInputSchema.parse({
        ...base,
        rules: [
          {
            ...base.rules[0],
            actions: [{ type: "send_webhook", url: "https://example.com" }],
          },
        ],
      }),
    ).toThrow();
  });

  test("enforces the API limit of four actions per rule", () => {
    expect(() =>
      updateMailboxRulesInputSchema.parse({
        id: "mbx_123",
        rules: [
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Too many actions",
            enabled: true,
            position: 0,
            match_mode: "all",
            stop: false,
            conditions: [{ type: "has_attachment" }],
            actions: [
              { type: "mark_read" },
              { type: "star" },
              { type: "send_webhook" },
              { type: "move", target: { kind: "system", role: "archive" } },
              { type: "move", target: { kind: "system", role: "trash" } },
            ],
          },
        ],
      }),
    ).toThrow();
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

describe("createMailboxInputSchema", () => {
  test("requires a strong password or server-generated password mode", () => {
    expect(
      createMailboxInputSchema.parse({
        domain_id: "dom_123",
        address: "hello",
        password: "StrongPass123",
      }).password,
    ).toBe("StrongPass123");
    expect(() =>
      createMailboxInputSchema.parse({ domain_id: "dom_123", address: "hello" }),
    ).toThrow();
    expect(
      createMailboxInputSchema.parse({
        domain_id: "dom_123",
        address: "hello",
        generate_password: true,
      }).generate_password,
    ).toBe(true);
    expect(() =>
      createMailboxInputSchema.parse({
        domain_id: "dom_123",
        address: "hello",
        password: "StrongPass123",
        generate_password: true,
      }),
    ).toThrow();
    expect(() =>
      createMailboxInputSchema.parse({
        domain_id: "dom_123",
        address: "hello",
        password: "Password1",
      }),
    ).toThrow();
  });
});

describe("listMailboxInboxMessagesInputSchema", () => {
  test("accepts cursor and date pagination with keyword filters", () => {
    const out = listMailboxInboxMessagesInputSchema.parse({
      id: "mbx_abc123",
      folder_role: "inbox",
      cursor: "cur_10",
      after: "2026-01-01T00:00:00.000Z",
      limit: 25,
      has_keyword: "$seen",
    });
    expect(out.cursor).toBe("cur_10");
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

describe("injectSandboxInboundInputSchema", () => {
  test("accepts an isolated fake inbound message", () => {
    const value = injectSandboxInboundInputSchema.parse({
      id: "mbx_abc123",
      from: "Customer@Example.COM",
      subject: "Sandbox reply",
      text: "Looks good",
      message_id: "<reply-1@example.com>",
    });

    expect(value.from).toBe("customer@example.com");
    expect(value.message_id).toBe("<reply-1@example.com>");
  });

  test("rejects missing content and header injection", () => {
    expect(() =>
      injectSandboxInboundInputSchema.parse({
        id: "mbx_abc123",
        from: "customer@example.com",
        subject: "No body",
      }),
    ).toThrow();
    expect(() =>
      injectSandboxInboundInputSchema.parse({
        id: "mbx_abc123",
        from: "customer@example.com",
        subject: "Hello\r\nBcc: spy@example.com",
        text: "body",
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

  test("accepts durable correlation metadata and RFC 8058 headers", () => {
    const out = sendMessageInputSchema.parse({
      mailbox_id: "mbx_abc",
      to: ["u@example.com"],
      subject: "hi",
      text: "body",
      client_reference: "crm-123",
      metadata: { campaign: "onboarding", step: 2 },
      source_rfc_message_id: "<crm-123@example.com>",
      headers: [
        { name: "List-Unsubscribe", value: "<https://example.com/unsubscribe/123>" },
        { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
      ],
    });
    expect(out.client_reference).toBe("crm-123");
  });

  test("rejects reserved mixed-case headers and nested metadata", () => {
    expect(() =>
      sendMessageInputSchema.parse({
        mailbox_id: "mbx_abc",
        to: ["u@example.com"],
        subject: "hi",
        text: "body",
        headers: [{ name: "X-SeS-Tenant", value: "spoofed" }],
      }),
    ).toThrow();
    expect(() =>
      sendMessageInputSchema.parse({
        mailbox_id: "mbx_abc",
        to: ["u@example.com"],
        subject: "hi",
        text: "body",
        metadata: { nested: { value: true } },
      }),
    ).toThrow();
  });
});

describe("audience feed schemas", () => {
  test("audience feed output accepts the public response shape", () => {
    const feed = audienceFeedSchema.parse({
      object: "audience_feed",
      audience_id: "aud_123",
      enabled: true,
      title: "Release notes",
      subtitle: null,
      site_url: "https://example.com/",
      canonical_url: "https://example.com/feed.xml",
      author_name: null,
      icon_url: null,
      entry_limit: 25,
      url: "https://shipmail.to/f/audfeed_abc/feed.xml",
      updated_at: "2026-07-28T00:00:00.000Z",
    });
    expect(feed.url).toContain("/f/audfeed_abc/feed.xml");
    expect(feed.canonical_url).toBe("https://example.com/feed.xml");
    expect(feed.entry_limit).toBe(25);
  });

  test("update requires at least one feed setting", () => {
    expect(() => updateAudienceFeedInputSchema.parse({ audience_id: "aud_123" })).toThrow(
      "Provide at least one feed setting to update.",
    );
  });

  test("update accepts a single setting", () => {
    const out = updateAudienceFeedInputSchema.parse({
      audience_id: "aud_123",
      canonical_url: "https://example.com/feed.xml",
      entry_limit: 25,
    });
    expect(out.canonical_url).toBe("https://example.com/feed.xml");
    expect(out.entry_limit).toBe(25);
  });

  // The API caps feed URLs at 2000 characters; the MCP must never accept input the
  // API would reject.
  test("rejects feed URLs longer than the API's 2000 character cap", () => {
    const longUrl = `https://example.com/${"a".repeat(2_000)}`;
    expect(() =>
      updateAudienceFeedInputSchema.parse({ audience_id: "aud_123", site_url: longUrl }),
    ).toThrow("2000 characters or fewer");
    expect(() =>
      updateAudienceFeedInputSchema.parse({ audience_id: "aud_123", canonical_url: longUrl }),
    ).toThrow("2000 characters or fewer");
  });

  test("accepts null settings and rejects invalid entry limits", () => {
    expect(
      updateAudienceFeedInputSchema.parse({
        audience_id: "aud_123",
        canonical_url: null,
        entry_limit: null,
      }),
    ).toMatchObject({ canonical_url: null, entry_limit: null });
    expect(() =>
      updateAudienceFeedInputSchema.parse({ audience_id: "aud_123", entry_limit: 9 }),
    ).toThrow();
    expect(() =>
      updateAudienceFeedInputSchema.parse({ audience_id: "aud_123", entry_limit: 101 }),
    ).toThrow();
    expect(() =>
      updateAudienceFeedInputSchema.parse({ audience_id: "aud_123", entry_limit: 10.5 }),
    ).toThrow();
  });
});

describe("newsletter schemas", () => {
  test("create requires blocks, html, or text", () => {
    const out = createNewsletterInputSchema.parse({
      audience_id: "aud_123",
      sender_identity_id: "nwsid_123",
      name: "July Update",
      subject: "What shipped in July",
      body_html: "<p>Updates</p>",
      styling_mode: "plain",
    });
    expect(out.body_html).toBe("<p>Updates</p>");
    expect(out.styling_mode).toBe("plain");

    expect(() =>
      createNewsletterInputSchema.parse({
        audience_id: "aud_123",
        sender_identity_id: "nwsid_123",
        name: "July Update",
        subject: "What shipped in July",
      }),
    ).toThrow();
  });

  test("create accepts complete block shapes up to the server block limit", () => {
    const blocks = [
      { type: "heading", level: 1, text: "July updates" },
      { type: "list", ordered: false, items: ["One", "Two"] },
      { type: "callout", variant: "info", title: "Quick note", body: "A short intro." },
      {
        type: "columns",
        ratio: "50-50",
        left: { title: "For teams", body: "Shared inbox improvements." },
        right: { title: "For agents", body: "API and MCP improvements." },
      },
    ] as const;
    const out = createNewsletterInputSchema.parse({
      audience_id: "aud_123",
      sender_identity_id: "nwsid_123",
      name: "July Update",
      subject: "What shipped in July",
      blocks,
    });
    expect(out.blocks?.[1]?.type).toBe("list");

    expect(() =>
      createNewsletterInputSchema.parse({
        audience_id: "aud_123",
        sender_identity_id: "nwsid_123",
        name: "July Update",
        subject: "What shipped in July",
        blocks: Array.from({ length: 201 }, () => ({
          type: "paragraph",
          body: "Too many.",
        })),
      }),
    ).toThrow();
  });

  test("create from changelog accepts entries and media", () => {
    const out = createNewsletterFromChangelogInputSchema.parse({
      audience_id: "aud_123",
      sender_identity_id: "nwsid_123",
      name: "July Update",
      subject: "What shipped in July",
      tone: "technical",
      styling_mode: "plain",
      entries: [
        {
          title: "Media library",
          body: "Reuse uploaded assets.",
          media: [
            {
              kind: "video",
              video_url: "https://cdn.example.com/demo.mp4",
              thumbnail_url: "https://cdn.example.com/demo.jpg",
              label: "Watch demo",
            },
          ],
        },
      ],
    });
    expect(out.entries[0]?.title).toBe("Media library");
    expect(out.styling_mode).toBe("plain");
  });

  test("update accepts explicit nullable fields and rejects id-only input", () => {
    expect(
      updateNewsletterInputSchema.parse({
        id: "nws_123",
        preview_text: null,
        idempotency_key: "k",
      }).preview_text,
    ).toBeNull();
    expect(
      updateNewsletterInputSchema.parse({
        id: "nws_123",
        styling_mode: "styled",
      }).styling_mode,
    ).toBe("styled");
    expect(() => updateNewsletterInputSchema.parse({ id: "nws_123" })).toThrow();
    expect(() =>
      createNewsletterInputSchema.parse({
        audience_id: "aud_123",
        sender_identity_id: "nwsid_123",
        name: "July Update",
        subject: "What shipped in July",
        body_text: "Updates",
        styling_mode: "minimal",
      }),
    ).toThrow();
  });

  test("test send normalizes recipient email", () => {
    const out = sendNewsletterTestInputSchema.parse({
      id: "nws_123",
      recipient_email: "  User@Example.COM ",
    });
    expect(out.recipient_email).toBe("user@example.com");
  });

  test("schedule requires an ISO datetime", () => {
    expect(
      scheduleNewsletterInputSchema.parse({
        id: "nws_123",
        scheduled_at: "2026-08-01T09:00:00.000Z",
      }).scheduled_at,
    ).toBe("2026-08-01T09:00:00.000Z");
    expect(() =>
      scheduleNewsletterInputSchema.parse({
        id: "nws_123",
        scheduled_at: "tomorrow morning",
      }),
    ).toThrow();
  });

  test("newsletter output accepts the public response shape", () => {
    expect(
      newsletterSchema.parse({
        object: "newsletter",
        id: "nws_123",
        audience_id: "aud_123",
        sender_identity_id: "nwsid_123",
        newsletter_domain_id: "nwsdom_123",
        reply_to_mailbox_id: null,
        name: "July Update",
        subject: "What shipped in July",
        published_at: null,
        archive_url: null,
        preview_text: null,
        from_name: "ShipMail",
        from_address: "updates@example.com",
        reply_to_address: null,
        blocks: [{ type: "paragraph", body: "<p>Updates</p>" }],
        body_html: "<p>Updates</p>",
        body_text: null,
        status: "draft",
        archive_visibility: "private",
        styling_mode: "styled",
        preflight_status: "not_run",
        preflight_results: {},
        send_window_hours: 6,
        send_rate_per_hour: 100,
        recipient_count: 0,
        sent_count: 0,
        delivered_count: 0,
        bounced_count: 0,
        complained_count: 0,
        failed_count: 0,
        skipped_count: 0,
        last_test_sent_at: null,
        last_test_recipient: null,
        content_changed_since_test_send: false,
        scheduled_at: null,
        approved_at: null,
        started_at: null,
        completed_at: null,
        cancelled_at: null,
        created_at: "2026-07-03T00:00:00.000Z",
        updated_at: "2026-07-03T00:00:00.000Z",
      }).id,
    ).toBe("nws_123");
  });

  test("newsletter domain output accepts the public response shape", () => {
    expect(
      newsletterDomainSchema.parse({
        object: "newsletter_domain",
        id: "nwsdom_123",
        root_domain_id: "dom_123",
        domain_name: "updates.example.com",
        from_local_part: "updates",
        from_address: "updates@updates.example.com",
        mail_from_domain: "mail.updates.example.com",
        reply_to_mailbox_id: "mbx_123",
        status: "verified",
        dkim_status: "verified",
        mail_from_status: "verified",
        spf_status: "verified",
        dmarc_status: "verified",
        verified_at: "2026-07-03T00:00:00.000Z",
        created_at: "2026-07-03T00:00:00.000Z",
        updated_at: "2026-07-03T00:00:00.000Z",
      }).id,
    ).toBe("nwsdom_123");
  });
});

describe("sendMessageInputSchema attachment cutover", () => {
  test("accepts staged attachment IDs", () => {
    const out = sendMessageInputSchema.parse({
      mailbox_id: "mbx_123",
      to: ["recipient@example.com"],
      subject: "Report",
      text: "Attached.",
      staged_attachment_ids: ["sat_abc123"],
    });
    expect(out.staged_attachment_ids).toEqual(["sat_abc123"]);
  });

  test("rejects removed base64 attachment inputs", () => {
    expect(() =>
      sendMessageInputSchema.parse({
        mailbox_id: "mbx_123",
        to: ["recipient@example.com"],
        subject: "Report",
        text: "Attached.",
        attachments: [{ filename: "report.pdf", content: "AAAA" }],
      }),
    ).toThrow();
  });

  test("rejects malformed staged attachment IDs", () => {
    expect(() =>
      sendMessageInputSchema.parse({
        mailbox_id: "mbx_123",
        to: ["recipient@example.com"],
        subject: "Report",
        text: "Attached.",
        staged_attachment_ids: ["../sat_abc123"],
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
