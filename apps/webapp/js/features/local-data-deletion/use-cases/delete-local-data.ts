import type {
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../../event-day/public-api";
import type { LocalDataDeletionScope } from "../domain/local-data-deletion-types";

export interface RouteGuidanceStorageCleanup {
  deleteActivitySnapshot(eventDay: EventDayRef): void;
  deleteAllRouteData(eventDay: EventDayRef): void;
}

export interface DeleteLocalDataOptions {
  readonly now?: () => string;
  readonly createSourceGeneration?: () => string;
}

export interface DeleteLocalDataOperation {
  execute(scope: LocalDataDeletionScope): Promise<void>;
}

function emptySourceState(
  state: LocalEventDayState,
  now: string,
  sourceGeneration: string,
): LocalEventDayState {
  return {
    ...state,
    source: { type: "csv", fileName: "empty.csv" },
    sourceGeneration,
    circles: [],
    gasOutbox: [],
    timestamps: {
      ...state.timestamps,
      updatedAt: now,
      sourceUpdatedAt: now,
    },
  };
}

export class DeleteLocalDataUseCase implements DeleteLocalDataOperation {
  private readonly now: () => string;
  private readonly createSourceGeneration: () => string;

  constructor(
    private readonly repository: EventDayRepository,
    private readonly routeGuidanceCleanup: RouteGuidanceStorageCleanup,
    options: DeleteLocalDataOptions = {},
  ) {
    let generation = 0;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createSourceGeneration =
      options.createSourceGeneration ??
      (() => `deletion-${Date.now()}-${++generation}`);
  }

  async execute(scope: LocalDataDeletionScope): Promise<void> {
    switch (scope.kind) {
      case "activity":
        this.deleteActivity(scope.eventDay);
        return;
      case "circle-source":
        this.deleteCircleSource(scope.eventDay);
        return;
      case "event-day":
        this.deleteEventDay(scope.eventDay);
        return;
      case "all-event-days":
        this.deleteAllEventDays();
        return;
      default:
        throw new Error("Unsupported deletion scope");
    }
  }

  private deleteActivity(ref: EventDayRef): void {
    const state = this.requireState(ref);
    this.repository.save(ref, {
      ...state,
      circleStates: {},
      gasOutbox: [],
      timestamps: { ...state.timestamps, updatedAt: this.now() },
    });
    // Activity reset removes the route snapshot but deliberately keeps matrices.
    this.routeGuidanceCleanup.deleteActivitySnapshot(ref);
  }

  private deleteCircleSource(ref: EventDayRef): void {
    const state = this.requireState(ref);
    this.repository.save(
      ref,
      emptySourceState(state, this.now(), this.createSourceGeneration()),
    );
    this.routeGuidanceCleanup.deleteAllRouteData(ref);
  }

  private deleteEventDay(ref: EventDayRef): void {
    this.requireState(ref);
    this.repository.deleteEventDay(ref);
    this.routeGuidanceCleanup.deleteAllRouteData(ref);
  }

  private deleteAllEventDays(): void {
    const entries = this.repository.listEventDaysForDeletion();
    this.repository.deleteAllEventDays(
      entries.map(({ ref, state }) => ({
        ref,
        sourceGeneration: state.sourceGeneration,
      })),
    );
    for (const { ref } of entries) {
      this.routeGuidanceCleanup.deleteAllRouteData(ref);
    }
  }

  private requireState(ref: EventDayRef): LocalEventDayState {
    const state = this.repository.load(ref);
    if (!state) throw new Error("Event/day state not found");
    return state;
  }
}
