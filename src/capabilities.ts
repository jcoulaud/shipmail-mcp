import { API_KEY_SCOPES, type ApiKeyScope, apiKeyScopesGrant } from "shipmail/api-key-scopes";

export const MCP_CAPABILITY_VERSION = "1.0.0";

export const MCP_PERMISSION_GROUP_NAMES = [
  "account_status",
  "mail_read",
  "drafts",
  "mail_organize",
  "send_mail",
  "calendar_read",
  "calendar_write",
  "booking_pages",
  "forwarding",
  "webhooks",
  "credentials",
  "mailbox_export",
  "domain_admin",
  "mailbox_admin",
  "newsletters",
  "audiences",
  "suppressions",
  "partner_admin",
] as const;

export type McpPermissionGroupName = (typeof MCP_PERMISSION_GROUP_NAMES)[number];

export const MCP_MEMBER_PERMISSION_GROUP_NAMES = [
  "account_status",
  "mail_read",
  "drafts",
  "mail_organize",
  "send_mail",
  "calendar_read",
  "calendar_write",
] as const satisfies readonly McpPermissionGroupName[];

export type McpRole = "owner" | "member";
export type McpCapabilityEffect = "read" | "local_write" | "external_write" | "destructive";
export type McpRecipientControl = "none" | "server_derived" | "caller_supplied";
export type McpCapabilityDuration = "one_shot" | "scheduled" | "persistent" | "credential";
export type McpIdempotencyBehavior = "none" | "api_header" | "resource_key" | "forbidden";

export type McpPermissionGroup = {
  readonly name: McpPermissionGroupName;
  readonly label: string;
  readonly description: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly persistent: boolean;
};

export const MCP_PERMISSION_GROUPS = [
  {
    name: "account_status",
    label: "Account status",
    description: "Check whether the ShipMail API is available.",
    scopes: [],
    persistent: false,
  },
  {
    name: "mail_read",
    label: "Read mail",
    description: "Read mailboxes, messages, threads, folders, identities, and import status.",
    scopes: ["mailboxes:read", "messages:read", "threads:read"],
    persistent: false,
  },
  {
    name: "drafts",
    label: "Create drafts",
    description: "Create reply drafts whose recipients are derived by ShipMail.",
    scopes: ["drafts:write"],
    persistent: false,
  },
  {
    name: "mail_organize",
    label: "Organize mail",
    description:
      "Update message state, move messages, and delete messages already in Trash or Junk.",
    scopes: ["messages:write"],
    persistent: false,
  },
  {
    name: "send_mail",
    label: "Send mail",
    description: "Send new messages and replies from the mailboxes this connection can access.",
    scopes: ["messages:send"],
    persistent: false,
  },
  {
    name: "calendar_read",
    label: "Read calendar",
    description: "Read calendar events and availability.",
    scopes: ["calendar:read"],
    persistent: false,
  },
  {
    name: "calendar_write",
    label: "Manage calendar",
    description: "Create, update, and delete calendar events.",
    scopes: ["calendar:write"],
    persistent: false,
  },
  {
    name: "booking_pages",
    label: "Booking pages",
    description: "Read and manage public booking pages.",
    scopes: ["booking_pages:read", "booking_pages:write"],
    persistent: true,
  },
  {
    name: "forwarding",
    label: "Mailbox forwarding",
    description: "Read and manage persistent forwarding destinations.",
    scopes: ["mailbox_forwarding:read", "mailbox_forwarding:write"],
    persistent: true,
  },
  {
    name: "webhooks",
    label: "Webhooks",
    description: "Read and manage persistent webhook destinations and deliveries.",
    scopes: ["webhooks:read", "webhooks:write"],
    persistent: true,
  },
  {
    name: "credentials",
    label: "Mailbox credentials",
    description: "List, create, and revoke mailbox app passwords.",
    scopes: ["mailbox_credentials:read", "mailbox_credentials:write"],
    persistent: true,
  },
  {
    name: "mailbox_export",
    label: "Mailbox export",
    description: "Create and retrieve mailbox content exports.",
    scopes: ["mailboxes:export"],
    persistent: true,
  },
  {
    name: "domain_admin",
    label: "Domain administration",
    description: "Read and manage domains and DNS verification.",
    scopes: ["domains:read", "domains:write"],
    persistent: true,
  },
  {
    name: "mailbox_admin",
    label: "Mailbox administration",
    description: "Create, change, suspend, import, and delete mailboxes and mailbox settings.",
    scopes: ["mailboxes:read", "mailboxes:write"],
    persistent: true,
  },
  {
    name: "newsletters",
    label: "Newsletters",
    description: "Read, create, test, schedule, and manage newsletter campaigns.",
    scopes: ["newsletters:read", "newsletters:write"],
    persistent: false,
  },
  {
    name: "audiences",
    label: "Audiences",
    description: "Read and manage newsletter audiences and subscribers.",
    scopes: ["audiences:read", "audiences:write"],
    persistent: false,
  },
  {
    name: "suppressions",
    label: "Suppressions",
    description: "Read and remove suppressed recipient addresses.",
    scopes: ["suppressions:read", "suppressions:write"],
    persistent: false,
  },
  {
    name: "partner_admin",
    label: "Partner administration",
    description: "Manage delegated partner organizations, credential grants, and usage.",
    scopes: [
      "partner:organizations:read",
      "partner:organizations:write",
      "partner:organizations:access",
      "partner:mailbox_credentials:issue",
      "partner:usage:read",
    ],
    persistent: true,
  },
] as const satisfies readonly McpPermissionGroup[];

