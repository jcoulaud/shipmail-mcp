import { describe, expect, test } from "bun:test";

import { getAllowedMcpToolNames } from "../capabilities";

describe("MCP transport capability derivation", () => {
  test("keeps hosted file handoff tools out of the stdio catalog", () => {
    const hosted = getAllowedMcpToolNames(["messages:send"], "directApiKeyHttp");
    const stdio = getAllowedMcpToolNames(["messages:send"], "stdio");

    expect(hosted).toContain("shipmail_send_message");
    expect(hosted).toContain("shipmail_compose_message_with_file");
    expect(hosted).toContain("shipmail_prepare_staged_attachment_upload");
    expect(stdio).toContain("shipmail_send_message");
    expect(stdio).not.toContain("shipmail_compose_message_with_file");
    expect(stdio).not.toContain("shipmail_prepare_staged_attachment_upload");
  });

  test("always exposes only the public status tool without granted scopes", () => {
    expect([...getAllowedMcpToolNames([], "stdio")]).toEqual(["shipmail_status"]);
  });
});
