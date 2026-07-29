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

  test("maps dedicated rule scopes to persistent least-privilege tools", () => {
    const read = getAllowedMcpToolNames(["mailbox_rules:read"], "hostedOAuth");
    const write = getAllowedMcpToolNames(["mailbox_rules:write"], "hostedOAuth");

    expect(read).toContain("shipmail_get_mailbox_rules");
    expect(read).not.toContain("shipmail_set_mailbox_rules");
    expect(write).toContain("shipmail_set_mailbox_rules");
    expect(write).not.toContain("shipmail_update_mailbox");
    expect(
      MCP_CAPABILITIES.find((capability) => capability.toolName === "shipmail_set_mailbox_rules"),
    ).toMatchObject({
      permissionGroup: "mailbox_rules",
      effect: "destructive",
      duration: "persistent",
    });
  });

  test("marks irreversible feed lifecycle operations as destructive", () => {
    for (const toolName of ["shipmail_rotate_audience_feed", "shipmail_revoke_audience_feed"]) {
      expect(MCP_CAPABILITIES.find((capability) => capability.toolName === toolName)).toMatchObject(
        {
          effect: "destructive",
        },
      );
    }
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
