// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createComiPathApplication } from "../apps/webapp/js/app/comipath-application";
import { BrowserApplication } from "../apps/webapp/js/app/browser-application";

describe("ComiPath application shell", () => {
  it("starts and stops the browser runtime exactly once", async () => {
    const browserRuntime = {
      startCalls: 0,
      stopCalls: 0,
      async start() {
        this.startCalls++;
      },
      stop() {
        this.stopCalls++;
      },
    };
    const app = createComiPathApplication({ browserRuntime });
    await Promise.all([app.start(), app.start()]);
    app.stop();
    app.stop();
    expect(browserRuntime.startCalls).toBe(1);
    expect(browserRuntime.stopCalls).toBe(1);
  });

  it("cleans up after a failed start and rejects subsequent start attempts on the same instance", async () => {
    let attempts = 0;
    const browserRuntime = {
      stopCalls: 0,
      async start() {
        attempts++;
        if (attempts === 1) throw new Error("fatal");
      },
      stop() {
        this.stopCalls++;
      },
    };
    const app = createComiPathApplication({ browserRuntime });
    await expect(app.start()).rejects.toThrow();
    expect(browserRuntime.stopCalls).toBe(1);
    await expect(app.start()).rejects.toThrow();
    app.stop();
    expect(attempts).toBe(1);
    expect(browserRuntime.stopCalls).toBe(1);
  });

  it("settles scheduled work when the legacy application is disposed", async () => {
    let cancelled = false;
    let disposeCalls = 0;
    const fakeApp = {
      stopped: false,
      ownedTimers: new Set<ReturnType<typeof setTimeout>>(),
      ownedTimerCancels: new Map<ReturnType<typeof setTimeout>, () => void>(),
      ownedEventListeners: [],
      ownedWorkers: new Set(),
      disposeSyncCoordinator() {},
      routeGuidanceController: {
        invalidatePendingDestinationSelection() {},
      },
      navigationRuntimeController: {
        dispose() {
          disposeCalls++;
        },
      },
      settingsEscapeHandler: null,
    } as unknown as BrowserApplication;

    const pending = new Promise<void>((resolve) => {
      BrowserApplication.prototype.scheduleTimeout.call(
        fakeApp,
        () => {},
        60_000,
        () => {
          cancelled = true;
          resolve();
        },
      );
    });

    BrowserApplication.prototype.dispose.call(fakeApp);
    await pending;
    expect(cancelled).toBe(true);
    expect(disposeCalls).toBe(1);
  });
});
