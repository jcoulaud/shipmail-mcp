import {
  DOMAIN_STATUSES,
  MESSAGE_SOURCES,
  MESSAGE_STATUSES,
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

const publicHttpsUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => isPublicHttpsUrl(value), {
    message: "URL must use https and a public host (no localhost, private IPs, or .internal).",
  });

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
  managed_by: z.enum(["external", "namecom"] as const),
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
  spam_filter_threshold: z.number(),
  auto_reply: autoReplySchema,
  created_at: z.string(),
  updated_at: z.string(),
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

export const messageSchema = z.object({
  object: z.literal("message"),
  id: z.string(),
  mailbox_id: z.string(),
  thread_id: z.string().nullable(),
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
  event_type: z.enum(WEBHOOK_EVENT_TYPES),
  status: z.enum(WEBHOOK_DELIVERY_STATUSES),
  attempts: z.number(),
  last_status_code: z.number().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  delivered_at: z.string().nullable(),
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
export const mailboxOutputSchema = z.object({ mailbox: mailboxSchema });
export const mailboxFolderOutputSchema = z.object({ folder: mailboxFolderSchema });
export const mailboxFoldersOutputSchema = z.object({ folders: mailboxFoldersSchema });
export const mailboxIdentitiesOutputSchema = z.object({ identities: mailboxIdentitiesSchema });
export const inboxMessagesOutputSchema = z.object({ inbox_messages: inboxMessagesSchema });
export const inboxThreadOutputSchema = z.object({ inbox_thread: inboxThreadSchema });
export const inboxMessageActionOutputSchema = z.object({
  inbox_message_action: inboxMessageActionSchema,
});
export const mailboxRulesOutputSchema = z.object({ rules: mailboxRulesSchema });
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
    .enum(["gmail", "yahoo", "aol", "icloud", "fastmail", "zoho", "imap"])
    .describe("Source provider. Outlook imports require the dashboard's Microsoft sign-in."),
  email: z.string().min(3).max(320).describe("Address of the source mailbox"),
  password: z
    .string()
    .min(1)
    .max(1024)
    .describe("App password (preferred) or IMAP password for the source mailbox"),
  host: z.string().min(1).max(253).optional().describe("IMAP server, only for provider 'imap'"),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .describe("IMAP port, only for provider 'imap'"),
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
export const createMailboxInputSchema = z.object({
  domain_id: idSchema,
  address: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/),
  display_name: recipientNameSchema.max(200).optional(),
  idempotency_key: idempotencyKeySchema,
});
export const updateMailboxInputSchema = z.object({
  id: idSchema,
  display_name: recipientNameSchema
    .max(200)
    .nullable()
    .describe("New display name, or null to clear."),
  idempotency_key: idempotencyKeySchema,
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

export const listMessagesInputSchema = paginationInputSchema.extend({
  mailbox_id: idSchema,
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
    scheduled_at: z.iso.datetime().optional(),
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
    scheduled_at: z.iso.datetime().optional(),
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

export const listSuppressionsInputSchema = paginationInputSchema;
export const removeSuppressionInputSchema = z.object({
  email: emailSchema,
});