type CapabilityRow = readonly [
  toolName: string,
  operationId: string,
  requiredScope: ApiKeyScope | "public",
];

const CAPABILITY_ROWS = [
  ["shipmail_status", "getStatus", "public"],
  ["shipmail_create_domain", "createDomain", "domains:write"],
  ["shipmail_list_domains", "listDomains", "domains:read"],
  ["shipmail_get_domain", "getDomain", "domains:read"],
  ["shipmail_get_domain_dns_records", "getDomainDnsRecords", "domains:read"],
  ["shipmail_update_domain", "updateDomain", "domains:write"],
  ["shipmail_delete_domain", "deleteDomain", "domains:write"],
  ["shipmail_verify_domain", "verifyDomain", "domains:write"],
  ["shipmail_search_domains", "searchDomains", "domains:read"],
  ["shipmail_create_mailbox", "createMailbox", "mailboxes:write"],
  ["shipmail_list_mailboxes", "listMailboxes", "mailboxes:read"],
  ["shipmail_get_mailbox", "getMailbox", "mailboxes:read"],
  ["shipmail_list_mailbox_app_passwords", "listMailboxAppPasswords", "mailbox_credentials:read"],
  ["shipmail_create_mailbox_app_password", "createMailboxAppPassword", "mailbox_credentials:write"],
  ["shipmail_revoke_mailbox_app_password", "revokeMailboxAppPassword", "mailbox_credentials:write"],
  ["shipmail_suspend_mailbox", "suspendMailbox", "mailboxes:write"],
  ["shipmail_resume_mailbox", "resumeMailbox", "mailboxes:write"],
  ["shipmail_create_mailbox_export", "createMailboxExport", "mailboxes:export"],
  ["shipmail_get_mailbox_export", "getMailboxExport", "mailboxes:export"],
  ["shipmail_update_mailbox", "updateMailbox", "mailboxes:write"],
  ["shipmail_delete_mailbox", "deleteMailbox", "mailboxes:write"],
  ["shipmail_list_mailbox_folders", "listMailboxFolders", "mailboxes:read"],
  ["shipmail_create_mailbox_folder", "createMailboxFolder", "mailboxes:write"],
  ["shipmail_update_mailbox_folder", "updateMailboxFolder", "mailboxes:write"],
  ["shipmail_delete_mailbox_folder", "deleteMailboxFolder", "mailboxes:write"],
  ["shipmail_list_mailbox_identities", "listMailboxIdentities", "mailboxes:read"],
  ["shipmail_list_mailbox_inbox_messages", "listMailboxInboxMessages", "messages:read"],
  ["shipmail_get_mailbox_inbox_message", "getMailboxInboxMessage", "messages:read"],
  ["shipmail_list_mailbox_inbox_threads", "listMailboxInboxThreads", "messages:read"],
  ["shipmail_get_mailbox_inbox_thread", "getMailboxInboxThread", "messages:read"],
  [
    "shipmail_update_inbox_thread_reply_state",
    "updateMailboxInboxThreadReplyState",
    "messages:write",
  ],
  ["shipmail_create_inbox_reply_draft", "createMailboxInboxReplyDraft", "drafts:write"],
  ["shipmail_send_inbox_reply_draft", "sendMailboxInboxReplyDraft", "messages:send"],
  ["shipmail_reply_to_inbox_message", "replyToMailboxInboxMessage", "messages:send"],
  ["shipmail_reply_to_inbox_thread", "replyToMailboxInboxThread", "messages:send"],
  ["shipmail_update_inbox_message", "updateMailboxInboxMessage", "messages:write"],
  ["shipmail_move_inbox_message", "moveMailboxInboxMessage", "messages:write"],
  ["shipmail_delete_inbox_message", "deleteMailboxInboxMessage", "messages:write"],
  ["shipmail_list_mailbox_forwarding", "listMailboxForwarding", "mailbox_forwarding:read"],
  ["shipmail_create_mailbox_forwarding", "createMailboxForwarding", "mailbox_forwarding:write"],
  ["shipmail_delete_mailbox_forwarding", "deleteMailboxForwarding", "mailbox_forwarding:write"],
  ["shipmail_reset_mailbox_password", "resetMailboxPassword", "mailboxes:write"],
  ["shipmail_set_auto_reply", "updateAutoReply", "mailboxes:write"],
  ["shipmail_set_spam_filter", "updateSpamFilter", "mailboxes:write"],
  ["shipmail_create_mailbox_import", "createMailboxImport", "mailboxes:write"],
  ["shipmail_list_mailbox_imports", "listMailboxImports", "mailboxes:read"],
  ["shipmail_get_mailbox_import", "getMailboxImport", "mailboxes:read"],
  ["shipmail_cancel_mailbox_import", "cancelMailboxImport", "mailboxes:write"],
  ["shipmail_undo_mailbox_import", "undoMailboxImport", "mailboxes:write"],
  ["shipmail_inject_sandbox_inbound", "injectSandboxInbound", "messages:write"],
  ["shipmail_list_messages", "listMessages", "messages:read"],
  ["shipmail_compose_message_with_file", "prepareStagedAttachmentUpload", "messages:send"],
  ["shipmail_prepare_staged_attachment_upload", "prepareStagedAttachmentUpload", "messages:send"],
  ["shipmail_send_message", "sendMessage", "messages:send"],
  ["shipmail_list_scheduled_messages", "listScheduledMessages", "messages:read"],
  ["shipmail_get_scheduled_message", "getScheduledMessage", "messages:read"],
  ["shipmail_update_scheduled_message", "updateScheduledMessage", "messages:send"],
  ["shipmail_cancel_scheduled_message", "cancelScheduledMessage", "messages:send"],
  ["shipmail_get_message", "getMessage", "messages:read"],
  ["shipmail_reply_to_message", "replyToMessage", "messages:send"],
  ["shipmail_list_threads", "listThreads", "threads:read"],
  ["shipmail_get_thread", "getThread", "threads:read"],
  ["shipmail_reply_to_thread", "replyToThread", "messages:send"],
  ["shipmail_create_reply_scan", "createReplyScan", "messages:read"],
  ["shipmail_get_reply_scan", "getReplyScan", "messages:read"],
  ["shipmail_list_reply_scan_results", "listReplyScanResults", "messages:read"],
  ["shipmail_create_webhook", "createWebhook", "webhooks:write"],
  ["shipmail_list_webhooks", "listWebhooks", "webhooks:read"],
  ["shipmail_get_webhook", "getWebhook", "webhooks:read"],
  ["shipmail_update_webhook", "updateWebhook", "webhooks:write"],
  ["shipmail_delete_webhook", "deleteWebhook", "webhooks:write"],
  ["shipmail_rotate_webhook_secret", "rotateWebhookSecret", "webhooks:write"],
  ["shipmail_test_webhook", "testWebhook", "webhooks:write"],
  ["shipmail_list_webhook_deliveries", "listWebhookDeliveries", "webhooks:read"],
  ["shipmail_get_webhook_delivery", "getWebhookDelivery", "webhooks:read"],
  ["shipmail_replay_webhook_delivery", "replayWebhookDelivery", "webhooks:write"],
  ["shipmail_list_suppressions", "listSuppressions", "suppressions:read"],
  ["shipmail_remove_suppression", "removeSuppression", "suppressions:write"],
  ["shipmail_create_audience", "createAudience", "audiences:write"],
  ["shipmail_list_audiences", "listAudiences", "audiences:read"],
  ["shipmail_get_audience", "getAudience", "audiences:read"],
  ["shipmail_update_audience", "updateAudience", "audiences:write"],
  ["shipmail_delete_audience", "deleteAudience", "audiences:write"],
  ["shipmail_add_subscriber", "addSubscriber", "audiences:write"],
  ["shipmail_add_subscribers_batch", "addSubscribersBatch", "audiences:write"],
  ["shipmail_list_subscribers", "listSubscribers", "audiences:read"],
  ["shipmail_get_subscriber", "getSubscriber", "audiences:read"],
  ["shipmail_get_subscriber_by_email", "getSubscriberByEmail", "audiences:read"],
  ["shipmail_update_subscriber", "updateSubscriber", "audiences:write"],
  ["shipmail_unsubscribe_subscriber", "unsubscribeSubscriber", "audiences:write"],
  ["shipmail_resubscribe_subscriber", "resubscribeSubscriber", "audiences:write"],
  ["shipmail_remove_subscriber", "removeSubscriber", "audiences:write"],
  ["shipmail_list_newsletter_domains", "listNewsletterDomains", "newsletters:read"],
  ["shipmail_create_newsletter", "createNewsletter", "newsletters:write"],
  [
    "shipmail_create_newsletter_from_changelog",
    "createNewsletterFromChangelog",
    "newsletters:write",
  ],
  ["shipmail_list_newsletters", "listNewsletters", "newsletters:read"],
  ["shipmail_get_newsletter", "getNewsletter", "newsletters:read"],
  ["shipmail_update_newsletter", "updateNewsletter", "newsletters:write"],
  ["shipmail_list_newsletter_assets", "listNewsletterAssets", "newsletters:read"],
  ["shipmail_register_newsletter_asset", "uploadNewsletterAsset", "newsletters:write"],
  ["shipmail_preview_newsletter", "previewNewsletter", "newsletters:read"],
  ["shipmail_run_newsletter_preflight", "runNewsletterPreflight", "newsletters:write"],
  ["shipmail_send_newsletter_test", "sendNewsletterTest", "newsletters:write"],
  ["shipmail_schedule_newsletter", "scheduleNewsletter", "newsletters:write"],
  ["shipmail_cancel_newsletter", "cancelNewsletter", "newsletters:write"],
  ["shipmail_resume_newsletter", "resumeNewsletter", "newsletters:write"],
  ["shipmail_list_calendar_events", "listCalendarEvents", "calendar:read"],
  ["shipmail_create_calendar_event", "createCalendarEvent", "calendar:write"],
  ["shipmail_get_calendar_event", "getCalendarEvent", "calendar:read"],
  ["shipmail_update_calendar_event", "updateCalendarEvent", "calendar:write"],
  ["shipmail_delete_calendar_event", "deleteCalendarEvent", "calendar:write"],
  ["shipmail_get_calendar_availability", "getCalendarAvailability", "calendar:read"],
  ["shipmail_list_booking_pages", "listBookingPages", "booking_pages:read"],
  ["shipmail_create_booking_page", "createBookingPage", "booking_pages:write"],
  ["shipmail_get_booking_page", "getBookingPage", "booking_pages:read"],
  ["shipmail_update_booking_page", "updateBookingPage", "booking_pages:write"],
  ["shipmail_delete_booking_page", "deleteBookingPage", "booking_pages:write"],
  ["shipmail_list_partner_organizations", "listPartnerOrganizations", "partner:organizations:read"],
  [
    "shipmail_create_partner_organization",
    "createPartnerOrganization",
    "partner:organizations:write",
  ],
  ["shipmail_get_partner_organization", "getPartnerOrganization", "partner:organizations:read"],
  [
    "shipmail_update_partner_organization",
    "updatePartnerOrganization",
    "partner:organizations:write",
  ],
  [
    "shipmail_resend_partner_ownership_invitation",
    "resendPartnerOwnershipInvitation",
    "partner:organizations:write",
  ],
  [
    "shipmail_suspend_partner_organization",
    "suspendPartnerOrganization",
    "partner:organizations:write",
  ],
  [
    "shipmail_resume_partner_organization",
    "resumePartnerOrganization",
    "partner:organizations:write",
  ],
  [
    "shipmail_offboard_partner_organization",
    "offboardPartnerOrganization",
    "partner:organizations:write",
  ],
  [
    "shipmail_list_partner_mailbox_credential_grants",
    "listPartnerMailboxCredentialGrants",
    "partner:mailbox_credentials:issue",
  ],
  [
    "shipmail_consume_partner_mailbox_credential_grant",
    "consumePartnerMailboxCredentialGrant",
    "partner:mailbox_credentials:issue",
  ],
  ["shipmail_get_partner_usage", "getPartnerUsage", "partner:usage:read"],
] as const satisfies readonly CapabilityRow[];

