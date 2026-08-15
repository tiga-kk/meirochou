// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import type { LocalDataDeletionScope } from "../apps/webapp/js/features/local-data-deletion/public-api";
import type {
  CompleteCircleVisitInput,
  CompleteCircleVisitResult,
} from "../apps/webapp/js/app/complete-circle-visit";

interface BindingOptions {
  readonly completeCircleVisit: (
    input: CompleteCircleVisitInput,
  ) => Promise<CompleteCircleVisitResult>;
  readonly alnsWorkerFactory?: () => Worker;
  readonly routeGuidanceDependencies?: {
    readonly routeGuidanceSession: unknown;
    readonly routeMapAreaCatalog: unknown;
    readonly routeMapAssetsLoader: unknown;
    readonly navigationRuntimeController: unknown;
    readonly routeGuidanceController: unknown;
  };
  readonly localDataDeletionController: {
    confirmDeletion(scope: LocalDataDeletionScope): Promise<void>;
    selectDeletionScope(scope: LocalDataDeletionScope): void;
  };
  readonly eventDayDependencies: {
    readonly backgroundProcess: { start(): void; stop(): void };
  };
}

const mockState = vi.hoisted(() => ({
  constructors: 0,
  workerFactories: [] as Array<(() => Worker) | undefined>,
  options: [] as BindingOptions[],
  bindings: [] as Array<Record<string, never>>,
}));

const testRegistry = {
  schemaVersion: 1 as const,
  events: [
    {
      eventId: "test-event",
      displayName: "Test Event",
      mapBundle: "test-map",
      days: [{ dayId: "day1", displayName: "Day 1" }],
    },
  ],
};

vi.mock("../apps/webapp/js/app/browser-application", () => ({
  BrowserApplication: class {
    constructor(options: BindingOptions) {
      mockState.constructors += 1;
      mockState.workerFactories.push(options.alnsWorkerFactory);
      mockState.options.push(options);
      mockState.bindings.push(this);
    }
    async start() {
      this.currentManifest = { bundleVersion: "bundle-v1" };
      mockState.options[0].eventDayDependencies.backgroundProcess.start();
      mockState.workerFactories[0]?.();
    }
    showStartupError() {}
    dispose() {
      mockState.options[0].eventDayDependencies.backgroundProcess.stop();
    }
  },
}));

import { assembleComiPathApplication } from "../apps/webapp/js/app/assemble-comipath-application";

