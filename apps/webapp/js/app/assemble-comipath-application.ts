import { App } from "../app.js";
import {
  createActiveEventDayReader,
  createActiveEventDaySession,
  LocalStorageEventDayRepository,
} from "../features/event-day/public-api";
import { StorageService } from "../state/storage-service";
import {
  createComiPathApplication,
  type StartableApplication,
} from "./comipath-application";

export interface AssembleComiPathApplicationOptions {
  readonly document: Document;
  readonly window: Window;
  readonly createAlnsWorker?: () => Worker;
}

/** Composition root for the temporary legacy application. */
export function assembleComiPathApplication(
  options: AssembleComiPathApplicationOptions,
): StartableApplication {
  void options.document;
  void options.window;
  const storage = new StorageService();
  const repository = new LocalStorageEventDayRepository(storage);
  const activeEventDaySession = createActiveEventDaySession();
  const activeEventDayReader = createActiveEventDayReader(
    activeEventDaySession,
  );
  const legacyApplication = new App({
    alnsWorkerFactory: options.createAlnsWorker,
    dataManagerOptions: {
      storage,
      repository,
      activeEventDaySession,
      activeEventDayReader,
    },
  });
  return createComiPathApplication({
    legacyApplication: {
      start: () => legacyApplication.start(),
      stop: () => legacyApplication.dispose(),
    },
  });
}
