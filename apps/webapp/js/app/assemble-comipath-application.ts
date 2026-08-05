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
  EventDaySelectorController,
  OpenInitialEventDayUseCase,
  SwitchEventDayUseCase,
  type EventDayRepository,
  type EventDaySelectorView,
  type EventRegistry,
} from "../features/event-day/public-api";
import {
  ApplyCircleDataPreviewUseCase,
  CancelCircleDataPreviewUseCase,
  CircleDataSourceController,
  createCircleDataSourceSession,
  ExportCirclesToCsvUseCase,
  PreviewCsvImportUseCase,
  PreviewGoogleSheetImportUseCase,
  type CircleCsvDownloader,
  type CircleDataSourceView,
  type GoogleSheetCircleClient,
  type RouteGuidanceInvalidation,
} from "../features/circle-data-source/public-api";
import { GasGoogleSheetCircleClient } from "../features/circle-data-source/infrastructure/gas-google-sheet-circle-client";
import { BrowserCircleCsvDownloader } from "../features/circle-data-source/infrastructure/browser-circle-csv-downloader";
import { StorageService } from "../state/storage-service";
import {
  createComiPathApplication,
  type StartableApplication,
} from "./comipath-application";

export interface AssembleComiPathApplicationOptions {
  readonly document: Document;
  readonly window: Window;
  readonly createAlnsWorker?: () => Worker;
  readonly repository?: EventDayRepository;
  readonly eventDayView?: EventDaySelectorView;
  readonly circleDataSourceView?: CircleDataSourceView;
  readonly routeGuidanceInvalidation?: RouteGuidanceInvalidation;
  readonly registry?: EventRegistry;
  readonly googleSheetClient?: GoogleSheetCircleClient;
  readonly csvDownloader?: CircleCsvDownloader;
}

/** Composition root for the browser runtime and feature infrastructure. */
export function assembleComiPathApplication(
  options: AssembleComiPathApplicationOptions,
): StartableApplication & Record<string, unknown> {
  const storage = new StorageService();
  const repository =
    options.repository ?? new LocalStorageEventDayRepository(storage);
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

  // Event Day feature assembly
  const switchEventDay = new SwitchEventDayUseCase(
    repository,
    options.registry ?? undefined,
  );
  const openInitialEventDay = new OpenInitialEventDayUseCase(repository);
  const eventDaySelectorController = new EventDaySelectorController({
    switchEventDay,
    openInitialEventDay,
    registry: options.registry,
    view: options.eventDayView,
    repository,
  });

  // Route Guidance invalidation fallback if not provided
  const routeGuidanceInvalidation: RouteGuidanceInvalidation =
    options.routeGuidanceInvalidation ?? {
      invalidateAfterCircleSourceChange: () => {},
    };

  // Circle Data Source feature assembly
  const googleSheetClient =
    options.googleSheetClient ?? new GasGoogleSheetCircleClient();
  const csvDownloader =
    options.csvDownloader ?? new BrowserCircleCircleCsvDownloaderAdapter(options.window);
  const circleDataSourceSession = createCircleDataSourceSession();

  const previewCsvImport = new PreviewCsvImportUseCase(repository);
  const previewGoogleSheetImport = new PreviewGoogleSheetImportUseCase(
    repository,
    googleSheetClient,
  );
  const applyCircleDataPreview = new ApplyCircleDataPreviewUseCase(
    repository,
    activeEventDaySession,
    routeGuidanceInvalidation,
  );
  const cancelCircleDataPreview = new CancelCircleDataPreviewUseCase();
  const exportCirclesToCsv = new ExportCirclesToCsvUseCase(
    repository,
    csvDownloader,
  );

  const circleDataSourceController = new CircleDataSourceController({
    client: googleSheetClient,
    session: circleDataSourceSession,
    view: options.circleDataSourceView,
    previewCsvImport,
    previewGoogleSheetImport,
    applyCircleDataPreview,
    cancelCircleDataPreview,
    exportCirclesToCsv,
    routeGuidanceInvalidation,
  });

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

  const baseApp = createComiPathApplication({
    browserRuntime: {
      start: async () => {
        backgroundProcess.start();
        await eventDaySelectorController.start();
        return browserRuntime.start();
      },
      stop: () => {
        backgroundProcess.stop();
        eventDaySelectorController.stop();
        circleDataSourceController.stop();
        browserRuntime.dispose();
      },
    },
  });

  return Object.assign(baseApp, {
    eventDaySelectorController,
    circleDataSourceController,
    previewCsvImport,
    previewGoogleSheetImport,
    applyCircleDataPreview,
    cancelCircleDataPreview,
    exportCirclesToCsv,
    switchEventDay,
    openInitialEventDay,
  }) as unknown as StartableApplication & Record<string, unknown>;
}

class BrowserCircleCircleCsvDownloaderAdapter implements CircleCsvDownloader {
  private readonly inner: BrowserCircleCsvDownloader;
  constructor(windowObj: Window) {
    this.inner = new BrowserCircleCsvDownloader(windowObj as Window & typeof globalThis);
  }
  downloadCirclesAsCsv(
    filename: string,
    circles: readonly any[],
    purchasedSpaces: ReadonlySet<string>,
  ): void {
    this.inner.downloadCirclesAsCsv(filename, circles, purchasedSpaces);
  }
}
