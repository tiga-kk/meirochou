import { ComiPathBrowserRuntime } from "../comipath-browser-runtime.js";
import { GasPendingUpdateDelivery } from "../features/circle-status/infrastructure/gas-pending-update-delivery";
import { CircleStatusController } from "../features/circle-status/ui/circle-status-controller";
import { PendingGasUpdatesController } from "../features/circle-status/ui/pending-gas-updates-controller";
import { ChangeCircleStatusUseCase } from "../features/circle-status/use-cases/change-circle-status";
import { DiscardPendingGasUpdatesUseCase } from "../features/circle-status/use-cases/discard-pending-gas-updates";
import { DefaultPendingGasUpdateBackgroundProcess } from "../features/circle-status/use-cases/pending-gas-update-background-process";
import { SendPendingGasUpdatesUseCase } from "../features/circle-status/use-cases/send-pending-gas-updates";
import { UndoCircleStatusChangeUseCase } from "../features/circle-status/use-cases/undo-circle-status-change";
import { LocalStorageEventDayRepository } from "../features/event-day/infrastructure/local-storage-event-day-repository";
import {
  createActiveEventDayReader,
  createActiveEventDaySession,
} from "../features/event-day/public-api";
import { StorageService } from "../state/storage-service";
import {
  createComiPathApplication,
  type StartableApplication,
} from "./comipath-application";

export interface AssembleComiPathApplicationOptions {
  readonly document: Document;
  readonly window: Window;
  readonly createAlnsWorker?: () => Worker;
}

/** Composition root for the browser runtime and feature infrastructure. */
export function assembleComiPathApplication(
  options: AssembleComiPathApplicationOptions,
): StartableApplication {
  void options.document;
  void options.window;
  const storage = new StorageService();
  const repository = new LocalStorageEventDayRepository(storage);
  const activeEventDaySession = createActiveEventDaySession();
  const activeEventDayReader = createActiveEventDayReader(
    activeEventDaySession,
  );
  const delivery = new GasPendingUpdateDelivery();
  const sendPendingGasUpdates = new SendPendingGasUpdatesUseCase(
    repository,
    activeEventDaySession,
    delivery,
  );
  const discardPendingGasUpdates = new DiscardPendingGasUpdatesUseCase(
    repository,
    activeEventDaySession,
  );
  const backgroundProcess = new DefaultPendingGasUpdateBackgroundProcess(
    sendPendingGasUpdates,
    options.window,
  );
  const changeCircleStatus = new ChangeCircleStatusUseCase(
    repository,
    activeEventDaySession,
    backgroundProcess,
  );
  const undoCircleStatus = new UndoCircleStatusChangeUseCase(
    repository,
    activeEventDaySession,
  );
  const circleStatusController = new CircleStatusController(
    changeCircleStatus,
    undoCircleStatus,
  );
  const pendingGasUpdatesController = new PendingGasUpdatesController(
    sendPendingGasUpdates,
    discardPendingGasUpdates,
  );

  const browserRuntime = new ComiPathBrowserRuntime({
    alnsWorkerFactory: options.createAlnsWorker,
    dataManagerOptions: {
      storage,
      repository,
      activeEventDaySession,
      activeEventDayReader,
      circleStatusController,
      pendingGasUpdatesController,
      backgroundProcess,
    },
  });
  return createComiPathApplication({
    browserRuntime: {
      start: () => {
        backgroundProcess.start();
        return browserRuntime.start();
      },
      stop: () => {
        backgroundProcess.stop();
        browserRuntime.dispose();
      },
    },
  });
}
