import type { ShipmailClient } from "shipmail";

import { MCP_CAPABILITY_VERSION, MCP_TOOL_NAMES } from "./capabilities.js";

type WarningWriter = (message: string) => void;

function writeStderrWarning(message: string): void {
  process.stderr.write(`${message}\n`);
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim() || "Unknown error";
}

export async function resolveAllowedTools(
  client: ShipmailClient,
  writeWarning: WarningWriter = writeStderrWarning,
): Promise<ReadonlySet<string>> {
  let capabilities;
  try {
    capabilities = await client.capabilities.get();
  } catch (error) {
    writeWarning(
      `Could not fetch Shipmail capabilities (${errorMessage(error)}). The tool list is unverified and calls may fail.`,
    );
    return new Set(MCP_TOOL_NAMES);
  }

  const serverMajor = capabilities.capability_version.split(".")[0];
  const supportedMajor = MCP_CAPABILITY_VERSION.split(".")[0];
  if (!serverMajor || serverMajor !== supportedMajor) {
    throw new Error(
      `Shipmail capability version ${capabilities.capability_version} is incompatible with this shipmail-mcp version. Upgrade shipmail-mcp before reconnecting.`,
    );
  }

  const localTools = new Set<string>(MCP_TOOL_NAMES);
  const allowedTools = new Set(
    capabilities.allowed_mcp_tools.filter((toolName) => localTools.has(toolName)),
  );
  const missingTools = capabilities.allowed_mcp_tools.filter(
    (toolName) => !localTools.has(toolName),
  );
  if (missingTools.length > 0) {
    writeWarning(
      `Shipmail allows tools not implemented by this shipmail-mcp version: ${missingTools.join(", ")}. Upgrade to use them.`,
    );
  }

  return allowedTools;
}
