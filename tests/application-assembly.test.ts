// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import type { LocalDataDeletionScope } from "../apps/webapp/js/features/local-data-deletion/public-api";

interface BindingOptions {
  readonly alnsWorkerFactory?: () => Worker;
  readonly routeGuidanceDependencies?: {
    readonly routeGuidanceSession: unknown;
    readonly routeMapAssetsLoader: unknown;
    readonly snapshotRepository: unknown;
    readonly matrixRepository: unknown;
    readonly orchestrationService: unknown;
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
      routeMapAssetsLoader: expect.any(Object),
      snapshotRepository: expect.any(Object),
      matrixRepository: expect.any(Object),
      orchestrationService: expect.any(Object),
      navigationRuntimeController: expect.any(Object),
      routeGuidanceController: expect.any(Object),
    });
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
    const deletion = mockState.options[0].localDataDeletionUseCase;
    await deletion.execute({ kind: "activity", eventDay: ref });
    expect(binding.clearNavigationSnapshot).toHaveBeenCalledWith(ref);
    expect(binding.clearNavigationSnapshot).toHaveBeenCalledOnce();
    expect(binding.matrixRepository.deleteByEventDay).not.toHaveBeenCalled();

    await deletion.execute({ kind: "circle-source", eventDay: ref });

    expect(binding.matrixRepository.deleteByEventDay).toHaveBeenCalledWith(
      ref.eventId,
      ref.dayId,
    );
    expect(binding.clearNavigationSnapshot).toHaveBeenCalledTimes(2);
    expect(state.gasOutbox).toEqual([]);
  });
});
