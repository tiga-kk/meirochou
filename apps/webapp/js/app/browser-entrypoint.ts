import { assembleComiPathApplication } from "./assemble-comipath-application";
import { runComiPathInBrowser } from "./run-comipath-in-browser";

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker
    .register("./catalog-service-worker.js")
    .catch((error: unknown) => {
      console.warn("Catalog Service Worker registration failed.", error);
    });
}

const application = assembleComiPathApplication({
  document,
  window,
});

void runComiPathInBrowser(application, { document, window }).start();
