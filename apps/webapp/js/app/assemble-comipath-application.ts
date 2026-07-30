import { App } from "../app.js";
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
  const legacyApplication = new App({
    alnsWorkerFactory: options.createAlnsWorker,
  });
  return createComiPathApplication({
    legacyApplication: {
      start: () => legacyApplication.start(),
      stop: () => legacyApplication.dispose(),
    },
  });
}