export type McpToolName = (typeof CAPABILITY_ROWS)[number][0];

export type McpCapability = {
  readonly toolName: McpToolName;
  readonly operationId: string;
  readonly requiredScope: ApiKeyScope | "public";
  readonly permissionGroup: McpPermissionGroupName;
  readonly allowedRoles: readonly McpRole[];
  readonly effect: McpCapabilityEffect;
  readonly recipientControl: McpRecipientControl;
  readonly duration: McpCapabilityDuration;
  readonly idempotency: McpIdempotencyBehavior;
  readonly annotations: {
    readonly readOnlyHint: boolean;
    readonly destructiveHint: boolean;
    readonly openWorldHint: boolean;
  };
  readonly auditAction: string | null;
  readonly transports: {
    readonly hostedOAuth: boolean;
    readonly directApiKeyHttp: boolean;
    readonly stdio: boolean;
  };
};

const MEMBER_GROUPS: ReadonlySet<McpPermissionGroupName> = new Set(
  MCP_MEMBER_PERMISSION_GROUP_NAMES,
);

const DESTRUCTIVE_PREFIXES = [
  "shipmail_delete_",
  "shipmail_remove_",
  "shipmail_revoke_",
  "shipmail_offboard_",
  "shipmail_cancel_",
] as const;

