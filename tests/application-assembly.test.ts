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
    readonly snapshotRepository: unknown;
    readonly matrixRepository: unknown;
    readonly navigationRuntimeController: unknown;
    readonly routeGuidanceController: unknown;
  };
  readonly localDataDeletionUseCase: {
    execute(scope: LocalDataDeletionScope): Promise<void>;
  };
  readonly eventDayDependencies: {
    readonly backgroundProcess: { start(): void; stop(): void };
  };
}

const mockState = vi.hoisted(() => ({
  constructors: 0,
  workerFactories: [] as Array<(() => Worker) | undefined>,
  options: [] as BindingOptions[],
  bindings: [] as Array<{
    clearNavigationSnapshot: ReturnType<typeof vi.fn>;
    matrixRepository: { deleteByEventDay: ReturnType<typeof vi.fn> };
    currentManifest?: { bundleVersion?: string };
  }>,
}));

vi.mock("../apps/webapp/js/app/bind-browser-events", () => ({
  BrowserEventBinding: class {
    clearNavigationSnapshot = vi.fn();
    matrixRepository = { deleteByEventDay: vi.fn() };

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
    });

    expect(mockState.options[0].routeGuidanceDependencies).toMatchObject({
      routeGuidanceSession: expect.any(Object),
      routeMapAreaCatalog: expect.any(Object),
      routeMapAssetsLoader: expect.any(Object),
      snapshotRepository: expect.any(Object),
      matrixRepository: expect.any(Object),
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

  it("injects one background process without starting or stopping it twice", async () => {
    const app = assembleComiPathApplication({
      document: {} as Document,
      window: {} as Window,
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
      repository,
    });

    const binding = mockState.bindings[0];
    const routeDependencies = mockState.options[0]
      .routeGuidanceDependencies as any;
    const clearSavedSnapshot = vi.spyOn(
      routeDependencies.routeGuidanceController,
      "clearSavedSnapshot",
    );
    const deleteByEventDay = vi.spyOn(
      routeDependencies.matrixRepository,
      "deleteByEventDay",
    );
    const deletion = mockState.options[0].localDataDeletionUseCase;
    await deletion.execute({ kind: "activity", eventDay: ref });
    expect(clearSavedSnapshot).toHaveBeenCalledWith(ref);
    expect(clearSavedSnapshot).toHaveBeenCalledOnce();
    expect(deleteByEventDay).not.toHaveBeenCalled();
    expect(binding.clearNavigationSnapshot).not.toHaveBeenCalled();
    expect(binding.matrixRepository.deleteByEventDay).not.toHaveBeenCalled();

    await deletion.execute({ kind: "circle-source", eventDay: ref });

    expect(deleteByEventDay).toHaveBeenCalledWith(
      ref.eventId,
      ref.dayId,
    );
    expect(clearSavedSnapshot).toHaveBeenCalledTimes(2);
    expect(binding.clearNavigationSnapshot).not.toHaveBeenCalled();
    expect(binding.matrixRepository.deleteByEventDay).not.toHaveBeenCalled();
    expect(state.gasOutbox).toEqual([]);
  });

  it("wires start snapshot persistence through the route guidance controller after startup", async () => {
    const app = assembleComiPathApplication({
      document: {} as Document,
      window: {} as Window,
    });
    const routeDependencies = mockState.options[0]
      .routeGuidanceDependencies as any;
    const saveSnapshot = vi.spyOn(
      routeDependencies.routeGuidanceController,
      "saveSnapshot",
    );
    const clearSavedSnapshot = vi.spyOn(
      routeDependencies.routeGuidanceController,
      "clearSavedSnapshot",
    );
    const binding = mockState.bindings[0];
    const startGuidance = routeDependencies.routeGuidanceController.deps
      .startGuidance;
    const snapshotRepository = startGuidance.snapshotRepo;
    const ref: EventDayRef = { eventId: "demo-v1", dayId: "day1" };

    await app.start();

    snapshotRepository.saveSnapshot(ref, {
      eventId: ref.eventId,
      dayId: ref.dayId,
      mapAreaId: "east",
      startPosition: {
        areaId: "east",
        gridIndex: 0,
        svgX: 10,
        svgY: 20,
        source: "manual-start",
      },
      targetSpace: "東A01a",
      visitedSpaces: [],
    });
    snapshotRepository.deleteSnapshot(ref);

    expect(saveSnapshot).toHaveBeenCalledWith(ref, "bundle-v1");
    expect(clearSavedSnapshot).toHaveBeenCalledWith(ref);
    expect(binding.clearNavigationSnapshot).not.toHaveBeenCalled();
  });
});
