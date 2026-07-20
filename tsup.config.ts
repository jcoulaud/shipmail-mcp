import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: false,
    clean: true,
    target: "node20",
    splitting: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    // Embeddable server factory consumed by the hosted remote MCP endpoint
    // (shipmail.to/api/mcp) and importable as `shipmail-mcp/server`.
    entry: ["src/server.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: false,
    clean: false,
    target: "node20",
    splitting: false,
  },
]);
