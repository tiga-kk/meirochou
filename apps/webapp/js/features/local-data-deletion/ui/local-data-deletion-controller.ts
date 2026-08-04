import type { EventDayRef } from "../../event-day/public-api";
import type { LocalDataDeletionScope } from "../domain/local-data-deletion-types";
import type { DeleteLocalDataOperation } from "../use-cases/delete-local-data";

export interface LocalDataDeletionControllerDependencies {
  readonly deleteLocalData: DeleteLocalDataOperation;
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

  constructor(
    private readonly dependencies: LocalDataDeletionControllerDependencies,
  ) {}

  selectDeletionScope(detail: unknown): void {
    if (!this.stopped) this.selectedScope = parseScope(detail);
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
    this.stopped = true;
    this.selectedScope = null;
  }
}
