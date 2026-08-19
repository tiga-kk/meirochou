import { BrowserApplication } from "./browser-application";
import {
  DomXPostPanel,
  DefaultEventDayXPostMonitor,
} from "../features/x-post-monitoring/public-api";
import { BrowserIndexedDbXPostCache } from "../features/x-post-monitoring/infrastructure/browser-indexed-db-x-post-cache";
import { HttpXPostClient } from "../features/x-post-monitoring/infrastructure/http-x-post-client";
import { DeleteLocalDataWithCatalogCleanup } from "./delete-local-data-with-catalog-cleanup";
import { DeleteLocalDataWithXPostCleanup } from "./delete-local-data-with-x-post-cleanup";
import {
  CacheEventDayCatalogsUseCase,
  GetCatalogOfflineStatusUseCase,
  type CatalogOfflineCachePort,
} from "../features/catalog-offline/public-api";
import { BrowserCatalogOfflineCache } from "../features/catalog-offline/infrastructure/browser-catalog-offline-cache";
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
import { DistanceMatrixController } from "../features/route-guidance/infrastructure/distance-matrix-controller";
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
import { PrepareRouteOptimizationUseCase } from "../features/route-guidance/use-cases/prepare-route-optimization";
import type { RouteOptimizationPreview } from "../features/route-guidance/use-cases/route-optimization-preview";
import type { MapBundleManifest } from "../features/event-day/domain/event-day-contracts";
import type { MapBundleManifestV1 } from "../features/event-day/domain/application-contract-types";
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
  readonly catalogOfflineCache?: CatalogOfflineCachePort;
  readonly targetElement?: HTMLElement | Window | Document;
}

export interface AssembledComiPathApplication extends StartableApplication {
  readonly eventDaySelectorController: EventDaySelectorController | null;
  readonly circleDataSourceController: CircleDataSourceController;
  readonly previewCsvImport: PreviewCsvImportUseCase;
  readonly previewGoogleSheetImport: PreviewGoogleSheetImportUseCase;
  readonly applyCircleDataPreview: ApplyCircleDataPreviewUseCase;
  readonly cancelCircleDataPreview: CancelCircleDataPreviewUseCase;
  readonly exportCirclesToCsv: ExportCirclesToCsvUseCase;
  readonly switchEventDay: SwitchEventDayUseCase | null;
  readonly openInitialEventDay: OpenInitialEventDayUseCase;
  readonly routeGuidanceController: RouteGuidanceController;
  readonly routeGuidanceSession: ReturnType<typeof createRouteGuidanceSession>;
  readonly catalogOfflineCache: CatalogOfflineCachePort;
  readonly cacheEventDayCatalogs: CacheEventDayCatalogsUseCase;
  readonly getCatalogOfflineStatus: GetCatalogOfflineStatusUseCase;
  readonly getCurrentCatalogUrls: () => readonly string[];
}

function toDomainMapManifest(manifest: MapBundleManifestV1): MapBundleManifest {
  return {
    schemaVersion: manifest.schemaVersion,
    eventId: manifest.eventId,
    displayName: manifest.displayName,
    bundleVersion: manifest.bundleVersion,
    areas: manifest.areas.map(
      (area): MapBundleManifest["areas"][number] => ({ ...area }),
    ),
  };
}

