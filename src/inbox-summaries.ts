import type { InboxFullMessage, InboxMessage, InboxMessages } from "shipmail";

// A page of full inbox messages from a real mailbox is multiple megabytes of
// body content, which exceeds every MCP host's tool-result budget and made the
// list tool unusable in practice. List surfaces return the API's summary
// representation instead; full content stays on the single-message and
// single-thread tools.
export function toInboxMessageSummary(message: InboxFullMessage): InboxMessage {
  return {
    object: "inbox_message",
    id: message.id,
    thread_id: message.thread_id,
    mailbox_id: message.mailbox_id,
    address: message.address,
    folder_ids: message.folder_ids,
    keywords: message.keywords,
    from: message.from,
    to: message.to,
    subject: message.subject,
    received_at: message.received_at,
    preview: message.preview,
    has_attachment: message.has_attachment,
    size: message.size,
    authentication_results: message.authentication_results,
  };
}

export type InboxMessageSummaries = Omit<InboxMessages, "data"> & {
  readonly data: readonly InboxMessage[];
};

export function toInboxMessageSummaries(messages: InboxMessages): InboxMessageSummaries {
  return {
    ...messages,
    data: messages.data.map(toInboxMessageSummary),
  };
}
