import { BrowserApplication } from "./browser-application";
import { createDevDemoData, isDevDemoEnabled } from "../dev-demo-data.js";
import {
  completeCircleVisit,
  type CompleteCircleVisitInput,
} from "./complete-circle-visit";
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
  type EventDayRef,
  type EventDayRepository,
  EventDaySelectorController,
  type EventDaySelectorView,
  type EventRegistry,
  OpenInitialEventDayUseCase,
  SwitchEventDayUseCase,
} from "../features/event-day/public-api";
import { loadRuntimeMapBundleManifestFromUrl, resolveEventMapManifestUrl } from "../features/event-day/infrastructure/http-map-manifest-loader";
import { loadEventRegistryWithUrl } from "../features/event-day/infrastructure/http-event-registry-loader";
import {
  DeleteLocalDataUseCase,
  LocalDataDeletionController,
} from "../features/local-data-deletion/public-api";
import { runtimeMapAreaCatalog } from "../features/route-guidance/infrastructure/runtime-map-area-catalog";
import type { MapAreaCatalog } from "../features/route-guidance/domain/map-area";
import { HttpRouteMapAssetsLoader } from "../features/route-guidance/infrastructure/http-route-map-assets-loader";
import { LocalStorageDistanceMatrixRepository } from "../features/route-guidance/infrastructure/local-storage-distance-matrix-repository";
import { LocalStorageRouteGuidanceSnapshotRepository } from "../features/route-guidance/infrastructure/local-storage-route-guidance-snapshot-repository";
import { RouteGuidanceRuntimeController } from "../features/route-guidance/infrastructure/route-guidance-runtime-controller";
import { RouteGuidanceController } from "../features/route-guidance/ui/route-guidance-controller";
import { ChangeDestinationUseCase } from "../features/route-guidance/use-cases/change-destination";
import { FinishCurrentCircleUseCase } from "../features/route-guidance/use-cases/finish-current-circle";
import { InvalidateRouteGuidanceUseCase } from "../features/route-guidance/use-cases/invalidate-route-guidance";
import { ResumeRouteGuidanceUseCase } from "../features/route-guidance/use-cases/resume-route-guidance";
import { RouteGuidanceNavigationOperations } from "../features/route-guidance/use-cases/route-guidance-navigation-operations";
import { createRouteGuidanceSession } from "../features/route-guidance/use-cases/route-guidance-session";
import { StartRouteGuidanceUseCase } from "../features/route-guidance/use-cases/start-route-guidance";
import type { MapBundleManifest } from "../features/event-day/domain/event-day-contracts";
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
  let browserRuntime: any;
  let currentRouteGuidanceBundleVersion: string | null = null;
  let saveRouteGuidanceControllerSnapshot = (
    _eventDay: EventDayRef,
    _bundleVersion: string,
  ) => {};
  let clearRouteGuidanceControllerSnapshot = (_eventDay: EventDayRef) => {};
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
    {
      targetElement: options.targetElement ?? options.document,
      onRetryRequest: (detail) => browserRuntime?.handleGasRetryRequest(detail),
      onDiscardRequest: (detail) => browserRuntime?.handleGasDiscardRequest(detail),
      onStateChange: () => browserRuntime?.updateManagementModels?.(),
    },
  );

  // Event Day feature assembly
  const openInitialEventDay = new OpenInitialEventDayUseCase(repository);
  let eventDaySelectorController: EventDaySelectorController | null = null;
  let switchEventDay: SwitchEventDayUseCase | null = null;
  const eventDayTransition = {
    execute: (input: EventDayRef) => {
      if (!switchEventDay) throw new Error("Event day transition is not ready");
      return switchEventDay.execute(input);
    },
  };

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

  const routeGuidanceSession = createRouteGuidanceSession();
  const routeMapAreaCatalog =
    runtimeMapAreaCatalog as unknown as MapAreaCatalog;
  const routeMapAssetsLoader = new HttpRouteMapAssetsLoader();
  const snapshotRepository = new LocalStorageRouteGuidanceSnapshotRepository();
  const matrixRepository = new LocalStorageDistanceMatrixRepository();
  const orchestrationService = new RouteGuidanceNavigationOperations();
  const navigationRuntimeController = new RouteGuidanceRuntimeController({
    snapshotRepo: snapshotRepository,
    matrixRepo: matrixRepository,
    orchestration: orchestrationService,
    ...(options.createAlnsWorker
      ? { workerFactory: options.createAlnsWorker }
      : {}),
  });
  const saveRouteGuidanceSnapshot = (eventDay: EventDayRef) => {
    const bundleVersion = currentRouteGuidanceBundleVersion;
    if (!bundleVersion) return;
    try {
      saveRouteGuidanceControllerSnapshot(eventDay, bundleVersion);
    } catch (error) {
      console.warn("Navigation snapshot could not be saved.", error);
    }
  };
  const clearRouteGuidanceSnapshot = (eventDay: EventDayRef) => {
    try {
      clearRouteGuidanceControllerSnapshot(eventDay);
    } catch (error) {
      console.warn("Navigation snapshot could not be cleared.", error);
    }
  };
  const routeGuidanceSnapshotRepository = {
    loadSnapshot: () => null,
    saveSnapshot: (eventDay: EventDayRef) =>
      saveRouteGuidanceSnapshot(eventDay),
    deleteSnapshot: (eventDay: EventDayRef) =>
      clearRouteGuidanceSnapshot(eventDay),
  };
  const routeGuidanceController = new RouteGuidanceController({
    startGuidance: new StartRouteGuidanceUseCase(
      routeGuidanceSession,
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      routeGuidanceSnapshotRepository,
    ),
    resumeGuidance: new ResumeRouteGuidanceUseCase(
      routeGuidanceSession,
      navigationRuntimeController,
      routeMapAssetsLoader,
      routeMapAreaCatalog,
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
  saveRouteGuidanceControllerSnapshot = (eventDay, bundleVersion) =>
    routeGuidanceController.saveSnapshot(eventDay, bundleVersion);
  clearRouteGuidanceControllerSnapshot = (eventDay) =>
    routeGuidanceController.clearSavedSnapshot(eventDay);

  const deleteLocalData = new DeleteLocalDataUseCase(
    repository,
    {
      deleteActivitySnapshot: (ref) => clearRouteGuidanceSnapshot(ref),
      deleteAllRouteData: (ref) => {
        matrixRepository.deleteByEventDay(ref.eventId, ref.dayId);
        clearRouteGuidanceSnapshot(ref);
      },
    },
    {
      now: () => new Date().toISOString(),
      createSourceGeneration: () =>
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `gen-${Date.now()}`,
    },
  );
  const localDataDeletionController = new LocalDataDeletionController({
    deleteLocalData,
    targetElement: options.targetElement ?? options.document,
    onScopeSelect: (detail) =>
      browserRuntime?.handleDeleteOptionSelect(
        detail && typeof detail === "object"
          ? (detail as { scope?: unknown }).scope
          : undefined,
      ),
    onDeleteRequest: (detail) =>
      browserRuntime?.handleStorageDeleteRequest(detail),
    onCancel: () => browserRuntime?.handleDeleteDialogCancel(),
    onStateChange: () => browserRuntime?.updateManagementModels?.(),
  });

  browserRuntime = new BrowserApplication({
    document: options.document,
    window: options.window,
    circleDataSourceSession,
    circleDataSourceController,
    completeCircleVisit: (input: CompleteCircleVisitInput) =>
      completeCircleVisit(
        circleStatusController,
        () => activeEventDayReader.getPendingCircles(),
        (finishInput) =>
          routeGuidanceController.finishCurrentCircle(finishInput),
        input,
      ),
    localDataDeletionController,
    routeGuidanceDependencies: {
      routeGuidanceSession,
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      snapshotRepository,
      matrixRepository,
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
      eventRegistry: options.registry,
      eventDayTransition,
    },
  });

  const baseApp = createComiPathApplication({
    browserRuntime: {
      start: async () => {
        const demoEnabled = isDevDemoEnabled(options.window.location);
        const browserFetcher = options.window.fetch?.bind(options.window);
        const loaded = options.registry
          ? { registry: options.registry, registryUrl: "" }
          : demoEnabled
            ? {
                registry: {
                  schemaVersion: 1 as const,
                  events: [
                    {
                      eventId: "demo-v1",
                      displayName: "Demo Event",
                      mapBundle: "demo",
                      days: [{ dayId: "day1", displayName: "Day 1" }],
                    },
                  ],
                },
                registryUrl: "",
              }
            : browserFetcher
              ? await loadEventRegistryWithUrl(undefined, browserFetcher)
              : {
                  registry: {
                    schemaVersion: 1 as const,
                    events: [
                      {
                        eventId: "demo-v1",
                        displayName: "Demo Event",
                        mapBundle: "demo",
                        days: [{ dayId: "day1", displayName: "Day 1" }],
                      },
                    ],
                  },
                  registryUrl: "",
                };
        browserRuntime.eventRegistry = loaded.registry;
        browserRuntime.eventRegistryUrl = loaded.registryUrl;

        if (demoEnabled) {
          const demoData = createDevDemoData();
          const purchased = new Set<string>(demoData.purchasedList);
          const held = new Set<string>(demoData.holdList);
          const circleStates: Record<string, "purchased" | "held"> = {};
          for (const circle of demoData.wantToBuy) {
            if (purchased.has(circle.space)) circleStates[circle.space] = "purchased";
            else if (held.has(circle.space)) circleStates[circle.space] = "held";
          }
          const now = new Date().toISOString();
          repository.save(
            { eventId: "demo-v1", dayId: "day1" },
            {
              schemaVersion: 2,
              source: { type: "csv", fileName: "demo-ui.csv" },
              sourceGeneration: "demo-ui",
              circles: demoData.wantToBuy,
              circleStates,
              gasOutbox: [],
              timestamps: { createdAt: now, updatedAt: now, sourceUpdatedAt: now },
            },
          );
        }

        const runtimeRegistry = loaded.registry;
        const runtimeRegistryUrl = loaded.registryUrl;
        switchEventDay = new SwitchEventDayUseCase({
          repository,
          registry: runtimeRegistry,
          activeEventDaySession,
          currentManifest: null,
          loadManifest: async (event, signal) =>
            runtimeRegistryUrl
              ? ((await loadRuntimeMapBundleManifestFromUrl(
                  resolveEventMapManifestUrl(runtimeRegistryUrl, event),
                  event.eventId,
                  {
                    fetcher: browserFetcher,
                    signal,
                  },
                )) as unknown as MapBundleManifest)
              : {
                  schemaVersion: 1,
                  eventId: event.eventId,
                  displayName: event.displayName,
                  areas: [],
                },
          collaborators: {
            afterSwitch: async (newRef, manifest, state) => {
              runtimeMapAreaCatalog.replaceMapAreas(manifest.areas);
              browserRuntime.currentManifest = manifest;
              currentRouteGuidanceBundleVersion = manifest.bundleVersion ?? null;
              activeEventDaySession.setActiveEventDay(newRef, state);
            },
          },
        });
        eventDaySelectorController = new EventDaySelectorController({
          switchEventDay,
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
        await browserRuntime.start();
        currentRouteGuidanceBundleVersion =
          browserRuntime.currentManifest?.bundleVersion ?? null;
        circleDataSourceController.start();
        return undefined;
      },
      stop: () => {
        eventDaySelectorController?.stop();
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
    routeGuidanceController,
    routeGuidanceSession,
  }) as unknown as StartableApplication & Record<string, unknown>;
}
