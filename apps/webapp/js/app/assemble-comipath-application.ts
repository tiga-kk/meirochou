import { ComiPathBrowserRuntime } from "../comipath-browser-runtime.js";
import { BrowserCircleCsvDownloader } from "../features/circle-data-source/infrastructure/browser-circle-csv-downloader";
import { GasGoogleSheetCircleClient } from "../features/circle-data-source/infrastructure/gas-google-sheet-circle-client";
import {
  ApplyCircleDataPreviewUseCase,
  CancelCircleDataPreviewUseCase,
  type CircleCsvDownloader,
  CircleDataSourceController,
  type CircleDataSourceView,
  createCircleDataSourceSession,
  DomCircleDataSourceView,
  ExportCirclesToCsvUseCase,
  type GoogleSheetCircleClient,
  PreviewCsvImportUseCase,
  PreviewGoogleSheetImportUseCase,
  type RouteGuidanceInvalidation,
} from "../features/circle-data-source/public-api";
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
  DomEventDaySelectorView,
  type EventDayRepository,
  EventDaySelectorController,
  type EventDaySelectorView,
  type EventRegistry,
  OpenInitialEventDayUseCase,
  SwitchEventDayUseCase,
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
  readonly repository?: EventDayRepository;
  readonly eventDayView?: EventDaySelectorView;
  readonly circleDataSourceView?: CircleDataSourceView;
  readonly routeGuidanceInvalidation?: RouteGuidanceInvalidation;
  readonly registry?: EventRegistry;
  readonly googleSheetClient?: GoogleSheetCircleClient;
  readonly csvDownloader?: CircleCsvDownloader;
  readonly targetElement?: HTMLElement | Window | Document;
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
    {
      afterSwitch: async (newRef) => {
        const state = repository.load(newRef);
        if (state) {
          activeEventDaySession.setActiveEventDay(newRef, state);
        }
      },
    },
    options.registry ?? undefined,
  );
  const openInitialEventDay = new OpenInitialEventDayUseCase(repository);
  let eventDaySelectorController = new EventDaySelectorController({
    switchEventDay,
    openInitialEventDay,
    registry: options.registry,
    view:
      options.eventDayView ??
      new DomEventDaySelectorView(
        typeof options.document.querySelector === "function"
          ? options.document.querySelector("event-day-selector")
          : null,
      ),
    repository,
    activeEventDaySession,
    targetElement: options.targetElement ?? options.document,
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
    options.csvDownloader ??
    new BrowserCircleCsvDownloader(
      options.window as Window & typeof globalThis,
    );
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
    view:
      options.circleDataSourceView ??
      new DomCircleDataSourceView(
        typeof options.document.getElementById === "function"
          ? options.document.getElementById("source-diff-dialog")
          : null,
      ),
    previewCsvImport,
    previewGoogleSheetImport,
    applyCircleDataPreview,
    cancelCircleDataPreview,
    exportCirclesToCsv,
    routeGuidanceInvalidation,
    activeEventDaySession,
    targetElement: options.targetElement ?? options.document,
    diffDialogElement:
      typeof options.document.getElementById === "function"
        ? (options.document.getElementById("source-diff-dialog") ?? undefined)
        : undefined,
  });

  const browserRuntime = new ComiPathBrowserRuntime({
    alnsWorkerFactory: options.createAlnsWorker,
    circleDataSourceSession,
    circleDataSourceController,
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
        if (options.registry) await eventDaySelectorController.start();
        await browserRuntime.start();
        if (!options.registry) {
          const runtimeRegistry = browserRuntime.dm?.eventRegistry;
          if (runtimeRegistry) {
            eventDaySelectorController = new EventDaySelectorController({
              switchEventDay: browserRuntime.dm.getTransitionService(
                browserRuntime.currentManifest,
              ),
              openInitialEventDay,
              registry: runtimeRegistry,
              view:
                options.eventDayView ??
                new DomEventDaySelectorView(
                  typeof options.document.querySelector === "function"
                    ? options.document.querySelector("event-day-selector")
                    : null,
                ),
              repository,
              activeEventDaySession,
              targetElement: options.targetElement ?? options.document,
            });
            await eventDaySelectorController.start();
          }
        }
        circleDataSourceController.start();
        return undefined;
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
    routeGuidanceController: browserRuntime.routeGuidanceController,
    routeGuidanceSession: browserRuntime.routeGuidanceSession,
  }) as unknown as StartableApplication & Record<string, unknown>;
}
