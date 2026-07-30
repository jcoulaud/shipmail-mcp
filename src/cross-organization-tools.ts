import { performance } from "node:perf_hooks";

import type { CallToolResult } from "@modelcontextprotocol/server";
import { McpServer } from "@modelcontextprotocol/server";
import { type ShipmailClient, ShipmailError } from "shipmail";
import { z } from "zod/v4";

import { getMcpCapability } from "./capabilities.js";
import { jsonResult } from "./result.js";
import { sanitizeString } from "./sanitize.js";
import {
  audienceSchema,
  bookingPageSchema,
  domainSchema,
  mailboxSchema,
  newsletterAssetSchema,
  newsletterDomainSchema,
  newsletterSchema,
  newsletterSenderIdentitySchema,
  paginationSchema,
  suppressionSchema,
  webhookSchema,
} from "./schemas.js";

const MAX_CONCURRENT_ORGANIZATIONS = 4;
const SAFE_ERROR_TYPES: ReadonlySet<string> = new Set([
  "validation_error",
  "authentication_error",
  "authorization_error",
  "quota_exceeded",
  "not_found",
  "rate_limit_error",
  "conflict",
]);

const cursorSchema = z
  .string()
  .regex(/^[A-Za-z0-9_\-=.+/]{1,512}$/, "Cursor must be 1-512 characters of [A-Za-z0-9_\\-=.+/].");

const crossOrganizationListInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe("Maximum results to return from each organization."),
  cursor_by_organization: z
    .record(z.string().min(1).max(128), cursorSchema)
    .optional()
    .describe(
      "Independent pagination cursors keyed by organization ID. Copy each successful section's next_cursor into the matching key on the next call.",
    ),
});

const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const organizationErrorSchema = z.object({
  type: z.string(),
  message: z.string(),
  status: z.number().int().nullable(),
  request_id: z.string().nullable(),
  retryable: z.boolean(),
});

function crossOrganizationListOutputSchema(itemSchema: z.ZodType) {
  return z.object({
    organizations: z.array(
      z.discriminatedUnion("status", [
        z.object({
          organization: organizationSchema,
          status: z.literal("ok"),
          data: z.array(itemSchema),
          pagination: paginationSchema,
        }),
        z.object({
          organization: organizationSchema,
          status: z.literal("error"),
          error: organizationErrorSchema,
        }),
      ]),
    ),
  });
}

type CrossOrganizationListArgs = z.infer<typeof crossOrganizationListInputSchema>;

export type CrossOrganizationGrant = {
  readonly id: string;
  readonly name: string;
  readonly client: ShipmailClient;
  readonly allowedTools: ReadonlySet<string>;
};

type CrossOrganizationListBehavior = {
  readonly toolName: string;
  readonly baseToolName: string;
  readonly title: string;
  readonly description: string;
  readonly itemSchema: z.ZodType;
  readonly list: (
    client: ShipmailClient,
    params: { readonly cursor?: string; readonly limit: number },
  ) => Promise<unknown>;
};

