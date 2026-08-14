import { describe, expect, it, vi } from "vitest";
import { ResumeRouteGuidanceUseCase } from "../apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance";

const routeAssets = {
  points: {
    image: { width: 40, height: 10 },
    points: [
      {
        space: "東A01a",
        identifier: "A",
        number: 1,
        center_x: 15,
        center_y: 5,
        portals: [{ col: 1, row: 0, x: 15, y: 5 }],
      },
    ],
  },
  gridMetadata: {
    width: 40,
    height: 10,
    cell_size: 10,
    cols: 4,
    rows: 1,
  },
  gridBytes: new Uint8Array([1, 1, 1, 1]),
};

function createRuntimeController(snapshot: Record<string, unknown> | null) {
  let pendingResumeSnapshot = snapshot;
  return {
    getPendingResumeSnapshot: vi.fn(() => pendingResumeSnapshot),
    setPendingResumeSnapshot: vi.fn((next) => {
      pendingResumeSnapshot = next;
    }),
    getMatrixRef: vi.fn(() => null),
    setMatrixRef: vi.fn(),
    getMatrixRepo: vi.fn(() => ({ load: vi.fn(() => null) })),
    saveSnapshot: vi.fn(),
    launchAlnsOptimization: vi.fn(),
    resumeFromSnapshot: vi.fn((saved) => ({
      navState: saved.navState,
      optimizationTimeLimitMs: saved.optimizationTimeLimitMs,
      matrixRef: saved.matrixRef,
      fixedFirstTarget: saved.navState.targetSpace,
      initialSolutions:
        saved.navState.bestOrder.length > 0 ? [saved.navState.bestOrder] : [],
    })),
  };
}

function createSession() {
  let currentSnapshot = {
    navigationState: null,
    currentDestination: null,
    currentRoute: null,
    selectedDestination: null,
    selectedRoute: null,
    selectionStatus: "idle",
    routeOptimizationGeneration: 1,
  };
  return {
    getSnapshot: vi.fn(() => currentSnapshot),
    replaceSnapshot: vi.fn((next) => {
      currentSnapshot = next;
    }),
  };
}

