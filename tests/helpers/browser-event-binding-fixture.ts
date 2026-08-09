import { GasPendingUpdateDelivery } from "../../apps/webapp/js/features/circle-status/infrastructure/gas-pending-update-delivery";
import { CircleStatusController } from "../../apps/webapp/js/features/circle-status/ui/circle-status-controller";
import { PendingGasUpdatesController } from "../../apps/webapp/js/features/circle-status/ui/pending-gas-updates-controller";
import { ChangeCircleStatusUseCase } from "../../apps/webapp/js/features/circle-status/use-cases/change-circle-status";
import { DiscardPendingGasUpdatesUseCase } from "../../apps/webapp/js/features/circle-status/use-cases/discard-pending-gas-updates";
import {
  DefaultPendingGasUpdateBackgroundProcess,
  type PendingGasUpdateBackgroundProcess,
} from "../../apps/webapp/js/features/circle-status/use-cases/pending-gas-update-background-process";
import { SendPendingGasUpdatesUseCase } from "../../apps/webapp/js/features/circle-status/use-cases/send-pending-gas-updates";
import { UndoCircleStatusChangeUseCase } from "../../apps/webapp/js/features/circle-status/use-cases/undo-circle-status-change";
import { createCircleDataSourceSession } from "../../apps/webapp/js/features/circle-data-source/public-api";
import {
  createActiveEventDayReader,
  createActiveEventDaySession,
  type ActiveEventDayReader,
  type ActiveEventDaySession,
  type EventDayRepository,
} from "../../apps/webapp/js/features/event-day/public-api";
import type { SwitchEventDayOperation } from "../../apps/webapp/js/features/event-day/use-cases/switch-event-day";
import { LocalStorageEventDayRepository } from "../../apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository";
import {
  DeleteLocalDataUseCase,
  LocalDataDeletionController,
} from "../../apps/webapp/js/features/local-data-deletion/public-api";
import { HttpRouteMapAssetsLoader } from "../../apps/webapp/js/features/route-guidance/infrastructure/http-route-map-assets-loader";
import { LocalStorageDistanceMatrixRepository } from "../../apps/webapp/js/features/route-guidance/infrastructure/local-storage-distance-matrix-repository";
import { LocalStorageRouteGuidanceSnapshotRepository } from "../../apps/webapp/js/features/route-guidance/infrastructure/local-storage-route-guidance-snapshot-repository";
import { RouteGuidanceRuntimeController } from "../../apps/webapp/js/features/route-guidance/infrastructure/route-guidance-runtime-controller";
import { runtimeMapAreaCatalog } from "../../apps/webapp/js/features/route-guidance/infrastructure/runtime-map-area-catalog";
import { RouteGuidanceController } from "../../apps/webapp/js/features/route-guidance/ui/route-guidance-controller";
import { ChangeDestinationUseCase } from "../../apps/webapp/js/features/route-guidance/use-cases/change-destination";
import { FinishCurrentCircleUseCase } from "../../apps/webapp/js/features/route-guidance/use-cases/finish-current-circle";
import { InvalidateRouteGuidanceUseCase } from "../../apps/webapp/js/features/route-guidance/use-cases/invalidate-route-guidance";
import { ResumeRouteGuidanceUseCase } from "../../apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance";
import { RouteGuidanceNavigationOperations } from "../../apps/webapp/js/features/route-guidance/use-cases/route-guidance-navigation-operations";
import { createRouteGuidanceSession } from "../../apps/webapp/js/features/route-guidance/use-cases/route-guidance-session";
import { StartRouteGuidanceUseCase } from "../../apps/webapp/js/features/route-guidance/use-cases/start-route-guidance";
import { StorageService } from "../../apps/webapp/js/state/storage-service";
import {
  completeCircleVisit,
  type CompleteCircleVisitInput,
  type CompleteCircleVisitResult,
} from "../../apps/webapp/js/app/complete-circle-visit";

interface BrowserApplicationFixtureOptions {
  readonly repository?: EventDayRepository;
  readonly activeEventDaySession?: ActiveEventDaySession;
  readonly activeEventDayReader?: ActiveEventDayReader;
  readonly circleStatusController?: CircleStatusController;
  readonly pendingGasUpdatesController?: PendingGasUpdatesController;
  readonly backgroundProcess?: PendingGasUpdateBackgroundProcess;
  readonly completeCircleVisit?: (
    input: CompleteCircleVisitInput,
  ) => Promise<CompleteCircleVisitResult>;
  readonly eventDayTransition?: SwitchEventDayOperation;
}

