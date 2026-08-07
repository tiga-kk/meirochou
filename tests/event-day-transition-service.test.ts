import { describe, expect, it, vi } from "vitest";
import type {
  EventRegistryV1,
  MapBundleManifestV1,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import {
  loadMapBundleManifestFromUrl,
  resolveEventMapManifestUrl,
} from "../apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader";
import {
  LocalStorageEventDayRepository as EventDayRepository,
  StorageWriteError,
} from "../apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository";
import {
  SwitchEventDayUseCase as EventDayTransitionService,
  type PreparedEventDayTransition,
} from "../apps/webapp/js/features/event-day/use-cases/switch-event-day";
import { StorageService } from "../apps/webapp/js/state/storage-service";

const registryUrl = "http://localhost:5173/assets/events/manifest.json";

const sampleRegistry: EventRegistryV1 = {
  schemaVersion: 1,
  events: [
    {
      eventId: "c104",
      displayName: "コミックマーケット104",
      mapBundle: "../maps/demo-v1/manifest.json",
      days: [
        { dayId: "day1", displayName: "1日目" },
        { dayId: "day2", displayName: "2日目" },
      ],
    },
    {
      eventId: "c105",
      displayName: "コミックマーケット105",
      mapBundle: "../maps/c105-v1/manifest.json",
      days: [{ dayId: "day1", displayName: "1日目" }],
    },
  ],
};

const rawManifestC104: MapBundleManifestV1 = {
  schemaVersion: 1,
  eventId: "c104",
  displayName: "コミックマーケット104",
  areas: [
    {
      id: "e456",
      mapId: "e456",
      name: "東456ホール",
      prefixes: ["東"],
      labels: ["A", "B"],
      mapFile: "./map.png",
      pointsFile: "./points.json",
      gridMetaFile: "./grid.json",
      gridFile: "./grid.bin",
    },
  ],
};

const resolvedManifestC104: MapBundleManifestV1 = {
  schemaVersion: 1,
  eventId: "c104",
  displayName: "コミックマーケット104",
  areas: [
    {
      id: "e456",
      mapId: "e456",
      name: "東456ホール",
      prefixes: ["東"],
      labels: ["A", "B"],
      mapFile: "http://localhost:5173/assets/maps/demo-v1/map.png",
      pointsFile: "http://localhost:5173/assets/maps/demo-v1/points.json",
      gridMetaFile: "http://localhost:5173/assets/maps/demo-v1/grid.json",
      gridFile: "http://localhost:5173/assets/maps/demo-v1/grid.bin",
    },
  ],
};

const rawManifestC105: MapBundleManifestV1 = {
  schemaVersion: 1,
  eventId: "c105",
  displayName: "コミックマーケット105",
  areas: [
    {
      id: "w12",
      mapId: "w12",
      name: "西12ホール",
      prefixes: ["西"],
      labels: ["A"],
      mapFile: "./west.png",
      pointsFile: "./west_points.json",
      gridMetaFile: "./west_grid.json",
      gridFile: "./west_grid.bin",
    },
  ],
};

const resolvedManifestC105: MapBundleManifestV1 = {
  schemaVersion: 1,
  eventId: "c105",
  displayName: "コミックマーケット105",
  areas: [
    {
      id: "w12",
      mapId: "w12",
      name: "西12ホール",
      prefixes: ["西"],
      labels: ["A"],
      mapFile: "http://localhost:5173/assets/maps/c105-v1/west.png",
      pointsFile: "http://localhost:5173/assets/maps/c105-v1/west_points.json",
      gridMetaFile: "http://localhost:5173/assets/maps/c105-v1/west_grid.json",
      gridFile: "http://localhost:5173/assets/maps/c105-v1/west_grid.bin",
    },
  ],
};

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

describe("map-manifest-loader url resolution and loading", () => {
  it("resolves event map manifest URL relative to registry URL", () => {
    const url = resolveEventMapManifestUrl(
      registryUrl,
      sampleRegistry.events[0],
    );
    expect(url).toBe("http://localhost:5173/assets/maps/demo-v1/manifest.json");

    const url2 = resolveEventMapManifestUrl(
      registryUrl,
      sampleRegistry.events[1],
    );
    expect(url2).toBe(
      "http://localhost:5173/assets/maps/c105-v1/manifest.json",
    );
  });

  it("rejects path traversal and absolute external URLs in mapBundle", () => {
    expect(() =>
      resolveEventMapManifestUrl(registryUrl, {
        eventId: "bad",
        displayName: "Bad",
        mapBundle: "../../../etc/passwd",
        days: [],
      }),
    ).toThrow();

    expect(() =>
      resolveEventMapManifestUrl(registryUrl, {
        eventId: "bad2",
        displayName: "Bad2",
        mapBundle: "https://evil.com/manifest.json",
        days: [],
      }),
    ).toThrow();

    expect(() =>
      resolveEventMapManifestUrl(registryUrl, {
        eventId: "bad3",
        displayName: "Bad3",
        mapBundle: "../maps/demo%2fv1/manifest.json",
        days: [],
      }),
    ).toThrow();
  });

  it("loads map bundle manifest from URL successfully", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => rawManifestC104,
    } as Response);

    const manifest = await loadMapBundleManifestFromUrl(
      "http://localhost:5173/assets/maps/demo-v1/manifest.json",
      { fetcher: mockFetcher },
    );
    expect(manifest).toEqual(resolvedManifestC104);
  });

  it("rejects HTTP errors and JSON parse errors", async () => {
    const mockFetcherHttpError = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    await expect(
      loadMapBundleManifestFromUrl(
        "http://localhost:5173/assets/maps/demo-v1/manifest.json",
        {
          fetcher: mockFetcherHttpError,
        },
      ),
    ).rejects.toThrow();

    const mockFetcherInvalidJson = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("Bad JSON");
      },
    } as Response);

    await expect(
      loadMapBundleManifestFromUrl(
        "http://localhost:5173/assets/maps/demo-v1/manifest.json",
        {
          fetcher: mockFetcherInvalidJson,
        },
      ),
    ).rejects.toThrow();
  });
});

