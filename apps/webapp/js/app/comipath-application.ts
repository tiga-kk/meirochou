export interface StartableApplication {
  start(): Promise<void>;
  stop(): void;
}

export interface ComiPathApplicationDependencies {
  readonly legacyApplication: StartableApplication;
}

/** Application shell owning only lifecycle delegation. */
export function createComiPathApplication(
  dependencies: ComiPathApplicationDependencies,
): StartableApplication {
  let started = false;
  let stopped = false;
  let startPromise: Promise<void> | null = null;

  return {
    start(): Promise<void> {
      if (stopped) return Promise.resolve();
      if (startPromise) return startPromise;
      if (started) return Promise.resolve();
      started = true;
      startPromise = Promise.resolve(
        dependencies.legacyApplication.start(),
      ).catch((error: unknown) => {
        started = false;
        startPromise = null;
        dependencies.legacyApplication.stop();
        throw error;
      });
      return startPromise;
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      dependencies.legacyApplication.stop();
    },
  };
}