const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set([
  "shipmail_create_mailbox_app_password",
  "shipmail_create_mailbox_export",
  "shipmail_rotate_webhook_secret",
  "shipmail_consume_partner_mailbox_credential_grant",
]);

const EXTERNAL_WRITE_TOOLS: ReadonlySet<string> = new Set([
  "shipmail_send_message",
  "shipmail_send_inbox_reply_draft",
  "shipmail_reply_to_inbox_message",
  "shipmail_reply_to_inbox_thread",
  "shipmail_reply_to_message",
  "shipmail_reply_to_thread",
  "shipmail_create_mailbox_forwarding",
  "shipmail_create_webhook",
  "shipmail_update_webhook",
  "shipmail_test_webhook",
  "shipmail_replay_webhook_delivery",
  "shipmail_send_newsletter_test",
  "shipmail_schedule_newsletter",
  "shipmail_create_calendar_event",
  "shipmail_update_calendar_event",
  "shipmail_update_scheduled_message",
]);

const SERVER_DERIVED_RECIPIENT_TOOLS: ReadonlySet<string> = new Set([
  "shipmail_send_inbox_reply_draft",
  "shipmail_reply_to_inbox_message",
  "shipmail_reply_to_inbox_thread",
  "shipmail_reply_to_message",
  "shipmail_reply_to_thread",
]);

