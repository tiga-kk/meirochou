import type { StartableApplication } from "./comipath-application";

export interface BrowserApplicationRun {
  start(): Promise<void>;
  stop(): void;
}

export function runComiPathInBrowser(
  application: StartableApplication,
  browser: { readonly document: Document; readonly window: Window },
): BrowserApplicationRun {
  let started = false;
  let stopped = false;
  let startPromise: Promise<void> | null = null;
  let pendingReadyHandler: (() => void) | null = null;
  let resolvePendingReady: (() => void) | null = null;
  const onPageHide = () => stop();

  const begin = async (): Promise<void> => {
    if (stopped || started) return startPromise ?? Promise.resolve();
    started = true;
    browser.window.addEventListener("pagehide", onPageHide, { once: true });
    startPromise = application.start().catch((error: unknown) => {
      stop();
      throw error;
    });
    return startPromise;
  };

  const start = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (browser.document.readyState !== "loading") return begin();
    if (startPromise) return startPromise;
    startPromise = new Promise<void>((resolve, reject) => {
      resolvePendingReady = resolve;
      const handleReady = () => {
        pendingReadyHandler = null;
        resolvePendingReady = null;
        void begin().then(resolve).catch(reject);
      };
      pendingReadyHandler = handleReady;
      browser.document.addEventListener("DOMContentLoaded", handleReady, {
        once: true,
      });
    });
    return startPromise;
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (pendingReadyHandler) {
      browser.document.removeEventListener(
        "DOMContentLoaded",
        pendingReadyHandler,
      );
      pendingReadyHandler = null;
    }
    if (resolvePendingReady) {
      resolvePendingReady();
      resolvePendingReady = null;
    }
    browser.window.removeEventListener("pagehide", onPageHide);
    application.stop();
  };

  return { start, stop };
}
