// Compile-time drift check between the published `shipmail` SDK types and the
// MCP package's Zod output schemas. The MCP package validates upstream API
// responses with these schemas before forwarding to the LLM, so they must stay
// in sync with the SDK contract. The SDK is the source of truth.
//
// Two directions are checked:
// 1. Every SDK type field must exist in the matching MCP schema (no fields
//    silently stripped from the LLM when the SDK adds them).
// 2. Every MCP schema field must exist in the SDK type (no schema-only fields
//    that the SDK doesn't know about).
//
// If either direction fails, this file fails to typecheck. There are no
// runtime assertions — the existence of the test (and its place under bun
// test discovery) keeps it in CI.
import { describe, test } from "bun:test";
import type {
  BookingPage,
  CreatedMailboxAppPassword,
  Domain,
  DomainSearchResult,
  DomainVerificationResult,
  InboxFullMessage,
  InboxMessage,
  InboxMessageAction,
  InboxMessages,
  InboxThread,
  Mailbox,
  MailboxAppPassword,
  MailboxExport,
  MailboxFolder,
  MailboxFolders,
  MailboxIdentities,
  MailboxIdentity,
  Message,
  Newsletter,
  NewsletterAsset,
  NewsletterDomain,
  NewsletterPreflight,
  NewsletterPreflightItem,
  NewsletterPreview,
  NewsletterTestSend,
  PartnerMailboxCredential,
  Suppression,
  Webhook,
  WebhookDelivery,
  WebhookDeliveryDetail,
} from "shipmail";
import type { z } from "zod/v4";

import {
  bookingPageSchema,
  createdMailboxAppPasswordSchema,
  domainSchema,
  domainSearchResultSchema,
  domainVerificationSchema,
  inboxFullMessageSchema,
  inboxMessageActionSchema,
  inboxMessageSchema,
  inboxMessagesSchema,
  inboxThreadSchema,
  mailboxAppPasswordSchema,
  mailboxExportSchema,
  mailboxFolderSchema,
  mailboxFoldersSchema,
  mailboxIdentitiesSchema,
  mailboxIdentitySchema,
  mailboxSchema,
  messageSchema,
  newsletterAssetSchema,
  newsletterDomainSchema,
  newsletterPreflightItemSchema,
  newsletterPreflightSchema,
  newsletterPreviewSchema,
  newsletterSchema,
  newsletterTestSendSchema,
  partnerMailboxCredentialSchema,
  suppressionSchema,
  webhookDeliveryDetailSchema,
  webhookDeliverySchema,
  webhookSchema,
} from "../schemas.js";

// `[T] extends [never]` is true only when T is never; bare `T extends never`
// distributes over unions and gives misleading results. Force a non-never key
// to surface as a compile error in the consumer of `KeysMatch`.
type Keys<T> = keyof T;
type KeysMatch<A, B> = [Exclude<Keys<A>, Keys<B>>] extends [never]
  ? [Exclude<Keys<B>, Keys<A>>] extends [never]
    ? true
    : { error: "MCP schema has fields the SDK type does not"; extra: Exclude<Keys<B>, Keys<A>> }
  : { error: "SDK type has fields the MCP schema does not"; missing: Exclude<Keys<A>, Keys<B>> };

type AssertTrue<T extends true> = T;

// One assertion per (SDK type, MCP schema) pair. Adding a field on either
// side and forgetting to mirror it on the other will fail this typecheck.
type _DomainKeys = AssertTrue<KeysMatch<Domain, z.infer<typeof domainSchema>>>;
type _BookingPageKeys = AssertTrue<KeysMatch<BookingPage, z.infer<typeof bookingPageSchema>>>;
type _MailboxKeys = AssertTrue<KeysMatch<Mailbox, z.infer<typeof mailboxSchema>>>;
type _MailboxAppPasswordKeys = AssertTrue<
  KeysMatch<MailboxAppPassword, z.infer<typeof mailboxAppPasswordSchema>>
>;
type _CreatedMailboxAppPasswordKeys = AssertTrue<
  KeysMatch<CreatedMailboxAppPassword, z.infer<typeof createdMailboxAppPasswordSchema>>
>;
type _PartnerMailboxCredentialKeys = AssertTrue<
  KeysMatch<PartnerMailboxCredential, z.infer<typeof partnerMailboxCredentialSchema>>
>;
type _MailboxExportKeys = AssertTrue<KeysMatch<MailboxExport, z.infer<typeof mailboxExportSchema>>>;
type _MailboxFolderKeys = AssertTrue<KeysMatch<MailboxFolder, z.infer<typeof mailboxFolderSchema>>>;
type _MailboxFoldersKeys = AssertTrue<
  KeysMatch<MailboxFolders, z.infer<typeof mailboxFoldersSchema>>