const CALLER_SUPPLIED_RECIPIENT_TOOLS: ReadonlySet<string> = new Set([
  "shipmail_send_message",
  "shipmail_create_mailbox_forwarding",
  "shipmail_create_webhook",
  "shipmail_update_webhook",
  "shipmail_send_newsletter_test",
  "shipmail_create_calendar_event",
  "shipmail_update_calendar_event",
  "shipmail_update_scheduled_message",
]);

const OPEN_WORLD_READ_SCOPES: ReadonlySet<ApiKeyScope> = new Set([
  "messages:read",
  "threads:read",
  "webhooks:read",
]);

function permissionGroupFor(
  toolName: McpToolName,
  requiredScope: ApiKeyScope | "public",
): McpPermissionGroupName {
  if (requiredScope === "public") return "account_status";
  if (requiredScope.startsWith("partner:")) return "partner_admin";
  if (requiredScope.startsWith("domains:")) return "domain_admin";
  if (requiredScope.startsWith("mailbox_credentials:")) return "credentials";
  if (requiredScope.startsWith("mailbox_forwarding:")) return "forwarding";
  if (requiredScope === "mailboxes:export") return "mailbox_export";
  if (requiredScope === "drafts:write") return "drafts";
  if (requiredScope === "messages:send") return "send_mail";
  if (requiredScope === "messages:write") return "mail_organize";
  if (requiredScope === "messages:read" || requiredScope === "threads:read") return "mail_read";
  if (requiredScope === "calendar:read") return "calendar_read";
  if (requiredScope === "calendar:write") return "calendar_write";
  if (requiredScope.startsWith("booking_pages:")) return "booking_pages";
  if (requiredScope.startsWith("webhooks:")) return "webhooks";
  if (requiredScope.startsWith("newsletters:")) return "newsletters";
  if (requiredScope.startsWith("audiences:")) return "audiences";
  if (requiredScope.startsWith("suppressions:")) return "suppressions";
  if (requiredScope === "mailboxes:read") {
    return toolName.includes("_import") ? "mailbox_admin" : "mail_read";
  }
  return "mailbox_admin";
}

