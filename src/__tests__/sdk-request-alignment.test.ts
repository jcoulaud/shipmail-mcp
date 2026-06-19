// Compile-time drift check between the SDK *request* parameter types and the
// MCP package's Zod *input* schemas. The existing sdk-alignment.test.ts covers
// response shapes (entity types like Domain, Mailbox, Webhook). This file
// covers the inverse direction: every key the SDK accepts in a request body
// must be present in the matching MCP input schema, and every key the MCP
// schema declares must either map to an SDK request key or to a documented
// MCP-only field (idempotency_key, id-as-path-param).
//
// If either direction fails, this file fails to typecheck. Mechanism mirrors
// `KeysMatch` from sdk-alignment.test.ts.
import { describe, test } from "bun:test";
import type {
  CreateDomainParams,
  CreateMailboxFolderParams,
  CreateMailboxParams,
  CreateWebhookParams,
  ListInboxMessagesParams,
  MoveInboxMessageParams,
  ReplyToMessageParams,
  ReplyToThreadParams,
  ResetMailboxPasswordParams,
  SearchDomainsParams,
  SendMessageParams,
  UpdateAutoReplyParams,
  UpdateDomainParams,
  UpdateInboxMessageParams,
  UpdateMailboxFolderParams,
  UpdateMailboxParams,
  UpdateMailboxRulesParams,
  UpdateSpamFilterParams,
  UpdateWebhookParams,
} from "shipmail";
import type { z } from "zod/v4";

import type {
  autoReplyInputSchema,
  createDomainInputSchema,
  createMailboxFolderInputSchema,
  createMailboxInputSchema,
  createWebhookInputSchema,
  listMailboxInboxMessagesInputSchema,
  moveInboxMessageInputSchema,
  replyToMessageInputSchema,
  replyToThreadInputSchema,
  resetPasswordInputSchema,
  searchDomainsInputSchema,
  sendMessageInputSchema,
  spamFilterInputSchema,
  updateDomainInputSchema,
  updateInboxMessageInputSchema,
  updateMailboxFolderInputSchema,
  updateMailboxInputSchema,
  updateMailboxRulesInputSchema,
  updateWebhookInputSchema,
} from "../schemas.js";

// MCP-only request fields that intentionally have no SDK counterpart:
// - `idempotency_key` is the optional MCP-supplied idempotency key. The SDK
//   takes this through MethodOptions, not the params object.
// - `id` is the path parameter for tools that wrap "PATCH /thing/:id" or
//   "POST /thing/:id/sub-action". The SDK passes id as the first positional
//   argument, separate from params.
// - `folder_id` and `message_id` are second path parameters for nested tools.
type StripMcpOnly<T> = Omit<T, "idempotency_key" | "id" | "folder_id" | "message_id">;
type StripMcpOnlyKeepFolderId<T> = Omit<T, "idempotency_key" | "id">;

// SDK fields that the MCP intentionally does not expose. Keep this list
// honest: every entry should match a documented design choice. If the list
// grows, document why in the threat-model / runbook.
type SendMessageSdkOnly = "from"; // MCP forces explicit mailbox_id; no email lookup.

type Keys<T> = keyof T;
type KeysMatch<A, B> = [Exclude<Keys<A>, Keys<B>>] extends [never]
  ? [Exclude<Keys<B>, Keys<A>>] extends [never]
    ? true
    : { error: "MCP schema has fields the SDK type does not"; extra: Exclude<Keys<B>, Keys<A>> }
  : { error: "SDK type has fields the MCP schema does not"; missing: Exclude<Keys<A>, Keys<B>> };

type AssertTrue<T extends true> = T;

// One assertion per (SDK request type, MCP input schema) pair.
type _CreateDomain = AssertTrue<
  KeysMatch<CreateDomainParams, StripMcpOnly<z.infer<typeof createDomainInputSchema>>>
>;
type _UpdateDomain = AssertTrue<
  KeysMatch<UpdateDomainParams, StripMcpOnly<z.infer<typeof updateDomainInputSchema>>>
