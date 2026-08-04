export interface StartableApplication {
  start(): Promise<void>;
  stop(): void;
}

export interface ComiPathApplicationDependencies {
  readonly browserRuntime: StartableApplication;
}

/** Application shell owning only lifecycle delegation. */
export function createComiPathApplication(
  dependencies: ComiPathApplicationDependencies,
): StartableApplication {
  let started = false;
  let stopped = false;
  let startPromise: Promise<void> | null = null;
  let startError: unknown = null;

  return {
    start(): Promise<void> {
      if (stopped) return Promise.reject(new Error("Application is stopped"));
      if (startError) return Promise.reject(startError);
      if (startPromise) return startPromise;
      if (started) return Promise.resolve();
      started = true;
      startPromise = Promise.resolve(dependencies.browserRuntime.start()).catch(
        (error: unknown) => {
          startError = error;
          stopped = true;
          dependencies.browserRuntime.stop();
          throw error;
        },
      );
      return startPromise;
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      dependencies.browserRuntime.stop();
    },
  };
}
