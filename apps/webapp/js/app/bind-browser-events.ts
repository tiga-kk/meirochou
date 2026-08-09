import { bindCircleStatusEvents } from "./bind-circle-status-events";
import { bindRouteGuidanceEvents } from "./bind-route-guidance-events";
import { bindSettingsShellEvents } from "./bind-settings-shell-events";
import type { BrowserApplication } from "./browser-application";

export interface BindBrowserEventsDependencies {
  readonly application: BrowserApplication;
  readonly document: Document;
}

/** Binds only app-owned browser events and returns idempotent cleanup. */
export function bindBrowserEvents(
  dependencies: BindBrowserEventsDependencies,
): { stop(): void } {
  const cleanups = [
    bindRouteGuidanceEvents(
      dependencies.application,
      dependencies.document,
      dependencies.application.ui.els.settingsArea,
    ),
    bindCircleStatusEvents(dependencies.application, dependencies.document),
    bindSettingsShellEvents(
      dependencies.application,
      dependencies.document,
      dependencies.application.ui.els.settingsArea,
    ),
  ];
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}