>;
type _MailboxIdentityKeys = AssertTrue<
  KeysMatch<MailboxIdentity, z.infer<typeof mailboxIdentitySchema>>
>;
type _MailboxIdentitiesKeys = AssertTrue<
  KeysMatch<MailboxIdentities, z.infer<typeof mailboxIdentitiesSchema>>
>;
type _InboxMessageKeys = AssertTrue<KeysMatch<InboxMessage, z.infer<typeof inboxMessageSchema>>>;
type _InboxMessageActionKeys = AssertTrue<
  KeysMatch<InboxMessageAction, z.infer<typeof inboxMessageActionSchema>>
>;
type _InboxFullMessageKeys = AssertTrue<
  KeysMatch<InboxFullMessage, z.infer<typeof inboxFullMessageSchema>>
>;
type _InboxMessagesKeys = AssertTrue<KeysMatch<InboxMessages, z.infer<typeof inboxMessagesSchema>>>;
type _InboxThreadKeys = AssertTrue<KeysMatch<InboxThread, z.infer<typeof inboxThreadSchema>>>;
type _MessageKeys = AssertTrue<KeysMatch<Message, z.infer<typeof messageSchema>>>;
type _NewsletterDomainKeys = AssertTrue<
  KeysMatch<NewsletterDomain, z.infer<typeof newsletterDomainSchema>>
>;
type _NewsletterKeys = AssertTrue<KeysMatch<Newsletter, z.infer<typeof newsletterSchema>>>;
type _NewsletterAssetKeys = AssertTrue<
  KeysMatch<NewsletterAsset, z.infer<typeof newsletterAssetSchema>>
>;
type _NewsletterPreflightItemKeys = AssertTrue<
  KeysMatch<NewsletterPreflightItem, z.infer<typeof newsletterPreflightItemSchema>>
>;
type _NewsletterPreflightKeys = AssertTrue<
  KeysMatch<NewsletterPreflight, z.infer<typeof newsletterPreflightSchema>>
>;
type _NewsletterPreviewKeys = AssertTrue<
  KeysMatch<NewsletterPreview, z.infer<typeof newsletterPreviewSchema>>
>;
type _NewsletterTestSendKeys = AssertTrue<
  KeysMatch<NewsletterTestSend, z.infer<typeof newsletterTestSendSchema>>
>;
type _WebhookKeys = AssertTrue<KeysMatch<Webhook, z.infer<typeof webhookSchema>>>;
type _WebhookDeliveryKeys = AssertTrue<
  KeysMatch<WebhookDelivery, z.infer<typeof webhookDeliverySchema>>
>;
type _WebhookDeliveryDetailKeys = AssertTrue<
  KeysMatch<WebhookDeliveryDetail, z.infer<typeof webhookDeliveryDetailSchema>>
>;
type _SuppressionKeys = AssertTrue<KeysMatch<Suppression, z.infer<typeof suppressionSchema>>>;
type _DomainSearchKeys = AssertTrue<
  KeysMatch<DomainSearchResult, z.infer<typeof domainSearchResultSchema>>
>;
type _DomainVerificationKeys = AssertTrue<
  KeysMatch<DomainVerificationResult, z.infer<typeof domainVerificationSchema>>
>;

// Suppress unused-type warnings; the existence of the type aliases above is
// what enforces the assertion at compile time.
type _AllChecks = [
  _DomainKeys,
  _BookingPageKeys,
  _MailboxKeys,
  _MailboxAppPasswordKeys,
  _CreatedMailboxAppPasswordKeys,
  _PartnerMailboxCredentialKeys,
  _MailboxExportKeys,
  _MailboxFolderKeys,
  _MailboxFoldersKeys,
  _MailboxIdentityKeys,
  _MailboxIdentitiesKeys,
  _InboxMessageKeys,
  _InboxMessageActionKeys,
  _InboxFullMessageKeys,
  _InboxMessagesKeys,
  _InboxThreadKeys,
  _MessageKeys,
  _NewsletterDomainKeys,
  _NewsletterKeys,
  _NewsletterAssetKeys,
  _NewsletterPreflightItemKeys,
  _NewsletterPreflightKeys,
  _NewsletterPreviewKeys,
  _NewsletterTestSendKeys,
  _WebhookKeys,
  _WebhookDeliveryKeys,
  _WebhookDeliveryDetailKeys,
  _SuppressionKeys,
  _DomainSearchKeys,
  _DomainVerificationKeys,
];

// Runtime no-op test so the suite reports the alignment file when CI lists
// suites and so the import side-effects (and the schema bodies) are exercised.
describe("SDK / MCP schema alignment", () => {
  test("compile-time key match holds (see this file's type aliases)", () => {
    const checks: _AllChecks = [
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ];
    if (checks.length !== 30) throw new Error("alignment matrix size changed");
  });
});
