import { describe, expect, test } from "bun:test";

import {
  getAllowedMcpToolNames,
  MCP_CAPABILITIES,
  MCP_HOSTED_OAUTH_PERMISSION_GROUP_NAMES,
} from "../capabilities";

describe("MCP transport capability derivation", () => {
  test("offers raw staged uploads to local clients without exposing the hosted review card", () => {
    const hosted = getAllowedMcpToolNames(["messages:send"], "directApiKeyHttp");
    const stdio = getAllowedMcpToolNames(["messages:send"], "stdio");

    expect(hosted).toContain("shipmail_send_message");
    expect(hosted).toContain("shipmail_compose_message_with_file");
    expect(hosted).toContain("shipmail_prepare_staged_attachment_upload");
    expect(stdio).toContain("shipmail_send_message");
    expect(stdio).not.toContain("shipmail_compose_message_with_file");
    expect(stdio).toContain("shipmail_prepare_staged_attachment_upload");
  });

  test("always exposes only the public status tool without granted scopes", () => {
    expect([...getAllowedMcpToolNames([], "stdio")]).toEqual(["shipmail_status"]);
  });

  test("derives hosted OAuth permission groups from the hosted tool catalog", () => {
    expect(MCP_HOSTED_OAUTH_PERMISSION_GROUP_NAMES).not.toContain("partner_admin");
    for (const group of MCP_HOSTED_OAUTH_PERMISSION_GROUP_NAMES) {
      expect(
        MCP_CAPABILITIES.some(
          (capability) => capability.permissionGroup === group && capability.transports.hostedOAuth,
        ),
      ).toBe(true);
    }
  });
});