// This is an intentionally explicit behavior allowlist. A tool belongs here only after its REST
// operation has been checked to be organization-rooted, read-only, cursor-paginated, and safe to
// execute once per grant. Never derive this list from a name prefix or an MCP annotation.
export const CROSS_ORGANIZATION_LIST_BEHAVIORS = [
  {
    toolName: "shipmail_list_domains_across_organizations",
    baseToolName: "shipmail_list_domains",
    title: "List Domains Across Organizations",
    description:
      "List domains in every organization on this connection. Returns one independently paginated success or failure section per organization.",
    itemSchema: domainSchema,
    list: (client, params) => client.domains.list(params),
  },
  {
    toolName: "shipmail_list_mailboxes_across_organizations",
    baseToolName: "shipmail_list_mailboxes",
    title: "List Mailboxes Across Organizations",
    description:
      "List mailboxes in every organization on this connection. Returns one independently paginated success or failure section per organization.",
    itemSchema: mailboxSchema,
    list: (client, params) => client.mailboxes.list(params),
  },
  {
    toolName: "shipmail_list_webhooks_across_organizations",
    baseToolName: "shipmail_list_webhooks",
    title: "List Webhooks Across Organizations",
    description:
      "List webhooks in every organization on this connection. Returns one independently paginated success or failure section per organization.",
    itemSchema: webhookSchema,
    list: (client, params) => client.webhooks.list(params),
  },
  {
    toolName: "shipmail_list_suppressions_across_organizations",
    baseToolName: "shipmail_list_suppressions",
    title: "List Suppressions Across Organizations",
    description:
      "List suppressions in every organization on this connection. Returns one independently paginated success or failure section per organization.",
    itemSchema: suppressionSchema,
    list: (client, params) => client.suppressions.list(params),
  },
  {
    toolName: "shipmail_list_newsletters_across_organizations",
    baseToolName: "shipmail_list_newsletters",
    title: "List Newsletters Across Organizations",
    description:
      "List newsletters in every organization on this connection. Returns one independently paginated success or failure section per organization.",
    itemSchema: newsletterSchema,
    list: (client, params) => client.newsletters.list(params),
  },
  {
    toolName: "shipmail_list_newsletter_domains_across_organizations",
    baseToolName: "shipmail_list_newsletter_domains",
    title: "List Newsletter Domains Across Organizations",
    description:
      "List newsletter sending domains in every organization on this connection. Returns one independently paginated success or failure section per organization.",
    itemSchema: newsletterDomainSchema,
    list: (client, params) => client.newsletters.domains.list(params),
  },
  {
    toolName: "shipmail_list_newsletter_sender_identities_across_organizations",
    baseToolName: "shipmail_list_newsletter_sender_identities",
    title: "List Newsletter Sender Identities Across Organizations",
    description:
      "List newsletter sender identities in every organization on this connection. Returns one independently paginated success or failure section per organization.",
    itemSchema: newsletterSenderIdentitySchema,
    list: (client, params) => client.newsletters.senderIdentities.list(params),
  },
  {
    toolName: "shipmail_list_newsletter_assets_across_organizations",
    baseToolName: "shipmail_list_newsletter_assets",
    title: "List Newsletter Assets Across Organizations",
    description:
      "List newsletter assets in every organization on this connection. Returns one independently paginated success or failure section per organization.",
    itemSchema: newsletterAssetSchema,
    list: (client, params) => client.newsletters.assets.list(params),
  },
  {
    toolName: "shipmail_list_audiences_across_organizations",
    baseToolName: "shipmail_list_audiences",
    title: "List Audiences Across Organizations",
    description:
      "List audiences in every organization on this connection. Returns one independently paginated success or failure section per organization.",
    itemSchema: audienceSchema,
    list: (client, params) => client.audiences.list(params),
  },
  {
    toolName: "shipmail_list_booking_pages_across_organizations",
    baseToolName: "shipmail_list_booking_pages",
    title: "List Booking Pages Across Organizations",
    description:
      "List booking pages in every organization on this connection. Returns one independently paginated success or failure section per organization.",
    itemSchema: bookingPageSchema,
    list: (client, params) => client.bookingPages.list(params),
  },
] as const satisfies readonly CrossOrganizationListBehavior[];

export const CROSS_ORGANIZATION_TOOL_NAMES: ReadonlySet<string> = new Set(
  CROSS_ORGANIZATION_LIST_BEHAVIORS.map((behavior) => behavior.toolName),
);

function permissionError(behavior: CrossOrganizationListBehavior) {
  return {
    type: "authorization_error",
    message: `${behavior.baseToolName} is not permitted for this organization.`,
    status: 403,
    request_id: null,
    retryable: false,
  };
}

function requestError(error: unknown) {
  if (error instanceof ShipmailError) {
    const isSafeMessage = error.type !== undefined && SAFE_ERROR_TYPES.has(error.type);
    return {
      type: error.type ?? "api_error",
      message: isSafeMessage
        ? sanitizeString(error.message, 500)
        : "Shipmail could not list this organization. Contact support with the request_id.",
      status: error.status ?? null,
      request_id: error.requestId ?? null,
      retryable: error.retryable,
    };
  }
  return {
    type: "internal_error",
    message: "The organization could not be listed because of an unexpected error.",
    status: null,
    request_id: null,
    retryable: false,
  };
}

function upstreamSchemaError(toolName: string, organizationId: string, issues: string): void {
  process.stderr.write(
    `${JSON.stringify({
      tool: toolName,
      organization_id: organizationId,
      output_schema_violation: issues,
    })}\n`,
  );
}