/** Supplies the explicitly assembled dependencies required by the browser binder. */
export function createBrowserApplicationOptions(
  options: BrowserApplicationFixtureOptions = {},
) {
  const repository =
    options.repository ?? new LocalStorageEventDayRepository(new StorageService());
  const activeEventDaySession =
    options.activeEventDaySession ?? createActiveEventDaySession();
  const activeEventDayReader =
    options.activeEventDayReader ??
    createActiveEventDayReader(activeEventDaySession);
  const sendPendingGasUpdates = new SendPendingGasUpdatesUseCase(
    repository,
    activeEventDaySession,
    new GasPendingUpdateDelivery(),
  );
  const backgroundProcess =
    options.backgroundProcess ??
    new DefaultPendingGasUpdateBackgroundProcess(sendPendingGasUpdates);
  const circleStatusController =
    options.circleStatusController ??
    new CircleStatusController(
      new ChangeCircleStatusUseCase(
        repository,
        activeEventDaySession,
        backgroundProcess,
      ),
      new UndoCircleStatusChangeUseCase(repository, activeEventDaySession),
    );
  const pendingGasUpdatesController =
    options.pendingGasUpdatesController ??
    new PendingGasUpdatesController(
      sendPendingGasUpdates,
      new DiscardPendingGasUpdatesUseCase(repository, activeEventDaySession),
      {
        targetElement: document,
        onRetryRequest() {},
        onDiscardRequest() {},
      },
    );
  const circleDataSourceSession = createCircleDataSourceSession();
  const routeGuidanceSession = createRouteGuidanceSession();
  const routeMapAreaCatalog = runtimeMapAreaCatalog;
  const routeMapAssetsLoader = new HttpRouteMapAssetsLoader();
  const snapshotRepository = new LocalStorageRouteGuidanceSnapshotRepository();
  const matrixRepository = new LocalStorageDistanceMatrixRepository();
  const orchestrationService = new RouteGuidanceNavigationOperations();
  const navigationRuntimeController = new RouteGuidanceRuntimeController({
    snapshotRepo: snapshotRepository,
    matrixRepo: matrixRepository,
    orchestration: orchestrationService,
  });
  const routeGuidanceController = new RouteGuidanceController({
    startGuidance: new StartRouteGuidanceUseCase(
      routeGuidanceSession,
      runtimeMapAreaCatalog,
      routeMapAssetsLoader,
      snapshotRepository,
    ),
    resumeGuidance: new ResumeRouteGuidanceUseCase(
      routeGuidanceSession,
      navigationRuntimeController,
      routeMapAssetsLoader,
      runtimeMapAreaCatalog,
    ),
    changeDestination: new ChangeDestinationUseCase(
      routeGuidanceSession,
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      orchestrationService,
    ),
    finishCircle: new FinishCurrentCircleUseCase(
      routeGuidanceSession,
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      orchestrationService,
    ),
    session: routeGuidanceSession,
    invalidateGuidance: new InvalidateRouteGuidanceUseCase(
      routeGuidanceSession,
    ),
    navigationRuntimeController,
  });
  const completeCircleVisitOperation =
    options.completeCircleVisit ??
    ((input: CompleteCircleVisitInput) =>
      completeCircleVisit(
        circleStatusController,
        () => activeEventDayReader.getPendingCircles(),
        (finishInput) =>
          routeGuidanceController.finishCurrentCircle(finishInput),
        input,
      ));
  const eventDayTransition =
    options.eventDayTransition ?? {
      execute: async (ref: EventDayRef) => {
        const state =
          repository.load(ref) ??
          {
            schemaVersion: 2,
            source: { type: "csv", fileName: "empty.csv" },
            sourceGeneration: "fixture",
            circles: [],
            circleStates: {},
            gasOutbox: [],
            timestamps: {
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
            },
          };
        repository.saveAndRememberLastOpened(ref, state);
        activeEventDaySession.setActiveEventDay(ref, state);
      },
    } satisfies SwitchEventDayOperation;

  return {
    document,
    window,
    circleDataSourceSession,
    circleDataSourceController: {
      start() {},
      cancelCurrentRequest() {
        circleDataSourceSession.setBusy(false);
      },
      cancelPreview() {
        circleDataSourceSession.setPreview(null);
      },
    },
    completeCircleVisit: completeCircleVisitOperation,
    localDataDeletionController: new LocalDataDeletionController({
      deleteLocalData: new DeleteLocalDataUseCase(repository, {
        deleteActivitySnapshot() {},
        deleteAllRouteData() {},
      }),
      targetElement: document,
      onScopeSelect() {},
      onDeleteRequest() {},
      onCancel() {},
    }),
    routeGuidanceDependencies: {
      routeGuidanceSession,
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      navigationRuntimeController,
      routeGuidanceController,
    },
      eventDayDependencies: {
      repository,
      activeEventDaySession,
      activeEventDayReader,
      circleStatusController,
      pendingGasUpdatesController,
        backgroundProcess,
        eventDayTransition,
      loadEventRegistry: async () => {
        throw new Error("Event registry is not configured for this test");
      },
    },
  };
}