describe("EventDayTransitionService prepare", () => {
  it("prepares a transition for a registered ref without mutating storage", async () => {
    const storageService = new StorageService(new MemoryStorage());
    const repo = new EventDayRepository(storageService);

    const mockFetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("demo-v1")) {
        return { ok: true, json: async () => rawManifestC104 } as Response;
      }
      throw new Error(`Unexpected url ${url}`);
    });

    const service = new EventDayTransitionService(
      {
        repository: repo,
        registry: sampleRegistry,
        registryUrl,
        fetcher: mockFetcher,
      },
    );

    const ref = { eventId: "c104", dayId: "day1" };
    const prepared = await service.prepare(ref);

    expect(prepared.ref).toEqual(ref);
    expect(prepared.event.eventId).toBe("c104");
    expect(prepared.manifest).toEqual(resolvedManifestC104);
    expect(prepared.createsState).toBe(true);
    expect(prepared.state.circles).toEqual([]);

    // Zero side effects before commit
    expect(repo.load(ref)).toBeNull();
    expect(repo.getLastOpenedEventDay()).toBeNull();
  });

  it("reuses current manifest for same-event day switch without fetching again", async () => {
    const storageService = new StorageService(new MemoryStorage());
    const repo = new EventDayRepository(storageService);

    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => rawManifestC104,
    } as Response);

    const service = new EventDayTransitionService(
      {
        repository: repo,
        registry: sampleRegistry,
        registryUrl,
        currentManifest: resolvedManifestC104,
        fetcher: mockFetcher,
      },
    );

    const refDay2 = { eventId: "c104", dayId: "day2" };
    const prepared = await service.prepare(refDay2);

    expect(prepared.manifest).toEqual(resolvedManifestC104);
    expect(mockFetcher).not.toHaveBeenCalled();
  });

  it("fetches new manifest when switching to a different event", async () => {
    const storageService = new StorageService(new MemoryStorage());
    const repo = new EventDayRepository(storageService);

    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => rawManifestC105,
    } as Response);

    const service = new EventDayTransitionService(
      {
        repository: repo,
        registry: sampleRegistry,
        registryUrl,
        currentManifest: resolvedManifestC104,
        fetcher: mockFetcher,
      },
    );

    const refC105 = { eventId: "c105", dayId: "day1" };
    const prepared = await service.prepare(refC105);

    expect(prepared.manifest).toEqual(resolvedManifestC105);
    expect(mockFetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched eventId in fetched manifest", async () => {
    const storageService = new StorageService(new MemoryStorage());
    const repo = new EventDayRepository(storageService);

    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...rawManifestC104, eventId: "wrong_event" }),
    } as Response);

    const service = new EventDayTransitionService(
      {
        repository: repo,
        registry: sampleRegistry,
        registryUrl,
        fetcher: mockFetcher,
      },
    );

    await expect(
      service.prepare({ eventId: "c104", dayId: "day1" }),
    ).rejects.toThrow("Manifest eventId mismatch");
  });

  it("rejects unregistered event/day ref", async () => {
    const storageService = new StorageService(new MemoryStorage());
    const repo = new EventDayRepository(storageService);

    const service = new EventDayTransitionService(
      {
        repository: repo,
        registry: sampleRegistry,
        registryUrl,
      },
    );
    await expect(
      service.prepare({ eventId: "unknown", dayId: "day1" }),
    ).rejects.toThrow("Event/Day not found in registry");
  });

  it("supersedes older prepared tokens when a new prepare is called", async () => {
    const storageService = new StorageService(new MemoryStorage());
    const repo = new EventDayRepository(storageService);

    const mockFetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("demo-v1"))
        return { ok: true, json: async () => rawManifestC104 } as Response;
      if (url.includes("c105-v1"))
        return { ok: true, json: async () => rawManifestC105 } as Response;
      throw new Error("Unknown");
    });

    const service = new EventDayTransitionService(
      {
        repository: repo,
        registry: sampleRegistry,
        registryUrl,
        fetcher: mockFetcher,
      },
    );

    const prep1 = await service.prepare({ eventId: "c104", dayId: "day1" });
    const prep2 = await service.prepare({ eventId: "c105", dayId: "day1" });

    // prep1 is now stale and commit should throw
    expect(() => service.commit(prep1)).toThrow();
    // prep2 should succeed
    const committedState = service.commit(prep2);
    expect(committedState).toBeDefined();
  });

  it("rejects an older in-flight prepare after a newer request starts", async () => {
    const storageService = new StorageService(new MemoryStorage());
    const repo = new EventDayRepository(storageService);
    let resolveC104: ((response: Response) => void) | null = null;
    let resolveC105: ((response: Response) => void) | null = null;
    const c104Response = new Promise<Response>((resolve) => {
      resolveC104 = resolve;
    });
    const c105Response = new Promise<Response>((resolve) => {
      resolveC105 = resolve;
    });
    const mockFetcher = vi.fn((url: string) =>
      url.includes("demo-v1") ? c104Response : c105Response,
    );
    const service = new EventDayTransitionService(
      {
        repository: repo,
        registry: sampleRegistry,
        registryUrl,
        fetcher: mockFetcher,
      },
    );

    const older = service.prepare({ eventId: "c104", dayId: "day1" });
    const newer = service.prepare({ eventId: "c105", dayId: "day1" });
    resolveC105?.({
      ok: true,
      json: async () => rawManifestC105,
    } as Response);
    await expect(newer).resolves.toMatchObject({
      ref: { eventId: "c105", dayId: "day1" },
    });

    resolveC104?.({
      ok: true,
      json: async () => rawManifestC104,
    } as Response);
    await expect(older).rejects.toThrow("superseded");
  });
});

