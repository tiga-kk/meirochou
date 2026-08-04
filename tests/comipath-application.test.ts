// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createComiPathApplication } from "../apps/webapp/js/app/comipath-application";
import { App } from "../apps/webapp/js/app.js";

describe("ComiPath application shell", () => {
  it("starts and stops the legacy application exactly once", async () => {
    const legacy = {
      startCalls: 0,
      stopCalls: 0,
      async start() {
        this.startCalls++;
      },
      stop() {
        this.stopCalls++;
      },
    };
    const app = createComiPathApplication({ legacyApplication: legacy });
    await Promise.all([app.start(), app.start()]);
    app.stop();
    app.stop();
    expect(legacy.startCalls).toBe(1);
    expect(legacy.stopCalls).toBe(1);
  });

  it("cleans up after a failed start and rejects subsequent start attempts on the same instance", async () => {
    let attempts = 0;
    const legacy = {
      stopCalls: 0,
      async start() {
        attempts++;
        if (attempts === 1) throw new Error("fatal");
      },
      stop() {
        this.stopCalls++;
      },
    };
    const app = createComiPathApplication({ legacyApplication: legacy });
    await expect(app.start()).rejects.toThrow();
    expect(legacy.stopCalls).toBe(1);
    await expect(app.start()).rejects.toThrow();
    app.stop();
    expect(attempts).toBe(1);
    expect(legacy.stopCalls).toBe(1);
  });

  it("settles scheduled work when the legacy application is disposed", async () => {
    let cancelled = false;
    const fakeApp = {
      stopped: false,
      ownedTimers: new Set<ReturnType<typeof setTimeout>>(),
      ownedTimerCancels: new Map<ReturnType<typeof setTimeout>, () => void>(),
      ownedEventListeners: [],
      ownedWorkers: new Set(),
      dm: { disposeSyncCoordinator() {} },
      navigationRuntimeController: {},
      settingsEscapeHandler: null,
    } as unknown as App;

    const pending = new Promise<void>((resolve) => {
      App.prototype.scheduleTimeout.call(
        fakeApp,
        () => {},
        60_000,
        () => {
          cancelled = true;
          resolve();
        },
      );
    });

    App.prototype.dispose.call(fakeApp);
    await pending;
    expect(cancelled).toBe(true);
  });
});
