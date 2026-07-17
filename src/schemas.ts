import type { NewsletterBlock } from "shipmail";
import {
  CONFERENCING_PROVIDER_IDS,
  DOMAIN_STATUSES,
  MESSAGE_SOURCES,
  MESSAGE_STATUSES,
  WEBHOOK_DELIVERY_EVENT_TYPES,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_EVENT_TYPES,
} from "shipmail";
import { z } from "zod/v4";

import { isPublicHttpsUrl } from "./url-policy.js";

const ID_REGEX = /^[A-Za-z0-9_-]{1,100}$/;
// API spec accepts printable ASCII 1-255 (`Idempotency-Key` header). Mirror it.
const IDEMPOTENCY_REGEX = /^[\x20-\x7E]{1,255}$/;
const EMAIL_MAX_LENGTH = 254;
const RECIPIENT_NAME_MAX = 120;
// Reject ASCII control chars and DEL on inputs that later flow back to the LLM.
// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARS = /^[^\x00-\x1F\x7F]*$/;
// Filenames must reject control chars AND path separators / Windows-reserved chars.
// eslint-disable-next-line no-control-regex
const FILENAME_SAFE = /^[^\x00-\x1F\x7F/\\:*?"<>|]+$/;
const MIME_TYPE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/;
// Hostname-style domain: labels of [a-z0-9-] separated by dots, each label
// 1-63 chars and not starting/ending with hyphen. Tightens the previous bare
// `z.string().min(1).max(253)` so prompt-injection bytes cannot pass.
const DOMAIN_NAME_REGEX =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
// Cursor tokens are opaque base64-ish; restrict character set to prevent header
// injection or LLM-driven smuggling through pagination state.
const CURSOR_REGEX = /^[A-Za-z0-9_\-=.+/]{1,512}$/;
// SUPPRESSION_REASONS is not exported by the SDK; mirror the OpenAPI enum here.
const SUPPRESSION_REASONS = ["hard_bounce", "complaint", "manual"] as const;
const MAILBOX_RULE_MATCH_MODES = ["all", "any"] as const;
const MAILBOX_RULE_SYSTEM_TARGET_ROLES = ["inbox", "archive", "junk", "trash"] as const;
const SYSTEM_FOLDER_NAMES = [
  "inbox",
  "starred",
  "sent",
  "drafts",
  "archive",
  "junk",
  "trash",
] as const;
const JMAP_KEYWORDS = ["$flagged", "$seen", "$draft", "$answered", "$forwarded"] as const;
const NEWSLETTER_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "sending",
  "paused",
  "sent",
  "cancelled",
  "failed",
] as const;
const NEWSLETTER_DOMAIN_STATUSES = [
  "pending",
  "verifying",
  "verified",
  "failed",
  "disabled",
] as const;
const NEWSLETTER_DOMAIN_RECORD_STATUSES = ["pending", "verified", "failed"] as const;
const NEWSLETTER_ARCHIVE_VISIBILITIES = ["private", "public"] as const;
const NEWSLETTER_PREFLIGHT_STATUSES = ["not_run", "passed", "warning", "failed"] as const;
const NEWSLETTER_PREFLIGHT_ITEM_STATUSES = ["pass", "warn", "fail"] as const;
const NEWSLETTER_TEST_SEND_STATUSES = ["pending", "sent", "failed"] as const;
const COMMON_MAILBOX_PASSWORDS = new Set([
  "password",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "password1",
  "iloveyou",
  "sunshine1",
  "princess1",
  "football1",
  "charlie1",
  "access14",
  "trustno1",
  "letmein1",
  "master12",
  "dragon12",
  "monkey12",
  "shadow12",
  "abc12345",
  "password123",
  "admin123",
  "welcome1",
  "qwerty12",
  "passw0rd",
  "p@ssw0rd",
  "changeme",
]);

const publicHttpsUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => isPublicHttpsUrl(value), {
    message: "URL must use https and a public host (no localhost, private IPs, or .internal).",
  });

const newsletterLinkUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
    } catch {
      return false;
    }
  }, "URL must be absolute http, https, or mailto.");

const newsletterVideoUrlSchema = publicHttpsUrlSchema.refine((value) => {
  try {
    return /\.(?:mov|mp4|webm)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}, "Video URL must be an absolute https MP4, MOV, or WebM URL.");

const emailSchema = z
  .string()
  .max(EMAIL_MAX_LENGTH * 2)
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z
      .email()
      .max(EMAIL_MAX_LENGTH)
      .refine((value) => NO_CONTROL_CHARS.test(value), {
        message: "Email must not contain control characters.",
      }),
  );

const recipientNameSchema = z
  .string()
  .max(RECIPIENT_NAME_MAX)
  .refine((value) => NO_CONTROL_CHARS.test(value), {
    message: "Display name must not contain control characters.",
  });

const noControlString = (max: number, fieldName: string) =>
  z
    .string()
    .max(max)
    .refine((value) => NO_CONTROL_CHARS.test(value), {
      message: `${fieldName} must not contain control characters.`,
    });

export const idSchema = z
  .string()
  .regex(ID_REGEX, "ID must be 1-100 characters of [A-Za-z0-9_-].")
  .describe("ShipMail resource ID.");

const calendarIdInputSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => NO_CONTROL_CHARS.test(value), {
    message: "Calendar ID must not contain control characters.",
  })
  .describe("Opaque calendar ID.");

const calendarEventIdInputSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => NO_CONTROL_CHARS.test(value), {
    message: "Calendar event ID must not contain control characters.",
  })
  .describe("Opaque calendar event ID.");

export const idempotencyKeySchema = z
  .string()
  .regex(IDEMPOTENCY_REGEX, "Idempotency key must be 1-255 printable ASCII characters.")
  .optional()
  .describe("Optional idempotency key. If omitted, the MCP server generates one for POST tools.");

export const domainNameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(DOMAIN_NAME_REGEX, "Must be a valid domain name (e.g. example.com).");

export const paginationInputSchema = z.object({
  cursor: z
    .string()
    .regex(CURSOR_REGEX, "Cursor must be 1-512 characters of [A-Za-z0-9_\\-=.+/].")
    .optional()
    .describe("Pagination cursor returned by the previous call."),
  limit: z.number().int().min(1).max(100).default(25).describe("Maximum results to return."),
});

export const paginationSchema = z.object({
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  limit: z.number(),
});

export const statusSchema = z.object({
  status: z.string(),
  version: z.string(),
  time: z.string(),
  request_id: z.string(),
});

export const registrationSchema = z.object({
  expires_at: z.string(),
  auto_renew: z.boolean(),
  renewal_price: z.number(),
  currency: z.string(),
  registered_at: z.string(),
  privacy_enabled: z.boolean(),
});

export const domainSchema = z.object({
  object: z.literal("domain"),
  id: z.string(),
  name: z.string(),
  status: z.enum(DOMAIN_STATUSES),
  managed_by: z.enum(["external", "shipmail"] as const),
  dns_provider: z.string().nullable(),
  mx_verified: z.boolean(),
  spf_verified: z.boolean(),
  dkim_verified: z.boolean(),
  dmarc_verified: z.boolean(),
  dmarc_managed_externally: z.boolean(),
  outbound_verified: z.boolean(),
  catch_all_mailbox_id: z.string().nullable(),
  verified_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  registration: registrationSchema.optional(),
});

export const autoReplySchema = z.object({
  enabled: z.boolean(),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  from_date: z.string().nullable(),
  to_date: z.string().nullable(),
});