>;
type _SearchDomains = AssertTrue<
  KeysMatch<SearchDomainsParams, StripMcpOnly<z.infer<typeof searchDomainsInputSchema>>>
>;
type _CreateMailbox = AssertTrue<
  KeysMatch<CreateMailboxParams, StripMcpOnly<z.infer<typeof createMailboxInputSchema>>>
>;
type _UpdateMailbox = AssertTrue<
  KeysMatch<UpdateMailboxParams, StripMcpOnly<z.infer<typeof updateMailboxInputSchema>>>
>;
type _CreateMailboxFolder = AssertTrue<
  KeysMatch<CreateMailboxFolderParams, StripMcpOnly<z.infer<typeof createMailboxFolderInputSchema>>>
>;
type _UpdateMailboxFolder = AssertTrue<
  KeysMatch<UpdateMailboxFolderParams, StripMcpOnly<z.infer<typeof updateMailboxFolderInputSchema>>>
>;
type _ResetMailboxPassword = AssertTrue<
  KeysMatch<ResetMailboxPasswordParams, StripMcpOnly<z.infer<typeof resetPasswordInputSchema>>>
>;
type _UpdateMailboxRules = AssertTrue<
  KeysMatch<UpdateMailboxRulesParams, StripMcpOnly<z.infer<typeof updateMailboxRulesInputSchema>>>
>;
type _UpdateAutoReply = AssertTrue<
  KeysMatch<UpdateAutoReplyParams, StripMcpOnly<z.infer<typeof autoReplyInputSchema>>>
>;
type _UpdateSpamFilter = AssertTrue<
  KeysMatch<UpdateSpamFilterParams, StripMcpOnly<z.infer<typeof spamFilterInputSchema>>>
>;
type _ListInboxMessages = AssertTrue<
  KeysMatch<
    ListInboxMessagesParams,
    StripMcpOnlyKeepFolderId<z.infer<typeof listMailboxInboxMessagesInputSchema>>
  >
>;
type _UpdateInboxMessage = AssertTrue<
  KeysMatch<UpdateInboxMessageParams, StripMcpOnly<z.infer<typeof updateInboxMessageInputSchema>>>
>;
type _MoveInboxMessage = AssertTrue<
  KeysMatch<MoveInboxMessageParams, StripMcpOnly<z.infer<typeof moveInboxMessageInputSchema>>>
>;
type _SendMessage = AssertTrue<
  KeysMatch<
    Omit<SendMessageParams, SendMessageSdkOnly>,
    StripMcpOnly<z.infer<typeof sendMessageInputSchema>>
  >
>;
type _ReplyToMessage = AssertTrue<
  KeysMatch<ReplyToMessageParams, StripMcpOnly<z.infer<typeof replyToMessageInputSchema>>>
>;
type _ReplyToThread = AssertTrue<
  KeysMatch<ReplyToThreadParams, StripMcpOnly<z.infer<typeof replyToThreadInputSchema>>>
>;
type _CreateWebhook = AssertTrue<
  KeysMatch<CreateWebhookParams, StripMcpOnly<z.infer<typeof createWebhookInputSchema>>>
>;
type _UpdateWebhook = AssertTrue<
  KeysMatch<UpdateWebhookParams, StripMcpOnly<z.infer<typeof updateWebhookInputSchema>>>
>;

// Suppress unused-type warnings; the type aliases above are what enforce the
// assertion at compile time.
type _AllChecks = [
  _CreateDomain,
  _UpdateDomain,
  _SearchDomains,
  _CreateMailbox,
  _UpdateMailbox,
  _CreateMailboxFolder,
  _UpdateMailboxFolder,
  _ResetMailboxPassword,
  _UpdateMailboxRules,
  _UpdateAutoReply,
  _UpdateSpamFilter,
  _ListInboxMessages,
  _UpdateInboxMessage,
  _MoveInboxMessage,
  _SendMessage,
  _ReplyToMessage,
  _ReplyToThread,
  _CreateWebhook,
  _UpdateWebhook,
];

describe("SDK request params / MCP input schema alignment", () => {
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
    ];
    if (checks.length !== 19) throw new Error("alignment matrix size changed");
  });
});
