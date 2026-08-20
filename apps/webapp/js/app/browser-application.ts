import "../components/comipath-settings";
import "../components/navigation-resume-dialog";
import "../components/source-diff-dialog";
import "../components/user-guide-dialog";
import "../components/async-operation-indicator";
import type { AsyncOperationStatus } from "../components/async-operation-indicator";
import {
  DomRouteGuidanceView,
  buildRouteItineraryModel,
  normalizeRouteMotionPreference,
  type RouteMotionPreference,
} from "../features/route-guidance/public-api";
import { DomNearbyMapView } from "../features/route-guidance/public-api";
import { isDevDemoEnabled } from "../dev-demo-data.js";
import {
  parseSpace,
} from "../features/route-guidance/public-api";
import { buildSpaceFromLocation } from "../features/route-guidance/public-api";
import {
  orderDevDemoCandidates,
  planDevDemoRoute,
  rankDevDemoCandidates,
  type DevDemoRouteOptions,
} from "../dev-demo-route-guidance.js";
import type { MapBundleManifest } from "../features/event-day/public-api";
import type {
  ActiveEventDayReader,
  ActiveEventDaySession,
  Circle,
  EventDayRef,
  EventDayRepository,
  EventRegistry,
  LocalEventDayState,
} from "../features/event-day/public-api";
import type {
  PendingGasUpdateBackgroundProcess,
  PendingGasUpdateRetryOptions,
  GalleryScope,
} from "../features/circle-status/public-api";
import type { CircleStatusControllerPort as CircleStatusController } from "../features/circle-status/public-api";
import type {
  CircleDataSourceOperation,
  CircleDataSourceSession,
  CircleDataSourceController,
} from "../features/circle-data-source/public-api";
import type { LocalDataDeletionController } from "../features/local-data-deletion/public-api";
import {
  CacheEventDayCatalogsUseCase,
  catalogUrlsFromCircles,
  type CatalogOfflineCachePort,
} from "../features/catalog-offline/public-api";
import type { MapArea, MapAreaCatalog, RouteMapAssetsLoader, RouteGuidanceController } from "../features/route-guidance/public-api";
import type {
  RouteGuidanceSession,
  RouteGuidanceSessionSnapshot,
  RouteGuidanceRuntimePort,
  GridMeta,
  PointsPayload,
  RouteItineraryEntry,
} from "../features/route-guidance/public-api";
import type { SwitchEventDayOperation } from "../features/event-day/public-api";
import type { LocalDataDeletionScope } from "../features/local-data-deletion/public-api";
import type { CompleteCircleVisitInput, CompleteCircleVisitResult } from "./complete-circle-visit";
import type { DeleteScope, ManagementEventDetailMap } from "../shared/ui/management-events";
import type { RouteResult } from "../features/route-guidance/public-api";
import type { CircleStatusUndoToken } from "../features/circle-status/public-api";
import type {
  EventDayXPostMonitor,
  SaleMentionReader,
  XPostPanel,
  XPostCache,
} from "../features/x-post-monitoring/public-api";
import type { SpaceArea } from "../shared/domain/space-parser";
import type { SourceDiffViewModel } from "../shared/ui/management-view-model";
import {
  buildDeleteOptions,
  buildEventDayOptions,
  buildOutboxPanelModel,
  buildSourceManagerPanelModel,
  buildStorageDeleteDialogModel,
} from "../shared/ui/management-view-model";
import {
  buildEventDayManagementRows,
  type EventDayManagementRow,
} from "../shared/ui/event-day-management-view-model";
import { bindBrowserEvents } from "./bind-browser-events";
import {
  collectCirclePriorities,
  filterCirclesByPriority,
} from "../shared/domain/circle-priority-filter";
import {
  readRouteMotionPreference,
  writeRouteMotionPreference,
} from "../data/local-state-adapters";

/** Validates an event/day reference at the browser event boundary. */
function isEventDayRef(value: unknown): value is EventDayRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as Partial<EventDayRef>;
  return Boolean(
    typeof ref.eventId === "string" &&
      ref.eventId.length > 0 &&
      typeof ref.dayId === "string" &&
      ref.dayId.length > 0,
  );
}

function isDeleteScope(value: unknown): value is DeleteScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as { type?: string; ref?: unknown };
  if (scope.type === "all-events") return true;
  return (
    (scope.type === "circles" ||
      scope.type === "activity" ||
      scope.type === "event-day") &&
    isEventDayRef(scope.ref)
  );
}

function sameEventDayRef(left: EventDayRef | null, right: EventDayRef | null) {
  return Boolean(
    left &&
      right &&
      left.eventId === right.eventId &&
      left.dayId === right.dayId,
  );
}

function toDeleteScope(scope: LocalDataDeletionScope | null): DeleteScope | null {
  if (!scope) return null;
  if (scope.kind === "all-event-days") {
    return { type: "all-events" };
  }
  return {
    type: scope.kind === "circle-source" ? "circles" : scope.kind,
    ref: { ...scope.eventDay },
  } as DeleteScope;
}

type BrowserElement = HTMLElement & {
  open?: boolean;
  errorMessage?: string;
  targetSpace?: string;
  model?: object;
  entries?: readonly RouteItineraryEntry[];
  value?: string;
};
type BrowserInputElement = BrowserElement & { value: string };

interface BrowserElements {
  readonly settingsArea: (BrowserElement & {
    deleteOptions?: readonly { scope: DeleteScope; blocked: boolean }[];
  }) | null;
  readonly targetSection: HTMLElement;
  readonly targetEmpty: HTMLElement;
}

type BrowserUi = Omit<DomRouteGuidanceView, "toggleSettings"> & {
  els: BrowserElements;
  statsRenderer: {
    setOnHoldListReset(callback: (() => void) | null): void;
  } | null;
  toggleSettings(target: Element | null): void;
  showUndoSnackbar(space: string): void;
};

interface LatestPurchaseUndo {
  readonly space: string;
  readonly currentLocationSpace: string | null;
  readonly token: CircleStatusUndoToken;
  readonly routeSnapshot: RouteGuidanceSessionSnapshot;
}

