import { describe, expect, it, vi } from "vitest";
import {
  GasApiClient,
  GasTransportError,
} from "../apps/webapp/js/api/gas-api-client";
import { EventDayRepository } from "../apps/webapp/js/state/event-day-repository";
import { GasOutboxService } from "../apps/webapp/js/state/gas-outbox-service";
import { StorageService } from "../apps/webapp/js/state/storage-service";
import type { LocalEventDayState } from "../apps/webapp/js/types/domain";

function createMockStorageService(): StorageService {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  return new StorageService(mockStorage);
}

function createSampleGasState(
  eventId = "c104",
  dayId = "day1",
  sourceGen = "gen1",
): LocalEventDayState {
  return {
    schemaVersion: 1,
    source: {
      type: "gas",
      gasUrl: `https://script.google.com/macros/s/AKfycbx_test_${eventId}_${dayId}/exec`,
      sheetName: dayId,
    },
    sourceGeneration: sourceGen,
    circles: [{ space: "東A01a" }],
    purchased: [],
    hold: [],
    history: [],
    redo: [],
    gasOutbox: [],
    timestamps: {
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
      sourceUpdatedAt: "2026-07-23T00:00:00.000Z",
    },
  };
}

describe("GasOutboxService append & coalescing", () => {
  it("appends new entry to gasOutbox and captures source information", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const client = new GasApiClient();
    const service = new GasOutboxService(repo, client, {
      createId: () => "entry-1",
    });

    const ref = { eventId: "c104", dayId: "day1" };
    const initialState = createSampleGasState("c104", "day1");

    const result = service.append(
      initialState,
      ref,
      "東A01a",
      true,
      "2026-07-23T01:00:00.000Z",
    );

    expect(result.state.gasOutbox).toHaveLength(1);
    expect(result.entry).toEqual({
      id: "entry-1",
      eventId: "c104",
      dayId: "day1",
      sourceGeneration: "gen1",
      gasUrl: "https://script.google.com/macros/s/AKfycbx_test_c104_day1/exec",
      sheetName: "day1",
      space: "東A01a",
      purchased: true,
      createdAt: "2026-07-23T01:00:00.000Z",
      attempts: 0,
      lastError: null,
    });
  });

  it("coalesces tail entry if attempts === 0 and ref/source/space match", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const client = new GasApiClient();
    const service = new GasOutboxService(repo, client, {
      createId: () => "entry-2",
    });

    const ref = { eventId: "c104", dayId: "day1" };
    const state1 = createSampleGasState("c104", "day1");
    const { state: state2 } = service.append(
      state1,
      ref,
      "東A01a",
      true,
      "2026-07-23T01:00:00.000Z",
    );

    // Append opposite action for same space
    const { state: state3, entry: entry2 } = service.append(
      state2,
      ref,
      "東A01a",
      false,
      "2026-07-23T01:05:00.000Z",
    );

    expect(state3.gasOutbox).toHaveLength(1);
    expect(entry2.id).toBe("entry-2"); // Same ID as coalesced tail
    expect(entry2.createdAt).toBe("2026-07-23T01:00:00.000Z"); // Original createdAt preserved
    expect(entry2.purchased).toBe(false);
  });

  it("does not coalesce if tail entry has attempts > 0", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const client = new GasApiClient();
    const service = new GasOutboxService(repo, client, {
      createId: () => "entry-2",
    });

    const ref = { eventId: "c104", dayId: "day1" };
    let state = createSampleGasState("c104", "day1");
    state = {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
          sheetName: "Day1",
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 1,
          lastError: "network",
        },
      ],
    };

    const { state: newState } = service.append(
      state,
      ref,
      "東A01a",
      false,
      "2026-07-23T01:05:00.000Z",
    );

    expect(newState.gasOutbox).toHaveLength(2);
    expect(newState.gasOutbox[1].id).toBe("entry-2");
  });

  it("rejects append for CSV source or mismatched ref", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const client = new GasApiClient();
    const service = new GasOutboxService(repo, client);

    const ref = { eventId: "c104", dayId: "day1" };
    const csvState: LocalEventDayState = {
      ...createSampleGasState(),
      source: { type: "csv", fileName: "test.csv" },
    };

    expect(() =>
      service.append(csvState, ref, "東A01a", true, "2026-07-23T01:00:00.000Z"),
    ).toThrow();

    const initialGasState = createSampleGasState("c104", "day1");
    const { state: gasStateWithOutbox } = service.append(
      initialGasState,
      ref,
      "東A01a",
      true,
      "2026-07-23T01:00:00.000Z",
    );

    const mismatchedRef = { eventId: "c104", dayId: "day2" };
    expect(() =>
      service.append(
        gasStateWithOutbox,
        mismatchedRef,
        "東A01a",
        true,
        "2026-07-23T01:00:00.000Z",
      ),
    ).toThrow();
  });

  it("rejects a ref mismatch in any existing outbox entry", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const service = new GasOutboxService(repo, new GasApiClient());
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleGasState("c104", "day1");

    const stateWithMixedRefs: LocalEventDayState = {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: state.source.gasUrl,
          sheetName: state.source.sheetName,
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 0,
          lastError: null,
        },
        {
          id: "entry-2",
          eventId: "c105",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: state.source.gasUrl,
          sheetName: state.source.sheetName,
          space: "東A02b",
          purchased: true,
          createdAt: "2026-07-23T01:01:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    };

    expect(() =>
      service.append(
        stateWithMixedRefs,
        ref,
        "東A03c",
        true,
        "2026-07-23T01:02:00.000Z",
      ),
    ).toThrow();
  });

  it("rejects a generated ID that collides with an existing entry", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const service = new GasOutboxService(repo, new GasApiClient(), {
      createId: () => "entry-1",
    });
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleGasState("c104", "day1");
    const first = service.append(
      state,
      ref,
      "東A01a",
      true,
      "2026-07-23T01:00:00.000Z",
    );

    expect(() =>
      service.append(
        first.state,
        ref,
        "東A02b",
        true,
        "2026-07-23T01:01:00.000Z",
      ),
    ).toThrow();
  });
});