function effectFor(toolName: McpToolName): McpCapabilityEffect {
  if (
    toolName === "shipmail_status" ||
    toolName === "shipmail_compose_message_with_file" ||
    toolName.startsWith("shipmail_list_") ||
    toolName.startsWith("shipmail_get_") ||
    toolName.startsWith("shipmail_search_") ||
    toolName.startsWith("shipmail_preview_")
  ) {
    return "read";
  }
  if (DESTRUCTIVE_TOOLS.has(toolName)) return "destructive";
  if (EXTERNAL_WRITE_TOOLS.has(toolName)) return "external_write";
  if (DESTRUCTIVE_PREFIXES.some((prefix) => toolName.startsWith(prefix))) return "destructive";
  return "local_write";
}

function recipientControlFor(toolName: McpToolName): McpRecipientControl {
  if (SERVER_DERIVED_RECIPIENT_TOOLS.has(toolName)) return "server_derived";
  if (CALLER_SUPPLIED_RECIPIENT_TOOLS.has(toolName)) return "caller_supplied";
  return "none";
}

function durationFor(toolName: McpToolName): McpCapabilityDuration {
  if (
    toolName.includes("app_password") ||
    toolName.includes("credential_grant") ||
    toolName === "shipmail_rotate_webhook_secret"
  ) {
    return "credential";
  }
  if (
    toolName.includes("forwarding") ||
    toolName.includes("webhook") ||
    toolName.includes("booking_page")
  ) {
    return "persistent";
  }
  if (
    toolName === "shipmail_send_message" ||
    toolName.includes("schedule_") ||
    toolName.includes("scheduled_message")
  ) {
    return "scheduled";
  }
  return "one_shot";
}

