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
import { StorageService } from "../../apps/webapp/js/state/storage-service";

interface BrowserEventBindingFixtureOptions {
  readonly repository?: EventDayRepository;
  readonly activeEventDaySession?: ActiveEventDaySession;
  readonly activeEventDayReader?: ActiveEventDayReader;
  readonly circleStatusController?: CircleStatusController;
  readonly pendingGasUpdatesController?: PendingGasUpdatesController;
  readonly backgroundProcess?: PendingGasUpdateBackgroundProcess;
}

/** Supplies non-Route-Guidance dependencies that production assembles outside the binder. */
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

  return {
    circleDataSourceSession: createCircleDataSourceSession(),
    circleDataSourceController: { cancelPreview() {} },
    localDataDeletionUseCase: new DeleteLocalDataUseCase(repository, {
      deleteActivitySnapshot() {},
      deleteAllRouteData() {},
    }),
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