describe("GasOutboxService process & concurrency", () => {
  it("processes FIFO entries and removes them from repository on success", async () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };

    let state = createSampleGasState("c104", "day1");
    state = {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
          sheetName: "Day1",
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 0,
          lastError: null,
        },
        {
          id: "entry-2",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
          sheetName: "Day1",
          space: "東A02b",
          purchased: false,
          createdAt: "2026-07-23T01:01:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    };
    repo.save(ref, state);

    const sendSaleUpdate = vi.fn().mockResolvedValue(undefined);
    const client = { sendSaleUpdate } as unknown as GasApiClient;
    const service = new GasOutboxService(repo, client);

    const res = await service.process(ref);

    expect(res.sent).toBe(2);
    expect(res.pending).toBe(0);
    expect(res.error).toBeNull();
    expect(sendSaleUpdate).toHaveBeenCalledTimes(2);

    const savedState = repo.load(ref);
    expect(savedState?.gasOutbox).toHaveLength(0);
  });

  it("increments attempts, records redacted error, and stops queue on failure", async () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };

    let state = createSampleGasState("c104", "day1");
    state = {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
          sheetName: "Day1",
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 0,
          lastError: null,
        },
        {
          id: "entry-2",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
          sheetName: "Day1",
          space: "東A02b",
          purchased: true,
          createdAt: "2026-07-23T01:01:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    };
    repo.save(ref, state);

    const sendSaleUpdate = vi.fn().mockRejectedValue(
      new GasTransportError("Network error", {
        retryable: true,
        status: null,
      }),
    );
    const client = { sendSaleUpdate } as unknown as GasApiClient;
    const service = new GasOutboxService(repo, client);

    const res = await service.process(ref);

    expect(res.sent).toBe(0);
    expect(res.pending).toBe(2);
    expect(res.error).not.toBeNull();
    expect(sendSaleUpdate).toHaveBeenCalledTimes(1);

    const savedState = repo.load(ref);
    expect(savedState?.gasOutbox).toHaveLength(2);
    expect(savedState?.gasOutbox[0].attempts).toBe(1);
    expect(savedState?.gasOutbox[0].lastError).toBe("network");
  });

  it("returns a redacted error when the client error contains sensitive details", async () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleGasState("c104", "day1");
    repo.save(ref, {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: state.source.gasUrl,
          sheetName: state.source.sheetName,
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    });
    const sensitiveError = new Error(
      `request failed ${state.source.gasUrl} body={"space":"東A01a"}`,
    );
    const service = new GasOutboxService(repo, {
      sendSaleUpdate: vi.fn().mockRejectedValue(sensitiveError),
    } as unknown as GasApiClient);

    const result = await service.process(ref);

    expect(result.error?.message).toBe("unknown");
    expect(result.error?.message).not.toContain(state.source.gasUrl);
    expect(result.error?.message).not.toContain("東A01a");
  });

  it("coalesces concurrent process calls for the same ref into one promise", async () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };

    let state = createSampleGasState("c104", "day1");
    state = {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
          sheetName: "Day1",
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    };
    repo.save(ref, state);

    let resolveFetch: () => void;
    const fetchPromise = new Promise<void>((r) => {
      resolveFetch = r;
    });

    const sendSaleUpdate = vi.fn().mockImplementation(() => fetchPromise);
    const client = { sendSaleUpdate } as unknown as GasApiClient;
    const service = new GasOutboxService(repo, client);

    const p1 = service.process(ref);
    const p2 = service.process(ref);

    expect(p1).toBe(p2); // Same promise

    resolveFetch?.();
    await p1;

    expect(sendSaleUpdate).toHaveBeenCalledTimes(1);
  });

  it("preserves a same-space append made while the first send is in flight", async () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    let state = createSampleGasState("c104", "day1");
    state = {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: state.source.gasUrl,
          sheetName: state.source.sheetName,
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    };
    repo.save(ref, state);

    let resolveFirst: () => void = () => undefined;
    let sendCount = 0;
    const sendSaleUpdate = vi.fn().mockImplementation(() => {
      sendCount += 1;
      if (sendCount === 1) {
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve();
    });
    const service = new GasOutboxService(
      repo,
      { sendSaleUpdate } as unknown as GasApiClient,
      { createId: () => "entry-2" },
    );

    const processPromise = service.process(ref);
    await vi.waitFor(() => expect(sendSaleUpdate).toHaveBeenCalledTimes(1));

    const inFlightState = repo.load(ref);
    if (!inFlightState) {
      throw new Error("Expected in-flight state");
    }
    const appended = service.append(
      inFlightState,
      ref,
      "東A01a",
      false,
      "2026-07-23T01:01:00.000Z",
    );
    repo.save(ref, appended.state);
    resolveFirst();

    const result = await processPromise;

    expect(result.sent).toBe(2);
    expect(sendSaleUpdate).toHaveBeenNthCalledWith(2, state.source.gasUrl, {
      action: "sale",
      sheetName: state.source.sheetName,
      space: "東A01a",
      undo: true,
    });
  });

  it("rejects when removing a remotely successful entry cannot be saved", async () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleGasState("c104", "day1");
    const stateWithEntry = {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: state.source.gasUrl,
          sheetName: state.source.sheetName,
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    };
    repo.save(ref, stateWithEntry);
    vi.spyOn(repo, "save").mockImplementationOnce(() => {
      throw new Error("storage write failed");
    });

    const service = new GasOutboxService(repo, {
      sendSaleUpdate: vi.fn().mockResolvedValue(undefined),
    } as unknown as GasApiClient);

    await expect(service.process(ref)).rejects.toThrow("storage write failed");
    expect(repo.load(ref)?.gasOutbox[0].attempts).toBe(0);
    expect(repo.load(ref)?.gasOutbox[0].lastError).toBeNull();
  });

  it("processes different refs independently", async () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref1 = { eventId: "c104", dayId: "day1" };
    const ref2 = { eventId: "c105", dayId: "day1" };
    const state1 = createSampleGasState("c104", "day1");
    const state2 = createSampleGasState("c105", "day1");
    const withEntry = (state: LocalEventDayState, id: string) => ({
      ...state,
      gasOutbox: [
        {
          id,
          eventId: state.source.gasUrl.includes("c104") ? "c104" : "c105",
          dayId: "day1",
          sourceGeneration: state.sourceGeneration,
          gasUrl: state.source.gasUrl,
          sheetName: state.source.sheetName,
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    });
    repo.save(ref1, withEntry(state1, "entry-1"));
    repo.save(ref2, withEntry(state2, "entry-2"));
    const sendSaleUpdate = vi.fn().mockResolvedValue(undefined);
    const service = new GasOutboxService(repo, {
      sendSaleUpdate,
    } as unknown as GasApiClient);

    const [result1, result2] = await Promise.all([
      service.process(ref1),
      service.process(ref2),
    ]);

    expect(result1.sent).toBe(1);
    expect(result2.sent).toBe(1);
    expect(sendSaleUpdate).toHaveBeenCalledTimes(2);
  });

  it("does not send an entry whose captured ref differs from the requested ref", async () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleGasState("c104", "day1");
    repo.save(ref, {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c105",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: state.source.gasUrl,
          sheetName: state.source.sheetName,
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    });
    const sendSaleUpdate = vi.fn().mockResolvedValue(undefined);
    const service = new GasOutboxService(repo, {
      sendSaleUpdate,
    } as unknown as GasApiClient);

    await expect(service.process(ref)).rejects.toThrow();
    expect(sendSaleUpdate).not.toHaveBeenCalled();
  });
});

