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
import { LocalStorageEventDayRepository } from "../../apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository";
import { DeleteLocalDataUseCase } from "../../apps/webapp/js/features/local-data-deletion/public-api";
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
import type {
  NavigationSnapshot,
  RouteGuidanceSnapshotRepository,
} from "../../apps/webapp/js/features/route-guidance/use-cases/route-guidance-snapshot-repository";
import { StartRouteGuidanceUseCase } from "../../apps/webapp/js/features/route-guidance/use-cases/start-route-guidance";
import { StorageService } from "../../apps/webapp/js/state/storage-service";

interface BrowserEventBindingFixtureOptions {
  readonly repository?: EventDayRepository;
  readonly activeEventDaySession?: ActiveEventDaySession;
  readonly activeEventDayReader?: ActiveEventDayReader;
  readonly circleStatusController?: CircleStatusController;
  readonly pendingGasUpdatesController?: PendingGasUpdatesController;
  readonly backgroundProcess?: PendingGasUpdateBackgroundProcess;
}

/** Supplies the explicitly assembled dependencies required by the browser binder. */
export function createBrowserEventBindingOptions(
  options: BrowserEventBindingFixtureOptions = {},
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
    );
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
  const routeGuidanceSnapshots = new Map<string, NavigationSnapshot>();
  const routeGuidanceSnapshotRepository: RouteGuidanceSnapshotRepository = {
    loadSnapshot: ({ eventId, dayId }) =>
      routeGuidanceSnapshots.get(JSON.stringify([eventId, dayId])) ?? null,
    saveSnapshot: ({ eventId, dayId }, snapshot) => {
      routeGuidanceSnapshots.set(JSON.stringify([eventId, dayId]), snapshot);
    },
    deleteSnapshot: ({ eventId, dayId }) => {
      routeGuidanceSnapshots.delete(JSON.stringify([eventId, dayId]));
    },
  };
  const routeGuidanceController = new RouteGuidanceController({
    startGuidance: new StartRouteGuidanceUseCase(
      routeGuidanceSession,
      runtimeMapAreaCatalog,
      routeMapAssetsLoader,
      routeGuidanceSnapshotRepository,
    ),
    resumeGuidance: new ResumeRouteGuidanceUseCase(
      routeGuidanceSession,
      routeGuidanceSnapshotRepository,
      routeMapAssetsLoader,
      runtimeMapAreaCatalog,
    ),
    changeDestination: new ChangeDestinationUseCase(routeGuidanceSession),
    finishCircle: new FinishCurrentCircleUseCase(routeGuidanceSession),
    session: routeGuidanceSession,
    invalidateGuidance: new InvalidateRouteGuidanceUseCase(
      routeGuidanceSession,
    ),
  });

  return {
    circleDataSourceSession: createCircleDataSourceSession(),
    circleDataSourceController: { cancelPreview() {} },
    localDataDeletionUseCase: new DeleteLocalDataUseCase(repository, {
      deleteActivitySnapshot() {},
      deleteAllRouteData() {},
    }),
    routeGuidanceDependencies: {
      routeGuidanceSession,
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      snapshotRepository,
      matrixRepository,
      orchestrationService,
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
      loadEventRegistry: async () => {
        throw new Error("Event registry is not configured for this test");
      },
    },
  };
}