function getBrowserElement<T extends BrowserElement>(document: Document, id: string): T | null {
  return document.getElementById(id) as T | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderMapBootstrapError(targetDocument: Document, error: unknown): void {
  const page = targetDocument.createElement("main");
  page.className = "map-bootstrap-error";
  page.setAttribute("role", "alert");
  page.dataset.mapBootstrapError = "true";
  const title = targetDocument.createElement("h1");
  title.textContent = "地図設定を読み込めませんでした";
  const guidance = targetDocument.createElement("p");
  guidance.textContent =
    "地図バンドルの配置と manifest.json を確認してから再読み込みしてください。";
  const detail = targetDocument.createElement("pre");
  detail.textContent = errorMessage(error);
  page.append(title, guidance, detail);
  targetDocument.body.replaceChildren(page);
}

function toSpaceAreas(mapAreaCatalog: MapAreaCatalog): readonly SpaceArea[] {
  return mapAreaCatalog
    .getAllMapAreas()
    .filter(
      (area): area is MapArea & { name: string; labels: readonly string[] } =>
        typeof area.name === "string" && Array.isArray(area.labels),
    )
    .map((area) => ({
      name: area.name,
      prefixes: area.prefixes,
      labels: area.labels,
    }));
}

function pointMatchesSpace(
  point: PointsPayload["points"][number],
  space: string,
  identifier: string,
  number: number,
): boolean {
  const legacySpace = (point as typeof point & { space?: string }).space;
  return (
    legacySpace === space ||
    (point.identifier === identifier && Number(point.number) === number)
  );
}

function findAreaForSpace(space: string, mapAreaCatalog: MapAreaCatalog): MapArea | null {
  if (!space || typeof space !== "string") return null;

  const cleanedSpace = space.trim();
  if (cleanedSpace.length < 2) return null;

  const prefixChar = cleanedSpace[0];
  const labelChar = cleanedSpace[1];

  return (
    mapAreaCatalog
      .getAllMapAreas()
      .find(
        (area: MapArea) =>
          (area.prefixes ?? []).includes(prefixChar) &&
          (area.labels ?? []).includes(labelChar),
      ) || null
  );
}

function areSpacesInSameArea(spaceA: string, spaceB: string, mapAreaCatalog: MapAreaCatalog) {
  const areaA = findAreaForSpace(spaceA, mapAreaCatalog);
  const areaB = findAreaForSpace(spaceB, mapAreaCatalog);
  return Boolean(areaA && areaB && areaA.id === areaB.id);
}

interface BrowserApplicationOptions {
  readonly document?: Document;
  readonly window?: Window;
  readonly eventDayDependencies: {
    readonly repository: EventDayRepository;
    readonly activeEventDaySession: ActiveEventDaySession;
    readonly activeEventDayReader: ActiveEventDayReader;
    readonly circleStatusController: CircleStatusController;
    readonly pendingGasUpdatesController: PendingGasUpdatesControllerPort;
    readonly backgroundProcess: PendingGasUpdateBackgroundProcess;
    readonly eventDayTransition: SwitchEventDayOperation;
    readonly eventRegistry?: EventRegistry;
    readonly eventRegistryUrl?: string;
    readonly catalogOfflineCache?: CatalogOfflineCachePort;
    readonly cacheEventDayCatalogs?: CacheEventDayCatalogsUseCase;
  };
  readonly routeGuidanceDependencies: {
    readonly routeGuidanceSession: RouteGuidanceSession;
    readonly routeMapAreaCatalog: MapAreaCatalog;
    readonly routeMapAssetsLoader: RouteMapAssetsLoader;
    readonly navigationRuntimeController: RouteGuidanceRuntimePort;
    readonly routeGuidanceController: RouteGuidanceController;
  };
  readonly circleDataSourceSession: CircleDataSourceSession;
  readonly circleDataSourceController: CircleDataSourceController;
  readonly completeCircleVisit: (input: CompleteCircleVisitInput) => Promise<CompleteCircleVisitResult>;
  readonly localDataDeletionController: LocalDataDeletionController;
  readonly xPostPanel?: XPostPanel;
  readonly saleMentionMonitor?: EventDayXPostMonitor;
  readonly xPostCache?: XPostCache;
}

interface PendingGasUpdatesControllerPort {
  getViewState(): {
    readonly busy: boolean;
    readonly resultMessage: string;
    readonly errorMessage: string;
  };
  invalidateRequests(): void;
  start(): void;
  stop(): void;
  retryAll(
    eventDay?: EventDayRef,
    options?: PendingGasUpdateRetryOptions,
  ): Promise<number | null>;
  discardOne(eventDay: EventDayRef, updateId: string): void;
}

/**
 * アプリケーションのメインコントローラー
 */
export class BrowserApplication {
  started: boolean;
  stopped: boolean;
  document: Document;
  window: Window;
  eventDayRepository: EventDayRepository;
  activeEventDaySession: ActiveEventDaySession;
  activeEventDayReader: ActiveEventDayReader;
  backgroundProcess: PendingGasUpdateBackgroundProcess;
  circleStatusController: CircleStatusController;
  pendingGasUpdatesController: PendingGasUpdatesControllerPort;
  eventDayTransition: SwitchEventDayOperation;
  catalogOfflineCache: CatalogOfflineCachePort;
  cacheEventDayCatalogs: CacheEventDayCatalogsUseCase;
  completeCircleVisit: (input: CompleteCircleVisitInput) => Promise<CompleteCircleVisitResult>;
  localDataDeletionController: LocalDataDeletionController;
  xPostPanel: XPostPanel | null;
  saleMentionMonitor: EventDayXPostMonitor | null;
  xPostCache: XPostCache | null;
  saleMentionReader: SaleMentionReader | null;
  spreadsheetTitle: string;
  routeGuidanceSession: RouteGuidanceSession;
  routeMapAreaCatalog: MapAreaCatalog;
  routeMapAssetsLoader: RouteMapAssetsLoader;
  navigationRuntimeController: RouteGuidanceRuntimePort;
  routeGuidanceController: RouteGuidanceController;
  latestPurchaseUndo: LatestPurchaseUndo | null;
  circleDataSourceSession: CircleDataSourceSession;
  session: CircleDataSourceSession;
  circleDataSourceController: CircleDataSourceController;
  ui: BrowserUi;
  nearbyMapView: DomNearbyMapView;
  currentStartSpace: string;
  routePriorityFilter: number[] | null;
  routeMotionPreference: RouteMotionPreference;
  itineraryOpen: boolean;
  selectionMessage: string;
  transitionToken: number;
  isTransitioning: boolean;
  sourceErrorMessage: string;
  suppressSessionModelUpdates: boolean;
  ownedTimers: Set<ReturnType<typeof setTimeout>>;
  ownedTimerCancels: Map<ReturnType<typeof setTimeout>, () => void>;
  downloadAdapter: {
    createObjectURL(blob: Blob): string;
    revokeObjectURL(url: string): void;
    click(url: string, filename: string): void;
  };
  eventBindingCleanup: (() => void) | null;
  eventRegistry: EventRegistry | null = null;
  eventRegistryUrl: string | null = null;
  currentManifest: MapBundleManifest | null = null;
  asyncOperationIndicator: { status: AsyncOperationStatus } | null = null;
  managementRows: readonly EventDayManagementRow[] = [];
  private managementUpdateToken = 0;
  private saleMentionUnsubscribe: (() => void) | null = null;
  private saleMentionEventDayKey: string | null = null;
  private saleMentionToastSignature: string | null = null;
  private saleMentionTargetSpace: string | null = null;

  constructor(options?: BrowserApplicationOptions) {
    this.started = false;
    this.stopped = false;
    this.document = options?.document ?? globalThis.document;
    this.window = options?.window ?? globalThis.window;
    const eventDayDependencies = options?.eventDayDependencies;
    const routeGuidanceDependencies = options?.routeGuidanceDependencies;
    if (
      !options ||
      !eventDayDependencies ||
      !eventDayDependencies.repository ||
      !eventDayDependencies.activeEventDaySession ||
      !eventDayDependencies.activeEventDayReader ||
      !eventDayDependencies.circleStatusController ||
      !eventDayDependencies.pendingGasUpdatesController ||
      !eventDayDependencies.backgroundProcess ||
      !eventDayDependencies.eventDayTransition ||
      !options?.circleDataSourceSession ||
      !options?.circleDataSourceController ||
      !options?.completeCircleVisit ||
      !options?.localDataDeletionController ||
      !routeGuidanceDependencies ||
      !routeGuidanceDependencies.routeGuidanceSession ||
      !routeGuidanceDependencies.routeMapAreaCatalog ||
      !routeGuidanceDependencies.routeMapAssetsLoader ||
      !routeGuidanceDependencies.navigationRuntimeController ||
      !routeGuidanceDependencies.routeGuidanceController
    ) {
      throw new Error("BrowserApplication requires assembled dependencies");
    }
    this.eventDayRepository = eventDayDependencies.repository;
    this.activeEventDaySession = eventDayDependencies.activeEventDaySession;
    this.activeEventDayReader = eventDayDependencies.activeEventDayReader;
    this.backgroundProcess = eventDayDependencies.backgroundProcess;
    this.circleStatusController = eventDayDependencies.circleStatusController;
    this.pendingGasUpdatesController =
      eventDayDependencies.pendingGasUpdatesController;
    this.eventDayTransition = eventDayDependencies.eventDayTransition;
    this.catalogOfflineCache =
      eventDayDependencies.catalogOfflineCache ?? {
        getStatus: async () => ({ cached: 0, total: 0 }),
        cacheAll: async () => ({ cached: [], failed: [] }),
        remove: async () => {},
      };
    this.cacheEventDayCatalogs =
      eventDayDependencies.cacheEventDayCatalogs ??
      new CacheEventDayCatalogsUseCase(this.catalogOfflineCache);
    this.completeCircleVisit = options.completeCircleVisit;
    this.eventRegistry = eventDayDependencies.eventRegistry ?? null;
    this.eventRegistryUrl = eventDayDependencies.eventRegistryUrl ?? null;
    this.managementRows = [];
    this.localDataDeletionController = options.localDataDeletionController;
    this.xPostPanel = options.xPostPanel ?? null;
    this.saleMentionMonitor = options.saleMentionMonitor ?? null;
    this.xPostCache = options.xPostCache ?? null;
    this.saleMentionReader = this.saleMentionMonitor;
    this.spreadsheetTitle = "";
    this.routeGuidanceSession = routeGuidanceDependencies.routeGuidanceSession;
    this.routeMapAreaCatalog = routeGuidanceDependencies.routeMapAreaCatalog;
    this.routeMapAssetsLoader = routeGuidanceDependencies.routeMapAssetsLoader;
    this.navigationRuntimeController =
      routeGuidanceDependencies.navigationRuntimeController;
    this.routeGuidanceController = routeGuidanceDependencies.routeGuidanceController;
    this.latestPurchaseUndo = null;
    const baseSession = options.circleDataSourceSession;
    this.circleDataSourceSession = baseSession;
    this.session = baseSession;
    this.circleDataSourceController = options.circleDataSourceController;
    this.asyncOperationIndicator = this.document.getElementById(
      "async-operation-indicator",
    ) as { status: AsyncOperationStatus } | null;
    this.ui = new DomRouteGuidanceView(
      this.routeMapAreaCatalog,
      this.routeMapAssetsLoader as any,
    ) as BrowserUi;
    this.nearbyMapView = new DomNearbyMapView(
      this.routeMapAreaCatalog,
      this.routeMapAssetsLoader,
      this.activeEventDayReader,
      () => this.readCurrentSpace(),
      (circle, opener) => this.ui.showPdfModal(circle, { returnFocus: opener }),
      (circle) => this.handleSetNextTarget(circle),
    );
    this.saleMentionUnsubscribe = this.saleMentionReader?.subscribe(() => {
      this.applySaleMentionState(this.routeGuidanceSession.getSnapshot().currentDestination);
    }) ?? null;
    this.activeEventDaySession.subscribe(() => {
      if (this.ui) {
        this.updateManagementModels();
        this.ui.updateCounts?.(this);
        this.renderRoutePriorityFilter();
        this.syncSaleMentionMonitor();
      }
    });
    baseSession.subscribe((snapshot) => {
      this.renderAsyncOperationStatus(snapshot);
      if (this.ui && !this.suppressSessionModelUpdates)
        this.updateManagementModels();
    });
    this.currentStartSpace = "";
    this.routePriorityFilter = null;
    this.routeMotionPreference = readRouteMotionPreference();
    this.itineraryOpen = false;
    this.selectionMessage = "";
    this.currentManifest = null;
    this.transitionToken = 0;
    this.isTransitioning = false;
    this.sourceErrorMessage = "";
    this.suppressSessionModelUpdates = false;
    this.ownedTimers = new Set();
    this.ownedTimerCancels = new Map();
    this.downloadAdapter = {
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
      click: (url, filename) => {
        const anchor = this.document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = "none";
        this.document.body.appendChild(anchor);
        anchor.click();
        this.document.body.removeChild(anchor);
      },
    };
    this.eventBindingCleanup = null;

  }

  handleCircleDataSourceOperationComplete(
    operation: Exclude<CircleDataSourceOperation, "idle">,
  ): void {
    const labels = {
      "gas-sheet-list": "シート一覧を読み込みました",
      "gas-preview": "GASデータを読み込みました",
      "csv-preview": "CSVを読み込みました",
      "apply-preview": "データを保存しました",
    } as const;
    if (this.asyncOperationIndicator) {
      this.asyncOperationIndicator.status = { kind: "success", label: labels[operation] };
    }
  }

  private renderAsyncOperationStatus(snapshot: ReturnType<CircleDataSourceSession["getSnapshot"]>): void {
    const labels = {
      "gas-sheet-list": "シート一覧を取得中…",
      "gas-preview": "GASからデータを読み込み中…",
      "csv-preview": "CSVを読み込み中…",
      "apply-preview": "読み込み結果を保存中…",
    } as const;
    const status: AsyncOperationStatus = snapshot.busy
      ? { kind: "loading", label: labels[snapshot.operation as keyof typeof labels] }
      : snapshot.errorCode
        ? { kind: "error", label: "読み込みに失敗しました" }
        : { kind: "idle" };
    if (this.asyncOperationIndicator) this.asyncOperationIndicator.status = status;
  }

  showToast(message: string, type?: string) {
    this.ui?.showToast?.(message, type);
  }

  getSpreadsheetTitle() {
    return this.spreadsheetTitle || "";
  }

  toggleSettings(target: Element | null) {
    if (this.ui.els.settingsArea?.open) this.closeSettings();
    this.ui.toggleSettings(target ?? null);
  }

  closeSettings() {
    this.clearActivePreviewIfAny();
    this.circleDataSourceController.cancelCurrentRequest();
    this.pendingGasUpdatesController.invalidateRequests?.();
    this.localDataDeletionController.invalidateRequests?.();
    this.localDataDeletionController.cancelDeletion();
    this.sourceErrorMessage = "";
    this.ui.setSettingsError("");
    this.updateManagementModels();
  }

  showGallery(scope: GalleryScope) {
    this.ui.showGallery(scope);
  }

  showGalleryForArea(areaId: string) {
    this.showGallery({ kind: "area", areaId });
  }

  private getSourceManager(): {
    requestCsvFileSelection?: () => void;
    focusSourceEditor?: () => void;
  } | null {
    return this.document.querySelector("source-manager") as {
      requestCsvFileSelection?: () => void;
      focusSourceEditor?: () => void;
    } | null;
  }

  private openManagementDetail(ref?: EventDayRef): void {
    const settings = this.document.getElementById("settings-area") as
      | (BrowserElement & { openDetail?: (ref?: EventDayRef) => void })
      | null;
    settings?.openDetail?.(ref);
  }

  private async openEventDayForManagement(ref: EventDayRef): Promise<void> {
    await this.eventDayTransition.execute(ref);
  }

  async handleEventDayOpenRequest(detail: unknown): Promise<void> {
    if (!isEventDayRef((detail as { ref?: unknown })?.ref)) return;
    try {
      await this.openEventDayForManagement((detail as { ref: EventDayRef }).ref);
      if (this.ui.els.settingsArea?.open) {
        this.toggleSettings(this.document.getElementById("toggle-settings"));
      }
      this.ui.showToast("日程を開きました");
    } catch {
      this.ui.showToast("日程を開けませんでした", "error");
    }
  }

  async handleEventDayRefreshRequest(detail: unknown): Promise<void> {
    const ref = (detail as { ref?: unknown })?.ref;
    if (!isEventDayRef(ref)) return;
    try {
      await this.openEventDayForManagement(ref);
      const state = this.eventDayRepository.load(ref);
      if (!state) return;
      if (state.source.type === "gas") {
        this.openManagementDetail(ref);
        await this.circleDataSourceController.refreshSavedGasSource(ref, state.source);
      } else {
        this.ui.showSettings();
        this.openManagementDetail(ref);
        this.getSourceManager()?.requestCsvFileSelection?.();
      }
    } catch {
      this.ui.showToast("再読込を開始できませんでした", "error");
    }
  }

  async handleEventDayOfflineRequest(detail: unknown): Promise<void> {
    const ref = (detail as { ref?: unknown })?.ref;
    if (!isEventDayRef(ref)) return;
    try {
      await this.openEventDayForManagement(ref);
      const state = this.eventDayRepository.load(ref);
      if (!state) return;
      const urls = catalogUrlsFromCircles(state.circles);
      if (this.asyncOperationIndicator) {
        this.asyncOperationIndicator.status = {
          kind: "loading",
          label: `お品書きを保存中… 0 / ${urls.length}`,
        };
      }
      const result = await this.cacheEventDayCatalogs.execute({
        urls,
        onProgress: ({ current, total }) => {
          if (!this.asyncOperationIndicator) return;
          this.asyncOperationIndicator.status = {
            kind: "loading",
            label: `お品書きを保存中… ${current} / ${total}`,
          };
        },
      });
      const suffix = result.failedCount > 0 ? `、${result.failedCount}件失敗` : "";
      if (this.asyncOperationIndicator) {
        this.asyncOperationIndicator.status = {
          kind: "success",
          label: `お品書き ${result.cachedCount} / ${result.totalCount} 保存済み${suffix}`,
        };
      }
      this.updateManagementModels();
    } catch (error) {
      if (this.asyncOperationIndicator) {
        this.asyncOperationIndicator.status = {
          kind: "error",
          label: "お品書き保存に失敗しました",
        };
      }
      this.ui.showToast("オフライン準備に失敗しました", "error");
      console.warn("Catalog offline preparation failed.", error);
    }
  }

  async handleEventDayEditRequest(detail: unknown): Promise<void> {
    const ref = (detail as { ref?: unknown })?.ref;
    if (!isEventDayRef(ref)) return;
    try {
      await this.openEventDayForManagement(ref);
      this.ui.showSettings();
      this.openManagementDetail(ref);
      this.getSourceManager()?.focusSourceEditor?.();
    } catch {
      this.ui.showToast("編集画面を開けませんでした", "error");
    }
  }

  async handleEventDayDeleteRequest(detail: unknown): Promise<void> {
    const ref = (detail as { ref?: unknown })?.ref;
    if (!isEventDayRef(ref)) return;
    try {
      await this.openEventDayForManagement(ref);
      this.ui.showSettings();
      this.openManagementDetail(ref);
      this.handleDeleteOptionSelect({ type: "event-day", ref });
    } catch {
      this.ui.showToast("削除確認を開けませんでした", "error");
    }
  }

  handleOptimizationTimeLimitChange(detail: unknown) {
    const searchTimeLimitMs =
      typeof detail === "object" && detail !== null &&
      "searchTimeLimitMs" in detail
        ? (detail as { readonly searchTimeLimitMs?: unknown }).searchTimeLimitMs
        : undefined;
    const value = Number(searchTimeLimitMs);
    if (value !== 5000 && value !== 10000 && value !== 15000) return;
    this.routeGuidanceController.setOptimizationTimeLimit(value);
    if (this.routeGuidanceSession.getSnapshot().navigationState) {
      this.saveNavigationSnapshot();
    }
  }

  handleRouteMotionPreferenceChange(detail: unknown): void {
    const value =
      typeof detail === "object" && detail !== null && "preference" in detail
        ? (detail as { readonly preference?: unknown }).preference
        : undefined;
    this.routeMotionPreference = normalizeRouteMotionPreference(value);
    writeRouteMotionPreference(this.routeMotionPreference);
    this.ui.setRouteMotionPreference(this.routeMotionPreference);
    this.ui.updateSettingsState({
      routeMotionPreference: this.routeMotionPreference,
    });
  }

  scheduleTimeout(callback: () => void, delay: number, onCancel?: () => void) {
    const timer = setTimeout(() => {
      this.ownedTimers.delete(timer);
      this.ownedTimerCancels.delete(timer);
      if (!this.stopped) callback();
    }, delay);
    this.ownedTimers.add(timer);
    if (onCancel) this.ownedTimerCancels.set(timer, onCancel);
    return timer;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    try {
      await this.init(this.currentManifest);
    } catch (error) {
      this.started = false;
      throw error;
    }
  }

  get activeRef() {
    return this.activeEventDaySession.getActiveEventDay()?.ref ?? null;
  }

  get activeState() {
    return this.activeEventDaySession.getActiveEventDay()?.state ?? null;
  }

  get wantToBuy() {
    return [...this.activeEventDayReader.getAllCircles()];
  }

  get purchasedList() {
    return [...this.activeEventDayReader.getPurchasedCircleSpaces()];
  }

  get holdList() {
    return [...this.activeEventDayReader.getHeldCircleSpaces()];
  }

  getUnvisited() {
    return [...this.activeEventDayReader.getPendingCircles()];
  }

  setRoutePriorityFilter(selectedPriorities: readonly number[] | null): void {
    this.routePriorityFilter =
      selectedPriorities && selectedPriorities.length > 0
        ? [...selectedPriorities]
        : null;
    this.renderRoutePriorityFilter();
  }

  private getRouteGuidanceCandidates(
    selectedPriorities = this.routePriorityFilter,
  ) {
    return filterCirclesByPriority(
      this.getUnvisited(),
      selectedPriorities,
    );
  }

  private renderRoutePriorityFilter(): void {
    const container = this.document.getElementById("route-priority-filter");
    if (!container) return;
    const priorities = collectCirclePriorities(this.getUnvisited());
    const selected = this.routePriorityFilter ?? [];
    container.replaceChildren();
    const all = this.document.createElement("button");
    all.type = "button";
    all.className = "priority-chip";
    all.textContent = "すべて";
    all.setAttribute("aria-pressed", String(selected.length === 0));
    all.addEventListener("click", () => this.setRoutePriorityFilter(null));
    container.appendChild(all);
    for (const priority of priorities) {
      const chip = this.document.createElement("button");
      chip.type = "button";
      chip.className = "priority-chip";
      chip.textContent = String(priority);
      chip.setAttribute(
        "aria-pressed",
        String(selected.includes(priority)),
      );
      chip.addEventListener("click", () => {
        const next = selected.includes(priority)
          ? selected.filter((value) => value !== priority)
          : [...selected, priority];
        this.setRoutePriorityFilter(next);
      });
      container.appendChild(chip);
    }
  }

  /** Delegates event/day opening to the assembled validated transition. */
  openEventDay(ref: EventDayRef) {
    return this.eventDayTransition.execute(ref);
  }

  startSyncCoordinator() {
    this.backgroundProcess.start();
  }

  disposeSyncCoordinator() {
    this.backgroundProcess.stop();
  }

  discardOutboxEntries(ref: EventDayRef, ids: readonly string[]) {
    for (const id of ids) this.pendingGasUpdatesController.discardOne(ref, id);
    return this.eventDayRepository.load(ref) ?? this.activeState;
  }

  async addPurchased(space: string) {
    if (!this.activeRef || !this.activeState) throw new Error("No event/day is open");
    const routeSnapshot = this.routeGuidanceSession.getSnapshot();
    const currentLocationSpace = this.readCurrentSpace();
    const result = await this.completeCircleVisit({
      eventDay: this.activeRef,
      circleSpace: space,
      nextStatus: "purchased",
      expectedSourceGeneration: this.activeState.sourceGeneration,
    });
    const routeResult = result.routeGuidanceResult;
    this.ui.updateCounts(this);
    this.updateManagementModels();
    if (routeResult.kind === "ignored") {
      this.routeGuidanceController.removePurchasedSpaceFromOrder(space);
      this.renderNavigation("preserve");
      this.saveNavigationSnapshot();
    } else if (routeResult.kind === "advanced") {
      this.ui.updateCurrentLocation(space);
      this.renderNavigation("current");
      this.saveNavigationSnapshot();
    } else if (routeResult.kind === "finished") {
      this.ui.updateCurrentLocation(space);
      this.ui.showTarget(null);
      this.xPostPanel?.hide();
      this.ui.setSaleMentionWarning(false);
      this.saveNavigationSnapshot();
    } else if (routeResult.kind === "failed") {
      this.ui.showToast(
        routeResult.reason === "arrival-position-unavailable"
          ? "現在地を確定できないため、次の案内へ進めません"
          : "次の目的地への経路を再構築できませんでした。現在の案内を保持します",
        "error",
      );
    }
    this.rememberPurchaseUndo(space, result, routeSnapshot, currentLocationSpace);
    return result.statusResult.state;
  }

  async undoLastPurchase(): Promise<boolean> {
    const purchase = this.latestPurchaseUndo;
    if (!purchase || !this.activeRef || !sameEventDayRef(this.activeRef, purchase.token.eventDay)) {
      return false;
    }
    const currentToken = this.circleStatusController.getLastUndoToken();
    if (!currentToken || currentToken.undoId !== purchase.token.undoId) {
      this.latestPurchaseUndo = null;
      return false;
    }
    this.latestPurchaseUndo = null;
    if (!this.circleStatusController.undo()) return false;

    this.routeGuidanceSession.replaceSnapshot(purchase.routeSnapshot);
    const restoredLocationSpace =
      purchase.currentLocationSpace ??
      (purchase.routeSnapshot.navigationState?.currentPosition?.source === "arrived-circle"
        ? purchase.routeSnapshot.navigationState.currentPosition.circleSpace ?? null
        : null);
    this.currentStartSpace = restoredLocationSpace ?? "";
    if (restoredLocationSpace) this.ui.updateCurrentLocation(restoredLocationSpace);
    this.ui.updateCounts(this);
    this.updateManagementModels();
    this.renderNavigation("preserve");
    this.saveNavigationSnapshot();
    return true;
  }

  private rememberPurchaseUndo(
    space: string,
    result: CompleteCircleVisitResult,
    routeSnapshot: RouteGuidanceSessionSnapshot,
    currentLocationSpace: string | null,
  ): boolean {
    const token = result.statusResult.undoToken;
    if (!token) return false;
    this.latestPurchaseUndo = { space, currentLocationSpace, token, routeSnapshot };
    return true;
  }

  async addHold(space: string) {
    if (!this.activeRef || !this.activeState) throw new Error("No event/day is open");
    const result = await this.completeCircleVisit({
      eventDay: this.activeRef,
      circleSpace: space,
      nextStatus: "held",
      expectedSourceGeneration: this.activeState.sourceGeneration,
    });
    return result.statusResult.state;
  }

  resetAll() {
    if (!this.activeRef || !this.activeState) return [];
    const purchased = [...this.activeEventDayReader.getPurchasedCircleSpaces()];
    for (const space of Object.keys(this.activeState.circleStates)) {
      this.circleStatusController.changeStatus({
        eventDay: this.activeRef,
        circleSpace: space,
        nextStatus: "pending",
        expectedSourceGeneration: this.activeState.sourceGeneration,
      });
    }
    return purchased;
  }

  /** Rebuild the management selector and source manager models from registry and local state. */
  updateManagementModels() {
    if (!this.eventRegistry) return;
    const updateToken = ++this.managementUpdateToken;
    const states = this.eventDayRepository
      .listEventDays()
      .map((ref) => ({
        ref,
        state: this.eventDayRepository.load(ref),
      }))
      .filter(
        (item): item is { ref: EventDayRef; state: LocalEventDayState } =>
          item.state !== null,
      );

    const options = buildEventDayOptions(
      this.eventRegistry,
      states,
      this.activeRef,
    );

    const activeState = this.activeState;
    const activeRef = this.activeRef;
    const eventObj = activeRef
      ? this.eventRegistry.events.find(
          (e) => e.eventId === activeRef.eventId,
        )
      : null;
    const activeRefLabel = activeRef
      ? `${eventObj?.displayName || activeRef.eventId} ${activeRef.dayId}`
      : "";

    const sourceSessionSnapshot = this.circleDataSourceSession.getSnapshot();

    const sourceManagerModel = buildSourceManagerPanelModel({
      activeRef,
      activeRefLabel,
      activeState,
      sourceDraft: {
        draftWebAppUrl: sourceSessionSnapshot.draftWebAppUrl,
        selectedSheetName: sourceSessionSnapshot.selectedSheetName,
        sheetNames: sourceSessionSnapshot.sheetNames,
        busy: sourceSessionSnapshot.busy,
        errorMessage: sourceSessionSnapshot.errorCode
          ? String(sourceSessionSnapshot.errorCode)
          : null,
      },
      transitionBusy: this.isTransitioning,
      sourceErrorMessage: this.sourceErrorMessage,
    });

    const outboxPanelModel = buildOutboxPanelModel(
      this.eventRegistry,
      states,
      {
        processing: this.pendingGasUpdatesController.getViewState().busy,
        resultMessage: this.pendingGasUpdatesController.getViewState().resultMessage,
        errorMessage: this.pendingGasUpdatesController.getViewState().errorMessage,
      },
    );

    const selectedPendingCount = activeState ? activeState.gasOutbox.length : 0;
    const totalPendingCount = states.reduce(
      (sum, item) => sum + (item.state ? item.state.gasOutbox.length : 0),
      0,
    );
    const deleteOptions = activeRef
      ? buildDeleteOptions({
          selected: activeRef,
          eventDayCount: this.eventDayRepository.listEventDays().length,
          activeCircleCount: activeState ? activeState.circles.length : 0,
          activityCount: activeState
            ? Object.keys(activeState.circleStates).length
            : 0,
          selectedPendingCount,
          totalPendingCount,
        })
      : [];

    const deleteDialogModel = buildStorageDeleteDialogModel({
      selectedScope: toDeleteScope(
        this.localDataDeletionController.getSelectedScope(),
      ),
      deleteOptions,
      eventDayLabel: activeRefLabel,
      busy: this.localDataDeletionController.getViewState().busy,
      errorMessage: this.localDataDeletionController.getViewState().errorMessage,
    });

    this.ui?.updateSettingsState({
      eventDayOptions: options,
      eventDayManagementRows: this.managementRows,
      selectedEventId: this.activeRef?.eventId || "",
      selectedDayId: this.activeRef?.dayId || "",
      sourceManagerModel,
      outboxPanelModel,
      deleteOptions,
      deleteDialogModel,
    });

    void buildEventDayManagementRows({
      registry: this.eventRegistry,
      states,
      selected: this.activeRef,
      offlineCache: this.catalogOfflineCache,
    }).then((rows) => {
      if (updateToken !== this.managementUpdateToken) return;
      this.managementRows = rows;
      this.ui?.updateSettingsState({ eventDayManagementRows: rows });
    });
  }

  openSourceDiffDialog(
    sourceLabel: string,
    diffViewModel: SourceDiffViewModel,
    errorMessage = "",
  ) {
    const dialog = getBrowserElement(this.document, "source-diff-dialog");
    const activePreview = this.circleDataSourceSession.getSnapshot().preview;
    if (!dialog || !activePreview) return;

    dialog.model = {
      open: true,
      previewId: activePreview.previewId,
      sourceLabel,
      diff: diffViewModel,
      busy: false,
      errorMessage,
    };
  }

  closeSourceDiffDialog() {
    const dialog = getBrowserElement(this.document, "source-diff-dialog");
    if (!dialog) return;
    if (dialog.model) {
      dialog.model = {
        ...dialog.model,
        open: false,
        busy: false,
        errorMessage: "",
      };
    }
  }

  clearActivePreviewIfAny() {
    const activePreview = this.circleDataSourceSession.getSnapshot().preview;
    if (activePreview) {
      this.circleDataSourceController?.cancelPreview(activePreview.previewId);
    }
    this.closeSourceDiffDialog();
  }

  /** Delegates outbox retry requests to the GasSyncCoordinator. */
  async handleGasRetryRequest(detail: unknown) {
    if (!detail || typeof detail !== "object") return;
    const refValue = (detail as { readonly ref?: unknown }).ref;
    if (
      refValue !== null &&
      refValue !== undefined &&
      !isEventDayRef(refValue)
    ) {
      return;
    }
    const ref = isEventDayRef(refValue) ? refValue : undefined;
    try {
      const processed = await this.pendingGasUpdatesController.retryAll(ref);
      if (processed === null) return;
      this.ui.showToast(`GAS同期完了 (${processed}件送信)`);
    } catch (_error) {
      this.ui.showToast("再送エラー", "error");
    }
    this.updateManagementModels();
    this.ui?.updateCounts?.(this);
  }

  /** Opens the delete dialog for a chosen deletion scope. */
  handleDeleteOptionSelect(scope: unknown) {
    if (!isDeleteScope(scope)) return;
    const options = this.ui.els.settingsArea?.deleteOptions || [];
    const option = options.find((candidate) => {
      if (candidate.scope.type !== scope.type) return false;
      if (scope.type === "all-events") return true;
      if (candidate.scope.type === "all-events") return false;
      return sameEventDayRef(candidate.scope.ref, scope.ref);
    });
    if (!option || option.blocked) return;

    this.localDataDeletionController.selectDeletionScope(option.scope);
    this.updateManagementModels();
  }

  /** Closes the delete dialog without changing local data. */
  handleDeleteDialogCancel() {
    this.localDataDeletionController.cancelDeletion();
    this.updateManagementModels();
  }

  /** Verifies scope & confirmation and performs safe local data deletion. */
  async handleStorageDeleteRequest(detail: unknown) {
    if (!detail || typeof detail !== "object") return;
    const input = detail as {
      readonly scope?: unknown;
      readonly confirmation?: unknown;
    };
    if (!isDeleteScope(input.scope) || typeof input.confirmation !== "string") {
      return;
    }
    const scope = input.scope;
    const confirmation = input.confirmation;
    if (scope.type === "all-events" && confirmation !== "全イベントを削除") {
      return;
    }

    const activeRefBeforeDelete = this.activeRef
      ? { ...this.activeRef }
      : null;
    this.localDataDeletionController.selectDeletionScope(scope);
    this.updateManagementModels();

    try {
      if (!(await this.localDataDeletionController.confirmDeletion(scope))) return;

      const activeRefDeleted =
        scope.type === "all-events" ||
        (scope.type === "event-day" &&
          sameEventDayRef(scope.ref, activeRefBeforeDelete));
      const activeRefSourceDeleted =
        scope.type === "circles" &&
        sameEventDayRef(scope.ref, activeRefBeforeDelete);

      if (activeRefDeleted) {
        this.clearNavigationSnapshot(activeRefBeforeDelete);
        this.resetNavigationRuntimeState();
        this.activeEventDaySession.clearActiveEventDay();

        const remainingList = this.eventDayRepository.listEventDays();
        const registry = this.eventRegistry;
        if (!registry) return;
        const nextRef =
          remainingList.length > 0
            ? remainingList[0]
            : {
                eventId: registry.events[0].eventId,
                dayId: registry.events[0].days[0].dayId,
              };
        await this.eventDayTransition.execute(nextRef);

        if (!this.activeRef) {
          renderMapBootstrapError(
            this.document,
            new Error("No active event/day remains after deletion"),
          );
          return;
        }
      } else if (activeRefSourceDeleted && activeRefBeforeDelete) {
        this.invalidateNavigationForSourceChange(activeRefBeforeDelete);
        this.ui.showTarget(null);
        this.xPostPanel?.hide();
        this.ui.setSaleMentionWarning(false);
        this.updateManagementModels();
        this.ui.updateCounts(this);
      } else {
        this.updateManagementModels();
        this.ui.updateCounts(this);
      }
      this.ui.showToast("データを削除しました");
    } catch (_error) {
      if (activeRefBeforeDelete && !this.activeRef) {
        renderMapBootstrapError(
          this.document,
          new Error("No active event/day remains after deletion"),
        );
        return;
      }
      this.updateManagementModels();
      this.ui.showToast("削除エラー", "error");
    }
  }

  /** Verifies exact confirmation text and discards selected outbox entries. */
  async handleGasDiscardRequest(detail: unknown) {
    if (!detail || typeof detail !== "object") return;
    const input = detail as {
      readonly ref?: unknown;
      readonly ids?: unknown;
      readonly confirmation?: unknown;
    };
    if (
      !isEventDayRef(input.ref) ||
      !Array.isArray(input.ids) ||
      !input.ids.every(
        (id): id is string => typeof id === "string" && id.length > 0,
      ) ||
      input.confirmation !== "未送信を破棄"
    ) {
      return;
    }

    try {
      this.discardOutboxEntries(
        input.ref,
        input.ids,
      );
      this.ui.showToast("未送信データを破棄しました");
    } catch (_error) {
      this.ui.showToast("破棄エラー", "error");
    } finally {
      this.updateManagementModels();
      this.ui?.updateCounts?.(this);
    }
  }

  /**
   * 初期化実行
   */
  async init(manifest = this.currentManifest) {
    const devDemoEnabled = isDevDemoEnabled(this.window.location);
    if (devDemoEnabled) {
      this.spreadsheetTitle = "C108 サークル巡回リスト";
    } else {
      if (!this.activeRef || !this.activeState) {
        renderMapBootstrapError(
          this.document,
          new Error("No active event/day after startup transition"),
        );
        return;
      }
    }

    this.ui.init(this, {
      onSetNextTarget: (circle: Circle) => this.handleSetNextTarget(circle),
      onSelectTarget: (circle: Circle) => this.handleSelectTarget(circle),
      onPreviewRoute: () => this.handlePreviewRoute(),
      onConfirmRoute: () => this.handleConfirmRoute(),
      onCancelRoute: () => this.handleCancelRoute(),
      onCloseRouteSelection: () => this.handleCloseRouteSelection(),
    });
    this.ui.setRouteMotionPreference(this.routeMotionPreference);
    this.ui.updateSettingsState({
      routeMotionPreference: this.routeMotionPreference,
    });
    this.ui.updateMapVersion?.(manifest?.bundleVersion || manifest?.eventId || "");
    this.syncSaleMentionMonitor();
    this.renderRoutePriorityFilter();
    const nearbyMapButton = this.document.getElementById("btn-open-nearby-map");
    if (nearbyMapButton) {
      // Keep the legacy visual demo fixture stable; production has the header entry.
      if (isDevDemoEnabled(this.window.location)) nearbyMapButton.classList.add("hidden");
      nearbyMapButton.onclick = () => {
        const areaSelect = getBrowserElement<BrowserInputElement>(this.document, "loc-ewsn");
        const areaId = areaSelect && this.routeMapAreaCatalog.getMapArea(areaSelect.value)
          ? areaSelect.value
          : "";
        this.nearbyMapView.open(nearbyMapButton, areaId);
      };
    }
    const itineraryButton = this.document.getElementById("btn-open-itinerary");
    const itineraryDialog = getBrowserElement<BrowserElement>(
      this.document,
      "route-itinerary-dialog",
    );
    if (itineraryButton && itineraryDialog) {
      itineraryButton.onclick = () => {
        itineraryDialog.entries = buildRouteItineraryModel(
          this.routeGuidanceSession.getSnapshot(),
          this.getUnvisited(),
        );
        this.itineraryOpen = true;
        this.renderNavigation("preserve");
        itineraryDialog.open = true;
      };
      itineraryDialog.addEventListener("itinerary-close", () => {
        this.itineraryOpen = false;
        this.renderNavigation("preserve");
      });
    }
    const userGuideButton = this.document.getElementById("btn-open-user-guide");
    const userGuideDialog = getBrowserElement<BrowserElement>(
      this.document,
      "user-guide-dialog",
    );
    if (userGuideButton && userGuideDialog) {
      userGuideButton.onclick = () => {
        userGuideDialog.open = true;
      };
    }
    this.setupEvents();

    if (devDemoEnabled) {
      this.ui.updateCounts(this);
      this.updateManagementModels();
      this.ui.showToast("UIデモデータを表示中");
      this.searchNext();
      return;
    }

    this.ui.updateCounts(this);
    this.updateManagementModels();

    // スタートアップ時に非同期でバックグラウンド同期コーディネーターを起動
    this.startSyncCoordinator();

    // Load and validate the navigation snapshot after the active event/day and DOM are ready.
    const activeState = this.activeState;
    const activeRef = this.activeRef;
    if (activeRef && activeState) {
      const pendingCircleSpaces = activeState.circles
        .filter(
          (c) =>
            !c.removedFromSource &&
            (activeState.circleStates[c.space] === undefined ||
              String(activeState.circleStates[c.space]) === "pending"),
        )
        .map((c) => c.space);

      const startupResult = this.routeGuidanceController.initializeResumeStartup({
        eventDay: activeRef,
        bundleVersion: manifest?.bundleVersion || "",
        circleStates: activeState.circleStates,
        pendingCircleSpaces,
      });

      if (startupResult.kind === "ready") {
        const dialog = getBrowserElement(
          this.document,
          "navigation-resume-dialog",
        );
        if (dialog) {
          dialog.targetSpace = startupResult.targetSpace;
          dialog.errorMessage = "";
          dialog.open = true;
        }
        // Valid snapshot present: wait for user action, do NOT auto-start searchNext
        return;
      }
    }

    // データがあれば初期表示
    if (this.wantToBuy.length > 0) {
      this.ui.showToast("データ読み込み済み");
      this.searchNext("", false);
    } else {
      this.ui.showToast("CSVデータ未設定。空のイベント・日程で起動しました");
    }
  }

  showStartupError(error: unknown): void {
    renderMapBootstrapError(this.document, error);
  }

  /** Cleanup event listeners and coordinator timers. */
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    this.transitionToken += 1;
    this.routeGuidanceController.invalidatePendingDestinationSelection();
    // Management feature controllers own their event lifecycle.
    this.eventBindingCleanup?.();
    this.eventBindingCleanup = null;
    this.disposeSyncCoordinator();
    for (const timer of this.ownedTimers) clearTimeout(timer);
    this.ownedTimers.clear();
    for (const cancel of this.ownedTimerCancels.values()) cancel();
    this.ownedTimerCancels.clear();
    this.navigationRuntimeController.dispose();
    this.saleMentionUnsubscribe?.();
    this.saleMentionUnsubscribe = null;
    this.saleMentionMonitor?.stop();
    this.xPostPanel?.dispose();
    this.ui?.dispose?.();
    this.xPostCache?.dispose();
    this.pendingGasUpdatesController?.stop?.();
    this.localDataDeletionController?.stop?.();
  }

  /** Atomically applies one Route Guidance state transition through its Session. */
  replaceRouteGuidanceSnapshot(changes: object) {
    this.routeGuidanceSession.replaceSnapshot({
      ...this.routeGuidanceSession.getSnapshot(),
      ...changes,
    });
  }

  /** Derives the next circle from the current Route Guidance order. */
  getNextTarget(snapshot = this.routeGuidanceSession.getSnapshot()) {
    const navigationState = snapshot.navigationState;
    const nextSpace = navigationState?.bestOrder.find(
      (space) => space !== navigationState.targetSpace,
    );
    return nextSpace
      ? this.wantToBuy.find((circle) => circle.space === nextSpace) || null
      : null;
  }

  /** Build the complete render contract shared by the sheet and map. */
  getNavigationContext(fitMode = "preserve") {
    const snapshot = this.routeGuidanceSession.getSnapshot();
    return {
      currentTarget: snapshot.currentDestination,
      currentRoute: snapshot.currentRoute,
      selectedTarget: snapshot.selectedDestination || snapshot.currentDestination,
      selectedRoute: snapshot.selectedRoute,
      startSpace: this.currentStartSpace,
      nextTarget: this.getNextTarget(snapshot),
      currentPosition: snapshot.navigationState?.currentPosition ?? null,
      selectionState: snapshot.selectionStatus,
      selectionMessage: this.selectionMessage,
      itineraryEntries: this.itineraryOpen
        ? buildRouteItineraryModel(snapshot, this.getUnvisited())
        : [],
      fitMode,
    };
  }

  private eventDayDate(ref: EventDayRef): string | null {
    const event = this.eventRegistry?.events.find((candidate) => candidate.eventId === ref.eventId);
    return event?.days.find((day) => day.dayId === ref.dayId)?.date ?? null;
  }

  private syncSaleMentionMonitor(): void {
    const monitor = this.saleMentionMonitor;
    if (!monitor) return;
    const ref = this.activeRef;
    if (!ref) {
      monitor.stop();
      this.saleMentionEventDayKey = null;
      this.applySaleMentionState(null);
      this.xPostPanel?.hide();
      return;
    }
    const key = `${ref.eventId}:${ref.dayId}`;
    if (key !== this.saleMentionEventDayKey) {
      this.saleMentionEventDayKey = key;
      this.applySaleMentionState(null);
      try {
        monitor.start({ ref, eventDate: this.eventDayDate(ref) });
      } catch (error) {
        monitor.stop();
        this.saleMentionEventDayKey = null;
        console.warn("X post monitoring could not start.", error);
      }
    } else {
      try {
        monitor.refreshCircleAccounts();
      } catch (error) {
        console.warn("X post monitoring could not refresh.", error);
      }
    }
  }

  private applySaleMentionState(currentTarget: Circle | null): void {
    const reader = this.saleMentionReader;
    const spaces = reader?.getMentionSpaces() ?? new Set<string>();
    this.ui.setSaleMentionSpaces(spaces);
    this.nearbyMapView.setSaleMentionSpaces(spaces);
    const targetSpace = currentTarget?.space ?? null;
    if (targetSpace !== this.saleMentionTargetSpace) {
      this.saleMentionTargetSpace = targetSpace;
      this.saleMentionToastSignature = null;
    }
    const state = targetSpace && reader
      ? reader.getSaleMention(targetSpace)
      : { status: "unknown" as const };
    this.ui.setSaleMentionWarning(state.status === "mention");
    if (state.status !== "mention") return;
    const signature = `${targetSpace}:${[...state.matchedPostIds].sort().join(",")}`;
    if (signature === this.saleMentionToastSignature) return;
    this.saleMentionToastSignature = signature;
    this.ui.showToast("完売・売り切れに関する投稿があります", "warning");
  }

  /** Render navigation and keep the post panel bound to the active destination. */
  private renderNavigation(fitMode = "preserve"): void {
    const context = this.getNavigationContext(fitMode);
    this.ui.showNavigation(context);
    this.saleMentionMonitor?.prioritizeCircle(context.currentTarget);
    this.applySaleMentionState(context.currentTarget);
    const ref = this.activeRef;
    if (ref && context.currentTarget) {
      void this.xPostPanel?.show({ ref, circle: context.currentTarget });
    } else {
      this.xPostPanel?.hide();
    }
  }

  /** Persist the current navigation state when all snapshot identity fields exist. */
  saveNavigationSnapshot() {
    const activeRef = this.activeRef;
    const bundleVersion = this.currentManifest?.bundleVersion;
    if (!activeRef || !bundleVersion) return;

    try {
      this.routeGuidanceController.saveSnapshot(activeRef, bundleVersion);
    } catch (error) {
      console.warn("Navigation snapshot could not be saved.", error);
      this.ui.showToast(
        "案内状態の保存に失敗しました。案内は継続します",
        "warning",
      );
    }
  }

  /** Clear a navigation snapshot without allowing storage errors to break the UI. */
  clearNavigationSnapshot(ref = this.activeRef) {
    if (!ref) return;
    try {
      this.routeGuidanceController.clearSavedSnapshot(ref);
    } catch (error) {
      console.warn("Navigation snapshot could not be cleared.", error);
      this.ui.showToast("案内状態の削除に失敗しました", "warning");
    }
  }

  /** Invalidate runtime navigation and caches after circle identity changes. */
  invalidateNavigationForSourceChange(ref: EventDayRef) {
    try {
      this.routeGuidanceController.invalidatePersistence(ref, true);
    } catch (error) {
      console.warn(
        "Navigation state could not be cleared after source update.",
        error,
      );
    }
    this.resetNavigationRuntimeState();
  }

  resetNavigationRuntimeState() {
    this.currentStartSpace = "";
    this.routeGuidanceController.resetRuntimeState();
  }

  /** Copy exact grid distance and adopted endpoint onto a circle view model. */
  targetWithRoute(target: Circle, route: RouteResult | null) {
    if (!target || !route) return target;
    return {
      ...target,
      gridDistance: Math.round(route.cost),
      mapPosition: route.targetPosition,
    };
  }

  /** Resolve an exact same-area route using cached, runtime-validated assets. */
  async planGridRoute(
    startSpace: string,
    targetSpace: string,
    options: DevDemoRouteOptions = {},
  ) {
    if (!areSpacesInSameArea(startSpace, targetSpace, this.routeMapAreaCatalog)) return null;
    const area = findAreaForSpace(startSpace, this.routeMapAreaCatalog);
    if (!area) return null;
    const assets = await this.loadGridRouteAssets(area);
    if (!assets) return null;
    return planDevDemoRoute(
      assets,
      startSpace,
      targetSpace,
      options,
    );
  }

  /** Select a pin without changing the active destination or route. */
  async handleSelectTarget(circle: Circle) {
    if (
      !circle ||
      this.routeGuidanceSession.getSnapshot().selectionStatus === "comparing"
    )
      return;

    this.selectionMessage = "候補経路を計算中…";
    const selection = this.routeGuidanceController.selectDestination(
      circle.space,
      this.wantToBuy,
    );
    this.renderNavigation("preserve");
    const result = await selection;
    if (result.kind === "ignored" || result.kind === "stale") return;
    if (result.kind === "route-unavailable") {
      this.selectionMessage =
        result.reason === "invalid-origin"
          ? "同じ地図エリアの正式な経路を計算できません"
          : "候補地点までの経路を探索できません";
    } else if (result.kind === "failed") {
      console.warn(
        "Selected target route could not be calculated.",
        result.error,
      );
      this.selectionMessage =
        "候補経路の読込に失敗しました。もう一度お試しください";
    } else {
      this.selectionMessage = "";
    }
    const fitMode = result.kind === "selected" ? "comparison" : "preserve";
    this.renderNavigation(fitMode);
  }

  /** Enter the two-route comparison state after a candidate route is ready. */
  handlePreviewRoute() {
    if (!this.routeGuidanceController.compareSelectedDestination()) return;
    this.renderNavigation("comparison");
  }

  /** Promote the compared candidate to the active destination without recalculation. */
  handleConfirmRoute() {
    const destination =
      this.routeGuidanceController.confirmSelectedDestination();
    if (!destination) return;
    this.selectionMessage = "";
    this.renderNavigation("current");
    this.ui.showToast(`目的地を ${destination.space} に変更しました`);
    this.saveNavigationSnapshot();
  }

  /** Leave comparison while retaining the selected target details. */
  handleCancelRoute() {
    if (!this.routeGuidanceController.cancelDestinationComparison()) return;
    this.renderNavigation("comparison");
  }

  /** Close the candidate panel and invalidate any pending candidate route. */
  handleCloseRouteSelection() {
    if (!this.routeGuidanceController.cancelDestinationSelection()) return;
    this.selectionMessage = "";
    this.renderNavigation("current");
  }

  /**
   * 手動で目的地を設定
   */
  async handleSetNextTarget(circle: Circle): Promise<boolean> {
    if (!circle) return false;

    // The dev-only UI fixture intentionally has no production map bundle.
    if (isDevDemoEnabled(this.window.location)) {
      return this.handleSetNextTargetDevDemo(circle);
    }

    this.ui.showLoading();
    const result = await this.routeGuidanceController.setManualDestination(
      circle.space,
      this.wantToBuy,
    );
    if (result.kind === "ignored" || result.kind === "stale") return false;
    if (result.kind === "missing-position") {
      this.ui.showToast(
        "現在地が確定していないため、目的地を変更できません",
        "error",
      );
      return false;
    }
    if (result.kind === "route-unavailable") {
      this.ui.showToast(
        "経路の再構築に失敗したため、目的地を変更できません",
        "error",
      );
      return false;
    }
    if (result.kind === "failed") {
      if (result.reason === "route-calculation") {
        console.warn(
          "Selected target grid distance could not be calculated.",
          result.error,
        );
        this.ui.showToast(
          "経路の再構築に失敗したため、目的地を変更できません",
          "error",
        );
      } else {
        console.warn(
          "Manual target change could not be applied.",
          result.error,
        );
        this.ui.showToast("目的地を変更できませんでした", "error");
      }
      return false;
    }
    const currentPosition =
      this.routeGuidanceSession.getSnapshot().navigationState?.currentPosition;
    if (!currentPosition) return false;
    this.currentStartSpace =
      currentPosition.source === "arrived-circle"
        ? currentPosition.circleSpace || ""
        : "";
    this.selectionMessage = "";
    this.renderNavigation("current");
    this.ui.showToast(`目的地を ${circle.space} に設定しました`);
    this.saveNavigationSnapshot();
    return true;
  }

  readCurrentSpace() {
    const areaSelect = getBrowserElement<BrowserInputElement>(this.document, "loc-ewsn");
    const labelInput = getBrowserElement<BrowserInputElement>(this.document, "loc-label");
    const numberInput = getBrowserElement<BrowserInputElement>(this.document, "loc-number");
    if (!areaSelect || !labelInput || !numberInput) return null;
    const areaId = areaSelect.value;
    const area = this.routeMapAreaCatalog
      .getAllMapAreas()
      .find((candidate) => candidate.id === areaId);
    const currentSpace = buildSpaceFromLocation({
      areaName: area?.prefixes?.[0] || "",
      label: labelInput.value,
      number: numberInput.value,
    });

    if (!currentSpace) {
      this.ui.showToast("現在地の番号は1〜99で入力してください");
    }
    return currentSpace;
  }

  /** Legacy gallery target behavior used only by the dev UI fixture. */
  async handleSetNextTargetDevDemo(circle: Circle): Promise<boolean> {
    this.routeGuidanceController.invalidatePendingDestinationSelection();
    const currentSpace = this.readCurrentSpace();
    if (!currentSpace) return false;

    this.ui.showLoading();
    let gridTarget = null;
    let route = null;
    try {
      [gridTarget] =
        (await this.rankCandidatesByGrid(currentSpace, [circle])) || [];
      route = await this.planGridRoute(currentSpace, circle.space);
    } catch (error) {
      console.warn(
        "Selected target grid distance could not be calculated.",
        error,
      );
    }
    this.currentStartSpace = currentSpace;
    const target = this.targetWithRoute(gridTarget || circle, route);
    this.replaceRouteGuidanceSnapshot({
      currentRoute: route,
      currentDestination: target,
      selectedDestination: target,
      selectedRoute: route,
      selectionStatus: "idle",
    });
    this.selectionMessage = "";
    this.renderNavigation("current");
    this.ui.showToast(`目的地を ${circle.space} に設定しました`);
    return true;
  }

  /**
   * イベントリスナーの設定
   */
  setupEvents() {
    this.pendingGasUpdatesController?.start?.();
    this.localDataDeletionController?.start?.();
    this.eventBindingCleanup?.();
    // The settings-shell binder forwards toggleSettings(this.document.getElementById("toggle-settings")).
    const browserEvents = bindBrowserEvents({
      application: this,
      document: this.document,
    });
    this.eventBindingCleanup = () => browserEvents.stop();
  }

  /**
   * データ更新処理
   */
  async refreshData(force = false) {
    void force;
    this.ui.setSettingsError("GAS同期はPhase 2では利用できません");
    this.ui.showToast("GAS同期はPhase 2では利用できません");
  }

  async loadGridRouteAssets(area: MapArea) {
    const areaId = area?.id ?? area?.areaId;
    if (!areaId) {
      return null;
    }
    if (!area.assets) return null;
    try {
      const assets = await this.routeMapAssetsLoader.loadMapAssets({
        areaId,
        assets: {
          points: area.assets.points,
          gridMeta: area.assets.gridMeta,
          grid: area.assets.grid,
        },
      });
      return {
        pointsPayload: assets.points,
        gridMeta: assets.gridMetadata,
        gridBytes: assets.gridBytes,
      };
    } catch (error) {
      console.warn("Grid distance assets could not be loaded.", error);
      return null;
    }
  }

  async rankCandidatesByGrid(currentSpace: string, candidates: readonly Circle[]) {
    const area = findAreaForSpace(currentSpace, this.routeMapAreaCatalog);
    if (!area) return null;

    const sameAreaCandidates: Circle[] = [];
    const otherCandidates: Circle[] = [];
    candidates.forEach((candidate) => {
      if (
        areSpacesInSameArea(
          currentSpace,
          candidate?.space,
          this.routeMapAreaCatalog,
        )
      ) {
        sameAreaCandidates.push(candidate);
      } else {
        otherCandidates.push(candidate);
      }
    });
    if (sameAreaCandidates.length === 0) return null;

    const assets = await this.loadGridRouteAssets(area);
    if (!assets) return null;

    return rankDevDemoCandidates(
      assets,
      currentSpace,
      sameAreaCandidates,
      otherCandidates,
      toSpaceAreas(this.routeMapAreaCatalog),
    );
  }

  /**
   * 次の目的地検索処理
   */
  searchNext(startSpace = "", notifyComplete = true) {
    if (isDevDemoEnabled(this.window.location)) {
      return this.searchNextDevDemo(startSpace, notifyComplete);
    }

    if (this.wantToBuy.length === 0) {
      this.clearNavigationSnapshot();
      this.resetNavigationRuntimeState();
      this.ui.showToast("データがありません");
      return Promise.resolve();
    }

    const currentSpace = startSpace || this.readCurrentSpace();
    if (!currentSpace) return Promise.resolve();
    const selectedPriorities = this.routePriorityFilter;

    this.routeGuidanceController.invalidatePendingDestinationSelection();
    this.ui.showLoading();

    // UI描画をブロックしないように非同期実行
    return new Promise<void>((resolve) =>
      this.scheduleTimeout(
        async () => {
          const unfilteredCandidates = this.getUnvisited();
          if (unfilteredCandidates.length === 0) {
            this.clearNavigationSnapshot();
            this.resetNavigationRuntimeState();
            this.ui.showTarget(null);
            this.xPostPanel?.hide();
            this.ui.setSaleMentionWarning(false);
            if (notifyComplete)
              this.ui.showToast("全てのサークルを回りました！");
            resolve();
            return;
          }
          const allCandidates = this.getRouteGuidanceCandidates(selectedPriorities);
          if (allCandidates.length === 0) {
            this.renderNavigation("preserve");
            this.ui.showToast(
              "この条件に一致する巡回対象はありません",
              "warning",
            );
            resolve();
            return;
          }

          try {
            const areaInput = getBrowserElement<BrowserInputElement>(this.document, "loc-ewsn");
            const labelInput = getBrowserElement<BrowserInputElement>(this.document, "loc-label");
            const numberInput = getBrowserElement<BrowserInputElement>(this.document, "loc-number");
            if (!areaInput || !labelInput || !numberInput) {
              resolve();
              return;
            }
            await this.routeGuidanceController.startFromCurrentLocation({
              eventDay: this.activeRef || {
                eventId: this.currentManifest?.eventId || "runtime",
                dayId: "active",
              },
              bundleVersion: this.currentManifest?.bundleVersion || "unknown",
              currentLocation: {
                areaId: areaInput.value,
                label: labelInput.value,
                number: numberInput.value,
              },
              pendingCircles: allCandidates,
            });
          } catch (error) {
            console.warn("Route guidance could not be started.", error);
            if (
              errorMessage(error).includes(
                "No pending route guidance target is available",
              )
            ) {
              this.ui.showToast(
                "現在のエリアに未訪問の候補がありません。地図を切り替えて始点を設定してください",
                "warning",
              );
              resolve();
              return;
            }
            this.ui.showToast(
              "経路の再構築に失敗したため、案内を開始できませんでした",
              "error",
            );
            resolve();
            return;
          }

          this.currentStartSpace = currentSpace;
          this.selectionMessage = "";
          this.renderNavigation("current");

          resolve();
        },
        50,
        resolve,
      ),
    );
  }

  /** Keep the legacy demo-only fixture path outside production navigation. */
  searchNextDevDemo(startSpace = "", notifyComplete = true) {
    if (this.wantToBuy.length === 0) {
      this.ui.showToast("データがありません");
      return Promise.resolve();
    }

    const currentSpace = startSpace || this.readCurrentSpace();
    if (!currentSpace) return Promise.resolve();
    const selectedPriorities = this.routePriorityFilter;

    this.routeGuidanceController.invalidatePendingDestinationSelection();
    this.ui.showLoading();

    return new Promise<void>((resolve) =>
      this.scheduleTimeout(
        async () => {
          const allCandidates = this.getUnvisited();
          if (allCandidates.length === 0) {
            this.replaceRouteGuidanceSnapshot({
              currentDestination: null,
              currentRoute: null,
              selectedDestination: null,
              selectedRoute: null,
            });
            this.ui.showTarget(null);
            this.xPostPanel?.hide();
            this.ui.setSaleMentionWarning(false);
            if (notifyComplete)
              this.ui.showToast("全てのサークルを回りました！");
            resolve();
            return;
          }
          const candidates = this.getRouteGuidanceCandidates(selectedPriorities);
          if (candidates.length === 0) {
            this.renderNavigation("preserve");
            this.ui.showToast(
              "この条件に一致する巡回対象はありません",
              "warning",
            );
            resolve();
            return;
          }

          let gridRanked = null;
          try {
            gridRanked = await this.rankCandidatesByGrid(
              currentSpace,
              candidates,
            );
          } catch (error) {
            console.warn(
              "Grid candidate ranking failed; using fallback.",
              error,
            );
          }

          let path;
          try {
            path = gridRanked
              ? [{ space: currentSpace, isStart: true }, ...gridRanked]
              : orderDevDemoCandidates(
                  currentSpace,
                  candidates,
                  toSpaceAreas(this.routeMapAreaCatalog),
                );
          } catch (error) {
            console.warn(
              "Candidate ordering failed; using source order.",
              error,
            );
            path = [{ space: currentSpace, isStart: true }, ...candidates];
          }

          if (path.length > 1) {
            let route = null;
            try {
              route = await this.planGridRoute(currentSpace, path[1].space);
            } catch (error) {
              console.warn(
                "Grid route planning failed; showing target without route.",
                error,
              );
            }
            this.currentStartSpace = currentSpace;
            const target = this.targetWithRoute(path[1], route);
            const area = findAreaForSpace(
              currentSpace,
              this.routeMapAreaCatalog,
            );
            this.replaceRouteGuidanceSnapshot({
              navigationState: {
                stage: "navigating",
                areaId: area?.id ?? null,
                currentPosition: {
                  areaId: area?.id ?? null,
                  source: "arrived-circle",
                  circleSpace: currentSpace,
                },
                targetSpace: target.space,
                lockedFirstLeg: {
                  from: { type: "circle", space: currentSpace },
                  toSpace: target.space,
                },
                provisionalOrder: path.slice(1).map(({ space }) => space),
                bestOrder: path.slice(1).map(({ space }) => space),
                optimizationGeneration: 1,
              },
              currentRoute: route,
              currentDestination: target,
              selectedDestination: target,
              selectedRoute: route,
              selectionStatus: "idle",
            });
            this.selectionMessage = "";
          this.renderNavigation("current");
          }
          resolve();
        },
        50,
        resolve,
      ),
    );
  }

  /**
   * 購入・保留アクション
   */
  async handleAction(type: string) {
    const guidanceSnapshot = this.routeGuidanceSession.getSnapshot();
    if (guidanceSnapshot.selectionStatus === "comparing") return;
    if (type !== "purchase" && type !== "hold") return;
    const currentDestination = guidanceSnapshot.currentDestination;
    const selectedDestination = guidanceSnapshot.selectedDestination;
    if (
      currentDestination &&
      selectedDestination &&
      currentDestination.space !== selectedDestination.space
    ) {
      return;
    }
    const actionTarget = currentDestination || selectedDestination;
    if (!actionTarget) return;
    const activeRef = this.activeRef;
    const activeState = this.activeState;
    if (!activeRef || !activeState) return;

    const space = actionTarget.space;
    const routeSnapshot = guidanceSnapshot;
    const currentLocationSpace = type === "purchase" ? this.readCurrentSpace() : null;
    let visitResult;
    try {
      visitResult = await this.completeCircleVisit({
        eventDay: activeRef,
        circleSpace: space,
        nextStatus: type === "purchase" ? "purchased" : "held",
        expectedSourceGeneration: activeState.sourceGeneration,
      });
    } catch (error) {
      this.reportLocalMutationFailure(error);
      return;
    }

    this.ui?.showToast(
      type === "purchase" ? `${space} 購入！` : `${space} 保留`,
    );

    this.ui.updateCounts(this);
    this.updateManagementModels();
    if (isDevDemoEnabled(this.window.location)) {
      void this.handleDevDemoAction(space);
      if (type === "purchase" && this.rememberPurchaseUndo(space, visitResult, routeSnapshot, currentLocationSpace))
        this.ui.showUndoSnackbar(space);
      return;
    }

    const routeResult = visitResult.routeGuidanceResult;
    if (routeResult.kind !== "ignored") {
      this.ui.updateCurrentLocation(space); // 現在地を更新
    }
    if (type === "purchase" && routeResult.kind === "ignored") {
      this.routeGuidanceController.removePurchasedSpaceFromOrder(space);
      this.renderNavigation("preserve");
      this.saveNavigationSnapshot();
      if (this.rememberPurchaseUndo(space, visitResult, routeSnapshot, currentLocationSpace))
        this.ui.showUndoSnackbar(space);
      return;
    }
    if (routeResult.kind === "advanced") {
      this.renderNavigation("current");
      this.saveNavigationSnapshot();
      if (type === "purchase")
        if (this.rememberPurchaseUndo(space, visitResult, routeSnapshot, currentLocationSpace))
          this.ui.showUndoSnackbar(space);
      return;
    }

    if (routeResult.kind === "finished") {
      this.ui.showTarget(null);
      this.xPostPanel?.hide();
      this.ui.setSaleMentionWarning(false);
      if (type === "purchase") this.saveNavigationSnapshot();
      else this.clearNavigationSnapshot(this.activeRef);
      if (type === "purchase")
        if (this.rememberPurchaseUndo(space, visitResult, routeSnapshot, currentLocationSpace))
          this.ui.showUndoSnackbar(space);
      return;
    }

    if (routeResult.kind === "failed") {
      this.ui.showToast(
        routeResult.reason === "arrival-position-unavailable"
          ? "現在地を確定できないため、次の案内へ進めません"
          : "次の目的地への経路を再構築できませんでした。現在の案内を保持します",
        "error",
      );
    }
    if (type === "purchase")
      if (this.rememberPurchaseUndo(space, visitResult, routeSnapshot, currentLocationSpace))
        this.ui.showUndoSnackbar(space);
  }

  /**
   * 全リセット処理
   */
  handleReset() {
    if (confirm("本当にリセットしますか？")) {
      try {
        this.resetAll();
      } catch (error) {
        this.reportLocalMutationFailure(error);
        return;
      }
      this.clearNavigationSnapshot();
      this.resetNavigationRuntimeState();
      this.ui.updateCounts(this);
      this.ui.showTarget(null); // 表示クリア
      this.xPostPanel?.hide();
      this.ui.setSaleMentionWarning(false);
      this.ui.els.targetSection.classList.add("hidden");
      this.ui.els.targetEmpty.classList.remove("hidden");
      this.ui.showToast("リセットしました");
    }
  }

  handleResetHold(): void {
    this.resetAll();
  }

  /** Show a recoverable diagnostic when the local mutation could not be saved. */
  reportLocalMutationFailure(error: unknown) {
    console.error("Failed to save local purchase state:", error);
    this.ui.showToast(
      "端末への保存に失敗しました。操作は反映されていません。",
      "error",
    );
  }

  /**
   * 案内再開の確定処理
   */
  async handleResumeConfirm() {
    if (!this.activeRef || !this.activeState) return;
    const resumeResult = await this.routeGuidanceController.resumeSavedGuidance(
      this.activeRef,
      this.wantToBuy,
      this.activeState.circleStates,
    );

    const dialog = getBrowserElement(
      this.document,
      "navigation-resume-dialog",
    );
    if (resumeResult.kind === "idle") return;

    if (resumeResult.kind === "failed") {
      if (dialog) {
        dialog.errorMessage = resumeResult.message;
      }
      this.ui.showToast(resumeResult.message, "error");
      return;
    }

    if (dialog) {
      dialog.errorMessage = "";
      dialog.open = false;
    }
    const lockedLeg =
      this.routeGuidanceSession.getSnapshot().navigationState?.lockedFirstLeg;
    this.currentStartSpace =
      lockedLeg?.from?.type === "circle" ? lockedLeg.from.space : "";
    this.selectionMessage = "";
    this.renderNavigation("current");
    this.ui.showToast(
      `前回の案内（目的地: ${resumeResult.targetSpace}）を再開しました`,
    );
    if (resumeResult.warningMessage) {
      this.ui.showToast(resumeResult.warningMessage, "error");
    }
  }

  findPointPortalIndex(pointsPayload: PointsPayload, gridMeta: GridMeta, space: string) {
    const [, identifier, number] = parseSpace(
      space,
      toSpaceAreas(this.routeMapAreaCatalog),
    );
    const point = pointsPayload?.points?.find(
      (candidate) =>
        pointMatchesSpace(candidate, space, identifier, number),
    );
    const portal = point?.portals?.[0];
    if (
      !portal ||
      !Number.isInteger(portal.col) ||
      !Number.isInteger(portal.row) ||
      portal.col < 0 ||
      portal.row < 0 ||
      portal.col >= gridMeta.cols ||
      portal.row >= gridMeta.rows
    ) {
      return null;
    }
    return portal.row * gridMeta.cols + portal.col;
  }

  findPointPortalPosition(pointsPayload: PointsPayload, gridMeta: GridMeta, space: string) {
    const [, identifier, number] = parseSpace(
      space,
      toSpaceAreas(this.routeMapAreaCatalog),
    );
    const point = pointsPayload?.points?.find(
      (candidate) =>
        pointMatchesSpace(candidate, space, identifier, number),
    );
    const centerX = Number(point?.center_x);
    const centerY = Number(point?.center_y);
    if (Number.isFinite(centerX) && Number.isFinite(centerY)) {
      return { svgX: centerX, svgY: centerY };
    }
    const portal = point?.portals?.[0];
    const portalX = Number(portal?.x);
    const portalY = Number(portal?.y);
    if (Number.isFinite(portalX) && Number.isFinite(portalY)) {
      return { svgX: portalX, svgY: portalY };
    }

    const portalCol = Number(portal?.col);
    const portalRow = Number(portal?.row);
    const cellSize = Number(gridMeta?.cell_size);
    if (
      !Number.isInteger(portalCol) ||
      !Number.isInteger(portalRow) ||
      !Number.isFinite(cellSize)
    ) {
      return null;
    }
    return {
      svgX: (portalCol + 0.5) * cellSize,
      svgY: (portalRow + 0.5) * cellSize,
    };
  }

  /**
   * 始点再設定処理（navigation stateのみ破棄し、circle stateとdistance matrixは保持）
   */
  handleResumeResetStart() {
    this.clearNavigationSnapshot();
    this.routeGuidanceController.resetRuntimeState();
    this.currentStartSpace = "";

    const dialog = getBrowserElement(
      this.document,
      "navigation-resume-dialog",
    );
    if (dialog) {
      dialog.errorMessage = "";
      dialog.open = false;
    }

    this.ui.showToast("始点を設定し直します");
  }

  /** Continue the legacy purchase/hold demo flow without entering production navigation. */
  handleDevDemoAction(space: string) {
    return this.searchNextDevDemo(space, false);
  }
}
