import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { HELP_TEXT, readConfig } from "./config.js";
import { createShipMailMcpServer } from "./server.js";

function installShutdownHandlers(server: McpServer): void {
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
  const server = createShipMailMcpServer(config);
  installShutdownHandlers(server);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
