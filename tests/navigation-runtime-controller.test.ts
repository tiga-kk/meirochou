// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { BrowserApplication } from "../apps/webapp/js/app/browser-application";
import { createBrowserApplicationOptions } from "./helpers/browser-event-binding-fixture";
import { LocalStorageDistanceMatrixRepository } from "../apps/webapp/js/features/route-guidance/infrastructure/local-storage-distance-matrix-repository";
import { LocalStorageRouteGuidanceSnapshotRepository as LocalStorageNavigationSnapshotRepository } from "../apps/webapp/js/features/route-guidance/infrastructure/local-storage-route-guidance-snapshot-repository";
import { RouteGuidanceRuntimeController as NavigationRuntimeController } from "../apps/webapp/js/features/route-guidance/infrastructure/route-guidance-runtime-controller";
import { RouteGuidanceNavigationOperations as NavigationOrchestrationService } from "../apps/webapp/js/features/route-guidance/use-cases/route-guidance-navigation-operations";

describe("Phase 5C Task 11: NavigationRuntimeController", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("instantiates controller with single repository instances and connects save/clear", () => {
    const snapshotRepo = new LocalStorageNavigationSnapshotRepository(
      localStorage,
    );
    const matrixRepo = new LocalStorageDistanceMatrixRepository(localStorage);
    const orchestration = new NavigationOrchestrationService();

    const controller = new NavigationRuntimeController({
      snapshotRepo,
      matrixRepo,
      orchestration,
    });

    expect(controller).toBeDefined();
    expect(controller.getSnapshotRepo()).toBe(snapshotRepo);
    expect(controller.getMatrixRepo()).toBe(matrixRepo);
  });

  test("ComiPathBrowserRuntime constructor instantiates NavigationRuntimeController and shares single repository instances", () => {
    const dependencies = createBrowserApplicationOptions();
    const app = new BrowserApplication(dependencies);
    expect(app.navigationRuntimeController).toBeDefined();
    expect(app.navigationRuntimeController.getSnapshotRepo()).toBe(
      dependencies.routeGuidanceDependencies.navigationRuntimeController.getSnapshotRepo(),
    );
    expect(app.navigationRuntimeController.getMatrixRepo()).toBe(
      dependencies.routeGuidanceDependencies.navigationRuntimeController.getMatrixRepo(),
    );
    expect(app).not.toHaveProperty("snapshotRepository");
    expect(app).not.toHaveProperty("matrixRepository");
    expect(app.navigationRuntimeController.getOrchestration()).toBeDefined();

    expect(app.localDataDeletionController).toBe(
      dependencies.localDataDeletionController,
    );
  });

  test("loads valid snapshot on init and triggers resume dialog prompt", () => {
    const snapshotRepo = new LocalStorageNavigationSnapshotRepository(
      localStorage,
    );
    const matrixRepo = new LocalStorageDistanceMatrixRepository(localStorage);
    const orchestration = new NavigationOrchestrationService();

    const controller = new NavigationRuntimeController({
      snapshotRepo,
      matrixRepo,
      orchestration,
    });

    // Save sample valid snapshot
    snapshotRepo.save("c108", "day1", {
      schemaVersion: 1,
      eventId: "c108",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: "matrix-key-1",
      navState: {
        stage: "navigating",
        areaId: "east",
        currentPosition: {
          areaId: "east",
          gridIndex: 0,
          svgX: 10,
          svgY: 10,
          source: "manual-start",
        },
        targetSpace: "A-01",
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 0 },
          toSpace: "A-01",
        },
        provisionalOrder: ["A-01", "A-02"],
        bestOrder: ["A-01", "A-02"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-07-26T20:00:00.000Z",
    });

    const initResult = controller.initStartup({
      eventId: "c108",
      dayId: "day1",
      bundleVersion: "v1",
      circleStates: { "A-01": "pending", "A-02": "pending" },
      pendingCircleSpaces: ["A-01", "A-02"],
    });

    expect(initResult.shouldShowResumeDialog).toBe(true);
    expect(initResult.snapshot?.navState.targetSpace).toBe("A-01");
  });

  test("clears invalid snapshot on init and does NOT show resume dialog", () => {
    const snapshotRepo = new LocalStorageNavigationSnapshotRepository(
      localStorage,
    );
    const matrixRepo = new LocalStorageDistanceMatrixRepository(localStorage);
    const orchestration = new NavigationOrchestrationService();

    const controller = new NavigationRuntimeController({
      snapshotRepo,
      matrixRepo,
      orchestration,
    });

    // Save snapshot with target already purchased
    snapshotRepo.save("c108", "day1", {
      schemaVersion: 1,
      eventId: "c108",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: "matrix-key-1",
      navState: {
        stage: "navigating",
        areaId: "east",
        currentPosition: null,
        targetSpace: "A-01",
        lockedFirstLeg: null,
        provisionalOrder: ["A-01"],
        bestOrder: ["A-01"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-07-26T20:00:00.000Z",
    });

    const initResult = controller.initStartup({
      eventId: "c108",
      dayId: "day1",
      bundleVersion: "v1",
      circleStates: { "A-01": "purchased" }, // Purchased!
      pendingCircleSpaces: [],
    });

    expect(initResult.shouldShowResumeDialog).toBe(false);
    expect(snapshotRepo.load("c108", "day1")).toBeNull();
  });

  test("resumes navigation state and preserves fixedFirstTarget for warm-start ALNS", () => {
    const snapshotRepo = new LocalStorageNavigationSnapshotRepository(
      localStorage,
    );
    const matrixRepo = new LocalStorageDistanceMatrixRepository(localStorage);
    const orchestration = new NavigationOrchestrationService();

    const controller = new NavigationRuntimeController({
      snapshotRepo,
      matrixRepo,
      orchestration,
    });

    const snapshot = {
      schemaVersion: 1 as const,
      eventId: "c108",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: "matrix-key-1",
      navState: {
        stage: "navigating" as const,
        areaId: "east",
        currentPosition: {
          areaId: "east",
          gridIndex: 0,
          svgX: 10,
          svgY: 10,
          source: "manual-start" as const,
        },
        targetSpace: "A-01",
        lockedFirstLeg: {
          from: { type: "start" as const, areaId: "east", gridIndex: 0 },
          toSpace: "A-01",
        },
        provisionalOrder: ["A-01", "A-02"],
        bestOrder: ["A-01", "A-02"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-07-26T20:00:00.000Z",
    };

    const resumed = controller.resumeFromSnapshot(snapshot);
    expect(resumed.navState.targetSpace).toBe("A-01");
    expect(resumed.optimizationTimeLimitMs).toBe(10000);
    expect(resumed.matrixRef).toBe("matrix-key-1");
    expect(resumed.fixedFirstTarget).toBe("A-01");
    expect(resumed.initialSolutions).toEqual([["A-01", "A-02"]]);

    const started = controller.startOptimization(resumed.navState);
    expect(started.navState.optimizationGeneration).toBe(1);
    expect(controller.isValidResponse(started.jobId, started.generation)).toBe(
      true,
    );

    const updated = orchestration.handleWorkerProgress(
      started.navState,
      ["A-01", "A-02"],
      started.generation,
    );
    expect(updated.bestOrder).toEqual(["A-01", "A-02"]);
  });

  test("launchAlnsOptimization builds problem, manages worker messages and notifies progress callback", () => {
    let postedMessage: unknown = null;
    const fakeWorker = {
      postMessage(msg: unknown) {
        postedMessage = msg;
      },
      onmessage: null as ((ev: { data: unknown }) => void) | null,
    };

    const snapshotRepo = new LocalStorageNavigationSnapshotRepository(
      localStorage,
    );
    const matrixRepo = new LocalStorageDistanceMatrixRepository(localStorage);
    const orchestration = new NavigationOrchestrationService();

    const controller = new NavigationRuntimeController({
      snapshotRepo,
      matrixRepo,
      orchestration,
      workerFactory: () => fakeWorker as unknown as Worker,
    });

    const initialNavState = {
      stage: "navigating" as const,
      areaId: "e456",
      currentPosition: null,
      targetSpace: "A-01",
      lockedFirstLeg: null,
      provisionalOrder: ["A-01", "A-02"],
      bestOrder: ["A-01", "A-02"],
    };

    let updatedState: unknown = null;
    const startState = controller.launchAlnsOptimization(
      {
        navState: initialNavState,
        areaId: "e456",
        startDistanceToCircles: [10, 20],
        pendingCircles: [
          { space: "A-01", priority: 1 },
          { space: "A-02", priority: 2 },
        ],
        distanceMatrix: [0, 5, 5, 0],
        fixedFirstTarget: "A-01",
        searchTimeLimitMs: 10000,
        initialSolutions: [["A-01", "A-02"]],
      },
      (nextState) => {
        updatedState = nextState;
      },
    );

    const req = postedMessage as {
      type: string;
      jobId: string;
      problem: { fixedFirstTarget: string };
    };
    expect(startState.optimizationGeneration).toBe(1);
    expect(req).not.toBeNull();
    expect(req.type).toBe("start");
    expect(typeof req.jobId).toBe("string");
    expect(req.jobId.length).toBeGreaterThan(0);
    expect(req.problem.fixedFirstTarget).toBe("A-01");

    // Send malformed message -> ignored
    fakeWorker.onmessage?.({ data: "invalid-message" });
    expect(updatedState).toBeNull();

    // Send stale jobId message -> ignored
    fakeWorker.onmessage?.({
      data: {
        type: "progress",
        stage: "time-decayed-alns",
        jobId: "stale-job",
        elapsedMs: 100,
        searchTimeLimitMs: 10000,
        best: {
          cost: 10,
          route: ["A-02", "A-01"],
          completionTimesSec: [10, 20],
          elapsedMs: 100,
          optimizationProfileVersion: "v1",
        },
      },
    });
    expect(updatedState).toBeNull();

    // Send valid message -> callback receives updated bestOrder
    fakeWorker.onmessage?.({
      data: {
        type: "progress",
        stage: "time-decayed-alns",
        jobId: req.jobId,
        elapsedMs: 200,
        searchTimeLimitMs: 10000,
        best: {
          score: 8,
          cost: 8,
          route: ["A-01", "A-02"],
          completionTimesSec: [5, 15],
          elapsedMs: 200,
          optimizationProfileVersion: "v1",
        },
      },
    });

    expect(updatedState).not.toBeNull();
    expect((updatedState as { bestOrder: string[] }).bestOrder).toEqual([
      "A-01",
      "A-02",
    ]);
  });

  test("keeps progress ephemeral and commits the best order only on complete", () => {
    let postedMessage: any = null;
    const fakeWorker = {
      postMessage(message: unknown) {
        postedMessage = message;
      },
      onmessage: null as ((event: { data: unknown }) => void) | null,
    };
    const controller = new NavigationRuntimeController({
      snapshotRepo: new LocalStorageNavigationSnapshotRepository(localStorage),
      matrixRepo: new LocalStorageDistanceMatrixRepository(localStorage),
      orchestration: new NavigationOrchestrationService(),
      workerFactory: () => fakeWorker as unknown as Worker,
    });
    const navState = {
      stage: "navigating" as const,
      areaId: "e456",
      currentPosition: null,
      targetSpace: "A-01",
      lockedFirstLeg: null,
      provisionalOrder: ["A-01", "A-02"],
      bestOrder: ["A-01", "A-02"],
    };
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    controller.launchAlnsOptimization(
      {
        navState,
        areaId: "e456",
        startDistanceToCircles: [10, 20],
        pendingCircles: [
          { space: "A-01", priority: 1 },
          { space: "A-02", priority: 2 },
        ],
        distanceMatrix: [0, 5, 5, 0],
        fixedFirstTarget: "A-01",
        searchTimeLimitMs: 10000,
        initialSolutions: [],
      },
      { onPreview, onCommit },
    );
    const response = (type: "progress" | "complete") => ({
      type,
      stage: "time-decayed-alns",
      jobId: postedMessage.jobId,
      ...(type === "progress" ? { elapsedMs: 250, searchTimeLimitMs: 10000 } : {}),
      best: {
        score: 8,
        route: ["A-01", "A-02"],
        completionTimesSec: [5, 15],
        elapsedMs: 250,
        optimizationProfileVersion: "v1",
      },
    });

    fakeWorker.onmessage?.({ data: response("progress") });
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();

    fakeWorker.onmessage?.({ data: response("complete") });
    expect(onCommit).toHaveBeenCalledOnce();
  });

  test("invalidateActiveOptimization terminates the old worker and ignores stale progress callbacks", () => {
    let postedMessage: unknown = null;
    const fakeWorker = {
      postMessage(msg: unknown) {
        postedMessage = msg;
      },
      onmessage: null as ((ev: { data: unknown }) => void) | null,
      terminate: vi.fn(),
    };

    const controller = new NavigationRuntimeController({
      snapshotRepo: new LocalStorageNavigationSnapshotRepository(localStorage),
      matrixRepo: new LocalStorageDistanceMatrixRepository(localStorage),
      orchestration: new NavigationOrchestrationService(),
      workerFactory: () => fakeWorker as unknown as Worker,
    });

    const onProgress = vi.fn();
    const startedState = controller.launchAlnsOptimization(
      {
        navState: {
          stage: "navigating" as const,
          areaId: "e456",
          currentPosition: null,
          targetSpace: "A-01",
          lockedFirstLeg: null,
          provisionalOrder: ["A-01", "A-02"],
          bestOrder: ["A-01", "A-02"],
        },
        areaId: "e456",
        startDistanceToCircles: [0, 10],
        pendingCircles: [
          { space: "A-01", priority: 1 },
          { space: "A-02", priority: 2 },
        ],
        distanceMatrix: [0, 10, 10, 0],
        fixedFirstTarget: "A-01",
        searchTimeLimitMs: 10000,
        initialSolutions: [["A-01", "A-02"]],
      },
      onProgress,
    );

    const request = postedMessage as { jobId: string };
    const staleHandler = fakeWorker.onmessage;
    expect(startedState.optimizationGeneration).toBe(1);
    expect(request.jobId).toBeTruthy();
    expect(staleHandler).not.toBeNull();

    controller.invalidateActiveOptimization();

    expect(controller.getCurrentJobId()).toBeNull();
    expect(fakeWorker.onmessage).toBeNull();
    expect(fakeWorker.terminate).toHaveBeenCalledOnce();

    staleHandler?.({
      data: {
        type: "progress",
        stage: "time-decayed-alns",
        jobId: request.jobId,
        elapsedMs: 100,
        searchTimeLimitMs: 10000,
        best: {
          score: 8,
          cost: 8,
          route: ["A-02", "A-01"],
          completionTimesSec: [5, 15],
          elapsedMs: 100,
          optimizationProfileVersion: "v1",
        },
      },
    });

    expect(onProgress).not.toHaveBeenCalled();
  });
});
