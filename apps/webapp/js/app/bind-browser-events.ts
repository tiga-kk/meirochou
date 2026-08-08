import { bindCircleStatusEvents } from "./bind-circle-status-events";
import { bindRouteGuidanceEvents } from "./bind-route-guidance-events";
import { bindSettingsShellEvents } from "./bind-settings-shell-events";

type AppEventBindingApplication =
  Parameters<typeof bindRouteGuidanceEvents>[0] &
  Parameters<typeof bindCircleStatusEvents>[0] &
  Parameters<typeof bindSettingsShellEvents>[0];

export interface BindBrowserEventsDependencies {
  readonly application: AppEventBindingApplication;
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