describe("GasOutboxService discard", () => {
  it("discards specified entries by ID and updates updatedAt timestamp", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const client = new GasApiClient();
    const service = new GasOutboxService(repo, client);

    const ref = { eventId: "c104", dayId: "day1" };
    let state = createSampleGasState("c104", "day1");
    state = {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
          sheetName: "Day1",
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 1,
          lastError: "network",
        },
        {
          id: "entry-2",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
          sheetName: "Day1",
          space: "東A02b",
          purchased: false,
          createdAt: "2026-07-23T01:01:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    };
    repo.save(ref, state);

    const nextState = service.discard(
      ref,
      ["entry-1"],
      "2026-07-23T02:00:00.000Z",
    );

    expect(nextState.gasOutbox).toHaveLength(1);
    expect(nextState.gasOutbox[0].id).toBe("entry-2");
    expect(nextState.timestamps.updatedAt).toBe("2026-07-23T02:00:00.000Z");
  });

  it("rejects unknown IDs in discard request", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const client = new GasApiClient();
    const service = new GasOutboxService(repo, client);

    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleGasState("c104", "day1");
    repo.save(ref, state);

    expect(() =>
      service.discard(ref, ["unknown-id"], "2026-07-23T02:00:00.000Z"),
    ).toThrow();
  });

  it("rejects duplicate IDs in discard request", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const service = new GasOutboxService(repo, new GasApiClient());
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleGasState("c104", "day1");
    repo.save(ref, {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: state.source.gasUrl,
          sheetName: state.source.sheetName,
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T01:00:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    });

    expect(() =>
      service.discard(ref, ["entry-1", "entry-1"], "2026-07-23T02:00:00.000Z"),
    ).toThrow();
  });
});
