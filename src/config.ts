import { readFileSync } from "node:fs";
import { env } from "node:process";

const DEFAULT_BASE_URL = "https://shipmail.to/api/v1";

export type McpConfig = {
  readonly apiKey: string;
  readonly baseUrl: string | undefined;
  readonly organizationId: string | undefined;
};

export const HELP_TEXT = `shipmail-mcp

Usage:
  shipmail-mcp

Environment:
  SHIPMAIL_API_KEY      Required ShipMail API key (or use SHIPMAIL_API_KEY_FILE).
  SHIPMAIL_API_KEY_FILE Optional path to a file containing the API key. Takes precedence over
                        SHIPMAIL_API_KEY when set; reduces env-trace leak surface for hosts that
                        log environment variables.
  SHIPMAIL_BASE_URL     Optional API base URL. Must be https. Defaults to ${DEFAULT_BASE_URL}.
  SHIPMAIL_ORGANIZATION_ID
                        Optional delegated child organization ID for infrastructure tools.
  SHIPMAIL_ALLOW_INSECURE_BASE_URL=1
                        Permit non-https or non-shipmail.to base URL (development only).

ShipMail discovers tools from the API key's live permissions at startup. Change scopes, resources,
recipient rules, and send budgets in ShipMail Settings.`;

const API_KEY_HELP =
  "SHIPMAIL_API_KEY (or SHIPMAIL_API_KEY_FILE) is required. Create an API key in ShipMail, then run `SHIPMAIL_API_KEY=sm_live_... shipmail-mcp`.";

function readApiKey(): string {
  const filePath = env["SHIPMAIL_API_KEY_FILE"];
  if (filePath !== undefined && filePath.length > 0) {
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch (error) {
      throw new Error(
        `Failed to read SHIPMAIL_API_KEY_FILE at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new Error(`SHIPMAIL_API_KEY_FILE at ${filePath} is empty.`);
    }
    return trimmed;
  }
  const direct = env["SHIPMAIL_API_KEY"];
  if (!direct) throw new Error(API_KEY_HELP);
  return direct;
}

const ALLOWED_BASE_URL_HOSTS: readonly string[] = ["shipmail.to", "api.shipmail.to"];

function validateBaseUrl(rawValue: string, allowInsecure: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`SHIPMAIL_BASE_URL is not a valid URL: ${rawValue}`);
  }

  if (allowInsecure) return parsed.toString().replace(/\/+$/, "");
  if (parsed.protocol !== "https:") {
    throw new Error(
      "SHIPMAIL_BASE_URL must use https. Set SHIPMAIL_ALLOW_INSECURE_BASE_URL=1 for development.",
    );
  }

  const host = parsed.hostname.toLowerCase();
  const isAllowedHost = ALLOWED_BASE_URL_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
  if (!isAllowedHost) {
    throw new Error(
      `SHIPMAIL_BASE_URL host "${host}" is not allowed. Set SHIPMAIL_ALLOW_INSECURE_BASE_URL=1 for development.`,
    );
  }
  return parsed.toString().replace(/\/+$/, "");
}

export function readConfig(argv: readonly string[] = process.argv.slice(2)): McpConfig {
  if (argv.includes("--tools")) {
    throw new Error(
      "--tools was removed. ShipMail MCP tools now follow the API key permissions configured in ShipMail Settings.",
    );
  }
  const unknownArgs = argv.filter((arg) => arg !== "--help" && arg !== "-h");
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown argument: ${unknownArgs[0]}`);
  }

  const rawBaseUrl = env["SHIPMAIL_BASE_URL"];
  const allowInsecure = env["SHIPMAIL_ALLOW_INSECURE_BASE_URL"] === "1";
  const baseUrl =
    rawBaseUrl !== undefined && rawBaseUrl.length > 0
      ? validateBaseUrl(rawBaseUrl, allowInsecure)
      : undefined;

  return {
    apiKey: readApiKey(),
    baseUrl,
    organizationId: env["SHIPMAIL_ORGANIZATION_ID"] || undefined,
  };
}
