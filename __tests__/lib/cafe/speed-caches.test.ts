import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchService = vi.fn(async () => ({ sid: "IS1" }));
vi.mock("@/lib/twilio/client", () => ({
  twilioClient: { sync: { v1: { services: () => ({ fetch: fetchService }) } } },
}));
const findSyncMapItems = vi.fn();
vi.mock("@/lib/twilio", () => ({
  getSyncService: vi.fn(),
  fetchSyncListItem: vi.fn(),
  findSyncMapItems: (...a: unknown[]) => findSyncMapItems(...a),
  pushToSyncList: vi.fn(),
  updateSyncListItem: vi.fn(),
  updateSyncMapItem: vi.fn(),
}));
vi.mock("@/lib/cafe/sequence", () => ({ nextInSequence: vi.fn() }));

describe("the Sync service is looked up once", () => {
  it("many calls, one fetch", async () => {
    process.env.TWILIO_SYNC_SERVICE_SID = "IS1";
    vi.resetModules();
    const { getSyncService } = await import("@/lib/twilio/sync");
    await Promise.all([getSyncService(), getSyncService(), getSyncService()]);
    await getSyncService();
    expect(fetchService).toHaveBeenCalledTimes(1);
  });
});

describe("the event is kept for a few seconds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    findSyncMapItems.mockReset();
    findSyncMapItems.mockResolvedValue([{ data: { slug: "e", state: "OPEN", name: "E" } }]);
  });

  it("reads it once, then again after the time is up or when forgotten", async () => {
    vi.resetModules();
    const { getEvent, forgetEvent, EVENT_CACHE_MS } = await import("@/app/webhooks/mixologist-helper");
    forgetEvent();
    const a = await getEvent("e");
    const b = await getEvent("e");
    expect(a).toBe(b);
    expect(findSyncMapItems).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(EVENT_CACHE_MS + 1);
    await getEvent("e");
    expect(findSyncMapItems).toHaveBeenCalledTimes(2);
    forgetEvent("e");
    await getEvent("e");
    expect(findSyncMapItems).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