describe("EventDayTransitionService commit & rollback", () => {
  it("commits a prepared transition atomically updating state and last-opened", () => {
    const storageService = new StorageService(new MemoryStorage());
    const repo = new EventDayRepository(storageService);

    const service = new EventDayTransitionService(
      {
        repository: repo,
        registry: sampleRegistry,
        registryUrl,
        currentManifest: resolvedManifestC104,
      },
    );

    const prepared: PreparedEventDayTransition = {
      token: "token_1",
      ref: { eventId: "c104", dayId: "day1" },
      event: sampleRegistry.events[0],
      manifest: resolvedManifestC104,
      state: {
        schemaVersion: 2,
        source: { type: "csv", fileName: "test.csv" },
        sourceGeneration: "gen_1",
        circles: [],
        circleStates: {},
        gasOutbox: [],
        timestamps: {
          createdAt: "2026-07-23T00:00:00Z",
          updatedAt: "2026-07-23T00:00:00Z",
          sourceUpdatedAt: "2026-07-23T00:00:00Z",
        },
      },
      createsState: true,
    };

    (service as unknown as { activeToken: string }).activeToken = "token_1";

    const committed = service.commit(prepared);
    expect(committed).toEqual(prepared.state);

    expect(repo.load(prepared.ref)).toEqual(prepared.state);
    expect(repo.getLastOpenedEventDay()).toEqual(prepared.ref);
  });

  it("rolls back storage on save or last-opened failure during commit", () => {
    const memory = new MemoryStorage();
    const storageService = new StorageService(memory);
    const repo = new EventDayRepository(storageService);

    const service = new EventDayTransitionService(
      {
        repository: repo,
        registry: sampleRegistry,
        registryUrl,
        currentManifest: resolvedManifestC104,
      },
    );

    // Save an existing initial state
    const initialRef = { eventId: "c104", dayId: "day1" };
    repo.save(initialRef, {
      schemaVersion: 2,
      source: { type: "csv", fileName: "init.csv" },
      sourceGeneration: "gen_0",
      circles: [],
      circleStates: {},
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-23T00:00:00Z",
        updatedAt: "2026-07-23T00:00:00Z",
        sourceUpdatedAt: "2026-07-23T00:00:00Z",
      },
    });
    repo.rememberLastOpenedEventDay(initialRef);

    // Mock storage to fail on next setItem
    vi.spyOn(storageService, "setJson").mockImplementation((key: string) => {
      if (key.includes("c105")) {
        throw new Error("QuotaExceededError");
      }
    });

    const prepared: PreparedEventDayTransition = {
      token: "token_2",
      ref: { eventId: "c105", dayId: "day1" },
      event: sampleRegistry.events[1],
      manifest: resolvedManifestC105,
      state: {
        schemaVersion: 2,
        source: { type: "csv", fileName: "c105.csv" },
        sourceGeneration: "gen_c105",
        circles: [],
        circleStates: {},
        gasOutbox: [],
        timestamps: {
          createdAt: "2026-07-23T00:00:00Z",
          updatedAt: "2026-07-23T00:00:00Z",
          sourceUpdatedAt: "2026-07-23T00:00:00Z",
        },
      },
      createsState: true,
    };

    (service as unknown as { activeToken: string }).activeToken = "token_2";

    expect(() => service.commit(prepared)).toThrow(StorageWriteError);

    // Previous state and last-opened remain intact
    expect(repo.getLastOpenedEventDay()).toEqual(initialRef);
    expect(repo.load({ eventId: "c105", dayId: "day1" })).toBeNull();
  });
});