describe("ResumeRouteGuidanceUseCase", () => {
  it("restores valid guidance snapshot and launches warm-start optimization", async () => {
    const runtimeController = createRuntimeController({
      schemaVersion: 1,
      eventId: "c108",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: "matrix-east-v1",
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
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 0 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a"],
        bestOrder: ["東A01a"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-08-08T00:00:00.000Z",
    });
    const session = createSession();
    runtimeController.getMatrixRepo.mockReturnValue({
      load: vi.fn(() => ({
        schemaVersion: 1,
        cacheKey: "matrix-east-v1",
        areaId: "east",
        spaces: ["東A01a"],
        size: 1,
        distances: [0],
        createdAt: "2026-08-08T00:00:00.000Z",
      })),
    });
    runtimeController.launchAlnsOptimization.mockImplementation(
      ({ navState }) => ({
        ...navState,
        optimizationGeneration: 1,
      }),
    );

    const assetsLoader = {
      loadMapAssets: vi.fn(async () => routeAssets),
    };

    const useCase = new ResumeRouteGuidanceUseCase(
      session as any,
      runtimeController as any,
      assetsLoader as any,
      {
        getMapArea: vi.fn(() => ({
          areaId: "east",
          id: "east",
          prefixes: ["東"],
          labels: ["A"],
        })),
        findMapAreaForCircleSpace: vi.fn(() => ({
          areaId: "east",
          id: "east",
          prefixes: ["東"],
          labels: ["A"],
        })),
        getAllMapAreas: vi.fn(() => [
          { areaId: "east", id: "east", prefixes: ["東"], labels: ["A"] },
        ]),
      } as any,
    );

    const resumed = await useCase.execute({
      eventDay: { eventId: "c108", dayId: "day1" },
      circles: [{ space: "東A01a" }],
      circleStates: { 東A01a: "pending" },
    });

    expect(resumed).toEqual({
      kind: "resumed",
      targetSpace: "東A01a",
      optimizationTimeLimitMs: 10000,
    });
    expect(runtimeController.launchAlnsOptimization).toHaveBeenCalledOnce();
    expect(runtimeController.launchAlnsOptimization).toHaveBeenCalledWith(
      expect.objectContaining({
        areaId: "east",
        fixedFirstTarget: "東A01a",
        initialSolutions: [["東A01a"]],
        searchTimeLimitMs: 10000,
      }),
      expect.any(Function),
    );
    expect(session.replaceSnapshot).toHaveBeenCalledOnce();
    const [commitSnapshot] = session.replaceSnapshot.mock.calls[0];
    expect(commitSnapshot).toMatchObject({
      navigationState: expect.objectContaining({
        optimizationGeneration: 1,
        targetSpace: "東A01a",
      }),
      currentDestination: expect.objectContaining({
        space: "東A01a",
      }),
      currentRoute: expect.objectContaining({
        targetPosition: expect.any(Object),
      }),
      selectedDestination: expect.objectContaining({
        space: "東A01a",
      }),
      selectedRoute: expect.objectContaining({
        targetPosition: expect.any(Object),
      }),
      selectionStatus: "idle",
    });
    expect(commitSnapshot.currentDestination).toBe(
      commitSnapshot.selectedDestination,
    );
    expect(commitSnapshot.currentRoute).toBe(commitSnapshot.selectedRoute);
    expect(runtimeController.setPendingResumeSnapshot).toHaveBeenCalledWith(
      null,
    );
    expect(runtimeController.setMatrixRef).toHaveBeenCalledWith("matrix-east-v1");
    expect(runtimeController.saveSnapshot).toHaveBeenCalledWith(
      "c108",
      "day1",
      expect.objectContaining({
        navState: expect.objectContaining({ optimizationGeneration: 1 }),
      }),
    );
  });

  it("ignores stale ALNS progress after the destination was changed manually", async () => {
    const runtimeController = createRuntimeController({
      schemaVersion: 1,
      eventId: "c108",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: "matrix-east-v1",
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
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 0 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a"],
        bestOrder: ["東A01a"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-08-08T00:00:00.000Z",
    });
    const session = createSession();
    runtimeController.getMatrixRepo.mockReturnValue({
      load: vi.fn(() => ({
        schemaVersion: 1,
        cacheKey: "matrix-east-v1",
        areaId: "east",
        spaces: ["東A01a"],
        size: 1,
        distances: [0],
        createdAt: "2026-08-08T00:00:00.000Z",
      })),
    });
    let onProgress: ((nextNavState: any) => void) | undefined;
    runtimeController.launchAlnsOptimization.mockImplementation(
      ({ navState }, progress) => {
        onProgress = progress;
        return { ...navState, optimizationGeneration: 1 };
      },
    );

    const useCase = new ResumeRouteGuidanceUseCase(
      session as any,
      runtimeController as any,
      { loadMapAssets: vi.fn(async () => routeAssets) } as any,
      {
        getMapArea: vi.fn(() => ({
          areaId: "east",
          id: "east",
          prefixes: ["東"],
          labels: ["A"],
        })),
        findMapAreaForCircleSpace: vi.fn(() => ({
          areaId: "east",
          id: "east",
          prefixes: ["東"],
          labels: ["A"],
        })),
        getAllMapAreas: vi.fn(() => [
          { areaId: "east", id: "east", prefixes: ["東"], labels: ["A"] },
        ]),
      } as any,
    );

    await useCase.execute({
      eventDay: { eventId: "c108", dayId: "day1" },
      circles: [{ space: "東A01a" }],
      circleStates: { 東A01a: "pending" },
    });

    const changedSnapshot = {
      ...session.getSnapshot(),
      navigationState: {
        ...session.getSnapshot().navigationState!,
        targetSpace: "東A02a",
        optimizationGeneration: 2,
      },
      currentDestination: { space: "東A02a" },
      selectedDestination: { space: "東A02a" },
    };
    session.replaceSnapshot(changedSnapshot as any);
    const saveCount = runtimeController.saveSnapshot.mock.calls.length;

    onProgress!({
      ...changedSnapshot.navigationState,
      targetSpace: "東A01a",
      optimizationGeneration: 1,
    });

    expect(session.getSnapshot()).toBe(changedSnapshot);
    expect(session.getSnapshot().navigationState).toMatchObject({
      targetSpace: "東A02a",
      optimizationGeneration: 2,
    });
    expect(runtimeController.saveSnapshot).toHaveBeenCalledTimes(saveCount);
  });

  it("keeps the pending snapshot when the target no longer exists", async () => {
    const snapshot = {
      schemaVersion: 1,
      eventId: "c108",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: null,
      navState: {
        stage: "navigating",
        areaId: "east",
        currentPosition: null,
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 0 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a"],
        bestOrder: ["東A01a"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-08-08T00:00:00.000Z",
    };
    const runtimeController = createRuntimeController(snapshot);

    const resumed = await new ResumeRouteGuidanceUseCase(
      {
        getSnapshot: vi.fn(() => ({
          navigationState: null,
          currentDestination: null,
          currentRoute: null,
          selectedDestination: null,
          selectedRoute: null,
          selectionStatus: "idle",
          routeOptimizationGeneration: 1,
        })),
        replaceSnapshot: vi.fn(),
      } as any,
      runtimeController as any,
      { loadMapAssets: vi.fn(async () => routeAssets) } as any,
      {
        getMapArea: vi.fn(() => ({
          areaId: "east",
          id: "east",
          prefixes: ["東"],
          labels: ["A"],
        })),
        findMapAreaForCircleSpace: vi.fn(() => null),
        getAllMapAreas: vi.fn(() => [
          { areaId: "east", id: "east", prefixes: ["東"], labels: ["A"] },
        ]),
      } as any,
    ).execute({
      eventDay: { eventId: "c108", dayId: "day1" },
      circles: [],
      circleStates: {},
    });

    expect(resumed).toEqual({
      kind: "failed",
      message: "目的地が見つかりません。始点を再設定してください",
    });
    expect(runtimeController.setPendingResumeSnapshot).not.toHaveBeenCalled();
    expect(runtimeController.getPendingResumeSnapshot()).toBe(snapshot);
  });

  it("returns failed and preserves the pending snapshot when matrixRef is missing", async () => {
    const snapshot = {
      schemaVersion: 1,
      eventId: "c108",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: null,
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
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 0 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a"],
        bestOrder: ["東A01a"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-08-08T00:00:00.000Z",
    };
    const runtimeController = createRuntimeController(snapshot);
    const session = createSession();

    const resumed = await new ResumeRouteGuidanceUseCase(
      session as any,
      runtimeController as any,
      { loadMapAssets: vi.fn(async () => routeAssets) } as any,
      {
        getMapArea: vi.fn(() => ({
          areaId: "east",
          id: "east",
          prefixes: ["東"],
          labels: ["A"],
        })),
        findMapAreaForCircleSpace: vi.fn(() => ({
          areaId: "east",
          id: "east",
          prefixes: ["東"],
          labels: ["A"],
        })),
        getAllMapAreas: vi.fn(() => [
          { areaId: "east", id: "east", prefixes: ["東"], labels: ["A"] },
        ]),
      } as any,
    ).execute({
      eventDay: { eventId: "c108", dayId: "day1" },
      circles: [{ space: "東A01a" }],
      circleStates: { 東A01a: "pending" },
    });

    expect(resumed).toEqual({
      kind: "failed",
      message: "距離行列が見つからないため、最適化を開始できませんでした",
    });
    expect(session.replaceSnapshot).not.toHaveBeenCalled();
    expect(runtimeController.launchAlnsOptimization).not.toHaveBeenCalled();
    expect(runtimeController.setPendingResumeSnapshot).not.toHaveBeenCalled();
    expect(runtimeController.setMatrixRef).not.toHaveBeenCalled();
    expect(runtimeController.getPendingResumeSnapshot()).toBe(snapshot);
  });

  it("returns failed and preserves the pending snapshot when the stored matrix no longer matches the saved navigation state", async () => {
    const snapshot = {
      schemaVersion: 1,
      eventId: "c108",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: "matrix-east-v1",
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
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 0 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a"],
        bestOrder: ["東A01a"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-08-08T00:00:00.000Z",
    };
    const runtimeController = createRuntimeController(snapshot);
    const session = createSession();
    runtimeController.getMatrixRepo.mockReturnValue({
      load: vi.fn(() => ({
        schemaVersion: 1,
        cacheKey: "matrix-east-v1",
        areaId: "west",
        spaces: ["西A01a"],
        size: 1,
        distances: [0],
        createdAt: "2026-08-08T00:00:00.000Z",
      })),
    });

    const resumed = await new ResumeRouteGuidanceUseCase(
      session as any,
      runtimeController as any,
      { loadMapAssets: vi.fn(async () => routeAssets) } as any,
      {
        getMapArea: vi.fn(() => ({
          areaId: "east",
          id: "east",
          prefixes: ["東"],
          labels: ["A"],
        })),
        findMapAreaForCircleSpace: vi.fn(() => ({
          areaId: "east",
          id: "east",
          prefixes: ["東"],
          labels: ["A"],
        })),
        getAllMapAreas: vi.fn(() => [
          { areaId: "east", id: "east", prefixes: ["東"], labels: ["A"] },
        ]),
      } as any,
    ).execute({
      eventDay: { eventId: "c108", dayId: "day1" },
      circles: [{ space: "東A01a" }],
      circleStates: { 東A01a: "pending" },
    });

    expect(resumed).toEqual({
      kind: "failed",
      message: "保存済みの距離行列が現在の案内状態と一致しません",
    });
    expect(session.replaceSnapshot).not.toHaveBeenCalled();
    expect(runtimeController.launchAlnsOptimization).not.toHaveBeenCalled();
    expect(runtimeController.saveSnapshot).not.toHaveBeenCalled();
    expect(runtimeController.setPendingResumeSnapshot).not.toHaveBeenCalled();
    expect(runtimeController.setMatrixRef).not.toHaveBeenCalled();
    expect(runtimeController.getPendingResumeSnapshot()).toBe(snapshot);
  });

  it("returns failed and preserves the pending snapshot when ALNS startup throws", async () => {
    const snapshot = {
      schemaVersion: 1,
      eventId: "c108",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: "matrix-east-v1",
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
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 0 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a"],
        bestOrder: ["東A01a"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-08-08T00:00:00.000Z",
    };
    const runtimeController = createRuntimeController(snapshot);
    runtimeController.getMatrixRepo.mockReturnValue({
      load: vi.fn(() => ({
        schemaVersion: 1,
        cacheKey: "matrix-east-v1",
        areaId: "east",
        spaces: ["東A01a"],
        size: 1,
        distances: [0],
        createdAt: "2026-08-08T00:00:00.000Z",
      })),
    });
    runtimeController.launchAlnsOptimization.mockImplementation(() => {
      throw new Error("worker failed");
    });
    const session = createSession();

    const resumed = await new ResumeRouteGuidanceUseCase(
      session as any,
      runtimeController as any,
      { loadMapAssets: vi.fn(async () => routeAssets) } as any,
      {
        getMapArea: vi.fn(() => ({
          areaId: "east",
          id: "east",
          prefixes: ["東"],
          labels: ["A"],
        })),
        findMapAreaForCircleSpace: vi.fn(() => ({
          areaId: "east",
          id: "east",
          prefixes: ["東"],
          labels: ["A"],
        })),
        getAllMapAreas: vi.fn(() => [
          { areaId: "east", id: "east", prefixes: ["東"], labels: ["A"] },
        ]),
      } as any,
    ).execute({
      eventDay: { eventId: "c108", dayId: "day1" },
      circles: [{ space: "東A01a" }],
      circleStates: { 東A01a: "pending" },
    });

    expect(resumed).toEqual({
      kind: "failed",
      message: "最適化の開始に失敗しました",
    });
    expect(session.replaceSnapshot).not.toHaveBeenCalled();
    expect(runtimeController.setPendingResumeSnapshot).not.toHaveBeenCalled();
    expect(runtimeController.setMatrixRef).not.toHaveBeenCalled();
    expect(runtimeController.getPendingResumeSnapshot()).toBe(snapshot);
  });
});
