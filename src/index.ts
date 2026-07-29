import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { ShipMailClient } from "shipmail";

import { MCP_CAPABILITY_VERSION, MCP_TOOL_NAMES } from "./capabilities.js";
import { HELP_TEXT, readConfig } from "./config.js";
import { createShipMailMcpServer } from "./server.js";
import { VERSION } from "./version.js";

type CloseableServer = {
  close(): Promise<void>;
};

function installShutdownHandlers(server: CloseableServer): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    server
      .close()
      .catch(() => {
        // best-effort close; nothing to recover from at this stage
      })
      .finally(() => {
        // Convention: SIGINT exits 130 (128 + 2), SIGTERM exits 0.
        process.exit(signal === "SIGINT" ? 130 : 0);
      });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return;
  }

  const config = readConfig();
  const client = new ShipMailClient({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.organizationId ? { organizationId: config.organizationId } : {}),
    defaultHeaders: {
      "User-Agent": `shipmail-mcp/${VERSION}`,
      "X-ShipMail-Client": "mcp",
      "X-ShipMail-Client-Version": VERSION,
    },
  });
  const capabilities = await client.capabilities.get();
  const serverMajor = capabilities.capability_version.split(".")[0];
  const supportedMajor = MCP_CAPABILITY_VERSION.split(".")[0];
  if (!serverMajor || serverMajor !== supportedMajor) {
    throw new Error(
      `ShipMail capability version ${capabilities.capability_version} is incompatible with this shipmail-mcp version. Upgrade shipmail-mcp before reconnecting.`,
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
    process.stderr.write(
      `ShipMail allows tools not implemented by this shipmail-mcp version: ${missingTools.join(", ")}. Upgrade to use them.\n`,
    );
  }

  const server = serveStdio(() => createShipMailMcpServer(config, allowedTools), {
    legacy: "reject",
  });
  installShutdownHandlers(server);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