/** Composition root for the browser runtime and feature infrastructure. */
export function assembleComiPathApplication(
  options: AssembleComiPathApplicationOptions,
): AssembledComiPathApplication {
  let browserRuntime: BrowserApplication | null = null;
  const storage = new StorageService();
  const catalogOfflineCache =
    options.catalogOfflineCache ??
    new BrowserCatalogOfflineCache({
      caches: options.window.caches,
      fetcher: options.window.fetch?.bind(options.window),
      persist: options.window.navigator?.storage?.persist?.bind(
        options.window.navigator.storage,
      ),
    });
  const cacheEventDayCatalogs = new CacheEventDayCatalogsUseCase(
    catalogOfflineCache,
  );
  const getCatalogOfflineStatus = new GetCatalogOfflineStatusUseCase(
    catalogOfflineCache,
  );
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
    onOperationComplete: (operation) =>
      browserRuntime?.handleCircleDataSourceOperationComplete(operation),
  });

  const routeGuidanceSession = createRouteGuidanceSession();
  const routeMapAreaCatalog: MapAreaCatalog = {
    getAllMapAreas: () => runtimeMapAreaCatalog.getAllMapAreas(),
    getMapArea: (areaId) => runtimeMapAreaCatalog.getMapArea(areaId),
    findMapAreaForCircleSpace: (circleSpace) =>
      runtimeMapAreaCatalog.findMapAreaForCircleSpace(circleSpace),
    initializeMapAreas: (areas) =>
      runtimeMapAreaCatalog.initializeMapAreas(
        areas.map((area) => ({
          ...area,
          id: area.id ?? area.areaId,
          name: area.name ?? area.displayName ?? area.areaId,
          prefixes: area.prefixes ?? [],
          labels: area.labels ?? [],
        })),
      ),
    replaceMapAreas: (areas) =>
      runtimeMapAreaCatalog.replaceMapAreas(
        areas.map((area) => ({
          ...area,
          id: area.id ?? area.areaId,
          name: area.name ?? area.displayName ?? area.areaId,
          prefixes: area.prefixes ?? [],
          labels: area.labels ?? [],
        })),
      ),
  };
  const routeMapAssetsLoader = new HttpRouteMapAssetsLoader();
  const snapshotRepository = new LocalStorageRouteGuidanceSnapshotRepository();
  const matrixRepository = new LocalStorageDistanceMatrixRepository();
  const distanceMatrixController = new DistanceMatrixController({
    repository: matrixRepository,
  });
  const orchestrationService = new RouteGuidanceNavigationOperations();
  const navigationRuntimeController = new RouteGuidanceRuntimeController({
    snapshotRepo: snapshotRepository,
    matrixRepo: matrixRepository,
    orchestration: orchestrationService,
    ...(options.createAlnsWorker
      ? { workerFactory: options.createAlnsWorker }
      : {}),
  });
  const optimizationFeedback = {
    onPreview: (preview: RouteOptimizationPreview) =>
      browserRuntime?.ui.showOptimizationPreview(preview),
    onClear: () => browserRuntime?.ui.clearOptimizationPreview(),
  };
  const routeGuidanceController = new RouteGuidanceController({
    startGuidance: new StartRouteGuidanceUseCase(
      routeGuidanceSession,
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      snapshotRepository,
    ),
    resumeGuidance: new ResumeRouteGuidanceUseCase(
      routeGuidanceSession,
      navigationRuntimeController,
      routeMapAssetsLoader,
      routeMapAreaCatalog,
      optimizationFeedback,
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
    navigationOperations: orchestrationService,
    invalidateGuidance: new InvalidateRouteGuidanceUseCase(
      routeGuidanceSession,
    ),
    navigationRuntimeController,
    prepareOptimization: new PrepareRouteOptimizationUseCase(
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      distanceMatrixController,
    ),
    optimizationFeedback,
  });

  const deleteLocalDataUseCase = new DeleteLocalDataUseCase(
    repository,
    {
      deleteActivitySnapshot: (ref) =>
        routeGuidanceController.invalidatePersistence(ref),
      deleteAllRouteData: (ref) =>
        routeGuidanceController.invalidatePersistence(ref, true),
    },
    {
      now: () => new Date().toISOString(),
      createSourceGeneration: () =>
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `gen-${Date.now()}`,
    },
  );
  const deleteLocalData = new DeleteLocalDataWithCatalogCleanup(
    deleteLocalDataUseCase,
    repository,
    catalogOfflineCache,
  );
  const xPostClient = new HttpXPostClient({
    fetcher: options.window.fetch?.bind(options.window),
  });
  const xPostCache = new BrowserIndexedDbXPostCache({
    indexedDB: options.window.indexedDB,
  });
  const deleteLocalDataWithXPostCleanup = new DeleteLocalDataWithXPostCleanup(
    deleteLocalData,
    xPostCache,
  );
  const localDataDeletionController = new LocalDataDeletionController({
    deleteLocalData: deleteLocalDataWithXPostCleanup,
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

  const xPostPanel = new DomXPostPanel({
    document: options.document,
    client: xPostClient,
    cache: xPostCache,
  });
  const saleMentionMonitor = new DefaultEventDayXPostMonitor({
    client: xPostClient,
    cache: xPostCache,
    activeEventDayReader,
    document: options.document,
    onlineTarget: options.window,
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
    xPostPanel,
    saleMentionMonitor,
    xPostCache,
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
      eventRegistry: options.registry,
      eventDayTransition,
      catalogOfflineCache,
      cacheEventDayCatalogs,
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
                      mapBundle: "../maps/demo-v1/manifest.json",
                      mapBundleContract: "legacy" as const,
                      days: [{ dayId: "day1", displayName: "Day 1" }],
                    },
                  ],
                },
                registryUrl: new URL(
                  "/assets/events/manifest.json",
                  options.window.location?.href ?? "http://localhost/",
                ).href,
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
                        mapBundle: "../maps/demo-v1/manifest.json",
                        mapBundleContract: "legacy" as const,
                        days: [{ dayId: "day1", displayName: "Day 1" }],
                      },
                    ],
                  },
                  registryUrl: new URL(
                    "/assets/events/manifest.json",
                    options.window.location?.href ?? "http://localhost/",
                  ).href,
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
              ? toDomainMapManifest(
                  await loadRuntimeMapBundleManifestFromUrl(
                  resolveEventMapManifestUrl(runtimeRegistryUrl, event),
                  event,
                  {
                    fetcher: browserFetcher,
                    signal,
                  },
                ),
                )
              : {
                  schemaVersion: 1,
                  eventId: event.eventId,
                  displayName: event.displayName,
                  areas: [],
                },
          collaborators: {
            beforeSwitch: async () => {
              routeGuidanceController.invalidateActiveOptimization();
            },
            afterSwitch: async (newRef, manifest, state) => {
              runtimeMapAreaCatalog.replaceMapAreas(manifest.areas);
              browserRuntime.currentManifest = manifest;
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
        const startupError = await eventDaySelectorController.start();
        if (startupError) {
          browserRuntime.showStartupError(startupError);
          return undefined;
        }
        await browserRuntime.start();
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

  return {
    start: baseApp.start,
    stop: baseApp.stop,
    get eventDaySelectorController() {
      return eventDaySelectorController;
    },
    circleDataSourceController,
    previewCsvImport,
    previewGoogleSheetImport,
    applyCircleDataPreview,
    cancelCircleDataPreview,
    exportCirclesToCsv,
    get switchEventDay() {
      return switchEventDay;
    },
    openInitialEventDay,
    routeGuidanceController,
    routeGuidanceSession,
    catalogOfflineCache,
    cacheEventDayCatalogs,
    getCatalogOfflineStatus,
    getCurrentCatalogUrls: () => [
      ...new Set(
        activeEventDayReader
          .getAllCircles()
          .map((circle) => circle.tweet)
          .filter(
            (url): url is string =>
              typeof url === "string" && url.trim() !== "",
          ),
      ),
    ],
  };
}