export const mailboxSchema = z.object({
  object: z.literal("mailbox"),
  id: z.string(),
  domain_id: z.string(),
  address: z.string(),
  display_name: z.string().nullable(),
  suspended_at: z.string().nullable(),
  suspension_reasons: z.array(z.enum(["billing", "manual", "security"] as const)),
  spam_filter_threshold: z.number(),
  auto_reply: autoReplySchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const mailboxExportSchema = z.object({
  object: z.literal("mailbox_export"),
  id: z.string(),
  mailbox_id: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed", "expired"] as const),
  format: z.literal("zip"),
  format_version: z.number().int().positive(),
  file_size: z.number().int().nonnegative().nullable(),
  message_count: z.number().int().nonnegative().nullable(),
  folder_count: z.number().int().nonnegative().nullable(),
  error_code: z
    .enum(["source_unavailable", "snapshot_changed", "export_failed"] as const)
    .nullable(),
  download_url: z.url().nullable(),
  download_url_expires_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});

export const mailboxAppPasswordSchema = z.object({
  object: z.literal("mailbox_app_password"),
  id: z.string(),
  mailbox_id: z.string(),
  name: z.string(),
  state: z.enum(["pending_create", "active", "pending_revoke", "revoked", "failed"] as const),
  purpose: z.enum(["operator_client", "partner_embedded_webmail"] as const),
  expires_at: z.string().nullable(),
  allowed_cidrs: z.array(z.string()),
  last_used_at: z.string().nullable(),
  created_at: z.string(),
  revoked_at: z.string().nullable(),
});

export const createdMailboxAppPasswordSchema = mailboxAppPasswordSchema.extend({
  secret: z.string(),
});

export const partnerMailboxCredentialSchema = createdMailboxAppPasswordSchema.extend({
  operator_notified: z.boolean(),
});

export const partnerMailboxCredentialGrantSchema = z.object({
  object: z.literal("partner_mailbox_credential_grant"),
  id: z.string(),
  partner_organization_id: z.string(),
  organization_id: z.string(),
  organization_name: z.string(),
  external_reference: z.string(),
  operator_email: z.string(),
  mailbox_id: z.string(),
  mailbox_address: z.string(),
  disclosure_version: z.string(),
  expires_at: z.string(),
  consented_at: z.string(),
});

export const mailboxFolderSchema = z.object({
  object: z.literal("mailbox_folder"),
  id: z.string(),
  name: z.string(),
  parent_id: z.string().nullable(),
  role: z.string().nullable(),
  kind: z.enum(["custom", "system"] as const),
  total_emails: z.number().int().min(0),
  unread_emails: z.number().int().min(0),
  unread_threads: z.number().int().min(0),
  sort_order: z.number().int(),
});

export const mailboxFoldersSchema = z.object({
  object: z.literal("mailbox_folders"),
  mailbox_id: z.string(),
  address: z.string(),
  data: z.array(mailboxFolderSchema),
});

export const mailboxIdentitySchema = z.object({
  object: z.literal("mailbox_identity"),
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

export const mailboxIdentitiesSchema = z.object({
  object: z.literal("mailbox_identities"),
  mailbox_id: z.string(),
  address: z.string(),
  data: z.array(mailboxIdentitySchema),
});

export const inboxEmailHeaderSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
});

export const inboxAttachmentSchema = z.object({
  part_id: z.string(),
  blob_id: z.string(),
  name: z.string().nullable(),
  content_type: z.string(),
  size: z.number(),
  download_path: z.string(),
});

export const inboxBodyPartSchema = z.object({
  part_id: z.string(),
  type: z.string(),
});

export const inboxBodyValueSchema = z.object({
  value: z.string(),
  is_encoding_problem: z.boolean(),
});

export const inboxMessageSchema = z.object({
  object: z.literal("inbox_message"),
  id: z.string(),
  thread_id: z.string(),
  mailbox_id: z.string(),
  address: z.string(),
  folder_ids: z.array(z.string()),
  keywords: z.record(z.string(), z.boolean()),
  from: z.array(inboxEmailHeaderSchema).nullable(),
  to: z.array(inboxEmailHeaderSchema).nullable(),
  subject: z.string().nullable(),
  received_at: z.string(),
  preview: z.string(),
  has_attachment: z.boolean(),
  size: z.number(),
});

export const inboxFullMessageSchema = inboxMessageSchema.omit({ object: true }).extend({
  object: z.literal("inbox_message_full"),
  cc: z.array(inboxEmailHeaderSchema).nullable(),
  reply_to: z.array(inboxEmailHeaderSchema).nullable(),
  message_id: z.array(z.string()).nullable(),
  in_reply_to: z.array(z.string()).nullable(),
  references: z.array(z.string()).nullable(),
  body_values: z.record(z.string(), inboxBodyValueSchema),
  text_body: z.array(inboxBodyPartSchema),
  html_body: z.array(inboxBodyPartSchema),
  attachments: z.array(inboxAttachmentSchema),
});

export const inboxMessagesSchema = z.object({
  object: z.literal("inbox_messages"),
  mailbox_id: z.string(),
  address: z.string(),
  data: z.array(inboxFullMessageSchema),
  pagination: z.object({
    position: z.number(),
    limit: z.number(),
    total: z.number(),
    has_more: z.boolean(),
    next_position: z.number().nullable(),
  }),
});

export const inboxThreadSchema = z.object({
  object: z.literal("inbox_thread"),
  mailbox_id: z.string(),
  address: z.string(),
  thread_id: z.string(),
  data: z.array(inboxFullMessageSchema),
});

export const inboxMessageActionSchema = z.object({
  object: z.literal("inbox_message_action"),
  mailbox_id: z.string(),
  address: z.string(),
  message_id: z.string(),
  ok: z.literal(true),
});

const folderNameSchema = z
  .string()
  .transform((name) => name.trim())
  .pipe(
    noControlString(100, "name")
      .min(1)
      .refine((name) => {
        const normalized = name.trim().toLowerCase();
        return (
          normalized.length > 0 &&
          !name.includes("/") &&
          !name.includes("\\") &&
          !(SYSTEM_FOLDER_NAMES as readonly string[]).includes(normalized)
        );
      }, "Invalid or reserved folder name."),
  );

const folderIdSchema = noControlString(256, "folder_id").min(1);

type MailboxRuleConditionInput =
  | {
      readonly type:
        | "from_is"
        | "from_contains"
        | "recipient_is"
        | "plus_tag_is"
        | "subject_contains";
      readonly value: string;
    }
  | {
      readonly type: "has_attachment" | "list_unsubscribe_exists";
    }
  | {
      readonly type: "group";
      readonly match_mode: "all" | "any";
      readonly conditions: readonly MailboxRuleConditionInput[];
    };

export const mailboxRuleConditionSchema: z.ZodType<MailboxRuleConditionInput> = z.lazy(() =>
  z.union([
    z.object({
      type: z.enum([
        "from_is",
        "from_contains",
        "recipient_is",
        "plus_tag_is",
        "subject_contains",
      ] as const),
      value: noControlString(256, "condition value").min(1),
    }),
    z.object({
      type: z.enum(["has_attachment", "list_unsubscribe_exists"] as const),
    }),
    z.object({
      type: z.literal("group"),
      match_mode: z.enum(MAILBOX_RULE_MATCH_MODES),
      conditions: z.array(mailboxRuleConditionSchema).min(1).max(10),
    }),
  ]),
);

export const mailboxRuleActionSchema = z.union([
  z.object({
    type: z.literal("move"),
    target: z.union([
      z.object({
        kind: z.literal("system"),
        role: z.enum(MAILBOX_RULE_SYSTEM_TARGET_ROLES),
      }),
      z.object({
        kind: z.literal("custom"),
        folder_id: noControlString(256, "folder_id").min(1),
      }),
    ]),
  }),
  z.object({
    type: z.enum(["mark_read", "star"] as const),
  }),
  z.object({
    type: z.literal("send_webhook"),
  }),
  z.object({
    type: z.literal("ai_draft_reply"),
    instructions: noControlString(2000, "instructions").min(1),
    reply_mode: z.enum(["reply", "reply_all"] as const),
    agent_policy: z.enum(["observe_only", "draft_for_review"] as const),
  }),
]);

export const mailboxRuleSchema = z.object({
  id: z.uuid("Rule ID must be a UUID."),
  name: noControlString(120, "name").min(1),
  enabled: z.boolean(),
  position: z.number().int().min(0),
  match_mode: z.enum(MAILBOX_RULE_MATCH_MODES),
  stop: z.boolean(),
  conditions: z.array(mailboxRuleConditionSchema).min(1).max(10),
  actions: z.array(mailboxRuleActionSchema).min(1).max(5),
});

export const mailboxRuleFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parent_id: z.string().nullable(),
  role: z.string().nullable(),
  kind: z.enum(["custom", "system"] as const),
});

export const mailboxRulesSchema = z.object({
  object: z.literal("mailbox_rules"),
  mailbox_id: z.string(),
  address: z.string(),
  rules: z.array(mailboxRuleSchema),
  folders: z.array(mailboxRuleFolderSchema),
});

export const mailboxForwardingSchema = z.object({
  object: z.literal("mailbox_forwarding"),
  id: z.string(),
  mailbox_id: z.string(),
  destination: emailSchema,
  status: z.enum(["pending", "active"] as const),
  verification_sent_at: z.string().nullable(),
  verified_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const mailboxForwardingListSchema = z.object({
  object: z.literal("mailbox_forwarding_list"),
  mailbox_id: z.string(),
  data: z.array(mailboxForwardingSchema).max(3),
});

export const recipientObjectSchema = z.object({
  address: emailSchema,
  name: recipientNameSchema.nullable().optional(),
});

export const recipientInputSchema = z.union([emailSchema, recipientObjectSchema]);

export const attachmentInputSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .regex(FILENAME_SAFE, "Filename must not contain control chars or path separators.")
    .refine((value) => !value.includes(".."), {
      message: "Filename must not contain '..'.",
    }),
  content: z.string().min(1).max(10_485_760).describe("Base64 encoded attachment content."),
  content_type: z
    .string()
    .max(256)
    .refine(
      (value) => MIME_TYPE_REGEX.test(value.split(";")[0]?.trim() ?? ""),
      "content_type must be a valid MIME type.",
    )
    .optional(),
});

const messageMetadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const messageMetadataSchema = z
  .record(noControlString(64, "metadata key").min(1), messageMetadataValueSchema)
  .refine((value) => Object.keys(value).length <= 20, {
    message: "metadata must contain at most 20 keys.",
  })
  .refine((value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= 8_192, {
    message: "metadata must be at most 8 KB.",
  });

const sourceRfcMessageIdSchema = noControlString(998, "source_rfc_message_id").regex(
  /^<[^<>\s@]+@[^<>\s@]+>$/,
  "source_rfc_message_id must be an ASCII RFC Message-ID in <local@domain> form.",
);

const outboundHeaderSchema = z
  .object({
    name: noControlString(78, "header name").regex(/^[A-Za-z0-9-]+$/),
    value: noControlString(998, "header value").min(1),
  })
  .superRefine((header, ctx) => {
    const name = header.name.toLowerCase();
    const allowed =
      name === "list-unsubscribe" ||
      name === "list-unsubscribe-post" ||
      (name.startsWith("x-") &&
        !name.startsWith("x-ses-") &&
        !name.startsWith("x-sm-") &&
        !name.startsWith("x-shipmail-"));
    if (!allowed) {
      ctx.addIssue({ code: "custom", message: "Header is not allowed." });
    }
    if (name === "list-unsubscribe-post" && header.value !== "List-Unsubscribe=One-Click") {
      ctx.addIssue({
        code: "custom",
        message: "List-Unsubscribe-Post must be List-Unsubscribe=One-Click.",
      });
    }
    if (name === "list-unsubscribe" && !/<https:\/\/[^>]+>/i.test(header.value)) {
      ctx.addIssue({ code: "custom", message: "List-Unsubscribe must contain an HTTPS URL." });
    }
  });

const outboundHeadersSchema = z.array(outboundHeaderSchema).max(20);

export const messageSchema = z.object({
  object: z.literal("message"),
  id: z.string(),
  mailbox_id: z.string(),
  thread_id: z.string().nullable(),
  source_rfc_message_id: z.string().nullable(),
  delivered_rfc_message_id: z.string().nullable(),
  client_reference: z.string().nullable(),
  metadata: z.record(z.string(), messageMetadataValueSchema),
  headers: outboundHeadersSchema,
  subject: z.string().nullable(),
  from_address: z.string().nullable(),
  to_addresses: z.array(recipientObjectSchema).nullable(),
  cc_addresses: z.array(recipientObjectSchema).nullable(),
  bcc_addresses: z.array(recipientObjectSchema).nullable(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        size: z.number(),
        content_type: z.string(),
      }),
    )
    .nullable(),
  source: z.enum(MESSAGE_SOURCES),
  mode: z.enum(["live", "test"] as const),
  status: z.enum(MESSAGE_STATUSES),
  scheduled_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const threadSchema = z.object({
  object: z.literal("thread"),
  id: z.string(),
  mailbox_id: z.string(),
  subject: z.string().nullable(),
  message_count: z.number(),
  latest_message: messageSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const domainVerificationSchema = z.object({
  all_verified: z.boolean(),
  records: z.object({
    mx: z.boolean(),
    spf: z.boolean(),
    dkim: z.boolean(),
    dmarc: z.boolean(),
  }),
  outbound_verified: z.boolean(),
  outbound_error: z.boolean(),
  existing_spf: z.string().nullable(),
  suggested_spf: z.string().nullable(),
  conflicting_mx: z.array(z.string()),
  dmarc_valid: z.boolean(),
  dmarc_exact_match: z.boolean(),
  dmarc_record_value: z.string().nullable(),
  dmarc_managed_externally: z.boolean(),
});

export const domainDnsRecordSchema = z.object({
  key: z.enum(["mx", "spf", "mail_from_mx", "mail_from_spf", "dkim", "dmarc"] as const),
  type: z.enum(["MX", "TXT"] as const),
  host: z.string(),
  value: z.string().nullable(),
  priority: z.number().int().nullable(),
  ttl: z.number().int().positive(),
  status: z.enum(["verified", "not_found", "mismatch", "pending"] as const),
  found_values: z.array(z.string()),
});

export const domainDnsRecordSetSchema = z.object({
  object: z.literal("dns_record_set"),
  domain_id: z.string(),
  domain_name: z.string(),
  all_verified: z.boolean(),
  checked_at: z.string(),
  records: z.array(domainDnsRecordSchema),
});

export const domainSearchResultSchema = z.object({
  domain_name: z.string(),
  available: z.boolean(),
  purchase_price: z.number().nullable(),
  renewal_price: z.number().nullable(),
  currency: z.string(),
  premium: z.boolean(),
});

export const webhookSchema = z.object({
  object: z.literal("webhook"),
  id: z.string(),
  url: z.string(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)),
  active: z.boolean(),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const webhookWithSecretSchema = webhookSchema.extend({
  secret: z.string(),
});

export const webhookDeliverySchema = z.object({
  object: z.literal("webhook_delivery"),
  id: z.string(),
  event_id: z.string(),
  event_type: z.enum(WEBHOOK_DELIVERY_EVENT_TYPES),
  mode: z.enum(["live", "test"] as const),
  status: z.enum(WEBHOOK_DELIVERY_STATUSES),
  attempts: z.number(),
  last_status_code: z.number().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  delivered_at: z.string().nullable(),
});

export const webhookDeliveryDetailSchema = webhookDeliverySchema.extend({
  payload: z.unknown(),
  next_attempt_at: z.string().nullable(),
  replayed_from_delivery_id: z.string().nullable(),
});

export const suppressionSchema = z.object({
  object: z.literal("suppression"),
  email_address: z.string(),
  reason: z.enum(SUPPRESSION_REASONS),
  created_at: z.string(),
});

export const acknowledgmentSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});

export const statusOutputSchema = z.object({ status: statusSchema });
export const domainOutputSchema = z.object({ domain: domainSchema });
export const domainDnsRecordsOutputSchema = z.object({ dns_records: domainDnsRecordSetSchema });
export const mailboxOutputSchema = z.object({ mailbox: mailboxSchema });
export const mailboxExportOutputSchema = z.object({ export: mailboxExportSchema });
export const mailboxAppPasswordOutputSchema = z.object({
  app_password: mailboxAppPasswordSchema,
});
export const createdMailboxAppPasswordOutputSchema = z.object({
  app_password: createdMailboxAppPasswordSchema,
});
export const mailboxAppPasswordsOutputSchema = z.object({
  app_passwords: z.object({
    object: z.literal("list"),
    data: z.array(mailboxAppPasswordSchema),
  }),
});
export const partnerMailboxCredentialOutputSchema = z.object({
  credential: partnerMailboxCredentialSchema,
});
export const partnerMailboxCredentialGrantsOutputSchema = z.object({
  grants: z.object({
    data: z.array(partnerMailboxCredentialGrantSchema),
  }),
});
export const mailboxFolderOutputSchema = z.object({ folder: mailboxFolderSchema });
export const mailboxFoldersOutputSchema = z.object({ folders: mailboxFoldersSchema });
export const mailboxIdentitiesOutputSchema = z.object({ identities: mailboxIdentitiesSchema });
export const inboxMessagesOutputSchema = z.object({ inbox_messages: inboxMessagesSchema });
export const inboxThreadOutputSchema = z.object({ inbox_thread: inboxThreadSchema });
export const inboxMessageActionOutputSchema = z.object({
  inbox_message_action: inboxMessageActionSchema,
});
export const mailboxRulesOutputSchema = z.object({ rules: mailboxRulesSchema });
export const mailboxForwardingOutputSchema = z.object({ forwarding: mailboxForwardingSchema });
export const mailboxForwardingListOutputSchema = z.object({
  forwarding: mailboxForwardingListSchema,
});
export const messageOutputSchema = z.object({ message: messageSchema });
export const webhookOutputSchema = z.object({ webhook: webhookSchema });
export const webhookWithSecretOutputSchema = z.object({ webhook: webhookWithSecretSchema });
export const webhookSecretOutputSchema = z.object({
  secret: z.string(),
  previous_secret_expires_at: z.string(),
});
export const webhookTestOutputSchema = z.object({ event_id: z.string() });
export const verificationOutputSchema = z.object({ verification: domainVerificationSchema });
export const domainSearchOutputSchema = z.object({
  results: z.array(domainSearchResultSchema),
});
export const domainsOutputSchema = z.object({
  data: z.array(domainSchema),
  pagination: paginationSchema,
});
export const mailboxesOutputSchema = z.object({
  data: z.array(mailboxSchema),
  pagination: paginationSchema,
});
export const messagesOutputSchema = z.object({
  data: z.array(messageSchema),
  pagination: paginationSchema,
});
export const threadsOutputSchema = z.object({
  data: z.array(threadSchema),
  pagination: paginationSchema,
});
export const threadMessagesOutputSchema = messagesOutputSchema;
export const webhooksOutputSchema = z.object({
  data: z.array(webhookSchema),
  pagination: paginationSchema,
});
export const webhookDeliveriesOutputSchema = z.object({
  data: z.array(webhookDeliverySchema),
  pagination: paginationSchema,
});
export const webhookDeliveryDetailOutputSchema = z.object({
  webhook_delivery: webhookDeliveryDetailSchema,
});
export const suppressionsOutputSchema = z.object({
  data: z.array(suppressionSchema),
  pagination: paginationSchema,
});
export const acknowledgmentOutputSchema = z.object({ result: acknowledgmentSchema });

export const listDomainsInputSchema = paginationInputSchema;
export const getByIdInputSchema = z.object({ id: idSchema });
export const idempotentByIdInputSchema = z.object({
  id: idSchema,
  idempotency_key: idempotencyKeySchema,
});

export const createMailboxImportInputSchema = z.object({
  id: idSchema,
  provider: z
    .enum([
      "gmail",
      "yahoo",
      "aol",
      "icloud",
      "fastmail",
      "zoho",
      "infomaniak",
      "ovh",
      "gandi",
      "imap",
    ])
    .describe("Source provider. Outlook imports require the dashboard's Microsoft sign-in."),
  email: z.string().min(3).max(320).describe("Address of the source mailbox"),
  password: z
    .string()
    .min(1)
    .max(1024)
    .describe("App password, device password, or IMAP password for the source mailbox"),
  host: z
    .string()
    .min(1)
    .max(253)
    .optional()
    .describe("IMAP server. Required for 'imap'; optional OVHcloud server override for 'ovh'."),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .describe("IMAP port. Used for 'imap' and optional OVHcloud overrides."),
  range: z
    .enum(["all", "12m", "3m", "1m"])
    .optional()
    .describe("How far back to import. Defaults to all."),
  include_spam: z.boolean().optional().describe("Also import the source spam folder"),
  include_trash: z.boolean().optional().describe("Also import the source trash folder"),
});

export const importScopedInputSchema = z.object({
  id: idSchema,
  import_id: z.string().min(1).describe("Import ID, starts with imp_"),
});

export const mailboxExportScopedInputSchema = z.object({
  id: idSchema.describe("Mailbox ID."),
  export_id: idSchema.describe("Mailbox export ID, starts with mbexp_."),
});

const importCountsSchema = z.object({
  found: z.number(),
  imported: z.number(),
  undone: z.number(),
  duplicates_skipped: z.number(),
  oversize_skipped: z.number(),
  failed: z.number(),
  contacts_imported: z.number(),
});

const importFolderSchema = z.object({
  source_folder: z.string(),
  target_folder: z.string().nullable(),
  role: z.string().nullable(),
  state: z.enum(["pending", "importing", "completed", "failed"]),
  found: z.number(),
  imported: z.number(),
  duplicates: z.number(),
  oversize: z.number(),
  failed: z.number(),
});

export const importSchema = z.object({
  object: z.literal("import"),
  id: z.string(),
  mailbox_id: z.string(),
  kind: z.enum(["imap", "file"]),
  provider: z.string(),
  source_address: z.string().nullable(),
  status: z.enum([
    "queued",
    "running",
    "paused_throttle",
    "paused_quota",
    "completed",
    "failed",
    "cancelled",
    "undo_queued",
    "undoing",
    "undone",
    "undo_failed",
  ]),
  status_detail: z.string().nullable(),
  error: z.string().nullable(),
  resume_at: z.string().nullable(),
  counts: importCountsSchema,
  bytes: z.object({ total: z.number(), imported: z.number() }),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  folders: z.array(importFolderSchema).optional(),
});

export const importOutputSchema = z.object({ import: importSchema });
export const importsOutputSchema = z.object({
  imports: z.object({
    object: z.literal("imports"),
    mailbox_id: z.string(),
    data: z.array(importSchema),
  }),
});
export const createDomainInputSchema = z.object({
  name: domainNameSchema.describe("Domain name to add to ShipMail."),
  idempotency_key: idempotencyKeySchema,
});
export const updateDomainInputSchema = z.object({
  id: idSchema,
  catch_all_mailbox_id: idSchema
    .nullable()
    .describe("Mailbox ID to receive catch-all mail, or null to clear."),
  idempotency_key: idempotencyKeySchema,
});
export const searchDomainsInputSchema = z.object({
  keyword: noControlString(253, "keyword").min(1).describe("Keyword or domain name to search."),
});

export const listMailboxesInputSchema = paginationInputSchema.extend({
  domain_id: idSchema.optional().describe("Filter mailboxes by domain ID."),
});
export const createMailboxInputSchema = z
  .object({
    domain_id: idSchema,
    address: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/),
    password: z
      .string()
      .min(8)
      .max(128)
      .refine((value) => /[a-z]/.test(value), "Password must include a lowercase letter.")
      .refine((value) => /[A-Z]/.test(value), "Password must include an uppercase letter.")
      .refine((value) => /[0-9]/.test(value), "Password must include a number.")
      .refine(
        (value) => !COMMON_MAILBOX_PASSWORDS.has(value.toLowerCase()),
        "This password is too common. Choose something stronger.",
      )
      .optional(),
    generate_password: z.literal(true).optional(),
    display_name: recipientNameSchema.max(128).optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.password) === Boolean(value.generate_password)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Provide password or set generate_password to true, but not both.",
      });
    }
  });