describe("application assembly", () => {
  beforeEach(() => {
    mockState.constructors = 0;
    mockState.workerFactories = [];
    mockState.options = [];
    mockState.bindings = [];
  });

  it("creates the browser binding once", async () => {
    const createAlnsWorker = vi.fn(() => ({}) as Worker);
    const app = assembleComiPathApplication({
      document: {} as Document,
      window: {} as Window,
      registry: testRegistry,
      createAlnsWorker,
    });
    expect(app).toMatchObject({
      start: expect.any(Function),
      stop: expect.any(Function),
    });
    await Promise.all([app.start(), app.start()]);
    expect(mockState.constructors).toBe(1);
    expect(mockState.workerFactories).toHaveLength(1);
    expect(createAlnsWorker).not.toHaveBeenCalled();
  });

  it("injects the assembled Route Guidance runtime into the browser binding", () => {
    assembleComiPathApplication({
      document: {} as Document,
      window: {} as Window,
      registry: testRegistry,
    });

    expect(mockState.options[0].routeGuidanceDependencies).toMatchObject({
      routeGuidanceSession: expect.any(Object),
      routeMapAreaCatalog: expect.any(Object),
      routeMapAssetsLoader: expect.any(Object),
      navigationRuntimeController: expect.any(Object),
      routeGuidanceController: expect.any(Object),
    });
    const routeDependencies = mockState.options[0]
      .routeGuidanceDependencies as any;
    const finishUseCase = routeDependencies.routeGuidanceController.deps
      .finishCircle;
    expect(finishUseCase.session).toBe(
      routeDependencies.routeGuidanceSession,
    );
    expect(finishUseCase.mapAreaCatalog).toBe(
      routeDependencies.routeMapAreaCatalog,
    );
    expect(finishUseCase.assetsLoader).toBe(
      routeDependencies.routeMapAssetsLoader,
    );
    expect(finishUseCase.navigationOperations).toBe(
      routeDependencies.routeGuidanceController.deps.changeDestination
        .navigationOperations,
    );
  });

  it("injects the X post panel and sale monitor as separate ports", () => {
    assembleComiPathApplication({
      document: {} as Document,
      window: {} as Window,
      registry: testRegistry,
    });

    expect(mockState.options[0]).toMatchObject({
      xPostPanel: expect.any(Object),
      saleMentionMonitor: expect.any(Object),
    });
  });

  it("injects one background process without starting or stopping it twice", async () => {
    const app = assembleComiPathApplication({
      document: {} as Document,
      window: {} as Window,
      registry: testRegistry,
    });
    const backgroundProcess =
      mockState.options[0].eventDayDependencies.backgroundProcess;
    const start = vi.spyOn(backgroundProcess, "start");
    const stop = vi.spyOn(backgroundProcess, "stop");

    await app.start();
    app.stop();

    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("connects injected local deletion to the binding's route cleanup callbacks", async () => {
    const ref: EventDayRef = { eventId: "demo-v1", dayId: "day1" };
    let state: LocalEventDayState = {
      schemaVersion: 2,
      source: { type: "csv", fileName: "circles.csv" },
      sourceGeneration: "source-1",
      circles: [{ space: "E1-01" }],
      circleStates: { "E1-01": "purchased" },
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
      },
    };
    const repository: EventDayRepository = {
      load: vi.fn(() => state),
      save: vi.fn((_ref, next) => {
        state = next;
      }),
      saveAndRememberLastOpened: vi.fn(),
      listEventDays: vi.fn(() => [ref]),
      getLastOpenedEventDay: vi.fn(() => ref),
      rememberLastOpenedEventDay: vi.fn(),
      deleteEventDay: vi.fn(),
      listEventDaysForDeletion: vi.fn(() => [{ ref, state }]),
      deleteAllEventDays: vi.fn(),
    };

    assembleComiPathApplication({
      document: {} as Document,
      window: {} as Window,
      registry: testRegistry,
      repository,
    });

    const routeDependencies = mockState.options[0]
      .routeGuidanceDependencies as any;
    const invalidatePersistence = vi.spyOn(
      routeDependencies.routeGuidanceController,
      "invalidatePersistence",
    );
    const deleteByEventDay = vi.spyOn(
      routeDependencies.navigationRuntimeController,
      "deleteMatrix",
    );
    const deletion = mockState.options[0].localDataDeletionController;
    deletion.selectDeletionScope({ kind: "activity", eventDay: ref });
    await deletion.confirmDeletion({ kind: "activity", eventDay: ref });
    expect(invalidatePersistence).toHaveBeenCalledWith(ref);
    expect(invalidatePersistence).toHaveBeenCalledOnce();
    expect(deleteByEventDay).not.toHaveBeenCalled();

    deletion.selectDeletionScope({ kind: "circle-source", eventDay: ref });
    await deletion.confirmDeletion({ kind: "circle-source", eventDay: ref });

    expect(deleteByEventDay).toHaveBeenCalledWith(
      ref.eventId,
      ref.dayId,
    );
    expect(invalidatePersistence).toHaveBeenCalledWith(ref, true);
    expect(invalidatePersistence).toHaveBeenCalledTimes(2);
    expect(state.gasOutbox).toEqual([]);
  });

  it("does not install a snapshot adapter in the browser binding", () => {
    assembleComiPathApplication({
      document: {} as Document,
      window: {} as Window,
      registry: testRegistry,
    });
    const routeDependencies = mockState.options[0]
      .routeGuidanceDependencies as any;
    expect(routeDependencies).not.toHaveProperty("snapshotRepository");
    expect(routeDependencies).not.toHaveProperty("matrixRepository");
    expect(routeDependencies.routeGuidanceController.invalidatePersistence)
      .toEqual(expect.any(Function));
  });
});