function idempotencyFor(
  toolName: McpToolName,
  effect: McpCapabilityEffect,
): McpIdempotencyBehavior {
  if (effect === "read") return "none";
  if (
    toolName === "shipmail_create_mailbox_app_password" ||
    toolName === "shipmail_consume_partner_mailbox_credential_grant" ||
    toolName === "shipmail_prepare_staged_attachment_upload"
  ) {
    return "forbidden";
  }
  if (
    DESTRUCTIVE_PREFIXES.some((prefix) => toolName.startsWith(prefix)) ||
    toolName.startsWith("shipmail_suspend_") ||
    toolName.startsWith("shipmail_resume_")
  ) {
    return "resource_key";
  }
  return "api_header";
}

function defineCapability(row: (typeof CAPABILITY_ROWS)[number]): McpCapability {
  const [toolName, operationId, requiredScope] = row;
  const permissionGroup = permissionGroupFor(toolName, requiredScope);
  const effect = effectFor(toolName);
  const recipientControl = recipientControlFor(toolName);
  const openWorldHint =
    effect === "external_write" ||
    recipientControl !== "none" ||
    (requiredScope !== "public" && OPEN_WORLD_READ_SCOPES.has(requiredScope));

  return {
    toolName,
    operationId,
    requiredScope,
    permissionGroup,
    allowedRoles: MEMBER_GROUPS.has(permissionGroup) ? ["owner", "member"] : ["owner"],
    effect,
    recipientControl,
    duration: durationFor(toolName),
    idempotency: idempotencyFor(toolName, effect),
    annotations: {
      readOnlyHint: effect === "read",
      destructiveHint: effect === "external_write" || effect === "destructive",
      openWorldHint,
    },
    auditAction: effect === "read" ? null : "api.mutation",
    transports: {
      hostedOAuth: permissionGroup !== "partner_admin",
      directApiKeyHttp: true,
      stdio: toolName !== "shipmail_compose_message_with_file",
    },
  };
}

export const MCP_CAPABILITIES: readonly McpCapability[] = CAPABILITY_ROWS.map(defineCapability);

export const MCP_TOOL_NAMES: readonly McpToolName[] = CAPABILITY_ROWS.map(([toolName]) => toolName);

export const MCP_HOSTED_OAUTH_PERMISSION_GROUP_NAMES: readonly McpPermissionGroupName[] =
  MCP_PERMISSION_GROUPS.filter((group) =>
    MCP_CAPABILITIES.some(
      (capability) =>
        capability.permissionGroup === group.name && capability.transports.hostedOAuth,
    ),
  ).map((group) => group.name);

export function getMcpCapability(toolName: string): McpCapability | undefined {
  return MCP_CAPABILITIES.find((capability) => capability.toolName === toolName);
}

export function getAllowedMcpToolNames(
  grantedScopes: readonly string[],
  transport: keyof McpCapability["transports"],
): ReadonlySet<McpToolName> {
  return new Set(
    MCP_CAPABILITIES.filter(
      (capability) =>
        capability.transports[transport] &&
        apiKeyScopesGrant(grantedScopes, capability.requiredScope),
    ).map((capability) => capability.toolName),
  );
}

export function permissionGroupsToScopes(
  groupNames: readonly McpPermissionGroupName[],
): readonly ApiKeyScope[] {
  const scopes = new Set<ApiKeyScope>();
  for (const group of MCP_PERMISSION_GROUPS) {
    if (!groupNames.includes(group.name)) continue;
    for (const scope of group.scopes) scopes.add(scope);
  }
  return API_KEY_SCOPES.filter((scope) => scope !== "*" && scopes.has(scope));
}
