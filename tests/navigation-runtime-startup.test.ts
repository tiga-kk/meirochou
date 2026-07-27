// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../apps/webapp/js/app.js";
import { Config } from "../apps/webapp/js/config.js";

describe("Phase 5C Task 11: Startup Snapshot Load & Resume Dialog Integration", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
  });

  test("shows resume dialog when valid snapshot exists and does not auto-run searchNext", async () => {
    document.body.innerHTML = `
      <div id="header-area-mark"></div>
      <div id="header-area-title"></div>
      <div id="spreadsheet-title"></div>
      <button id="btn-open-gallery"></button>
      <button id="toggle-settings"></button>
      <div id="settings-area"></div>
      <select id="loc-ewsn"><option value="east">東</option></select>
      <select id="loc-label"><option value="A">A</option></select>
      <input id="loc-number" value="1" />
      <button id="btn-search"></button>
      <div id="next-target">
        <div id="target-loading"></div>
        <div id="target-content"></div>
      </div>
      <div id="navigation-map">
        <div id="navigation-map-layer">
          <img id="navigation-map-image" />
          <div id="navigation-pin-layer"></div>
        </div>
        <div id="toast"></div>
      </div>
      <button id="btn-purchased"></button>
      <button id="btn-hold"></button>
      <button id="btn-reset-all"></button>
      <source-diff-dialog id="source-diff-dialog"></source-diff-dialog>
      <navigation-resume-dialog id="navigation-resume-dialog"></navigation-resume-dialog>
    `;

    const app = new App();
    const searchNextSpy = vi
      .spyOn(app, "searchNext")
      .mockImplementation(async () => {});

    // Save a valid snapshot
    app.snapshotRepository.save("demo-v1", "day1", {
      schemaVersion: 1,
      eventId: "demo-v1",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "fixture-v2",
      matrixRef: "matrix-demo-v1",
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
      savedAt: "2026-07-27T00:00:00.000Z",
    });

    const manifest = { bundleVersion: "fixture-v2", areas: [] };
    const registry = {
      schemaVersion: 1,
      events: [
        {
          eventId: "demo-v1",
          displayName: "Demo",
          mapBundle: "manifest.json",
          days: [{ dayId: "day1", displayName: "Day 1" }],
        },
      ],
    };

    // Mock DataManager openEventDay, activeRef & activeState
    app.dm.openEventDay = async (ref) => {
      app.dm.activeRef = ref;
      app.dm.activeState = {
        ref,
        circles: [
          {
            space: "東A01a",
            priority: 1,
            isTarget: true,
            removedFromSource: false,
          },
        ],
        circleStates: { 東A01a: "pending" },
        timestamps: { createdAt: "", updatedAt: "", sourceUpdatedAt: "" },
        source: { type: "csv", filename: "demo.csv" },
        sourceGeneration: "gen-1",
        gasOutbox: [],
      };
      app.dm.wantToBuy = app.dm.activeState.circles;
    };

    await app.init(
      manifest,
      { eventId: "demo-v1", dayId: "day1" },
      { registry, registryUrl: "" },
    );

    const dialog = document.getElementById("navigation-resume-dialog");
    expect(dialog).toBeDefined();
    expect(dialog?.open).toBe(true);
    expect(dialog?.targetSpace).toBe("東A01a");
    // Verify searchNext was NOT automatically called
    expect(searchNextSpy).not.toHaveBeenCalled();
  });

  test("clears invalid snapshot on init and does NOT show resume dialog", async () => {
    document.body.innerHTML = `
      <div id="header-area-mark"></div>
      <div id="header-area-title"></div>
      <div id="spreadsheet-title"></div>
      <button id="btn-open-gallery"></button>
      <button id="toggle-settings"></button>
      <div id="settings-area"></div>
      <select id="loc-ewsn"><option value="east">東</option></select>
      <select id="loc-label"><option value="A">A</option></select>
      <input id="loc-number" value="1" />
      <button id="btn-search"></button>
      <div id="next-target">
        <div id="target-loading"></div>
        <div id="target-content"></div>
      </div>
      <div id="navigation-map">
        <div id="navigation-map-layer">
          <img id="navigation-map-image" />
          <div id="navigation-pin-layer"></div>
        </div>
        <div id="toast"></div>
      </div>
      <button id="btn-purchased"></button>
      <button id="btn-hold"></button>
      <button id="btn-reset-all"></button>
      <source-diff-dialog id="source-diff-dialog"></source-diff-dialog>
      <navigation-resume-dialog id="navigation-resume-dialog"></navigation-resume-dialog>
    `;

    const app = new App();
    vi.spyOn(app, "searchNext").mockImplementation(async () => {});

    // Save snapshot where target circle is already purchased
    app.snapshotRepository.save("demo-v1", "day1", {
      schemaVersion: 1,
      eventId: "demo-v1",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: "matrix-demo-v1",
      navState: {
        stage: "navigating",
        areaId: "east",
        currentPosition: null,
        targetSpace: "東A01a",
        lockedFirstLeg: null,
        provisionalOrder: ["東A01a"],
        bestOrder: ["東A01a"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-07-27T00:00:00.000Z",
    });

    const manifest = { bundleVersion: "v1", areas: [] };
    const registry = {
      schemaVersion: 1,
      events: [
        {
          eventId: "demo-v1",
          displayName: "Demo",
          mapBundle: "manifest.json",
          days: [{ dayId: "day1", displayName: "Day 1" }],
        },
      ],
    };

    // Mock DataManager openEventDay, activeRef & activeState
    app.dm.openEventDay = async (ref) => {
      app.dm.activeRef = ref;
      app.dm.activeState = {
        ref,
        circles: [
          {
            space: "東A01a",
            priority: 1,
            isTarget: true,
            removedFromSource: false,
          },
        ],
        circleStates: { 東A01a: "purchased" },
        timestamps: { createdAt: "", updatedAt: "", sourceUpdatedAt: "" },
        source: { type: "csv", filename: "demo.csv" },
        sourceGeneration: "gen-1",
        gasOutbox: [],
      };
      app.dm.wantToBuy = [];
    };

    await app.init(
      manifest,
      { eventId: "demo-v1", dayId: "day1" },
      { registry, registryUrl: "" },
    );

    const dialog = document.getElementById("navigation-resume-dialog");
    expect(dialog?.open).toBe(false);
    expect(app.snapshotRepository.load("demo-v1", "day1")).toBeNull();
  });

  test("handleResumeResetStart clears snapshot while preserving distance matrix", () => {
    const app = new App();
    app.dm.activeRef = { eventId: "demo-v1", dayId: "day1" };

    // Save snapshot and distance matrix
    app.snapshotRepository.save("demo-v1", "day1", {
      schemaVersion: 1,
      eventId: "demo-v1",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: "matrix-key-1",
      navState: {
        stage: "navigating",
        areaId: "east",
        currentPosition: null,
        targetSpace: "東A01a",
        lockedFirstLeg: null,
        provisionalOrder: ["東A01a"],
        bestOrder: ["東A01a"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-07-27T00:00:00.000Z",
    });

    app.matrixRepository.saveWithRef("demo-v1", "day1", {
      schemaVersion: 1,
      cacheKey: "mat-cache-1",
      areaId: "east",
      spaces: ["東A01a"],
      size: 1,
      distances: [0],
      createdAt: "2026-07-27T00:00:00.000Z",
    });

    app.handleResumeResetStart();

    // Snapshot cleared
    expect(app.snapshotRepository.load("demo-v1", "day1")).toBeNull();
    // Distance matrix preserved
    expect(app.matrixRepository.load("mat-cache-1")).toBeDefined();
    expect(app.matrixRepository.load("mat-cache-1")?.spaces).toEqual([
      "東A01a",
    ]);
  });

  test("handleResumeConfirm restores navigation state and geometry when route assets load", async () => {
    document.body.innerHTML = `
      <div>
        <select id="loc-ewsn"></select>
        <select id="loc-label"></select>
      </div>
      <div id="target-loading" class="hidden"></div>
      <div id="target-empty" class="hidden"></div>
      <div id="target-content"></div>
      <div id="target-space-heading"></div>
      <div id="target-status-label"></div>
      <div id="target-priority"></div>
      <div id="sub-target-space"></div>
      <div id="target-dist"></div>
      <a id="target-tweet-link"></a>
      <div id="tweet-embed-container"></div>
      <div id="toast"></div>
      <navigation-resume-dialog id="navigation-resume-dialog"></navigation-resume-dialog>
    `;
    const app = new App();
    app.ui.init(app.dm);
    const snapshot = {
      schemaVersion: 1 as const,
      eventId: "demo-v1",
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
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start" as const, areaId: "east", gridIndex: 11 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a", "東A02b"],
        bestOrder: ["東A01a", "東A02b"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-07-27T00:00:00.000Z",
    };

    Config.initializeAreas([
      { id: "east", name: "東ホール", prefixes: ["東"], labels: ["A"] },
    ]);

    app.activeResumeSnapshot = snapshot;
    app.dm.wantToBuy = [
      {
        space: "東A01a",
        priority: 1,
        isTarget: true,
        removedFromSource: false,
      },
      {
        space: "東A02b",
        priority: 2,
        isTarget: true,
        removedFromSource: false,
      },
    ];

    const _mockRoute = {
      cost: 10,
      cells: [{ col: 0, row: 0 }],
      points: [{ x: 10, y: 10 }],
      startPosition: { x: 10, y: 10 },
      targetPosition: { x: 20, y: 20 },
      image: { width: 100, height: 100 },
    };

    // Mock loadGridRouteAssets with valid points and portals for planRouteFromGridIndex
    app.loadGridRouteAssets = async () => {
      const bytes = new Uint8Array(100);
      bytes.fill(1); // 1 = walkable
      return {
        pointsPayload: {
          points: [
            {
              space: "東A01a",
              identifier: "A",
              number: 1,
              portals: [{ col: 1, row: 1, x: 20, y: 20 }],
              center_x: 20,
              center_y: 20,
            },
          ],
        } as unknown as PointsPayload,
        gridMeta: {
          cell_size: 10,
          cols: 10,
          rows: 10,
          width: 100,
          height: 100,
        },
        gridBytes: bytes,
      };
    };

    await app.handleResumeConfirm();

    expect(app.activeResumeSnapshot).toBeNull();
    expect(app.navigationState?.currentPosition?.gridIndex).toBe(0);
    expect(app.currentTarget?.space).toBe("東A01a");
    expect(app.currentRoute).toBeDefined();
    expect(app.currentRoute?.startPosition).toEqual({ x: 20, y: 20 });
    expect(app.nextTarget?.space).toBe("東A02b");
  });

  test("handleResumeConfirm preserves snapshot and shows error when geometry reconstruction fails", async () => {
    document.body.innerHTML =
      '<navigation-resume-dialog id="navigation-resume-dialog"></navigation-resume-dialog>';
    const dialog = document.getElementById("navigation-resume-dialog");
    if (dialog) dialog.open = true;
    const app = new App();
    const snapshot = {
      schemaVersion: 1 as const,
      eventId: "demo-v1",
      dayId: "day1",
      areaId: "east",
      bundleVersion: "v1",
      matrixRef: "matrix-key-1",
      navState: {
        stage: "navigating" as const,
        areaId: "east",
        currentPosition: null,
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start" as const, areaId: "east", gridIndex: 0 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a"],
        bestOrder: ["東A01a"],
      },
      optimizationTimeLimitMs: 10000,
      savedAt: "2026-07-27T00:00:00.000Z",
    };

    app.activeResumeSnapshot = snapshot;
    app.dm.wantToBuy = [
      {
        space: "東A01a",
        priority: 1,
        isTarget: true,
        removedFromSource: false,
      },
    ];

    // Mock loadGridRouteAssets returning null -> geometry reconstruction fails
    app.loadGridRouteAssets = async () => null;

    const searchNextSpy = vi.spyOn(app, "searchNext");

    await app.handleResumeConfirm();

    // Snapshot is NOT discarded
    expect(app.activeResumeSnapshot).toBe(snapshot);
    // searchNext is NOT called
    expect(searchNextSpy).not.toHaveBeenCalled();
    // currentTarget is NOT set
    expect(app.currentTarget).toBeNull();
    expect(app.navigationState).toBeNull();
    expect(document.getElementById("navigation-resume-dialog")?.open).toBe(
      true,
    );
  });

  test("handleResumeConfirm launches ALNS worker warm-start optimization using fake Worker port and updates bestOrder on progress", async () => {
    document.body.innerHTML = `
      <div>
        <select id="loc-ewsn"></select>
        <select id="loc-label"></select>
      </div>
      <div id="header-area-mark"></div>
      <div id="header-area-title"></div>
      <div id="target-loading" class="hidden"></div>
      <div id="target-empty" class="hidden"></div>
      <div id="target-content"></div>
      <div id="target-space-heading"></div>
      <div id="target-status-label"></div>
      <div id="target-priority"></div>
      <div id="sub-target-space"></div>
      <div id="target-dist"></div>
      <a id="target-tweet-link"></a>
      <div id="tweet-embed-container"></div>
      <div id="toast"></div>
      <navigation-resume-dialog id="navigation-resume-dialog"></navigation-resume-dialog>
    `;

    const app = new App();
    app.ui.init(app.dm);

    // Save matrix into matrixRepository
    app.matrixRepository.save({
      schemaVersion: 1,
      cacheKey: "matrix-key-resume",
      areaId: "e456",
      spaces: ["東A01a", "東A02b"],
      size: 2,
      distances: [0, 10, 10, 0],
      createdAt: "2026-07-27T00:00:00.000Z",
    });

    const snapshot = {
      schemaVersion: 1 as const,
      eventId: "demo-v1",
      dayId: "day1",
      areaId: "e456",
      bundleVersion: "v1",
      matrixRef: "matrix-key-resume",
      navState: {
        stage: "navigating" as const,
        areaId: "e456",
        currentPosition: {
          areaId: "e456",
          gridIndex: 0,
          svgX: 10,
          svgY: 10,
          source: "manual-start" as const,
        },
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start" as const, areaId: "east", gridIndex: 11 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a", "東A02b"],
        bestOrder: ["東A01a", "東A02b"],
      },
      optimizationTimeLimitMs: 15000 as const,
      savedAt: "2026-07-27T00:00:00.000Z",
    };

    Config.replaceAreas([
      { id: "e456", name: "東ホール", prefixes: ["東"], labels: ["A"] },
    ]);

    app.activeResumeSnapshot = snapshot;
    app.dm.wantToBuy = [
      {
        space: "東A01a",
        priority: 1,
        isTarget: true,
        removedFromSource: false,
      },
      {
        space: "東A02b",
        priority: 2,
        isTarget: true,
        removedFromSource: false,
      },
    ];

    app.loadGridRouteAssets = async () => {
      const bytes = new Uint8Array(100);
      bytes.fill(1);
      return {
        pointsPayload: {
          points: [
            {
              space: "東A01a",
              identifier: "A",
              number: 1,
              portals: [{ col: 1, row: 1, x: 20, y: 20 }],
              center_x: 20,
              center_y: 20,
            },
            {
              space: "東A02b",
              identifier: "A",
              number: 2,
              portals: [{ col: 2, row: 2, x: 30, y: 30 }],
              center_x: 30,
              center_y: 30,
            },
          ],
        } as unknown as PointsPayload,
        gridMeta: {
          cell_size: 10,
          cols: 10,
          rows: 10,
          width: 100,
          height: 100,
        },
        gridBytes: bytes,
      };
    };

    // Fake Worker port setup
    let postedMessage: unknown = null;
    let factoryCalled = false;
    const fakeWorker = {
      postMessage(msg: unknown) {
        postedMessage = msg;
      },
      onmessage: null as ((ev: { data: unknown }) => void) | null,
    };

    const testApp = new App({
      alnsWorkerFactory: () => {
        factoryCalled = true;
        return fakeWorker as unknown as Worker;
      },
    });
    testApp.ui.init(testApp.dm);
    testApp.matrixRepository = app.matrixRepository;
    testApp.loadGridRouteAssets = app.loadGridRouteAssets;
    testApp.activeResumeSnapshot = snapshot;
    testApp.dm.wantToBuy = app.dm.wantToBuy;
    const workerProgressSpy = vi.spyOn(
      testApp.orchestrationService,
      "handleWorkerProgress",
    );

    await testApp.handleResumeConfirm();

    // 1. Verify App production path invoked worker factory
    expect(factoryCalled).toBe(true);

    // 2. Verify worker request contains fixedFirstTarget, initialSolutions, searchTimeLimitMs
    const req = postedMessage as {
      type: string;
      jobId: string;
      problem: {
        fixedFirstTarget: string;
        initialSolutions: string[][];
        searchTimeLimitMs: number;
      };
    };
    expect(req).not.toBeNull();
    expect(req.type).toBe("start");
    expect(req.problem.fixedFirstTarget).toBe("東A01a");
    expect(req.problem.initialSolutions).toEqual([["東A01a", "東A02b"]]);
    expect(req.problem.searchTimeLimitMs).toBe(15000);

    const initialRoute = testApp.currentRoute;
    const initialTarget = testApp.currentTarget;

    // 3. Verify stale/malformed response is ignored
    fakeWorker.onmessage?.({ data: { type: "unknown-type" } });
    fakeWorker.onmessage?.({
      data: {
        type: "progress",
        stage: "time-decayed-alns",
        jobId: "stale-job-id",
        elapsedMs: 100,
        searchTimeLimitMs: 15000,
        best: {
          score: 10,
          route: ["東A02b", "東A01a"],
          completionTimesSec: [10, 20],
          elapsedMs: 100,
          optimizationProfileVersion: "v1",
        },
      },
    });
    expect(testApp.navigationState?.bestOrder).toEqual(["東A01a", "東A02b"]);

    // 4. Simulate valid Worker progress response
    fakeWorker.onmessage?.({
      data: {
        type: "progress",
        stage: "time-decayed-alns",
        jobId: req.jobId,
        elapsedMs: 500,
        searchTimeLimitMs: 15000,
        best: {
          score: 10,
          route: ["東A01a", "東A02b"],
          completionTimesSec: [10, 20],
          elapsedMs: 500,
          optimizationProfileVersion: "v1",
        },
      },
    });

    // 5. Verify bestOrder updated, but currentTarget/currentRoute remain unchanged
    expect(workerProgressSpy).toHaveBeenCalledWith(
      expect.objectContaining({ optimizationGeneration: 1 }),
      ["東A01a", "東A02b"],
      1,
    );
    expect(testApp.navigationState?.bestOrder).toEqual(["東A01a", "東A02b"]);
    expect(testApp.currentTarget).toBe(initialTarget);
    expect(testApp.currentRoute).toBe(initialRoute);
  });

  test("does not postMessage when start distance calculation returns invalid distances", async () => {
    const snapshot = {
      schemaVersion: 1 as const,
      eventId: "demo-v1",
      dayId: "day1",
      areaId: "e456",
      bundleVersion: "v1",
      matrixRef: "matrix-key-invalid",
      navState: {
        stage: "navigating" as const,
        areaId: "e456",
        currentPosition: {
          areaId: "e456",
          gridIndex: 0,
          svgX: 10,
          svgY: 10,
          source: "manual-start" as const,
        },
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start" as const, areaId: "e456", gridIndex: 9999 }, // Out of bounds cell
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a"],
        bestOrder: ["東A01a"],
      },
      optimizationTimeLimitMs: 10000 as const,
      savedAt: "2026-07-27T00:00:00.000Z",
    };

    let posted = false;
    let factoryCalled = false;
    const fakeWorker = {
      postMessage() {
        posted = true;
      },
      onmessage: null,
    };
    const app = new App({
      alnsWorkerFactory: () => {
        factoryCalled = true;
        return fakeWorker as unknown as Worker;
      },
    });
    app.activeResumeSnapshot = snapshot;
    app.dm.wantToBuy = [
      {
        space: "東A01a",
        priority: 1,
        isTarget: true,
        removedFromSource: false,
      },
    ];
    app.loadGridRouteAssets = async () => null;

    await app.handleResumeConfirm();

    expect(posted).toBe(false);
    expect(factoryCalled).toBe(false);
    expect(app.activeResumeSnapshot).toBe(snapshot);
  });

  test("searchNext invokes NavigationOrchestrationService.startNavigation and avoids TspSolver.solve and rankCandidatesByGridDistance", async () => {
    document.body.innerHTML = `
      <div>
        <select id="loc-ewsn"><option value="e456">東</option></select>
        <select id="loc-label"><option value="A">A</option></select>
        <input id="loc-number" value="1" />
      </div>
      <div id="header-area-mark"></div>
      <div id="header-area-title"></div>
      <div id="target-loading" class="hidden"></div>
      <div id="target-empty" class="hidden"></div>
      <div id="target-content"></div>
      <div id="target-space-heading"></div>
      <div id="target-status-label"></div>
      <div id="target-priority"></div>
      <div id="sub-target-space"></div>
      <div id="target-dist"></div>
      <a id="target-tweet-link"></a>
      <div id="tweet-embed-container"></div>
      <div id="toast"></div>
    `;

    Config.replaceAreas([
      {
        id: "e456",
        mapId: "m1",
        name: "東ホール",
        prefixes: ["東"],
        labels: ["A"],
        mapFile: "m.svg",
        pointsFile: "p.json",
        gridMetaFile: "gm.json",
        gridFile: "g.bin",
      },
    ]);

    const app = new App();
    app.ui.init(app.dm);
    app.dm.wantToBuy = [
      {
        space: "東A01a",
        priority: 1,
        isTarget: true,
        removedFromSource: false,
      },
      {
        space: "東A02b",
        priority: 2,
        isTarget: false,
        removedFromSource: false,
      },
    ];

    const bytes = new Uint8Array(100);
    bytes.fill(1);
    app.loadGridRouteAssets = async () => ({
      pointsPayload: {
        points: [
          {
            space: "東A01a",
            identifier: "A",
            number: 1,
            portals: [{ col: 1, row: 1, x: 20, y: 20 }],
            center_x: 20,
            center_y: 20,
          },
          {
            space: "東A02b",
            identifier: "A",
            number: 2,
            portals: [{ col: 2, row: 2, x: 30, y: 30 }],
            center_x: 30,
            center_y: 30,
          },
        ],
      } as unknown as PointsPayload,
      gridMeta: {
        cell_size: 10,
        cols: 10,
        rows: 10,
        width: 100,
        height: 100,
      },
      gridBytes: bytes,
    });

    const startNavSpy = vi.spyOn(app.orchestrationService, "startNavigation");

    const rankSpy = vi.spyOn(app, "rankCandidatesByGrid");

    await app.searchNext("東A01a");

    // 1. Verify startNavigation was invoked on orchestrationService
    expect(startNavSpy).toHaveBeenCalled();

    // 2. Verify rankCandidatesByGrid was NOT called
    expect(rankSpy).not.toHaveBeenCalled();

    // 3. Verify navigationState fields
    expect(app.navigationState?.targetSpace).toBe("東A01a");
    expect(app.navigationState?.lockedFirstLeg).toBeDefined();
    expect(app.navigationState?.lockedFirstLeg?.toSpace).toBe("東A01a");

    // 4. Verify target space is set according to orchestration result
    expect(app.currentTarget?.space).toBe("東A01a");
  });

  test("manual target change uses orchestration state and does not rank candidates", async () => {
    document.body.innerHTML = `
      <select id="loc-ewsn"><option value="east">東</option></select>
      <select id="loc-label"><option value="A">A</option></select>
      <input id="loc-number" value="1" />
    `;
    const app = new App();
    app.ui.showNavigation = vi.fn();
    app.ui.showLoading = vi.fn();
    app.ui.showToast = vi.fn();
    app.ui.showNavigation = vi.fn();
    app.navigationState = {
      stage: "navigating",
      areaId: "east",
      currentPosition: {
        areaId: "east",
        gridIndex: 3,
        svgX: 30,
        svgY: 30,
        source: "arrived-circle",
        circleSpace: "東A01a",
      },
      targetSpace: "東A01a",
      lockedFirstLeg: {
        from: { type: "circle", space: "東A01a" },
        toSpace: "東A01a",
      },
      provisionalOrder: ["東A01a", "東A02b"],
      bestOrder: ["東A01a", "東A02b"],
    };
    const target = {
      space: "東A02b",
      priority: 2,
      isTarget: false,
      removedFromSource: false,
    };
    app.dm.wantToBuy = [
      {
        space: "東A01a",
        priority: 1,
        isTarget: true,
        removedFromSource: false,
      },
      target,
    ];
    const route = {
      cost: 12,
      targetPosition: { x: 42, y: 43 },
      startPosition: { x: 30, y: 30 },
    };
    app.planGridRoute = vi.fn().mockResolvedValue(route);
    const initialState = app.navigationState;
    const nextState = {
      ...initialState,
      targetSpace: "東A02b",
      lockedFirstLeg: {
        from: { type: "circle", space: "東A01a" },
        toSpace: "東A02b",
      },
      provisionalOrder: ["東A02b", "東A01a"],
      bestOrder: ["東A02b", "東A01a"],
    };
    const manualSpy = vi
      .spyOn(app.orchestrationService, "handleManualTarget")
      .mockReturnValue({
        navState: nextState,
        requiresMatrixRegeneration: false,
      });
    const rankSpy = vi.spyOn(app, "rankCandidatesByGrid");

    await app.handleSetNextTarget(target);

    expect(manualSpy).toHaveBeenCalledWith(initialState, "東A02b");
    expect(rankSpy).not.toHaveBeenCalled();
    expect(app.navigationState).toBe(nextState);
    expect(app.navigationState?.lockedFirstLeg?.toSpace).toBe("東A02b");
    expect(app.currentTarget?.space).toBe("東A02b");
    expect(app.currentRoute).toBe(route);
    expect(app.selectedTarget).toBe(app.currentTarget);
    expect(app.selectedRoute).toBe(route);
    expect(app.nextTarget?.space).toBe("東A01a");
  });

  test("hold updates orchestration state without falling back to searchNext", async () => {
    const app = new App();
    app.ui.showToast = vi.fn();
    app.ui.showNavigation = vi.fn();
    app.ui.updateCounts = vi.fn();
    app.ui.updateCurrentLocation = vi.fn();
    app.updateManagementModels = vi.fn();
    app.flushOutboxWithDiagnostic = vi.fn();
    app.currentTarget = {
      space: "東A01a",
      priority: 1,
      isTarget: true,
      removedFromSource: false,
    };
    app.currentRoute = { cost: 10, targetPosition: { x: 1, y: 1 } };
    app.selectedTarget = app.currentTarget;
    app.selectedRoute = app.currentRoute;
    app.nextTarget = null;
    app.navigationState = {
      stage: "navigating",
      areaId: "east",
      currentPosition: {
        areaId: "east",
        gridIndex: 3,
        svgX: 30,
        svgY: 30,
        source: "arrived-circle",
        circleSpace: "東A01a",
      },
      targetSpace: "東A01a",
      lockedFirstLeg: {
        from: { type: "circle", space: "東A01a" },
        toSpace: "東A01a",
      },
      provisionalOrder: ["東A01a", "東A02b"],
      bestOrder: ["東A01a", "東A02b"],
    };
    app.dm.wantToBuy = [
      app.currentTarget,
      {
        space: "東A02b",
        priority: 2,
        isTarget: false,
        removedFromSource: false,
      },
    ];
    app.dm.addHold = vi.fn();
    const heldState = {
      ...app.navigationState,
      targetSpace: "東A02b",
      lockedFirstLeg: {
        from: { type: "circle", space: "東A01a" },
        toSpace: "東A02b",
      },
      provisionalOrder: ["東A02b"],
      bestOrder: ["東A02b"],
    };
    const holdSpy = vi
      .spyOn(app.orchestrationService, "handleBeforeArrivalHold")
      .mockReturnValue({ navState: heldState, heldSpace: "東A01a" });
    app.planGridRoute = vi.fn().mockResolvedValue({
      cost: 20,
      targetPosition: { x: 2, y: 2 },
    });
    const initialNavigationState = app.navigationState;
    const searchSpy = vi.spyOn(app, "searchNext");

    await app.handleAction("hold");

    expect(app.dm.addHold).toHaveBeenCalledWith("東A01a", "");
    expect(holdSpy).toHaveBeenCalledWith(initialNavigationState);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(app.navigationState).toBe(heldState);
    expect(app.currentTarget?.space).toBe("東A02b");
    expect(app.currentRoute?.cost).toBe(20);
    expect(app.selectedTarget).toBe(app.currentTarget);
    expect(app.selectedRoute).toBe(app.currentRoute);
    expect(app.nextTarget).toBeNull();
  });

  test("hold completion clears the snapshot without referencing an undefined state", async () => {
    const app = new App();
    app.dm.activeRef = { eventId: "demo-v1", dayId: "day1" };
    app.dm.addHold = vi.fn();
    app.dm.wantToBuy = [{ space: "東A01a" }];
    app.currentTarget = app.dm.wantToBuy[0];
    app.selectedTarget = app.currentTarget;
    app.navigationState = {
      stage: "navigating",
      areaId: "demo-east",
      currentPosition: null,
      targetSpace: "東A01a",
      lockedFirstLeg: null,
      provisionalOrder: ["東A01a"],
      bestOrder: ["東A01a"],
    };
    app.ui.showToast = vi.fn();
    app.ui.showTarget = vi.fn();
    app.ui.updateCounts = vi.fn();
    app.ui.updateCurrentLocation = vi.fn();
    app.updateManagementModels = vi.fn();
    const clearSpy = vi
      .spyOn(app, "clearNavigationSnapshot")
      .mockImplementation(() => {});
    vi.spyOn(
      app.orchestrationService,
      "handleBeforeArrivalHold",
    ).mockReturnValue({
      navState: {
        ...app.navigationState,
        stage: "idle",
        targetSpace: null,
        lockedFirstLeg: null,
        provisionalOrder: [],
        bestOrder: [],
      },
      heldSpace: "東A01a",
    });

    await app.handleAction("hold");

    expect(clearSpy).toHaveBeenCalledWith(app.dm.activeRef);
    expect(app.navigationState).toBeNull();
  });

  test("hold keeps current navigation and shows an error when next route fails", async () => {
    const app = new App();
    app.ui.showToast = vi.fn();
    app.ui.updateCounts = vi.fn();
    app.ui.updateCurrentLocation = vi.fn();
    app.updateManagementModels = vi.fn();
    const currentTarget = { space: "東A01a" };
    const currentRoute = { cost: 10 };
    const navigationState = {
      stage: "navigating",
      areaId: "east",
      currentPosition: {
        areaId: "east",
        gridIndex: 3,
        svgX: 30,
        svgY: 30,
        source: "arrived-circle",
        circleSpace: "東A01a",
      },
      targetSpace: "東A01a",
      lockedFirstLeg: {
        from: { type: "circle", space: "東A01a" },
        toSpace: "東A01a",
      },
      provisionalOrder: ["東A01a", "東A02b"],
      bestOrder: ["東A01a", "東A02b"],
    };
    const nextState = {
      ...navigationState,
      targetSpace: "東A02b",
      lockedFirstLeg: {
        from: { type: "circle", space: "東A01a" },
        toSpace: "東A02b",
      },
      provisionalOrder: ["東A02b"],
      bestOrder: ["東A02b"],
    };
    app.currentTarget = currentTarget;
    app.currentRoute = currentRoute;
    app.selectedTarget = currentTarget;
    app.selectedRoute = currentRoute;
    app.navigationState = navigationState;
    app.dm.wantToBuy = [currentTarget, { space: "東A02b" }];
    app.dm.addHold = vi.fn();
    vi.spyOn(
      app.orchestrationService,
      "handleBeforeArrivalHold",
    ).mockReturnValue({
      navState: nextState,
      heldSpace: "東A01a",
    });
    app.planGridRoute = vi.fn().mockResolvedValue(null);

    await app.handleAction("hold");

    expect(app.navigationState).toBe(navigationState);
    expect(app.currentTarget).toBe(currentTarget);
    expect(app.currentRoute).toBe(currentRoute);
    expect(app.ui.showToast).toHaveBeenLastCalledWith(
      expect.any(String),
      "error",
    );
  });

  test("purchase advances through arrival and purchase orchestration without searchNext", async () => {
    Config.replaceAreas([
      {
        id: "east",
        mapId: "east-map",
        name: "東",
        prefixes: ["東"],
        labels: ["A"],
        mapFile: "map.svg",
        pointsFile: "points.json",
        gridMetaFile: "grid.json",
        gridFile: "grid.bin",
      },
    ]);
    const app = new App();
    app.ui.showToast = vi.fn();
    app.ui.showNavigation = vi.fn();
    app.ui.updateCounts = vi.fn();
    app.ui.updateCurrentLocation = vi.fn();
    app.updateManagementModels = vi.fn();
    const areaId = "east";
    const currentTarget = { space: "東A01a" };
    const currentRoute = {
      cost: 10,
      targetPosition: { x: 10, y: 20 },
      cells: [{ row: 2, col: 3 }],
      image: { width: 100, height: 100 },
    };
    const navigationState = {
      stage: "navigating",
      areaId,
      currentPosition: {
        areaId,
        gridIndex: 0,
        svgX: 0,
        svgY: 0,
        source: "manual-start",
      },
      targetSpace: "東A01a",
      lockedFirstLeg: {
        from: { type: "start", areaId: "east", gridIndex: 0 },
        toSpace: "東A01a",
      },
      provisionalOrder: ["東A01a", "東A02b"],
      bestOrder: ["東A01a", "東A02b"],
    };
    const arrivedState = {
      ...navigationState,
      stage: "atTarget",
      currentPosition: {
        ...navigationState.currentPosition,
        source: "arrived-circle",
        circleSpace: "東A01a",
      },
    };
    const purchasedState = {
      ...arrivedState,
      stage: "navigating",
      targetSpace: "東A02b",
      lockedFirstLeg: {
        from: { type: "circle", space: "東A01a" },
        toSpace: "東A02b",
      },
      provisionalOrder: ["東A02b"],
      bestOrder: ["東A02b"],
    };
    app.currentTarget = currentTarget;
    app.currentRoute = currentRoute;
    app.selectedTarget = currentTarget;
    app.selectedRoute = currentRoute;
    app.navigationState = navigationState;
    app.dm.wantToBuy = [currentTarget, { space: "東A02b" }];
    app.dm.addPurchased = vi.fn();
    app.loadGridRouteAssets = vi.fn().mockResolvedValue({
      pointsPayload: {
        points: [
          {
            space: "東A01a",
            identifier: "A",
            number: 1,
            portals: [{ col: 4, row: 5, x: 123, y: 234 }],
          },
        ],
      },
      gridMeta: { cols: 20, rows: 20, cell_size: 10 },
      gridBytes: new Uint8Array(400),
    });
    const arrivalSpy = vi
      .spyOn(app.orchestrationService, "handleArrival")
      .mockReturnValue(arrivedState);
    const purchaseSpy = vi
      .spyOn(app.orchestrationService, "handlePurchaseNext")
      .mockReturnValue(purchasedState);
    const nextRoute = { cost: 20, targetPosition: { x: 30, y: 40 } };
    app.planGridRoute = vi.fn().mockResolvedValue(nextRoute);
    const searchSpy = vi.spyOn(app, "searchNext");

    await app.handleAction("purchase");

    expect(arrivalSpy).toHaveBeenCalled();
    expect(arrivalSpy.mock.calls[0][1]).toMatchObject({
      gridIndex: 104,
      svgX: 123,
      svgY: 234,
      source: "arrived-circle",
      circleSpace: "東A01a",
    });
    expect(purchaseSpy).toHaveBeenCalledWith(arrivedState);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(app.navigationState).toBe(purchasedState);
    expect(app.currentTarget?.space).toBe("東A02b");
    expect(app.currentRoute).toBe(nextRoute);
    expect(app.selectedTarget).toBe(app.currentTarget);
    expect(app.selectedRoute).toBe(nextRoute);
  });

  test("searchNext maintains idle state when pending circles are empty", async () => {
    document.body.innerHTML = `
      <div>
        <select id="loc-ewsn"><option value="e456">東</option></select>
        <select id="loc-label"><option value="A">A</option></select>
        <input id="loc-number" value="1" />
      </div>
      <div id="header-area-mark"></div>
      <div id="header-area-title"></div>
      <div id="target-loading" class="hidden"></div>
      <div id="target-empty" class="hidden"></div>
      <div id="target-content"></div>
      <div id="toast"></div>
    `;

    const app = new App();
    app.ui.init(app.dm);
    app.dm.wantToBuy = []; // Empty

    await app.searchNext("東A01a");

    expect(app.currentTarget).toBeNull();
    expect(app.navigationState).toBeNull();
  });

  test("saveNavigationSnapshot builds the existing schema and preserves known matrixRef", () => {
    const app = new App();
    app.dm.activeRef = { eventId: "demo-v1", dayId: "day1" };
    app.currentManifest = { bundleVersion: "fixture-v2" };
    app.navigationState = {
      stage: "navigating",
      areaId: "east",
      currentPosition: null,
      targetSpace: "東A01a",
      lockedFirstLeg: null,
      provisionalOrder: ["東A01a"],
      bestOrder: ["東A01a"],
    };
    app.activeResumeSnapshot = null;
    app.navigationMatrixRef = "matrix-demo-v1";
    app.optimizationTimeLimitMs = 15000;
    const saveSpy = vi
      .spyOn(app.navigationRuntimeController, "saveSnapshot")
      .mockImplementation(() => {});

    app.saveNavigationSnapshot();

    expect(saveSpy).toHaveBeenCalledWith(
      "demo-v1",
      "day1",
      expect.objectContaining({
        schemaVersion: 1,
        eventId: "demo-v1",
        dayId: "day1",
        areaId: "east",
        bundleVersion: "fixture-v2",
        matrixRef: "matrix-demo-v1",
        navState: app.navigationState,
        optimizationTimeLimitMs: 15000,
      }),
    );
  });

  test("source changes clear navigation snapshot, matrix cache, and runtime state", () => {
    const app = new App();
    const ref = { eventId: "demo-v1", dayId: "day1" };
    app.dm.activeRef = ref;
    app.navigationState = {
      stage: "navigating",
      areaId: "demo-east",
      currentPosition: null,
      targetSpace: "東A01a",
      lockedFirstLeg: null,
      provisionalOrder: ["東A01a"],
      bestOrder: ["東A01a"],
    };
    app.currentTarget = { space: "東A01a" };

    const clearSpy = vi
      .spyOn(app, "clearNavigationSnapshot")
      .mockImplementation(() => {});
    const matrixDeleteSpy = vi.spyOn(app.matrixRepository, "deleteByEventDay");

    app.invalidateNavigationForSourceChange(ref);

    expect(clearSpy).toHaveBeenCalledWith(ref);
    expect(matrixDeleteSpy).toHaveBeenCalledWith("demo-v1", "day1");
    expect(app.navigationState).toBeNull();
    expect(app.currentTarget).toBeNull();
  });

  test("searchNext does not fallback to old TspSolver when grid distance calculation fails", async () => {
    document.body.innerHTML = `
      <div>
        <select id="loc-ewsn"><option value="e456">東</option></select>
        <select id="loc-label"><option value="A">A</option></select>
        <input id="loc-number" value="1" />
      </div>
      <div id="header-area-mark"></div>
      <div id="header-area-title"></div>
      <div id="target-loading" class="hidden"></div>
      <div id="target-empty" class="hidden"></div>
      <div id="target-content"></div>
      <div id="toast"></div>
    `;

    const app = new App();
    app.ui.init(app.dm);
    app.dm.wantToBuy = [
      {
        space: "東A01a",
        priority: 1,
        isTarget: true,
        removedFromSource: false,
      },
    ];

    app.loadGridRouteAssets = async () => null; // Loading fails

    const startNavSpy = vi.spyOn(app.orchestrationService, "startNavigation");

    await app.searchNext("東A01a");

    // Start navigation is NOT invoked and no target is selected
    expect(startNavSpy).not.toHaveBeenCalled();
    expect(app.currentTarget).toBeNull();
  });

  test("searchNext does not commit navigation state when route geometry fails", async () => {
    document.body.innerHTML = `
      <div>
        <select id="loc-ewsn"><option value="e456">東</option></select>
        <select id="loc-label"><option value="A">A</option></select>
        <input id="loc-number" value="1" />
      </div>
      <div id="header-area-mark"></div>
      <div id="header-area-title"></div>
      <div id="target-loading" class="hidden"></div>
      <div id="target-empty" class="hidden"></div>
      <div id="target-content"></div>
      <div id="toast"></div>
    `;

    Config.replaceAreas([
      {
        id: "e456",
        mapId: "m1",
        name: "東ホール",
        prefixes: ["東"],
        labels: ["A"],
        mapFile: "m.svg",
        pointsFile: "p.json",
        gridMetaFile: "gm.json",
        gridFile: "g.bin",
      },
    ]);

    const app = new App();
    app.ui.init(app.dm);
    app.dm.wantToBuy = [
      {
        space: "東A01a",
        priority: 1,
        isTarget: true,
        removedFromSource: false,
      },
    ];
    app.loadGridRouteAssets = async () => ({
      pointsPayload: {
        points: [
          {
            space: "東A01a",
            identifier: "A",
            number: 1,
            portals: [{ col: 1, row: 1, x: 20, y: 20 }],
            center_x: 20,
            center_y: 20,
          },
        ],
      } as unknown as PointsPayload,
      gridMeta: {
        cell_size: 10,
        cols: 10,
        rows: 10,
        width: 100,
        height: 100,
      },
      gridBytes: new Uint8Array(100),
    });

    await app.searchNext("東A01a");

    expect(app.navigationState).toBeNull();
    expect(app.currentTarget).toBeNull();
    expect(app.currentRoute).toBeNull();
  });
});
