import type { EventDayRepository } from "../features/event-day/use-cases/event-day-repository";
import type { DistanceMatrixRepository } from "../routing/distance-matrix";
import type { EventDayRef, LocalEventDayState } from "../types/domain";
import type { DeleteScope } from "../ui/management-view-model";
import type { NavigationSnapshotRepository } from "./navigation-snapshot-repository";
import type { SourceSettingsService } from "./source-settings-service";

export interface StorageDeletionResult {
  readonly deletedRefs: readonly EventDayRef[];
  readonly activeRefDeleted: boolean;
}

export class StorageDeletionService {
  constructor(
    private readonly repository: EventDayRepository,
    private readonly sourceSettings: SourceSettingsService,
    private readonly createSourceGeneration: () => string,
    private readonly matrixRepository?: DistanceMatrixRepository | null,
    private readonly snapshotRepository?: NavigationSnapshotRepository | null,
  ) {}

  delete(scope: DeleteScope, now: string): StorageDeletionResult {
    switch (scope.type) {
      case "circles":
        return this.deleteCircles(scope.ref, now);
      case "activity":
        return this.deleteActivity(scope.ref, now);
      case "event-day":
        return this.deleteEventDay(scope.ref);
      case "all-events":
        return this.deleteAllEvents();
      default:
        throw new Error("Unsupported delete scope");
    }
  }

  private deleteCircles(ref: EventDayRef, now: string): StorageDeletionResult {
    const current = this.sourceSettings.assertCanMutate(ref, "circles-delete");
    const nextState: LocalEventDayState = {
      ...current,
      source: { type: "csv", fileName: "empty.csv" },
      sourceGeneration: this.createSourceGeneration(),
      circles: [],
      timestamps: {
        ...current.timestamps,
        updatedAt: now,
        sourceUpdatedAt: now,
      },
    };

    this.sourceSettings.saveGuarded({
      ref,
      operation: "circles-delete",
      expectedSourceGeneration: current.sourceGeneration,
      nextState,
    });

    // Circle identity changed, so the endpoint matrix and recovery snapshot
    // cannot be reused safely.
    this.matrixRepository?.deleteByEventDay(ref.eventId, ref.dayId);
    this.snapshotRepository?.clear(ref.eventId, ref.dayId);

    return Object.freeze({
      deletedRefs: Object.freeze([]),
      activeRefDeleted: false,
    });
  }

  private deleteActivity(ref: EventDayRef, now: string): StorageDeletionResult {
    const current = this.sourceSettings.assertCanMutate(ref, "activity-delete");
    const nextState: LocalEventDayState = {
      ...current,
      circleStates: {},
      timestamps: {
        ...current.timestamps,
        updatedAt: now,
      },
    };

    this.sourceSettings.saveGuarded({
      ref,
      operation: "activity-delete",
      expectedSourceGeneration: current.sourceGeneration,
      nextState,
    });

    // Clear navigation snapshot but KEEP distance matrix
    if (this.snapshotRepository) {
      this.snapshotRepository.clear(ref.eventId, ref.dayId);
    }

    return Object.freeze({
      deletedRefs: Object.freeze([]),
      activeRefDeleted: false,
    });
  }

  private deleteEventDay(ref: EventDayRef): StorageDeletionResult {
    const current = this.sourceSettings.assertCanMutate(
      ref,
      "event-day-delete",
    );
    this.sourceSettings.deleteEventDay(ref, current.sourceGeneration);

    // Delete distance matrices and navigation snapshot for this event-day
    if (this.matrixRepository) {
      this.matrixRepository.deleteByEventDay(ref.eventId, ref.dayId);
    }
    if (this.snapshotRepository) {
      this.snapshotRepository.clear(ref.eventId, ref.dayId);
    }

    return Object.freeze({
      deletedRefs: Object.freeze([{ eventId: ref.eventId, dayId: ref.dayId }]),
      activeRefDeleted: true,
    });
  }

  private deleteAllEvents(): StorageDeletionResult {
    const currentList = this.repository.listEventDaysForDeletion();

    for (const item of currentList) {
      this.sourceSettings.assertCanMutate(item.ref, "event-day-delete");
    }

    const expected = currentList.map((item) =>
      Object.freeze({
        ref: { eventId: item.ref.eventId, dayId: item.ref.dayId },
        sourceGeneration: item.state.sourceGeneration,
      }),
    );

    this.repository.deleteAllEventDays(expected);

    for (const item of expected) {
      if (this.matrixRepository) {
        this.matrixRepository.deleteByEventDay(
          item.ref.eventId,
          item.ref.dayId,
        );
      }
      if (this.snapshotRepository) {
        this.snapshotRepository.clear(item.ref.eventId, item.ref.dayId);
      }
    }

    const deletedRefs = Object.freeze(
      expected.map((e) =>
        Object.freeze({ eventId: e.ref.eventId, dayId: e.ref.dayId }),
      ),
    );

    return Object.freeze({
      deletedRefs,
      activeRefDeleted: true,
    });
  }
}
