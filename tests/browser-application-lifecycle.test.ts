import { describe, expect, it, vi } from "vitest";
import { runComiPathInBrowser } from "../apps/webapp/js/app/run-comipath-in-browser";

describe("browser application lifecycle", () => {
  it("waits for DOMContentLoaded and stops on pagehide", async () => {
    const document = new EventTarget() as Document;
    Object.defineProperty(document, "readyState", { value: "loading" });
    const window = new EventTarget() as Window;
    const app = { start: vi.fn(async () => {}), stop: vi.fn() };
    const run = runComiPathInBrowser(app, { document, window });
    const pending = run.start();
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await pending;
    window.dispatchEvent(new Event("pagehide"));
    run.stop();
    expect(app.start).toHaveBeenCalledOnce();
    expect(app.stop).toHaveBeenCalledOnce();
  });

  it("removes pending readiness listener when stopped before DOM ready", async () => {
    const document = new EventTarget() as Document;
    Object.defineProperty(document, "readyState", { value: "loading" });
    const window = new EventTarget() as Window;
    const app = { start: vi.fn(async () => {}), stop: vi.fn() };
    const run = runComiPathInBrowser(app, { document, window });
    const pending = run.start();
    run.stop();
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(app.start).not.toHaveBeenCalled();
    expect(app.stop).toHaveBeenCalledOnce();
    await Promise.race([pending, Promise.resolve()]);
  });

  it("cleans up when application start fails", async () => {
    const document = new EventTarget() as Document;
    Object.defineProperty(document, "readyState", { value: "complete" });
    const window = new EventTarget() as Window;
    const app = {
      start: vi.fn(async () => {
        throw new Error("fatal");
      }),
      stop: vi.fn(),
    };
    await expect(
      runComiPathInBrowser(app, { document, window }).start(),
    ).rejects.toThrow("fatal");
    expect(app.stop).toHaveBeenCalledOnce();
  });
});
