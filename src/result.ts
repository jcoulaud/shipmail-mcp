import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ShipMailError, ValidationError } from "shipmail";

import { sanitizeRecord, sanitizeString, sanitizeValue } from "./sanitize.js";

const MAX_ERROR_MESSAGE_LENGTH = 500;
const SAFE_ERROR_TYPES = new Set([
  "validation_error",
  "not_found",
  "conflict",
  "rate_limit_error",
  "authentication_error",
  "authorization_error",
  "quota_exceeded",
]);
const GENERIC_INTERNAL_MESSAGE =
  "Internal MCP error. The original message is logged on the MCP server stderr.";
// Errors thrown locally with one of these markers carry messages we
// constructed ourselves (no upstream content, no env values, no stack frames)
// and are safe to forward to the LLM unredacted. The marker is stripped from
// the user-visible text. Anything without a marker gets the generic redacted
// message in errorResult.
export const MCP_RATE_LIMIT_MARKER = "[mcp.rate_limit]";
export const MCP_SCHEMA_VIOLATION_MARKER = "[mcp.schema_violation]";
const SAFE_MARKERS = [MCP_RATE_LIMIT_MARKER, MCP_SCHEMA_VIOLATION_MARKER] as const;

export function jsonResult(structuredContent: Record<string, unknown>): CallToolResult {
  const sanitized = sanitizeRecord(structuredContent);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(sanitized, null, 2),
      },
    ],
    structuredContent: sanitized,
  };
}

function formatShipMailError(error: ShipMailError): string {
  const parts: string[] = [];
  const isSafeMessage = error.type !== undefined && SAFE_ERROR_TYPES.has(error.type);
  if (isSafeMessage) {
    parts.push(sanitizeString(error.message, MAX_ERROR_MESSAGE_LENGTH));
  } else {
    parts.push("ShipMail request failed. Contact ShipMail support with the request_id below.");
  }
  if (error.type) parts.push(`type=${error.type}`);
  if (error.status !== undefined) parts.push(`status=${error.status}`);
  if (error.requestId) parts.push(`request_id=${error.requestId}`);
  if (isSafeMessage && error instanceof ValidationError && error.details?.length) {
    const fields = error.details
      .map((detail) => sanitizeString(detail.field, 100))
      .filter((field) => field.length > 0)
      .slice(0, 25)
      .join(", ");
    if (fields.length > 0) parts.push(`fields=${fields}`);
  }
  return parts.join(" | ");
}

function safeMarkerStrip(message: string): string | null {
  for (const marker of SAFE_MARKERS) {
    if (message.startsWith(marker)) {
      return message.slice(marker.length).trim();
    }
  }
  return null;
}

export function errorResult(error: unknown): CallToolResult {
  let text: string;
  if (error instanceof ShipMailError) {
    text = formatShipMailError(error);
  } else if (error instanceof Error && safeMarkerStrip(error.message) !== null) {
    // Surface our own MCP-constructed error text (rate limits, schema
    // violations) without redaction.
    text = sanitizeString(safeMarkerStrip(error.message) ?? "", MAX_ERROR_MESSAGE_LENGTH);
  } else {
    // Any other thrown value (including bare Error) is treated as untrusted:
    // its message can leak file paths, env values, or third-party error text
    // into LLM context. Log details for the operator and return a generic
    // message to the LLM.
    if (error instanceof Error) {
      process.stderr.write(
        `${JSON.stringify({
          tool: "mcp_internal_error",
          name: error.name,
          message: sanitizeString(error.message, MAX_ERROR_MESSAGE_LENGTH),
        })}\n`,
      );
    } else {
      process.stderr.write(
        `${JSON.stringify({
          tool: "mcp_internal_error",
          message: sanitizeString(String(error), MAX_ERROR_MESSAGE_LENGTH),
        })}\n`,
      );
    }
    text = GENERIC_INTERNAL_MESSAGE;
  }

  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}

export type ResourceContents = {
  contents: Array<{ uri: string; mimeType: "application/json"; text: string }>;
};

export function asTextResource(uri: string, value: unknown): ResourceContents {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(sanitizeValue(value), null, 2),
      },
    ],
  };
}
