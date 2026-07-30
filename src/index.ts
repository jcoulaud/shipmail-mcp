import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { ShipmailClient } from "shipmail";

import { HELP_TEXT, readConfig } from "./config.js";
import { createShipmailMcpServer } from "./server.js";
import { resolveAllowedTools } from "./startup.js";
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
  const client = new ShipmailClient({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.organizationId ? { organizationId: config.organizationId } : {}),
    defaultHeaders: {
      "User-Agent": `shipmail-mcp/${VERSION}`,
      "X-Shipmail-Client": "mcp",
      "X-Shipmail-Client-Version": VERSION,
    },
  });
  const allowedTools = await resolveAllowedTools(client);

  const server = serveStdio(() => createShipmailMcpServer(config, allowedTools), {
    legacy: "serve",
  });
  installShutdownHandlers(server);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
