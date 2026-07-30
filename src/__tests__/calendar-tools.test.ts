import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, test } from "bun:test";
import { ShipmailClient } from "shipmail";

import { registerTools } from "../tools.js";

// Verifies the calendar + booking-page MCP tools translate their inputs into the
// correct REST request (method, path, query, body) and forward the validated
// upstream response back through the declared output schema.

type CapturedRequest = { url: string; method: string; body: unknown };

const ADDRESS = "orders@papertrail-studio.test";
const OPAQUE_EVENT_ID = "evt:opaque.123";
let captured: CapturedRequest[] = [];

function eventPayload(overrides: Record<string, unknown> = {}) {
  return {
    object: "calendar_event",
    id: "evt_1",
    mailbox: ADDRESS,
    calendar_id: "cal_1",
    uid: "uid-1",
    title: "Sync",
    description: null,
    location: null,
    video_url: null,
    all_day: false,
    start: "2026-08-01T14:00:00Z",
    end: "2026-08-01T14:30:00Z",
    timezone: "Europe/Paris",
    duration: "PT30M",
    status: "confirmed",
    free_busy_status: "busy",
    privacy: null,
    color: null,
    recurrence: null,
    recurrence_id: null,
    reminders: [],
    organizer: { email: ADDRESS, name: "Orders" },
    attendees: [{ email: "guest@example.com", name: "Guest", status: "needs-action" }],
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function bookingPayload() {
  return {
    object: "booking_page",
    id: "bkp_1",
    mailbox: ADDRESS,
    slug: "intro",
    url: "https://shipmail.to/book/acme/intro",
    name: "Intro",
    description: null,
    duration_minutes: 30,
    availability_days: [1, 2, 3, 4, 5],
    window_start_minutes: 540,
    window_end_minutes: 1020,
    timezone: "America/New_York",
    buffer_minutes: 0,
    minimum_notice_minutes: 0,
    max_advance_days: 30,
    conferencing_provider: "google_meet",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

async function buildPair(responder: (req: CapturedRequest) => unknown) {
  const shipmail = new ShipmailClient({
    apiKey: "sk_test",
    baseUrl: "https://shipmail.to/api/v1",
    maxRetries: 0,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      const req = { url, method, body };
      captured.push(req);
      const payload = responder(req);
      const status = method === "DELETE" ? 204 : method === "POST" ? 201 : 200;
      return new Response(payload === undefined ? null : JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, shipmail, undefined);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("calendar + booking MCP tools", () => {
  beforeEach(() => {
    captured = [];
  });

  test("create_calendar_event POSTs to /calendar/events with the event body", async () => {
    const client = await buildPair(() => eventPayload());
    const result = await client.callTool({
      name: "shipmail_create_calendar_event",
      arguments: {
        mailbox: ADDRESS,
        title: "Sync",
        start: "2026-08-01T14:00:00",
        attendees: [{ email: "guest@example.com", name: "Guest" }],
      },
    });
    expect(result.isError).toBeFalsy();
    const req = captured[0];
    expect(req?.method).toBe("POST");
    expect(new URL(req?.url ?? "").pathname).toBe("/api/v1/calendar/events");
    expect(req?.body).toMatchObject({
      mailbox: ADDRESS,
      title: "Sync",
      start: "2026-08-01T14:00:00",
      attendees: [{ email: "guest@example.com", name: "Guest" }],
    });
    const sc = (result.structuredContent ?? {}) as { event?: { id?: string } };
    expect(sc.event?.id).toBe("evt_1");
  });

  test("get_calendar_event forwards the mailbox query param", async () => {
    const client = await buildPair(() => eventPayload());
    await client.callTool({
      name: "shipmail_get_calendar_event",
      arguments: { id: OPAQUE_EVENT_ID, mailbox: ADDRESS },
    });
    const url = new URL(captured[0]?.url ?? "");
    expect(url.pathname).toBe("/api/v1/calendar/events/evt%3Aopaque.123");
    expect(url.searchParams.get("mailbox")).toBe(ADDRESS);
  });

  test("update_calendar_event accepts opaque event ids", async () => {
    const client = await buildPair(() => eventPayload());
    const result = await client.callTool({
      name: "shipmail_update_calendar_event",
      arguments: { id: OPAQUE_EVENT_ID, mailbox: ADDRESS, location: null },
    });
    expect(result.isError).toBeFalsy();
    const req = captured[0];
    expect(req?.method).toBe("PATCH");
    expect(new URL(req?.url ?? "").pathname).toBe("/api/v1/calendar/events/evt%3Aopaque.123");
    expect(req?.body).toEqual({ mailbox: ADDRESS, location: null });
  });

  test("get_calendar_availability joins days and returns slots", async () => {
    const client = await buildPair(() => ({
      object: "calendar_availability",
      mailbox: ADDRESS,
      from: "2026-08-03T00:00:00Z",
      to: "2026-08-04T00:00:00Z",
      duration_minutes: 30,
      timezone: "America/New_York",
      slots: [{ start: "2026-08-03T13:00:00.000Z", end: "2026-08-03T13:30:00.000Z" }],
    }));
    const result = await client.callTool({
      name: "shipmail_get_calendar_availability",
      arguments: {
        mailbox: ADDRESS,
        from: "2026-08-03T00:00:00Z",
        to: "2026-08-04T00:00:00Z",
        duration: 30,
        days: [1, 3, 5],
      },
    });
    expect(result.isError).toBeFalsy();
    const url = new URL(captured[0]?.url ?? "");
    expect(url.pathname).toBe("/api/v1/calendar/availability");
    expect(url.searchParams.get("days")).toBe("1,3,5");
  });

  test("create_booking_page POSTs to /booking-pages", async () => {
    const client = await buildPair(() => bookingPayload());
    const result = await client.callTool({
      name: "shipmail_create_booking_page",
      arguments: {
        name: "Intro",
        mailbox: ADDRESS,
        slug: "intro",
        duration_minutes: 30,
        availability_days: [1, 2, 3, 4, 5],
        window_start_minutes: 540,
        window_end_minutes: 1020,
        timezone: "America/New_York",
        conferencing_provider: "google_meet",
      },
    });
    expect(result.isError).toBeFalsy();
    expect(new URL(captured[0]?.url ?? "").pathname).toBe("/api/v1/booking-pages");
    expect(captured[0]?.body).toMatchObject({ conferencing_provider: "google_meet" });
    const sc = (result.structuredContent ?? {}) as { booking_page?: { id?: string } };
    expect(sc.booking_page?.id).toBe("bkp_1");
  });

  test("update_booking_page clears conferencing with null", async () => {
    const client = await buildPair(() => bookingPayload());
    const result = await client.callTool({
      name: "shipmail_update_booking_page",
      arguments: { id: "bkp_1", conferencing_provider: null },
    });
    expect(result.isError).toBeFalsy();
    expect(captured[0]?.method).toBe("PATCH");
    expect(captured[0]?.body).toEqual({ conferencing_provider: null });
  });

  test("delete_calendar_event issues DELETE with mailbox and returns ok", async () => {
    const client = await buildPair(() => undefined);
    const result = await client.callTool({
      name: "shipmail_delete_calendar_event",
      arguments: { id: OPAQUE_EVENT_ID, mailbox: ADDRESS },
    });
    expect(result.isError).toBeFalsy();
    const req = captured[0];
    expect(req?.method).toBe("DELETE");
    const url = new URL(req?.url ?? "");
    expect(url.pathname).toBe("/api/v1/calendar/events/evt%3Aopaque.123");
    expect(url.searchParams.get("mailbox")).toBe(ADDRESS);
  });
});
