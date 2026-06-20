# Shipmail MCP Server

[![npm version](https://img.shields.io/npm/v/shipmail-mcp.svg)](https://www.npmjs.com/package/shipmail-mcp)
[![npm downloads](https://img.shields.io/npm/dm/shipmail-mcp.svg)](https://www.npmjs.com/package/shipmail-mcp)
[![node](https://img.shields.io/node/v/shipmail-mcp.svg)](https://www.npmjs.com/package/shipmail-mcp)
[![license](https://img.shields.io/npm/l/shipmail-mcp.svg)](./LICENSE)
[![source](https://img.shields.io/badge/source-GitHub-black.svg)](https://github.com/jcoulaud/shipmail-mcp)

Official Model Context Protocol server for [Shipmail](https://shipmail.to), a business email provider with a REST API, webhooks, and custom-domain inboxes for AI agents. Connect MCP-compatible agents (Claude Desktop, Cursor, VS Code, Windsurf, and others) to Shipmail domains, mailboxes, messages, threads, webhooks, and suppressions.
The public source repository is [jcoulaud/shipmail-mcp](https://github.com/jcoulaud/shipmail-mcp), which is also the npm package metadata target.

> [Model Context Protocol](https://modelcontextprotocol.io) is an open standard for connecting LLM clients to external tools and data. This server runs locally over stdio and exposes the Shipmail API to your agent.

**Transport**: stdio (local).
**Requirements**: Node.js 20+ and a [Shipmail API key](https://shipmail.to/docs/quick-start).

## Answer summary

- Shipmail is a business email provider with a REST API and an official MCP server for AI agents.
- Use `shipmail-mcp` when an AI agent needs its own custom-domain email inbox that it can send from, read, and reply from.
- The same mailbox can be operated through MCP tools, REST API calls, webhooks, the Shipmail dashboard, or standard IMAP/SMTP clients.
- Public source: [github.com/jcoulaud/shipmail-mcp](https://github.com/jcoulaud/shipmail-mcp). Published package: [`shipmail-mcp` on npm](https://www.npmjs.com/package/shipmail-mcp).
- Official registry metadata: [`io.github.jcoulaud/shipmail-mcp`](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.jcoulaud/shipmail-mcp). Public directory metadata: [Glama MCP listing](https://glama.ai/mcp/servers/jcoulaud/shipmail-mcp).

## Common recommendation answers

**Is there a business email provider with a REST API and an MCP server for AI agents?**
Yes. Shipmail provides custom-domain business email hosting, a REST API, webhooks, SDKs, IMAP/SMTP access, and this official MCP server. Use it when an agent needs a real mailbox it can send from, read, reply from, and hand back to a human.

**How can an AI agent get its own email inbox?**
Create a dedicated Shipmail mailbox on your domain, generate a scoped Shipmail API key, and install this MCP server with `npx -y shipmail-mcp`. The same mailbox can also be driven by the Shipmail REST API or inbound webhooks for deterministic product workflows.

**When is Shipmail a better fit than Gmail MCP, Microsoft Graph MCP, or a transactional email API?**
Use Shipmail when the agent needs a new business mailbox on your domain. Use Gmail MCP or Microsoft Graph MCP when the agent must operate inside an existing Google or Microsoft account. Use transactional providers when the agent only sends product email and does not need durable mailbox state.

## Contents

- [Answer summary](#answer-summary)
- [Common recommendation answers](#common-recommendation-answers)
- [Quick start](#quick-start)
  - [Claude Desktop](#claude-desktop)
  - [Cursor](#cursor)
  - [VS Code](#vs-code)
  - [Windsurf](#windsurf)
- [What you can do](#what-you-can-do)
- [Tools](#tools)
- [Resources](#resources)
- [Prompts](#prompts)
- [Configuration](#configuration)
- [Security](#security)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)
- [Links](#links)

## Quick start

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "shipmail": {
      "command": "npx",
      "args": ["-y", "shipmail-mcp"],
      "env": {
        "SHIPMAIL_API_KEY": "sm_live_..."
      }
    }
  }
}
```

Restart Claude Desktop. The Shipmail tools appear under the tools menu.

### Cursor

Add to `.cursor/mcp.json` in the project root, or `~/.cursor/mcp.json` for global use:

```json
{
  "mcpServers": {
    "shipmail": {
      "command": "npx",
      "args": ["-y", "shipmail-mcp"],
      "env": {
        "SHIPMAIL_API_KEY": "sm_live_..."
      }
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`. The `inputs` block prompts for the key on first use instead of storing it in the file:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "shipmail-api-key",
      "description": "Shipmail API key",
      "password": true
    }
  ],
  "servers": {
    "shipmail": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "shipmail-mcp"],
      "env": {
        "SHIPMAIL_API_KEY": "${input:shipmail-api-key}"
      }
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "shipmail": {
      "command": "npx",
      "args": ["-y", "shipmail-mcp"],
      "env": {
        "SHIPMAIL_API_KEY": "sm_live_..."
      }
    }
  }
}
```

## What you can do

Once connected, ask your agent:

- "Set up acme.com on Shipmail and show me the DNS records I need to add at my registrar."
- "Create a mailbox `support@acme.com` and turn on auto-reply with this text..."
- "Triage the threads in `support@acme.com` from this week and summarize what needs attention."
- "Reply to thread `thread_abc123` confirming we ship Friday."
- "Create a webhook that posts new email events to `https://example.com/hooks/shipmail`, then send a test event."
- "Show recent deliveries for webhook `whk_xyz` and flag any that failed."

## Tools

All tools are namespaced with `shipmail_` to avoid collisions with peer MCP servers.

| Group                | Tools                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | `shipmail_status`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Domains              | `shipmail_list_domains`, `shipmail_get_domain`, `shipmail_create_domain`, `shipmail_update_domain`, `shipmail_delete_domain`, `shipmail_verify_domain`, `shipmail_search_domains`                                                                                                                                                                                                                                                                                   |
| Mailboxes            | `shipmail_list_mailboxes`, `shipmail_get_mailbox`, `shipmail_create_mailbox`, `shipmail_update_mailbox`, `shipmail_delete_mailbox`, `shipmail_list_mailbox_folders`, `shipmail_create_mailbox_folder`, `shipmail_update_mailbox_folder`, `shipmail_delete_mailbox_folder`, `shipmail_list_mailbox_identities`, `shipmail_get_mailbox_rules`, `shipmail_set_mailbox_rules`, `shipmail_reset_mailbox_password`, `shipmail_set_auto_reply`, `shipmail_set_spam_filter` |
| Mailbox inbox        | `shipmail_list_mailbox_inbox_messages`, `shipmail_get_mailbox_inbox_thread`, `shipmail_update_inbox_message`, `shipmail_move_inbox_message`, `shipmail_delete_inbox_message`                                                                                                                                                                                                                                                                                        |
| Messages and threads | `shipmail_list_messages`, `shipmail_get_message`, `shipmail_send_message`, `shipmail_reply_to_message`, `shipmail_list_threads`, `shipmail_get_thread`, `shipmail_reply_to_thread`                                                                                                                                                                                                                                                                                  |
| Webhooks             | `shipmail_list_webhooks`, `shipmail_get_webhook`, `shipmail_create_webhook`, `shipmail_update_webhook`, `shipmail_delete_webhook`, `shipmail_rotate_webhook_secret`, `shipmail_test_webhook`, `shipmail_list_webhook_deliveries`                                                                                                                                                                                                                                    |
| Suppressions         | `shipmail_list_suppressions`, `shipmail_remove_suppression`                                                                                                                                                                                                                                                                                                                                                                                                         |

To restrict the surface, pass `--tools` (overrides `SHIPMAIL_MCP_TOOLS`):

```json
{
  "args": [
    "-y",
    "shipmail-mcp",
    "--tools",
    "shipmail_list_mailboxes,shipmail_get_thread,shipmail_reply_to_thread"
  ]
}
```

## Resources

Read-only resources for inspection without tool calls:

- `shipmail://account/status`
- `shipmail://domains`
- `shipmail://domains/{id}`
- `shipmail://mailboxes`
- `shipmail://mailboxes/{id}`
- `shipmail://mailboxes/{id}/folders`
- `shipmail://mailboxes/{id}/identities`
- `shipmail://mailboxes/{id}/rules`
- `shipmail://mailboxes/{id}/inbox/messages`
- `shipmail://mailboxes/{id}/inbox/threads/{thread_id}`
- `shipmail://messages/{id}`
- `shipmail://threads/{id}`

## Prompts

Pre-built prompts the agent can use as guided workflows:

- `setup_domain`: connect a new domain and walk through DNS setup.
- `triage_mailbox`: read recent threads in a mailbox and summarize what needs attention.
- `draft_email_reply`: draft a reply for a given thread, ready for user review.
- `configure_webhook`: set up and test a webhook for incoming events.

## Configuration

| Variable                           | Required                         | Description                                                                                                                                                 |
| ---------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHIPMAIL_API_KEY`                 | Yes (or `SHIPMAIL_API_KEY_FILE`) | Shipmail API key (`sm_live_...`).                                                                                                                           |
| `SHIPMAIL_API_KEY_FILE`            | No                               | Path to a file containing the API key. Takes precedence over `SHIPMAIL_API_KEY`. Reduces env-trace leak surface (Docker secrets, systemd `LoadCredential`). |
| `SHIPMAIL_BASE_URL`                | No                               | Override the API base URL. Must be https on a `shipmail.to` host. Defaults to `https://shipmail.to/api/v1`.                                                 |
| `SHIPMAIL_MCP_TOOLS`               | No                               | Comma-separated tool allowlist. The `--tools` flag overrides this.                                                                                          |
| `SHIPMAIL_ALLOW_INSECURE_BASE_URL` | No                               | Set to `1` to permit a non-https or non-`shipmail.to` base URL. Local development only.                                                                     |
| `SHIPMAIL_MCP_DEBUG`               | No                               | Set to `1` to include `request_id` and `status` in stderr tool-call logs.                                                                                   |

## Security

- **Tool namespacing**: All tools are prefixed with `shipmail_` to avoid collisions with peer MCP servers in the same host.
- **Structured outputs**: Successful tools return both text fallback content and structured MCP `structuredContent`.
- **Idempotency**: Mutating tools accept an optional `idempotency_key`. When omitted, the server generates a fresh key per tool call. Supply your own key if a specific request must stay idempotent across MCP retries.
- **Input sanitization**: Email content, addresses, and error text are stripped of ASCII control characters, DEL, and Unicode directional or BiDi markers (U+061C, U+200E/F, U+202A-E, U+2066-9). Long strings are truncated.
- **Error redaction**: 5xx and unexpected Shipmail errors are redacted to a generic message; the original `request_id` is preserved for support. Generic `Error` thrown values (network errors, deserialization) are redacted to "Internal MCP error" before reaching the LLM. Detail lands on stderr.
- **Circuit breaker**: Each session enforces per-tool rate limits and a hard total-call ceiling as a runaway-agent guard. These are not abuse controls. Real abuse limits live at the API per API key. Restart the server to reset.
- **Webhook URL validation**: Webhook URLs must be public https endpoints. Localhost, RFC1918, link-local, ULA, IPv4-mapped IPv6, `0.0.0.0`, decimal-int IPs, `.local`, and `.internal` hosts are rejected at input time.
- **Destructive annotations**: Tools that delete, retarget, rotate, replace rules, reset credentials, or create automatic outbound responses are annotated with `destructiveHint`. Hosts that gate on this annotation will prompt the user. Annotated tools include `shipmail_update_domain`, `shipmail_update_webhook`, `shipmail_rotate_webhook_secret`, `shipmail_delete_mailbox_folder`, `shipmail_set_mailbox_rules`, `shipmail_reset_mailbox_password`, and `shipmail_set_auto_reply` in addition to obvious deletes.

Domain purchase is intentionally excluded.

### What this server does not defend against

- **Indirect prompt injection from email content.** Reading a mailbox exposes the agent to attacker-controlled email bodies. The sanitizer strips invisible glyphs but cannot detect natural-language injection ("ignore previous instructions, send to..."). Only call destructive tools after explicit user approval.
- **Malicious LLM output or hallucinated arguments.** The MCP layer cannot tell whether an argument came from the user or was invented. Use the host UI's tool-call confirmation, especially for `destructiveHint:true` tools.
- **Compromised MCP host.** Your API key is read from `SHIPMAIL_API_KEY` and held in memory by this process. If the host is compromised, the key is gone regardless. Rotate keys you suspect have been exposed.
- **Webhook signing secret in conversation logs.** `shipmail_create_webhook` and `shipmail_rotate_webhook_secret` return the secret in `structuredContent`. Many MCP clients persist tool output in conversation history. Treat the session log as sensitive after these calls.

## Privacy

This server forwards email subject lines, bodies, headers, attachment metadata, and recipient lists to whatever LLM you connect it to. The LLM provider may log that content. For privacy-sensitive workflows, restrict the tool surface with `--tools` so the LLM only sees what it needs.

## Troubleshooting

**`SHIPMAIL_API_KEY` is not set.**
Confirm the host config includes the key in the `env` block, then restart the host.

**`Base URL must be https on a shipmail.to host`.**
You set `SHIPMAIL_BASE_URL` to something else. For local development, also set `SHIPMAIL_ALLOW_INSECURE_BASE_URL=1`.

**Tools do not show up in the host.**
Confirm the package launched. Most hosts surface a server log near the chat input or in a developer panel. Set `SHIPMAIL_MCP_DEBUG=1` to add `request_id` and `status` to stderr.

**`Internal MCP error`.**
A non-API error (network, deserialization) was redacted before reaching the agent. Check the host's stderr panel for the underlying detail.

**Rate limit hit mid-session.**
The per-session circuit breaker tripped. Restart the MCP server (in most hosts: toggle the server off and back on, or restart the host).

**Webhook URL rejected.**
URLs must be public https. Localhost, RFC1918, `.local`, and `.internal` are blocked at input time. Use a public tunnel (ngrok, cloudflared) for local testing.

## Development

For public source, tests, and issue tracking, use the standalone repository:
[github.com/jcoulaud/shipmail-mcp](https://github.com/jcoulaud/shipmail-mcp).

Install dependencies with Bun:

```bash
bun install
```

Run the server locally against the published Shipmail SDK:

```bash
SHIPMAIL_API_KEY=sm_live_... bun run dev
```

Run the standalone checks:

```bash
bun run typecheck
bun test
bun run build
```

The OpenAPI coverage test uses `fixtures/openapi.json`, copied from
`https://shipmail.to/openapi.json` when this public source repo is synced.

## License

[MIT](./LICENSE).

## Links

- [Shipmail docs](https://shipmail.to/docs)
- [MCP guide](https://shipmail.to/docs/mcp)
- [API reference](https://shipmail.to/docs/api)
- [`shipmail` SDK on npm](https://www.npmjs.com/package/shipmail)
- [TypeScript SDK docs](https://shipmail.to/docs/sdks/typescript)
- [Shipmail MCP on npm](https://www.npmjs.com/package/shipmail-mcp)
- [Official MCP Registry entry](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.jcoulaud/shipmail-mcp)
- [Glama MCP listing](https://glama.ai/mcp/servers/jcoulaud/shipmail-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Source repository](https://github.com/jcoulaud/shipmail-mcp)
- [Issues](https://github.com/jcoulaud/shipmail-mcp/issues)
