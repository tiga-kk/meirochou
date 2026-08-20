import type {
  EventDayRef,
  EventRegistry,
  LocalEventDayState,
} from "../features/event-day/public-api";
import type { LocalDataDeletionScope } from "../features/local-data-deletion/public-api";
import type { EventDayManagementRow } from "../shared/ui/event-day-management-view-model";
import {
  buildDeleteOptions,
  buildEventDayOptions,
  buildOutboxPanelModel,
  buildSourceManagerPanelModel,
  buildStorageDeleteDialogModel,
  type SourceManagerPanelModelInput,
} from "../shared/ui/management-view-model";
import type { DeleteScope } from "../shared/ui/management-events";

export interface BrowserManagementProjectionInput {
  readonly registry: EventRegistry;
  readonly states: readonly {
    readonly ref: EventDayRef;
    readonly state: LocalEventDayState;
  }[];
  readonly activeRef: EventDayRef | null;
  readonly activeState: LocalEventDayState | null;
  readonly sourceDraft: SourceManagerPanelModelInput["sourceDraft"];
  readonly transitionBusy: boolean;
  readonly sourceErrorMessage: string;
  readonly pendingGasState: {
    readonly busy: boolean;
    readonly resultMessage: string;
    readonly errorMessage: string;
  };
  readonly deletionState: {
    readonly selectedScope: LocalDataDeletionScope | null;
    readonly busy: boolean;
    readonly errorMessage: string;
  };
  readonly eventDayCount: number;
  readonly managementRows: readonly EventDayManagementRow[];
}

export interface BrowserManagementProjection {
  readonly eventDayOptions: ReturnType<typeof buildEventDayOptions>;
  readonly eventDayManagementRows: readonly EventDayManagementRow[];
  readonly selectedEventId: string;
  readonly selectedDayId: string;
  readonly sourceManagerModel: ReturnType<typeof buildSourceManagerPanelModel>;
  readonly outboxPanelModel: ReturnType<typeof buildOutboxPanelModel>;
  readonly deleteOptions: ReturnType<typeof buildDeleteOptions>;
  readonly deleteDialogModel: ReturnType<typeof buildStorageDeleteDialogModel>;
}

function toDeleteScope(scope: LocalDataDeletionScope | null): DeleteScope | null {
  if (!scope) return null;
  if (scope.kind === "all-event-days") return { type: "all-events" };
  return {
    type: scope.kind === "circle-source" ? "circles" : scope.kind,
    ref: { ...scope.eventDay },
  } as DeleteScope;
}

export function buildBrowserManagementProjection(
  input: BrowserManagementProjectionInput,
): BrowserManagementProjection {
  const eventDayOptions = buildEventDayOptions(
    input.registry,
    input.states,
    input.activeRef,
  );
  const event = input.activeRef
    ? input.registry.events.find(
        (candidate) => candidate.eventId === input.activeRef?.eventId,
      )
    : null;
  const activeRefLabel = input.activeRef
    ? `${event?.displayName || input.activeRef.eventId} ${input.activeRef.dayId}`
    : "";

  const sourceManagerModel = buildSourceManagerPanelModel({
    activeRef: input.activeRef,
    activeRefLabel,
    activeState: input.activeState,
    sourceDraft: input.sourceDraft,
    transitionBusy: input.transitionBusy,
    sourceErrorMessage: input.sourceErrorMessage,
  });

  const outboxPanelModel = buildOutboxPanelModel(
    input.registry,
    input.states,
    {
      processing: input.pendingGasState.busy,
      resultMessage: input.pendingGasState.resultMessage,
      errorMessage: input.pendingGasState.errorMessage,
    },
  );

  const selectedPendingCount = input.activeState?.gasOutbox.length ?? 0;
  const totalPendingCount = input.states.reduce(
    (sum, item) => sum + item.state.gasOutbox.length,
    0,
  );
  const deleteOptions = input.activeRef
    ? buildDeleteOptions({
        selected: input.activeRef,
        eventDayCount: input.eventDayCount,
        activeCircleCount: input.activeState?.circles.length ?? 0,
        activityCount: input.activeState
          ? Object.keys(input.activeState.circleStates).length
          : 0,
        selectedPendingCount,
        totalPendingCount,
      })
    : [];

  const deleteDialogModel = buildStorageDeleteDialogModel({
    selectedScope: toDeleteScope(input.deletionState.selectedScope),
    deleteOptions,
    eventDayLabel: activeRefLabel,
    busy: input.deletionState.busy,
    errorMessage: input.deletionState.errorMessage,
  });

  return {
    eventDayOptions,
    eventDayManagementRows: input.managementRows,
    selectedEventId: input.activeRef?.eventId ?? "",
    selectedDayId: input.activeRef?.dayId ?? "",
    sourceManagerModel,
    outboxPanelModel,
    deleteOptions,
    deleteDialogModel,
  };
}
