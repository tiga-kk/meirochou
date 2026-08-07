import { assembleComiPathApplication } from "./assemble-comipath-application";
import { runComiPathInBrowser } from "./run-comipath-in-browser";

const application = assembleComiPathApplication({
  document,
  window,
});

void runComiPathInBrowser(application, { document, window }).start();
