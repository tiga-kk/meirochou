export interface ManagementActionEventApplication {
  handleEventDayOpenRequest(detail: unknown): Promise<void>;
  handleEventDayRefreshRequest(detail: unknown): Promise<void>;
  handleEventDayOfflineRequest(detail: unknown): Promise<void>;
  handleEventDayEditRequest(detail: unknown): Promise<void>;
  handleEventDayDeleteRequest(detail: unknown): Promise<void>;
}

export function bindManagementActionEvents(
  application: ManagementActionEventApplication,
  document: Document,
): () => void {
  const handlers = {
    "event-day-open-request": (detail: unknown) =>
      void application.handleEventDayOpenRequest(detail),
    "event-day-refresh-request": (detail: unknown) =>
      void application.handleEventDayRefreshRequest(detail),
    "event-day-offline-request": (detail: unknown) =>
      void application.handleEventDayOfflineRequest(detail),
    "event-day-edit-request": (detail: unknown) =>
      void application.handleEventDayEditRequest(detail),
    "event-day-delete-request": (detail: unknown) =>
      void application.handleEventDayDeleteRequest(detail),
  } as const;

  const listeners = Object.entries(handlers).map(([type, handler]) => {
    const listener = (event: Event) => handler((event as CustomEvent).detail);
    document.addEventListener(type, listener);
    return [type, listener] as const;
  });
  let stopped = false;

  return () => {
    if (stopped) return;
    stopped = true;
    for (const [type, listener] of listeners) {
      document.removeEventListener(type, listener);
    }
  };
}
