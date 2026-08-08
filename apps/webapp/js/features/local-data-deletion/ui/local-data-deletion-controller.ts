import type { EventDayRef } from "../../event-day/public-api";
import type { LocalDataDeletionScope } from "../domain/local-data-deletion-types";
import type { DeleteLocalDataOperation } from "../use-cases/delete-local-data";

export interface LocalDataDeletionControllerDependencies {
  readonly deleteLocalData: DeleteLocalDataOperation;
  readonly targetElement?: EventTarget;
  readonly onScopeSelect?: (detail: unknown) => void;
  readonly onDeleteRequest?: (detail: unknown) => void | Promise<void>;
  readonly onCancel?: () => void;
}

function parseRef(value: unknown): EventDayRef | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const ref = value as Record<string, unknown>;
  if (
    typeof ref.eventId !== "string" ||
    ref.eventId.trim() === "" ||
    typeof ref.dayId !== "string" ||
    ref.dayId.trim() === ""
  ) {
    return null;
  }
  return { eventId: ref.eventId, dayId: ref.dayId };
}

function parseScope(value: unknown): LocalDataDeletionScope | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const input = value as Record<string, unknown>;
  if (input.kind === "all-event-days") return { kind: input.kind };
  if (input.type === "all-events") return { kind: "all-event-days" };
  if (
    input.type === "circles" ||
    input.type === "activity" ||
    input.type === "event-day"
  ) {
    const eventDay = parseRef(input.ref);
    if (!eventDay) return null;
    return {
      kind: input.type === "circles" ? "circle-source" : input.type,
      eventDay,
    };
  }
  if (
    input.kind !== "circle-source" &&
    input.kind !== "activity" &&
    input.kind !== "event-day"
  ) {
    return null;
  }
  const eventDay = parseRef(input.eventDay);
  return eventDay ? { kind: input.kind, eventDay } : null;
}

export class LocalDataDeletionController {
  private selectedScope: LocalDataDeletionScope | null = null;
  private stopped = false;
  private eventCleanup: (() => void) | null = null;

  constructor(
    private readonly dependencies: LocalDataDeletionControllerDependencies,
  ) {}

  start(): void {
    this.stop();
    this.stopped = false;
    const { targetElement, onScopeSelect, onDeleteRequest, onCancel } =
      this.dependencies;
    if (!targetElement || !onScopeSelect || !onDeleteRequest || !onCancel) return;
    const select = (event: Event) => onScopeSelect((event as CustomEvent).detail);
    const request = (event: Event) =>
      void onDeleteRequest((event as CustomEvent).detail);
    const cancel = () => onCancel();
    targetElement.addEventListener("delete-option-select", select);
    targetElement.addEventListener("storage-delete-request", request);
    targetElement.addEventListener("storage-delete-cancel", cancel);
    this.eventCleanup = () => {
      targetElement.removeEventListener("delete-option-select", select);
      targetElement.removeEventListener("storage-delete-request", request);
      targetElement.removeEventListener("storage-delete-cancel", cancel);
      this.eventCleanup = null;
    };
  }

  selectDeletionScope(detail: unknown): void {
    if (!this.stopped) this.selectedScope = parseScope(detail);
  }

  getSelectedScope(): LocalDataDeletionScope | null {
    return this.selectedScope
      ? { ...this.selectedScope, ...(this.selectedScope.kind === "all-event-days" ? {} : { eventDay: { ...this.selectedScope.eventDay } }) }
      : null;
  }

  async confirmDeletion(detail: unknown): Promise<void> {
    if (this.stopped) return;
    const scope = parseScope(detail) ?? this.selectedScope;
    if (!scope) throw new Error("Invalid deletion scope");
    await this.dependencies.deleteLocalData.execute(scope);
    this.selectedScope = null;
  }

  cancelDeletion(): void {
    this.selectedScope = null;
  }

  stop(): void {
    this.eventCleanup?.();
    this.stopped = true;
    this.selectedScope = null;
  }
}