async function listOneOrganization(
  behavior: CrossOrganizationListBehavior,
  grant: CrossOrganizationGrant,
  args: CrossOrganizationListArgs,
) {
  const organization = { id: grant.id, name: grant.name };
  if (!grant.allowedTools.has(behavior.baseToolName)) {
    return {
      organization,
      status: "error" as const,
      error: permissionError(behavior),
    };
  }

  try {
    const cursor = args.cursor_by_organization?.[grant.id];
    const raw = await behavior.list(grant.client, {
      limit: args.limit,
      ...(cursor ? { cursor } : {}),
    });
    const pageSchema = z.object({
      data: z.array(behavior.itemSchema),
      pagination: paginationSchema,
    });
    const page = pageSchema.safeParse(raw);
    if (!page.success) {
      const issues = page.error.issues
        .slice(0, 5)
        .map(
          (issue) =>
            `${issue.path.length === 0 ? "(root)" : issue.path.join(".")}: ${issue.message}`,
        )
        .join("; ");
      upstreamSchemaError(behavior.toolName, grant.id, issues);
      return {
        organization,
        status: "error" as const,
        error: {
          type: "internal_error",
          message: "Shipmail returned an unexpected response shape for this organization.",
          status: 500,
          request_id: null,
          retryable: false,
        },
      };
    }
    return {
      organization,
      status: "ok" as const,
      data: page.data.data,
      pagination: page.data.pagination,
    };
  } catch (error) {
    return {
      organization,
      status: "error" as const,
      error: requestError(error),
    };
  }
}

async function listEveryOrganization(
  behavior: CrossOrganizationListBehavior,
  grants: readonly CrossOrganizationGrant[],
  args: CrossOrganizationListArgs,
) {
  const organizations: unknown[] = [];
  for (let offset = 0; offset < grants.length; offset += MAX_CONCURRENT_ORGANIZATIONS) {
    const batch = grants.slice(offset, offset + MAX_CONCURRENT_ORGANIZATIONS);
    const sections = await Promise.all(
      batch.map((grant) => listOneOrganization(behavior, grant, args)),
    );
    organizations.push(...sections);
  }
  return { organizations };
}

export function registerCrossOrganizationTools(
  server: McpServer,
  grants: readonly CrossOrganizationGrant[],
): void {
  if (grants.length < 2) return;

  for (const behavior of CROSS_ORGANIZATION_LIST_BEHAVIORS) {
    if (!grants.some((grant) => grant.allowedTools.has(behavior.baseToolName))) continue;

    const baseCapability = getMcpCapability(behavior.baseToolName);
    if (!baseCapability || baseCapability.effect !== "read") {
      throw new Error(
        `Cross-organization MCP tool ${behavior.toolName} must map to an audited read capability.`,
      );
    }
    const outputSchema = crossOrganizationListOutputSchema(behavior.itemSchema);
    server.registerTool(
      behavior.toolName,
      {
        title: behavior.title,
        description: behavior.description,
        inputSchema: crossOrganizationListInputSchema,
        outputSchema,
        annotations: {
          ...baseCapability.annotations,
          readOnlyHint: true,
          destructiveHint: false,
        },
      },
      async (args): Promise<CallToolResult> => {
        const startedAt = performance.now();
        const raw = await listEveryOrganization(behavior, grants, args);
        const parsed = outputSchema.safeParse(raw);
        if (!parsed.success) {
          process.stderr.write(
            `${JSON.stringify({
              tool: behavior.toolName,
              output_schema_violation: parsed.error.message,
            })}\n`,
          );
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Shipmail could not validate the cross-organization list result.",
              },
            ],
          };
        }
        const failedOrganizations = parsed.data.organizations.filter(
          (section) => section.status === "error",
        ).length;
        process.stderr.write(
          `${JSON.stringify({
            tool: behavior.toolName,
            duration_ms: Math.round(performance.now() - startedAt),
            organizations: grants.length,
            failed_organizations: failedOrganizations,
            status:
              failedOrganizations === 0
                ? "ok"
                : failedOrganizations === grants.length
                  ? "failed"
                  : "partial",
          })}\n`,
        );
        return jsonResult(parsed.data);
      },
    );
  }
}