export const updateMailboxInputSchema = z.object({
  id: idSchema,
  display_name: recipientNameSchema
    .max(200)
    .nullable()
    .describe("New display name, or null to clear."),
  idempotency_key: idempotencyKeySchema,
});
const appPasswordCidrInputSchema = z.union([
  z.cidrv4("Must be a valid IPv4 CIDR range."),
  z.cidrv6("Must be a valid IPv6 CIDR range."),
]);
export const createMailboxAppPasswordInputSchema = z.object({
  id: idSchema.describe("Mailbox ID."),
  name: noControlString(100, "name").trim().min(1),
  expires_at: z.iso.datetime().optional(),
  allowed_cidrs: z.array(appPasswordCidrInputSchema).max(20).optional(),
});
export const revokeMailboxAppPasswordInputSchema = z.object({
  id: idSchema.describe("Mailbox ID."),
  app_password_id: idSchema.describe("App password ID."),
});
export const createMailboxFolderInputSchema = z.object({
  id: idSchema,
  name: folderNameSchema.describe("Custom folder name to create."),
  parent_id: folderIdSchema
    .nullable()
    .describe("Parent folder ID for a subfolder, or null to create a root folder."),
  idempotency_key: idempotencyKeySchema,
});
export const updateMailboxFolderInputSchema = z.object({
  id: idSchema,
  folder_id: folderIdSchema,
  name: folderNameSchema.describe("New custom folder name."),
  idempotency_key: idempotencyKeySchema,
});
export const deleteMailboxFolderInputSchema = z.object({
  id: idSchema,
  folder_id: folderIdSchema,
});
export const resetPasswordInputSchema = z.object({
  id: idSchema,
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((value) => /[a-z]/.test(value), "Password must include a lowercase letter.")
    .refine((value) => /[A-Z]/.test(value), "Password must include an uppercase letter.")
    .refine((value) => /[0-9]/.test(value), "Password must include a number."),
  idempotency_key: idempotencyKeySchema,
});
export const updateMailboxRulesInputSchema = z.object({
  id: idSchema,
  rules: z.array(mailboxRuleSchema).max(50),
  idempotency_key: idempotencyKeySchema,
});
export const createMailboxForwardingInputSchema = z.object({
  id: idSchema,
  destination: emailSchema,
  idempotency_key: idempotencyKeySchema,
});
export const deleteMailboxForwardingInputSchema = z.object({
  id: idSchema,
  forwarding_id: idSchema,
});
export const autoReplyInputSchema = z
  .object({
    id: idSchema,
    enabled: z.boolean(),
    subject: noControlString(998, "subject").nullable().optional(),
    body: noControlString(5000, "body").nullable().optional(),
    from_date: z.iso.datetime().nullable().optional(),
    to_date: z.iso.datetime().nullable().optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .refine((value) => !value.enabled || Boolean(value.body && value.body.trim().length > 0), {
    message: "body is required when enabling auto-reply.",
  });

export const spamFilterInputSchema = z.object({
  id: idSchema,
  threshold: z.number().int().min(1).max(14),
  idempotency_key: idempotencyKeySchema,
});

export const listMailboxInboxMessagesInputSchema = z
  .object({
    id: idSchema.describe("Mailbox ID."),
    folder_id: folderIdSchema.optional(),
    folder_role: z.enum(SYSTEM_FOLDER_NAMES).optional(),
    search_text: noControlString(500, "search_text").optional(),
    position: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(50),
    has_keyword: z.enum(JMAP_KEYWORDS).optional(),
    not_keyword: z.enum(JMAP_KEYWORDS).optional(),
  })
  .refine((value) => !(value.folder_id && value.folder_role), {
    message: "Use either folder_id or folder_role, not both.",
  });

export const getMailboxInboxThreadInputSchema = z.object({
  id: idSchema.describe("Mailbox ID."),
  thread_id: noControlString(256, "thread_id").min(1).describe("JMAP inbox thread ID."),
});

export const updateInboxMessageInputSchema = z
  .object({
    id: idSchema.describe("Mailbox ID."),
    message_id: noControlString(256, "message_id").min(1).describe("JMAP inbox message ID."),
    read: z.boolean().optional().describe("Set the message read state."),
    starred: z.boolean().optional().describe("Set the message starred state."),
    idempotency_key: idempotencyKeySchema,
  })
  .refine((value) => value.read !== undefined || value.starred !== undefined, {
    message: "Provide read or starred.",
  });

export const moveInboxMessageInputSchema = z
  .object({
    id: idSchema.describe("Mailbox ID."),
    message_id: noControlString(256, "message_id").min(1).describe("JMAP inbox message ID."),
    from_folder_id: folderIdSchema.optional().describe("Current folder ID, if already known."),
    target_role: z.enum(["inbox", "archive", "junk", "trash"] as const).optional(),
    target_folder_id: folderIdSchema.optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .refine((value) => Boolean(value.target_role) !== Boolean(value.target_folder_id), {
    message: "Use either target_role or target_folder_id.",
  });

export const deleteInboxMessageInputSchema = z.object({
  id: idSchema.describe("Mailbox ID."),
  message_id: noControlString(256, "message_id").min(1).describe("JMAP inbox message ID."),
  idempotency_key: idempotencyKeySchema,
});

export const listMessagesInputSchema = paginationInputSchema
  .extend({
    mailbox_id: idSchema.optional(),
    client_reference: noControlString(255, "client_reference").min(1).optional(),
  })
  .refine((value) => Boolean(value.mailbox_id || value.client_reference), {
    message: "Provide mailbox_id or client_reference.",
  });
export const sendMessageInputSchema = z
  .object({
    mailbox_id: idSchema.describe(
      "Mailbox ID to send from. Prefer this over email address lookup.",
    ),
    to: z.array(recipientInputSchema).min(1).max(50),
    cc: z.array(recipientInputSchema).max(50).optional(),
    bcc: z.array(recipientInputSchema).max(50).optional(),
    reply_to: recipientInputSchema.optional(),
    subject: noControlString(998, "subject").min(1),
    html: z.string().max(512_000).optional(),
    text: z.string().max(256_000).optional(),
    in_reply_to: noControlString(998, "in_reply_to").optional(),
    references: z.array(noControlString(998, "references")).max(50).optional(),
    attachments: z.array(attachmentInputSchema).max(10).optional(),
    client_reference: noControlString(255, "client_reference").min(1).optional(),
    metadata: messageMetadataSchema.optional(),
    source_rfc_message_id: sourceRfcMessageIdSchema.optional(),
    headers: outboundHeadersSchema.optional(),
    scheduled_at: z.iso.datetime().optional(),
    sandbox_outcome: z.enum(["delivered", "bounced", "complained"] as const).optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .refine((value) => Boolean(value.html || value.text), {
    message: "At least one of html or text is required.",
  });
export const replyToMessageInputSchema = z
  .object({
    id: idSchema.describe("Message ID to reply to."),
    to: z.array(recipientInputSchema).min(1).max(50),
    cc: z.array(recipientInputSchema).max(50).optional(),
    html: z.string().max(512_000).optional(),
    text: z.string().max(256_000).optional(),
    client_reference: noControlString(255, "client_reference").min(1).optional(),
    metadata: messageMetadataSchema.optional(),
    source_rfc_message_id: sourceRfcMessageIdSchema.optional(),
    headers: outboundHeadersSchema.optional(),
    scheduled_at: z.iso.datetime().optional(),
    sandbox_outcome: z.enum(["delivered", "bounced", "complained"] as const).optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .refine((value) => Boolean(value.html || value.text), {
    message: "At least one of html or text is required.",
  });

export const injectSandboxInboundInputSchema = z
  .object({
    id: idSchema.describe("Logical mailbox ID."),
    from: recipientInputSchema,
    to: z.array(recipientInputSchema).max(50).optional(),
    cc: z.array(recipientInputSchema).max(50).optional(),
    subject: noControlString(998, "subject").min(1),
    text: z.string().max(256_000).optional(),
    html: z.string().max(512_000).optional(),
    message_id: sourceRfcMessageIdSchema.optional(),
    in_reply_to: sourceRfcMessageIdSchema.optional(),
    references: z.array(sourceRfcMessageIdSchema).max(50).optional(),
    received_at: z.iso.datetime().optional(),
    headers: outboundHeadersSchema.optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .refine((value) => Boolean(value.html || value.text), {
    message: "At least one of html or text is required.",
  });

export const listThreadsInputSchema = paginationInputSchema.extend({
  mailbox_id: idSchema,
});
export const getThreadInputSchema = paginationInputSchema.extend({ id: idSchema });
export const replyToThreadInputSchema = z
  .object({
    id: idSchema.describe("Thread ID to reply to."),
    to: z.array(recipientInputSchema).max(50).optional(),
    cc: z.array(recipientInputSchema).max(50).optional(),
    html: z.string().max(512_000).optional(),
    text: z.string().max(256_000).optional(),
    scheduled_at: z.iso.datetime().optional(),
    sandbox_outcome: z.enum(["delivered", "bounced", "complained"] as const).optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .refine((value) => Boolean(value.html || value.text), {
    message: "At least one of html or text is required.",
  });

export const webhookEventSchema = z.enum(WEBHOOK_EVENT_TYPES);
export const webhookDeliveryStatusSchema = z.enum(WEBHOOK_DELIVERY_STATUSES);
export const listWebhooksInputSchema = paginationInputSchema;
export const createWebhookInputSchema = z.object({
  url: publicHttpsUrlSchema,
  events: z.array(webhookEventSchema).min(1).max(WEBHOOK_EVENT_TYPES.length),
  description: noControlString(500, "description").optional(),
  idempotency_key: idempotencyKeySchema,
});
export const updateWebhookInputSchema = z
  .object({
    id: idSchema,
    url: publicHttpsUrlSchema.optional(),
    events: z.array(webhookEventSchema).min(1).max(WEBHOOK_EVENT_TYPES.length).optional(),
    description: noControlString(500, "description").nullable().optional(),
    active: z.boolean().optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .refine(
    (value) =>
      value.url !== undefined ||
      value.events !== undefined ||
      value.description !== undefined ||
      value.active !== undefined,
    {
      message: "Provide at least one webhook field to update.",
    },
  );
export const listWebhookDeliveriesInputSchema = paginationInputSchema.extend({
  id: idSchema.describe("Webhook ID."),
  status: webhookDeliveryStatusSchema.optional(),
  event_type: webhookEventSchema.optional(),
});
export const getWebhookDeliveryInputSchema = z.object({
  id: idSchema.describe("Webhook ID."),
  delivery_id: idSchema.describe("Webhook delivery ID."),
});
export const replayWebhookDeliveryInputSchema = getWebhookDeliveryInputSchema.extend({
  idempotency_key: idempotencyKeySchema,
});

export const listSuppressionsInputSchema = paginationInputSchema;
export const removeSuppressionInputSchema = z.object({
  email: emailSchema,
});

// --- Audiences / subscribers -------------------------------------------------

const SUBSCRIBER_STATUSES = [
  "subscribed",
  "pending",
  "unsubscribed",
  "bounced",
  "complained",
  "suppressed",
  "transactional_only",
] as const;
const SUBSCRIBER_OUTCOMES = [
  "created",
  "updated",
  "skipped_not_mailable",
  "skipped_invalid",
  "skipped_cap",
  "skipped_quota",
] as const;

const mergeFieldsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

const mergeFieldsInputSchema = z
  .record(
    noControlString(64, "merge field key"),
    z.union([noControlString(500, "merge field value"), z.number(), z.boolean(), z.null()]),
  )
  .refine((value) => Object.keys(value).length <= 50, {
    message: "At most 50 merge fields are allowed.",
  });

export const audienceSchema = z.object({
  object: z.literal("audience"),
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  member_count: z.number(),
  subscribed_count: z.number(),
  consent_source: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const subscriberSchema = z.object({
  object: z.literal("subscriber"),
  id: z.string(),
  audience_id: z.string(),
  email_address: z.string(),
  display_name: z.string().nullable(),
  status: z.enum(SUBSCRIBER_STATUSES),
  merge_fields: mergeFieldsSchema,
  consent_source: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const subscriberResultSchema = z.object({
  email_address: z.string(),
  outcome: z.enum(SUBSCRIBER_OUTCOMES),
});

export const audienceOutputSchema = z.object({ audience: audienceSchema });
export const audiencesOutputSchema = z.object({
  data: z.array(audienceSchema),
  pagination: paginationSchema,
});
export const subscriberOutputSchema = z.object({ subscriber: subscriberSchema });
export const subscribersOutputSchema = z.object({
  data: z.array(subscriberSchema),
  pagination: paginationSchema,
});
export const subscriberResultOutputSchema = subscriberResultSchema;
export const subscribersBatchOutputSchema = z.object({
  results: z.array(subscriberResultSchema),
});

export const listAudiencesInputSchema = paginationInputSchema;

export const createAudienceInputSchema = z.object({
  name: noControlString(200, "name").min(1).describe("Audience name."),
  description: noControlString(2000, "description").nullish().describe("Optional description."),
  consent_source: noControlString(500, "consent_source")
    .min(1)
    .describe("Where and how these people opted in. This is a required consent attestation."),
  idempotency_key: idempotencyKeySchema,
});

export const updateAudienceInputSchema = z.object({
  id: idSchema,
  name: noControlString(200, "name").min(1).optional(),
  description: noControlString(2000, "description").nullish(),
  idempotency_key: idempotencyKeySchema,
});

export const listSubscribersInputSchema = paginationInputSchema.extend({
  audience_id: idSchema.describe("Audience ID."),
  status: z.enum(SUBSCRIBER_STATUSES).optional().describe("Filter by subscriber status."),
  email: emailSchema.optional().describe("Filter to an exact email address."),
});

const subscriberFieldsSchema = z.object({
  email_address: emailSchema,
  display_name: noControlString(200, "display_name").nullish(),
  merge_fields: mergeFieldsInputSchema.optional(),
  consent_source: noControlString(500, "consent_source").nullish(),
  consent_ip: noControlString(64, "consent_ip").nullish(),
});

export const addSubscriberInputSchema = subscriberFieldsSchema.extend({
  audience_id: idSchema.describe("Audience ID."),
  idempotency_key: idempotencyKeySchema,
});

export const addSubscribersBatchInputSchema = z.object({
  audience_id: idSchema.describe("Audience ID."),
  subscribers: z.array(subscriberFieldsSchema).min(1).max(1000),
  idempotency_key: idempotencyKeySchema,
});

export const getSubscriberInputSchema = z.object({
  audience_id: idSchema.describe("Audience ID."),
  subscriber_id: idSchema.describe("Subscriber ID."),
});

export const getSubscriberByEmailInputSchema = z.object({
  audience_id: idSchema.describe("Audience ID."),
  email: emailSchema,
});

export const updateSubscriberInputSchema = z.object({
  audience_id: idSchema.describe("Audience ID."),
  subscriber_id: idSchema.describe("Subscriber ID."),
  display_name: noControlString(200, "display_name").nullish(),
  merge_fields: mergeFieldsInputSchema.optional(),
  idempotency_key: idempotencyKeySchema,
});

export const subscriberActionInputSchema = z.object({
  audience_id: idSchema.describe("Audience ID."),
  subscriber_id: idSchema.describe("Subscriber ID."),
  idempotency_key: idempotencyKeySchema,
});

export const resubscribeSubscriberInputSchema = subscriberActionInputSchema.extend({
  consent_source: noControlString(500, "consent_source")
    .min(1)
    .describe("Where and how this subscriber opted in again."),
});

// --- Newsletters -------------------------------------------------------------

export const newsletterDomainSchema = z.object({
  object: z.literal("newsletter_domain"),
  id: z.string(),
  root_domain_id: z.string(),
  domain_name: z.string(),
  from_local_part: z.string(),
  from_address: z.string(),
  mail_from_domain: z.string(),
  reply_to_mailbox_id: z.string().nullable(),
  status: z.enum(NEWSLETTER_DOMAIN_STATUSES),
  dkim_status: z.enum(NEWSLETTER_DOMAIN_RECORD_STATUSES),
  mail_from_status: z.enum(NEWSLETTER_DOMAIN_RECORD_STATUSES),
  spf_status: z.enum(NEWSLETTER_DOMAIN_RECORD_STATUSES),
  dmarc_status: z.enum(NEWSLETTER_DOMAIN_RECORD_STATUSES),
  verified_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const newsletterSchema = z.object({
  object: z.literal("newsletter"),
  id: z.string(),
  audience_id: z.string().nullable(),
  newsletter_domain_id: z.string(),
  reply_to_mailbox_id: z.string().nullable(),
  name: z.string(),
  subject: z.string().nullable(),
  preview_text: z.string().nullable(),
  from_name: z.string().nullable(),
  from_address: z.string(),
  reply_to_address: z.string().nullable(),
  blocks: z.array(z.lazy(() => newsletterBlockInputSchema)).nullable(),
  body_html: z.string().nullable(),
  body_text: z.string().nullable(),
  status: z.enum(NEWSLETTER_STATUSES),
  archive_visibility: z.enum(NEWSLETTER_ARCHIVE_VISIBILITIES),
  preflight_status: z.enum(NEWSLETTER_PREFLIGHT_STATUSES),
  preflight_results: z.record(z.string(), z.unknown()),
  send_window_hours: z.number().int(),
  send_rate_per_hour: z.number().int(),
  recipient_count: z.number().int(),
  sent_count: z.number().int(),
  delivered_count: z.number().int(),
  bounced_count: z.number().int(),
  complained_count: z.number().int(),
  failed_count: z.number().int(),
  skipped_count: z.number().int(),
  last_test_sent_at: z.string().nullable(),
  last_test_recipient: z.string().nullable(),
  content_changed_since_test_send: z.boolean(),
  scheduled_at: z.string().nullable(),
  approved_at: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const newsletterPreflightItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(NEWSLETTER_PREFLIGHT_ITEM_STATUSES),
  message: z.string(),
});

export const newsletterUrlBreakdownSchema = z.object({
  href_count: z.number().int(),
  image_src_count: z.number().int(),
  video_href_count: z.number().int(),
  text_url_count: z.number().int(),
  unique_url_count: z.number().int(),
  max_unique_urls: z.number().int(),
  urls: z.array(
    z.object({
      url: z.string(),
      source: z.enum(["href", "image_src", "video_href", "text"]),
    }),
  ),
  offending_urls: z.array(z.string()),
});

export const newsletterPreflightSchema = z.object({
  object: z.literal("newsletter_preflight"),
  newsletter_id: z.string(),
  status: z.enum(NEWSLETTER_PREFLIGHT_STATUSES),
  items: z.array(newsletterPreflightItemSchema),
  url_breakdown: newsletterUrlBreakdownSchema,
});

export const newsletterPreviewSchema = z.object({
  object: z.literal("newsletter_preview"),
  newsletter_id: z.string(),
  html: z.string(),
  archive_html: z.string(),
  text: z.string(),
  warnings: z.array(
    z.object({
      kind: z.string(),
      severity: z.enum(["fail", "warn"]),
      message: z.string(),
    }),
  ),
  url_breakdown: newsletterUrlBreakdownSchema,
});

export const newsletterTestSendSchema = z.object({
  object: z.literal("newsletter_test_send"),
  id: z.string(),
  newsletter_id: z.string(),
  message_id: z.string().nullable(),
  recipient_email: z.string(),
  status: z.enum(NEWSLETTER_TEST_SEND_STATUSES),
  last_error: z.string().nullable(),
  sent_at: z.string().nullable(),
  created_at: z.string(),
});

export const newsletterAssetSchema = z.object({
  object: z.literal("newsletter_asset"),
  id: z.string(),
  kind: z.enum(["image", "video"]),
  filename: z.string(),
  content_type: z.string(),
  byte_size: z.number().int(),
  checksum_sha256: z.string(),
  url: z.string(),
  image_url: z.string().nullable(),
  video_url: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  thumbnail_content_type: z.string().nullable(),
  thumbnail_byte_size: z.number().int().nullable(),
  duration_seconds: z.number().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  created_at: z.string(),
});

export const newsletterAssetStorageUsageSchema = z.object({
  used_bytes: z.number().int(),
  limit_bytes: z.number().int(),
  remaining_bytes: z.number().int(),
  over_limit: z.boolean(),
  plan: z.string(),
  is_in_trial: z.boolean(),
  next_upgrade: z
    .object({
      plan: z.string(),
      storage_bytes: z.number().int(),
    })
    .nullable(),
});

export const newsletterOutputSchema = z.object({ newsletter: newsletterSchema });
export const newsletterAssetOutputSchema = z.object({ asset: newsletterAssetSchema });
export const newsletterAssetsOutputSchema = z.object({
  data: z.array(newsletterAssetSchema),
  pagination: paginationSchema,
  storage: newsletterAssetStorageUsageSchema,
});
export const newsletterDomainsOutputSchema = z.object({
  data: z.array(newsletterDomainSchema),
  pagination: paginationSchema,
});
export const newslettersOutputSchema = z.object({
  data: z.array(newsletterSchema),
  pagination: paginationSchema,
});
export const newsletterPreflightOutputSchema = z.object({
  preflight: newsletterPreflightSchema,
});
export const newsletterPreviewOutputSchema = z.object({
  preview: newsletterPreviewSchema,
});
export const newsletterTestSendOutputSchema = z.object({
  test_send: newsletterTestSendSchema,
});

const newsletterBlockTextSchema = noControlString(10_000, "newsletter block text").min(1);
const newsletterBlockOptionalTextSchema = noControlString(
  10_000,
  "newsletter block text",
).nullish();
const newsletterCalloutVariantSchema = z.enum(["accent", "info", "warning", "success"]);
const newsletterColumnRatioSchema = z.enum(["50-50", "33-67", "67-33"]);
const newsletterButtonAlignSchema = z.enum(["left", "center", "right"]);

const newsletterColumnContentInputSchema = z.object({
  title: newsletterBlockOptionalTextSchema,
  body: newsletterBlockTextSchema,
  image_url: publicHttpsUrlSchema.nullish(),
  image_alt: newsletterBlockOptionalTextSchema,
  cta_label: newsletterBlockOptionalTextSchema,
  cta_url: newsletterLinkUrlSchema.nullish(),
});

const newsletterBlockInputSchema: z.ZodType<NewsletterBlock> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    text: newsletterBlockTextSchema,
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  }),
  z.object({
    type: z.literal("paragraph"),
    body: newsletterBlockTextSchema,
  }),
  z.object({
    type: z.literal("list"),
    ordered: z.boolean().optional(),
    items: z.array(newsletterBlockTextSchema).min(1).max(50),
  }),
  z.object({
    type: z.literal("callout"),
    title: newsletterBlockOptionalTextSchema,
    body: newsletterBlockTextSchema,
    variant: newsletterCalloutVariantSchema.optional(),
  }),
  z.object({
    type: z.literal("button"),
    label: newsletterBlockTextSchema.max(120),
    url: newsletterLinkUrlSchema,
    align: newsletterButtonAlignSchema.optional(),
  }),
  z.object({
    type: z.literal("image"),
    url: publicHttpsUrlSchema,
    alt: newsletterBlockTextSchema.max(300),
    link_url: newsletterLinkUrlSchema.nullish(),
    caption: newsletterBlockOptionalTextSchema,
    caption_url: newsletterLinkUrlSchema.nullish(),
  }),
  z.object({
    type: z.literal("video"),
    video_url: newsletterVideoUrlSchema,
    thumbnail_url: publicHttpsUrlSchema,
    label: newsletterBlockTextSchema.max(160),
  }),
  z.object({
    type: z.literal("columns"),
    ratio: newsletterColumnRatioSchema.optional(),
    left: newsletterColumnContentInputSchema,
    right: newsletterColumnContentInputSchema,
  }),
  z.object({
    type: z.literal("link_list"),
    title: newsletterBlockOptionalTextSchema,
    items: z
      .array(
        z.object({
          label: newsletterBlockTextSchema.max(180),
          url: newsletterLinkUrlSchema,
          description: newsletterBlockOptionalTextSchema,
        }),
      )
      .min(1)
      .max(20),
  }),
  z.object({
    type: z.literal("quote"),
    body: newsletterBlockTextSchema,
    cite: newsletterBlockOptionalTextSchema,
  }),
  z.object({
    type: z.literal("divider"),
  }),
  z.object({
    type: z.literal("spacer"),
    height: z.number().int().min(8).max(80).optional(),
  }),
  z.object({
    type: z.literal("code"),
    code: newsletterBlockTextSchema,
  }),
  z.object({
    type: z.literal("custom_html"),
    html: z.string().trim().min(1).max(250_000),
  }),
]);

const newsletterDraftFieldsInputSchema = {
  audience_id: idSchema.describe("Audience ID."),
  newsletter_domain_id: idSchema.describe("Newsletter sending domain ID."),
  name: noControlString(160, "name").min(1).describe("Internal newsletter draft name."),
  subject: noControlString(200, "subject").min(1).describe("Email subject line."),
  preview_text: noControlString(240, "preview_text").nullish(),
  from_name: noControlString(120, "from_name").nullish(),
  body_html: z.string().max(250_000).nullish(),
  body_text: z.string().max(250_000).nullish(),
  blocks: z.array(newsletterBlockInputSchema).min(1).max(200).optional(),
  send_window_hours: z.number().int().min(1).max(24).optional(),
  archive_visibility: z.enum(NEWSLETTER_ARCHIVE_VISIBILITIES).optional(),
} as const;

export const createNewsletterInputSchema = z
  .object({
    ...newsletterDraftFieldsInputSchema,
    idempotency_key: idempotencyKeySchema,
  })
  .refine(
    (value) => Boolean(value.blocks?.length || value.body_html?.trim() || value.body_text?.trim()),
    {
      message: "At least one of blocks, body_html, or body_text is required.",
    },
  );

const newsletterChangelogMediaInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    url: publicHttpsUrlSchema,
    alt: noControlString(300, "alt").min(1),
    caption: noControlString(500, "caption").nullish(),
    link_url: newsletterLinkUrlSchema.nullish(),
  }),
  z.object({
    kind: z.literal("video"),
    video_url: newsletterVideoUrlSchema,
    thumbnail_url: publicHttpsUrlSchema,
    label: noControlString(160, "label").min(1),
  }),
]);

export const createNewsletterFromChangelogInputSchema = z.object({
  audience_id: idSchema.describe("Audience ID."),
  newsletter_domain_id: idSchema.describe("Newsletter sending domain ID."),
  name: noControlString(160, "name").min(1).describe("Internal newsletter draft name."),
  subject: noControlString(200, "subject").min(1).describe("Email subject line."),
  preview_text: noControlString(240, "preview_text").nullish(),
  from_name: noControlString(120, "from_name").nullish(),
  tone: z.enum(["concise", "friendly", "technical"]).default("concise"),
  entries: z
    .array(
      z.object({
        title: noControlString(180, "title").min(1),
        body: noControlString(5000, "body").nullish(),
        url: newsletterLinkUrlSchema.nullish(),
        media: z.array(newsletterChangelogMediaInputSchema).max(6).optional(),
        cta_label: noControlString(120, "cta_label").nullish(),
        cta_url: newsletterLinkUrlSchema.nullish(),
      }),
    )
    .min(1)
    .max(40),
  final_cta: z
    .object({
      label: noControlString(120, "label").min(1),
      url: newsletterLinkUrlSchema,
      body: noControlString(1000, "body").nullish(),
    })
    .optional(),
  send_window_hours: z.number().int().min(1).max(24).optional(),
  archive_visibility: z.enum(NEWSLETTER_ARCHIVE_VISIBILITIES).optional(),
  idempotency_key: idempotencyKeySchema,
});

export const updateNewsletterInputSchema = z
  .object({
    id: idSchema.describe("Newsletter ID."),
    audience_id: newsletterDraftFieldsInputSchema.audience_id.optional(),
    newsletter_domain_id: newsletterDraftFieldsInputSchema.newsletter_domain_id.optional(),
    name: newsletterDraftFieldsInputSchema.name.optional(),
    subject: newsletterDraftFieldsInputSchema.subject.optional(),
    preview_text: newsletterDraftFieldsInputSchema.preview_text,
    from_name: newsletterDraftFieldsInputSchema.from_name,
    body_html: newsletterDraftFieldsInputSchema.body_html,
    body_text: newsletterDraftFieldsInputSchema.body_text,
    blocks: newsletterDraftFieldsInputSchema.blocks,
    send_window_hours: newsletterDraftFieldsInputSchema.send_window_hours,
    archive_visibility: newsletterDraftFieldsInputSchema.archive_visibility,
    idempotency_key: idempotencyKeySchema,
  })
  .refine(
    (value) =>
      value.audience_id !== undefined ||
      value.newsletter_domain_id !== undefined ||
      value.name !== undefined ||
      value.subject !== undefined ||
      value.preview_text !== undefined ||
      value.from_name !== undefined ||
      value.body_html !== undefined ||
      value.body_text !== undefined ||
      value.blocks !== undefined ||
      value.send_window_hours !== undefined ||
      value.archive_visibility !== undefined,
    {
      message: "Provide at least one newsletter field to update.",
    },
  );

export const listNewslettersInputSchema = paginationInputSchema;
export const listNewsletterAssetsInputSchema = paginationInputSchema.extend({
  kind: z.enum(["image", "video"]).optional(),
  q: z.string().max(120).optional(),
});
export const registerNewsletterAssetInputSchema = z.object({
  url: z.string().url().describe("A Shipmail-hosted newsletter image or video URL to register."),
  filename: z.string().max(255).optional().describe("Optional display filename for the asset."),
  thumbnail_url: z
    .string()
    .url()
    .optional()
    .describe("For a video, its Shipmail-hosted thumbnail image URL."),
  idempotency_key: idempotencyKeySchema,
});
export const previewNewsletterInputSchema = z.object({
  id: idSchema.describe("Newsletter ID."),
});
export const sendNewsletterTestInputSchema = z.object({
  id: idSchema.describe("Newsletter ID."),
  recipient_email: emailSchema,
  idempotency_key: idempotencyKeySchema,
});
export const scheduleNewsletterInputSchema = z.object({
  id: idSchema.describe("Newsletter ID."),
  scheduled_at: z.iso.datetime().describe("ISO 8601 scheduled send time."),
  idempotency_key: idempotencyKeySchema,
});

// --- Calendar ---

const CALENDAR_EVENT_STATUSES = ["confirmed", "tentative", "cancelled"] as const;
const CALENDAR_FREE_BUSY_STATUSES = ["free", "busy"] as const;
const CALENDAR_PRIVACIES = ["public", "private", "secret"] as const;
const RECURRENCE_FREQUENCIES = [
  "yearly",
  "monthly",
  "weekly",
  "daily",
  "hourly",
  "minutely",
  "secondly",
] as const;
const WEEKDAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"] as const;

// A local date-time with no offset, e.g. "2026-07-10T14:00:00".
const localDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
    "Must be a local date-time (YYYY-MM-DDTHH:MM:SS).",
  );
// An ISO 8601 duration, e.g. "PT1H", "P1D".
const isoDurationSchema = z.string().regex(/^[-+]?P/, "Must be an ISO 8601 duration (e.g. PT1H).");
// A UTC instant for time-range queries.
const utcInstantSchema = z.string().min(1).max(64).describe("UTC instant (ISO 8601).");
const ianaTimeZoneSchema = z.string().min(1).max(64).describe("IANA time zone.");

export const recurrenceNDaySchema = z.object({
  day: z.enum(WEEKDAYS),
  nth_of_period: z.number().int().optional(),
});

export const recurrenceSchema = z.object({
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  interval: z.number().int().min(1).optional(),
  count: z.number().int().min(1).optional(),
  until: z.string().optional(),
  by_day: z.array(recurrenceNDaySchema).optional(),
});

export const reminderSchema = z.object({
  minutes_before: z.number().int().min(0),
});

const calendarPersonSchema = z.object({ email: z.string(), name: z.string().nullable() });
const calendarAttendeeSchema = calendarPersonSchema.extend({
  status: z.enum(["needs-action", "accepted", "declined", "tentative"]),
});

export const calendarEventSchema = z.object({
  object: z.literal("calendar_event"),
  id: z.string(),
  mailbox: z.string(),
  calendar_id: z.string().nullable(),
  uid: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  video_url: z.string().nullable(),
  all_day: z.boolean(),
  start: z.string(),
  end: z.string(),
  timezone: z.string().nullable(),
  duration: z.string().nullable(),
  status: z.enum(CALENDAR_EVENT_STATUSES).nullable(),
  free_busy_status: z.enum(CALENDAR_FREE_BUSY_STATUSES).nullable(),
  privacy: z.enum(CALENDAR_PRIVACIES).nullable(),
  color: z.string().nullable(),
  recurrence: recurrenceSchema.nullable(),
  recurrence_id: z.string().nullable(),
  reminders: z.array(reminderSchema),
  organizer: calendarPersonSchema.nullable(),
  attendees: z.array(calendarAttendeeSchema),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const calendarAvailabilitySlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

export const calendarAvailabilitySchema = z.object({
  object: z.literal("calendar_availability"),
  mailbox: z.string(),
  from: z.string(),
  to: z.string(),
  duration_minutes: z.number(),
  timezone: z.string(),
  slots: z.array(calendarAvailabilitySlotSchema),
});

export const bookingPageSchema = z.object({
  object: z.literal("booking_page"),
  id: z.string(),
  mailbox: z.string(),
  slug: z.string(),
  url: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  duration_minutes: z.number(),
  availability_days: z.array(z.number()),
  window_start_minutes: z.number(),
  window_end_minutes: z.number(),
  timezone: z.string(),
  buffer_minutes: z.number(),
  minimum_notice_minutes: z.number(),
  max_advance_days: z.number(),
  conferencing_provider: z.enum(CONFERENCING_PROVIDER_IDS).nullable(),
  active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const calendarEventOutputSchema = z.object({ event: calendarEventSchema });
export const calendarEventsOutputSchema = z.object({
  data: z.array(calendarEventSchema),
  pagination: paginationSchema,
});
export const calendarAvailabilityOutputSchema = z.object({
  availability: calendarAvailabilitySchema,
});
export const bookingPageOutputSchema = z.object({ booking_page: bookingPageSchema });
export const bookingPagesOutputSchema = z.object({
  data: z.array(bookingPageSchema),
  pagination: paginationSchema,
});

const recurrenceInputSchema = z.object({
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  interval: z.number().int().min(1).optional(),
  count: z.number().int().min(1).optional(),
  until: localDateTimeSchema.optional(),
  by_day: z
    .array(z.object({ day: z.enum(WEEKDAYS), nth_of_period: z.number().int().optional() }))
    .max(7)
    .optional(),
});

const reminderInputSchema = z.object({
  minutes_before: z.number().int().min(0).max(40_320),
});

const attendeeInputSchema = z.object({
  email: emailSchema,
  name: noControlString(255, "attendee name").optional(),
});

const mailboxAddressInputSchema = emailSchema.describe("The mailbox (calendar owner) address.");

export const listCalendarEventsInputSchema = paginationInputSchema.extend({
  mailbox: mailboxAddressInputSchema,
  from: utcInstantSchema.describe("Start of the time range (UTC instant)."),
  to: utcInstantSchema.describe("End of the time range (UTC instant)."),
  expand: z.boolean().optional().describe("Expand recurring events into individual instances."),
  calendar_id: calendarIdInputSchema.optional().describe("Restrict to a single calendar."),
});

export const getCalendarEventInputSchema = z.object({
  id: calendarEventIdInputSchema.describe("Calendar event ID."),
  mailbox: mailboxAddressInputSchema,
});

export const deleteCalendarEventInputSchema = z.object({
  id: calendarEventIdInputSchema.describe("Calendar event ID."),
  mailbox: mailboxAddressInputSchema,
});

export const createCalendarEventInputSchema = z.object({
  mailbox: mailboxAddressInputSchema,
  calendar_id: calendarIdInputSchema
    .optional()
    .describe("Target calendar. Defaults to the default calendar."),
  title: noControlString(1024, "title").min(1),
  start: localDateTimeSchema.describe("Local date-time; its zone is given by timezone."),
  description: noControlString(32768, "description").optional(),
  timezone: ianaTimeZoneSchema.optional(),
  duration: isoDurationSchema.optional().describe("ISO 8601 duration, e.g. PT1H."),
  all_day: z.boolean().optional(),
  location: noControlString(1024, "location").optional(),
  video_url: z.string().max(2048).optional(),
  color: noControlString(64, "color").optional(),
  status: z.enum(CALENDAR_EVENT_STATUSES).optional(),
  free_busy_status: z.enum(CALENDAR_FREE_BUSY_STATUSES).optional(),
  privacy: z.enum(CALENDAR_PRIVACIES).optional(),
  recurrence: recurrenceInputSchema.optional(),
  reminders: z.array(reminderInputSchema).max(5).optional(),
  attendees: z.array(attendeeInputSchema).max(50).optional(),
  idempotency_key: idempotencyKeySchema,
});

export const updateCalendarEventInputSchema = z.object({
  id: calendarEventIdInputSchema.describe("Calendar event ID."),
  mailbox: mailboxAddressInputSchema,
  title: noControlString(1024, "title").min(1).optional(),
  description: noControlString(32768, "description").nullish(),
  start: localDateTimeSchema.optional(),
  timezone: ianaTimeZoneSchema.nullish(),
  duration: isoDurationSchema.optional(),
  all_day: z.boolean().optional(),
  location: noControlString(1024, "location").nullish(),
  video_url: z.string().max(2048).nullish(),
  color: noControlString(64, "color").optional(),
  status: z.enum(CALENDAR_EVENT_STATUSES).optional(),
  free_busy_status: z.enum(CALENDAR_FREE_BUSY_STATUSES).optional(),
  privacy: z.enum(CALENDAR_PRIVACIES).optional(),
  recurrence: recurrenceInputSchema.nullish(),
  reminders: z.array(reminderInputSchema).max(5).nullish(),
  attendees: z.array(attendeeInputSchema).max(50).optional(),
  idempotency_key: idempotencyKeySchema,
});

export const calendarAvailabilityInputSchema = z.object({
  mailbox: mailboxAddressInputSchema,
  from: utcInstantSchema.describe("Start of the range (UTC instant)."),
  to: utcInstantSchema.describe("End of the range (UTC instant)."),
  duration: z.number().int().min(5).max(480).default(30).describe("Meeting length in minutes."),
  interval: z.number().int().min(5).max(480).optional().describe("Step between slot starts."),
  timezone: ianaTimeZoneSchema.optional().describe("Zone the window is defined in (default UTC)."),
  days: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .optional()
    .describe("Weekdays offered, 0=Sunday..6=Saturday (default Mon-Fri)."),
  window_start: z.number().int().min(0).max(1440).optional().describe("Minutes from midnight."),
  window_end: z.number().int().min(0).max(1440).optional().describe("Minutes from midnight."),
  buffer: z.number().int().min(0).max(240).optional(),
  minimum_notice: z.number().int().min(0).optional(),
});

export const listBookingPagesInputSchema = paginationInputSchema;
export const bookingPageByIdInputSchema = z.object({ id: idSchema.describe("Booking page ID.") });

const bookingSlugSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Slug must be lowercase letters, numbers, hyphens.");

export const createBookingPageInputSchema = z.object({
  name: noControlString(120, "name").min(1),
  mailbox: mailboxAddressInputSchema,
  slug: bookingSlugSchema,
  duration_minutes: z.number().int().min(5).max(480),
  availability_days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  window_start_minutes: z.number().int().min(0).max(1440),
  window_end_minutes: z.number().int().min(0).max(1440),
  timezone: ianaTimeZoneSchema,
  description: noControlString(2000, "description").nullish(),
  buffer_minutes: z.number().int().min(0).max(240).optional(),
  minimum_notice_minutes: z.number().int().min(0).optional(),
  max_advance_days: z.number().int().min(1).max(365).optional(),
  conferencing_provider: z
    .enum(CONFERENCING_PROVIDER_IDS)
    .nullish()
    .describe(
      "Opt-in meeting provider. It must already be connected to the page's mailbox. Null means no meeting link.",
    ),
  active: z.boolean().optional(),
  idempotency_key: idempotencyKeySchema,
});

export const updateBookingPageInputSchema = z.object({
  id: idSchema.describe("Booking page ID."),
  name: noControlString(120, "name").min(1).optional(),
  mailbox: mailboxAddressInputSchema.optional(),
  slug: bookingSlugSchema.optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  availability_days: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  window_start_minutes: z.number().int().min(0).max(1440).optional(),
  window_end_minutes: z.number().int().min(0).max(1440).optional(),
  timezone: ianaTimeZoneSchema.optional(),
  description: noControlString(2000, "description").nullish(),
  buffer_minutes: z.number().int().min(0).max(240).optional(),
  minimum_notice_minutes: z.number().int().min(0).optional(),
  max_advance_days: z.number().int().min(1).max(365).optional(),
  conferencing_provider: z
    .enum(CONFERENCING_PROVIDER_IDS)
    .nullish()
    .describe(
      "Opt-in meeting provider. It must already be connected to the page's mailbox. Set null to stop creating meeting links.",
    ),
  active: z.boolean().optional(),
  idempotency_key: idempotencyKeySchema,
});

// --- Partner beta ---

export const partnerOrganizationSchema = z.object({
  object: z.literal("partner_organization"),
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  external_reference: z.string(),
  owner_email: z.string(),
  owner_user_id: z.string().nullable(),
  status: z.enum(["pending_owner", "active", "suspended", "offboarding", "disconnected"]),
  data_classification: z.enum(["internal_test", "customer"]),
  mailbox_limit: z.number().int(),
  delegated_permissions: z.array(z.string()),
  owner_accepted_at: z.string().nullable(),
  activated_at: z.string().nullable(),
  suspended_at: z.string().nullable(),
  disconnected_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const partnerOrganizationOutputSchema = z.object({
  organization: partnerOrganizationSchema,
});
export const createdPartnerOrganizationSchema = partnerOrganizationSchema.extend({
  ownership_invitation: z
    .object({
      object: z.literal("partner_ownership_invitation"),
      owner_email: z.string(),
      email_sent: z.boolean(),
      expires_at: z.string(),
    })
    .nullable(),
});
export const createdPartnerOrganizationOutputSchema = z.object({
  organization: createdPartnerOrganizationSchema,
});
export const partnerOrganizationsOutputSchema = z.object({
  data: z.array(partnerOrganizationSchema),
});
export const partnerInvitationOutputSchema = z.object({
  invitation: z.object({
    object: z.literal("partner_ownership_invitation"),
    owner_email: z.string(),
    email_sent: z.boolean(),
    expires_at: z.string(),
  }),
});
export const partnerUsageOutputSchema = z.object({
  usage: z.object({
    object: z.literal("partner_usage"),
    period_start: z.string(),
    period_end: z.string(),
    closed_through: z.string().nullable(),
    active_children: z.number().int(),
    active_mailboxes: z.number().int(),
    child_active_seconds: z.number().int(),
    mailbox_active_seconds: z.number().int(),
    child_subtotal: z.number().int(),
    mailbox_subtotal: z.number().int(),
    minimum_shortfall: z.number().int(),
    projected_total: z.number().int(),
    currency: z.string(),
  }),
});

export const createPartnerOrganizationInputSchema = z.object({
  name: noControlString(120, "name").min(1),
  external_reference: noControlString(200, "external reference").min(1),
  owner_email: emailSchema,
  mailbox_limit: z.number().int().min(1).max(50).default(3),
  data_classification: z.enum(["internal_test", "customer"]).default("customer"),
  idempotency_key: idempotencyKeySchema,
});
export const partnerOrganizationByIdInputSchema = z.object({
  id: idSchema.describe("Partner organization relationship ID."),
});
export const updatePartnerOrganizationInputSchema = partnerOrganizationByIdInputSchema
  .extend({
    name: noControlString(120, "name").min(1).optional(),
    mailbox_limit: z.number().int().min(1).max(50).optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .refine((value) => value.name !== undefined || value.mailbox_limit !== undefined, {
    message: "Provide name or mailbox_limit.",
  });
export const resendPartnerInvitationInputSchema = partnerOrganizationByIdInputSchema.extend({
  owner_email: emailSchema.optional(),
  idempotency_key: idempotencyKeySchema,
});
export const consumePartnerMailboxCredentialGrantInputSchema = z.object({
  grant_id: idSchema.describe("Single-use mailbox credential grant ID."),
  name: noControlString(100, "name").trim().min(1).optional(),
  expires_at: z.iso.datetime().optional(),
  allowed_cidrs: z.array(appPasswordCidrInputSchema).max(20).optional(),
});
