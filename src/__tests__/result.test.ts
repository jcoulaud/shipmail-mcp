import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, test } from "bun:test";
import {
  ConflictError,
  InternalServerError,
  NotFoundError,
  ShipMailError,
  ValidationError,
} from "shipmail";

import { errorResult, jsonResult } from "../result.js";

function getText(result: CallToolResult): string {
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("expected text content");
  return first.text;
}

describe("jsonResult", () => {
  test("returns text and structuredContent with same payload", () => {
    const result = jsonResult({ ok: true, value: 42 });
    expect(result.structuredContent).toEqual({ ok: true, value: 42 });
    expect(JSON.parse(getText(result))).toEqual({ ok: true, value: 42 });
  });

  test("sanitizes control chars in nested string fields", () => {
    const result = jsonResult({ subject: "hi\x00‮there" });
    expect(result.structuredContent).toEqual({ subject: "hithere" });
  });
});

describe("errorResult", () => {
  test("includes safe upstream message for validation errors", () => {
    const error = new ValidationError("name is required", {
      requestId: "req_abc",
      details: [{ field: "name", message: "must not be empty" }],
    });
    const text = getText(errorResult(error));
    expect(text).toContain("name is required");
    expect(text).toContain("type=validation_error");
    expect(text).toContain("request_id=req_abc");
    expect(text).toContain("fields=name");
  });

  test("includes safe upstream message for not found", () => {
    const error = new NotFoundError("Domain not found", "req_xyz");
    const text = getText(errorResult(error));
    expect(text).toContain("Domain not found");
    expect(text).toContain("type=not_found");
    expect(text).toContain("status=404");
  });

  test("redacts internal_error message", () => {
    const error = new InternalServerError(
      "stack trace: postgres connection failed at line 42",
      "req_123",
    );
    const text = getText(errorResult(error));
    expect(text).not.toContain("postgres");
    expect(text).not.toContain("stack");
    expect(text).toContain("ShipMail support");
    expect(text).toContain("request_id=req_123");
    expect(text).toContain("type=internal_error");
  });

  test("redacts unknown ShipMailError types", () => {
    const error = new ShipMailError("something obscure happened", { status: 502 });
    const text = getText(errorResult(error));
    expect(text).not.toContain("obscure");
    expect(text).toContain("ShipMail support");
  });

  test("redacts generic Error messages so they cannot leak to the LLM", () => {
    // Network errors, JSON parse errors, etc. can carry filesystem paths,
    // proxy credentials, or env values in their message. Don't surface them.
    const error = new Error("ECONNREFUSED proxy=https://user:pw@10.0.0.1:8080");
    const text = getText(errorResult(error));
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("10.0.0.1");
    expect(text).not.toContain("pw");
    expect(text).toContain("Internal MCP error");
  });

  test("handles thrown non-Error values safely without echoing payload", () => {
    const text = getText(errorResult({ secret: "leak" }));
    expect(typeof text).toBe("string");
    expect(text).not.toContain("leak");
    expect(text).toContain("Internal MCP error");
  });

  test("MCP rate-limit marker text is surfaced (not redacted) so the agent can recover", () => {
    const error = new Error("[mcp.rate_limit] cap reached for shipmail_send_message");
    const text = getText(errorResult(error));
    expect(text).toContain("cap reached for shipmail_send_message");
    expect(text).not.toContain("Internal MCP error");
    expect(text).not.toContain("[mcp.rate_limit]");
  });

  test("does not include validation details when message is redacted", () => {
    const error = new InternalServerError("internal stuff", "req_abc");
    const text = getText(errorResult(error));
    expect(text).not.toContain("fields=");
  });

  test("conflict errors are passed through", () => {
    const error = new ConflictError("Domain already exists");
    const text = getText(errorResult(error));
    expect(text).toContain("Domain already exists");
    expect(text).toContain("type=conflict");
  });
});
