// @ts-nocheck

import "../components/comipath-settings";
import "../components/navigation-resume-dialog";
import "../components/source-diff-dialog";
import { DomRouteGuidanceView } from "../features/route-guidance/ui/dom-route-guidance-view";
import { createDevDemoData, isDevDemoEnabled } from "../dev-demo-data.js";
import {
  parseGridMeta,
  parsePointsPayload,
} from "../features/event-day/infrastructure/application-boundary-parsers";
import {
  loadRuntimeMapBundleManifestFromUrl,
  renderMapBootstrapError,
  resolveEventMapManifestUrl,
} from "../features/event-day/infrastructure/http-map-manifest-loader";
import {
  parseSpace,
  solveNearestNeighbor,
} from "../features/route-guidance/domain/optimization/nearest-neighbor-order";
import {
  planRoute,
  planRouteFromGridIndex,
  rankCandidatesByGridDistance,
} from "../features/route-guidance/domain/routing/grid-route-planner";
import { buildSpaceFromLocation } from "../features/route-guidance/ui/parse-current-location-form";
import {
  buildDeleteOptions,
  buildEventDayOptions,
  buildOutboxPanelModel,
  formatSourceSummary,
} from "../shared/ui/management-view-model";

/** Validates an event/day reference at the BrowserEventBinding's DOM event boundary. */
function isEventDayRef(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.eventId === "string" &&
      value.eventId.length > 0 &&
      typeof value.dayId === "string" &&
      value.dayId.length > 0,
  );
}

function isDeleteScope(value) {
  if (!value || typeof value !== "object") return false;
  if (value.type === "all-events") return true;
  return (
    (value.type === "circles" ||
      value.type === "activity" ||
      value.type === "event-day") &&
    isEventDayRef(value.ref)
  );
}

function sameEventDayRef(left, right) {
  return Boolean(
    left &&
      right &&
      left.eventId === right.eventId &&
      left.dayId === right.dayId,
  );
}

function findAreaForSpace(space, mapAreaCatalog) {
  if (!space || typeof space !== "string") return null;

  const cleanedSpace = space.trim();
  if (cleanedSpace.length < 2) return null;

  const prefixChar = cleanedSpace[0];
  const labelChar = cleanedSpace[1];

  return (
    mapAreaCatalog
      .getAllMapAreas()
      .find(
        (area) =>
          area.prefixes.includes(prefixChar) && area.labels.includes(labelChar),
      ) || null
  );
}

function areSpacesInSameArea(spaceA, spaceB, mapAreaCatalog) {
  const areaA = findAreaForSpace(spaceA, mapAreaCatalog);
  const areaB = findAreaForSpace(spaceB, mapAreaCatalog);
  return Boolean(areaA && areaB && areaA.id === areaB.id);
}

const DEFAULT_NAVIGATION_OPTIMIZATION_TIME_LIMIT_MS = 10000;

/**
 * アプリケーションのメインコントローラー
 */
export class BrowserEventBinding {
  constructor(options = {}) {
    this.started = false;
    this.stopped = false;
    const eventDayDependencies = options?.eventDayDependencies;
    const routeGuidanceDependencies = options?.routeGuidanceDependencies;
    if (
      !eventDayDependencies ||
      !eventDayDependencies.repository ||
      !eventDayDependencies.activeEventDaySession ||
      !eventDayDependencies.activeEventDayReader ||
      !eventDayDependencies.circleStatusController ||
      !eventDayDependencies.pendingGasUpdatesController ||
      !eventDayDependencies.backgroundProcess ||
      !eventDayDependencies.loadEventRegistry ||
      !options?.circleDataSourceSession ||
      !options?.circleDataSourceController ||
      !options?.completeCircleVisit ||
      !options?.localDataDeletionUseCase ||
      !routeGuidanceDependencies ||
      !routeGuidanceDependencies.routeGuidanceSession ||
      !routeGuidanceDependencies.routeMapAreaCatalog ||
      !routeGuidanceDependencies.routeMapAssetsLoader ||
      !routeGuidanceDependencies.snapshotRepository ||
      !routeGuidanceDependencies.matrixRepository ||
      !routeGuidanceDependencies.orchestrationService ||
      !routeGuidanceDependencies.navigationRuntimeController ||
      !routeGuidanceDependencies.routeGuidanceController
    ) {
      throw new Error("BrowserEventBinding requires assembled dependencies");
    }
    this.eventDayRepository = eventDayDependencies.repository;
    this.activeEventDaySession = eventDayDependencies.activeEventDaySession;
    this.activeEventDayReader = eventDayDependencies.activeEventDayReader;
    this.backgroundProcess = eventDayDependencies.backgroundProcess;
    this.circleStatusController = eventDayDependencies.circleStatusController;
    this.pendingGasUpdatesController =
      eventDayDependencies.pendingGasUpdatesController;
    this.loadEventRegistryOperation = eventDayDependencies.loadEventRegistry;
    this.completeCircleVisit = options.completeCircleVisit;
    this.eventRegistry = eventDayDependencies.eventRegistry ?? null;
    this.eventRegistryUrl = eventDayDependencies.eventRegistryUrl ?? null;
    this.localDataDeletionUseCase = options.localDataDeletionUseCase;
    this.spreadsheetTitle = "";
    this.routeGuidanceSession = routeGuidanceDependencies.routeGuidanceSession;
    this.routeMapAreaCatalog = routeGuidanceDependencies.routeMapAreaCatalog;
    this.routeMapAssetsLoader = routeGuidanceDependencies.routeMapAssetsLoader;
    this.snapshotRepository = routeGuidanceDependencies.snapshotRepository;
    this.matrixRepository = routeGuidanceDependencies.matrixRepository;
    this.orchestrationService = routeGuidanceDependencies.orchestrationService;
    this.navigationRuntimeController =
      routeGuidanceDependencies.navigationRuntimeController;
    this.routeGuidanceController = routeGuidanceDependencies.routeGuidanceController;
    const baseSession = options.circleDataSourceSession;
    this.circleDataSourceController = options.circleDataSourceController;
    let tokenSeq = 0;
    const busyLanes = new Set();
    let gasAbortController = null;
    const rawSetBusy = baseSession.setBusy.bind(baseSession);

    this.session = Object.assign(baseSession, {
      setBusy: (lane, busy) => {
        if (typeof lane === "boolean") {
          busyLanes.clear();
          if (lane) busyLanes.add("default");
          rawSetBusy(lane);
          return;
        }
        if (busy) {
          busyLanes.add(lane);
        } else {
          busyLanes.delete(lane);
        }
        rawSetBusy(busyLanes.size > 0);
      },
      isBusy: (lane) => {
        if (!lane) return baseSession.getSnapshot().busy;
        return busyLanes.has(lane);
      },
      isAnyBusy: () => busyLanes.size > 0 || baseSession.getSnapshot().busy,
      nextRequestToken: () => ++tokenSeq,
      beginSourceRequest: () => {
        this.session.abortGasRequest();
        this.session.clearPreview();
        this.session.setBusy("source-request", true);
        return ++tokenSeq;
      },
      isLatestRequestToken: (token) => token === tokenSeq,
      setGasAbortController: (ctrl) => {
        gasAbortController = ctrl;
      },
      getGasAbortController: () => gasAbortController,
      abortGasRequest: () => {
        if (gasAbortController) {
          gasAbortController.abort();
          gasAbortController = null;
        }
      },
      setActivePreview: (preview) => baseSession.setPreview(preview),
      getActivePreview: () => baseSession.getSnapshot().preview,
      clearPreview: () => baseSession.setPreview(null),
      onEventDayChange: () => {
        ++tokenSeq;
        this.session.abortGasRequest();
        this.session.clearPreview();
        this.session.setBusy("source-request", false);
      },
      onSettingsClose: () => {
        this.session.onEventDayChange();
        busyLanes.clear();
        baseSession.setBusy(false);
      },
    });
    this.ui = new DomRouteGuidanceView();
    this.activeEventDaySession.subscribe(() => {
      if (this.ui) {
        this.updateManagementModels();
        this.ui.updateCounts?.(this);
      }
    });
    baseSession.subscribe(() => {
      if (this.ui && !this.suppressSessionModelUpdates)
        this.updateManagementModels();
    });
    this.currentStartSpace = "";
    this.selectionMessage = "";
    this.selectionToken = 0;
    this.currentManifest = null;
    this.transitionToken = 0;
    this.isTransitioning = false;
    this.activeResumeSnapshot = null;
    this.navigationMatrixRef = null;
    this.optimizationTimeLimitMs =
      DEFAULT_NAVIGATION_OPTIMIZATION_TIME_LIMIT_MS;
    this.sourceErrorMessage = "";
    this.outboxResultMessage = "";
    this.outboxErrorMessage = "";
    this.suppressSessionModelUpdates = false;
    this.activeDeleteScope = null;
    this.deleteErrorMessage = "";
    this.settingsEscapeHandler = null;
    this.ownedEventListeners = [];
    this.ownedTimers = new Set();
    this.ownedTimerCancels = new Map();
    this.downloadAdapter = {
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
      click: (url, filename) => {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      },
    };

  }

  showToast(message, type) {
    this.ui?.showToast?.(message, type);
  }

  getSpreadsheetTitle() {
    return this.spreadsheetTitle || "";
  }

  addOwnedEventListener(target, type, listener, options) {
    if (target && typeof target.addEventListener === "function") {
      target.addEventListener(type, listener, options);
      this.ownedEventListeners.push(() =>
        target.removeEventListener(type, listener),
      );
    }
  }

  scheduleTimeout(callback, delay, onCancel) {
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
      await bootstrapApp(this);
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

  async loadEventRegistry() {
    if (this.eventRegistry) {
      return { registry: this.eventRegistry, registryUrl: this.eventRegistryUrl ?? "" };
    }
    const loaded = await this.loadEventRegistryOperation();
    this.eventRegistry = loaded.registry;
    this.eventRegistryUrl = loaded.registryUrl;
    return loaded;
  }

  async openEventDay(ref) {
    const event = this.eventRegistry?.events.find(
      (candidate) => candidate.eventId === ref.eventId,
    );
    if (!event?.days.some((day) => day.dayId === ref.dayId)) {
      throw new Error("Event/Day not found in registry");
    }
    const state =
      this.eventDayRepository.load(ref) ??
      {
        schemaVersion: 2,
        source: { type: "csv", fileName: "empty.csv" },
        sourceGeneration: `source-${Date.now()}`,
        circles: [],
        circleStates: {},
        gasOutbox: [],
        timestamps: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sourceUpdatedAt: new Date().toISOString(),
        },
      };
    this.eventDayRepository.saveAndRememberLastOpened(ref, state);
    this.activeEventDaySession.setActiveEventDay(ref, state);
    return state;
  }

  startSyncCoordinator() {
    this.backgroundProcess.start();
  }

  disposeSyncCoordinator() {
    this.backgroundProcess.stop();
  }

  discardOutboxEntries(ref, ids) {
    for (const id of ids) this.pendingGasUpdatesController.discardOne(ref, id);
    return this.eventDayRepository.load(ref) ?? this.activeState;
  }

  addPurchased(space) {
    if (!this.activeRef || !this.activeState) throw new Error("No event/day is open");
    const result = this.completeCircleVisit({
      eventDay: this.activeRef,
      circleSpace: space,
      nextStatus: "purchased",
      expectedSourceGeneration: this.activeState.sourceGeneration,
    });
    return result.state;
  }

  addHold(space) {
    if (!this.activeRef || !this.activeState) throw new Error("No event/day is open");
    const result = this.completeCircleVisit({
      eventDay: this.activeRef,
      circleSpace: space,
      nextStatus: "held",
      expectedSourceGeneration: this.activeState.sourceGeneration,
    });
    return result.state;
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

  async flushActiveOutbox() {
    if (!this.activeRef) return { sent: 0, pending: 0, error: null };
    const sent = await this.pendingGasUpdatesController.retryAll(this.activeRef);
    const pending = this.activeState?.gasOutbox.length ?? 0;
    return { sent, pending, error: pending ? new Error("Pending GAS updates remain") : null };
  }

  /** Rebuild the management selector and source manager models from registry and local state. */
  updateManagementModels() {
    if (!this.eventRegistry) return;
    const states = this.eventDayRepository
      .listEventDays()
      .map((ref) => ({
        ref,
        state: this.eventDayRepository.load(ref),
      }))
      .filter((item) => item.state !== null);

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

    const sourceSummary = activeState
      ? formatSourceSummary(activeState)
      : {
          typeLabel: "CSV",
          detail: "empty.csv",
          endpointSummary: null,
          pendingCount: 0,
        };

    const pendingCount = activeState ? activeState.gasOutbox.length : 0;
    const sourceType = activeState?.source.type === "gas" ? "gas" : "csv";
    const activeCircleCount = activeState
      ? activeState.circles.filter((circle) => !circle.removedFromSource).length
      : 0;
    const canExportCsv = activeCircleCount > 0;
    const sourceSessionSnapshot = this.session.getSnapshot();

    const sourceManagerModel = {
      activeRef: activeRef ? { ...activeRef } : null,
      activeRefLabel,
      source: sourceSummary,
      sourceType,
      gasUrlInput:
        sourceSessionSnapshot.draftWebAppUrl ||
        (activeState?.source.type === "gas" ? activeState.source.gasUrl : ""),
      selectedSheetName:
        sourceSessionSnapshot.selectedSheetName ||
        (activeState?.source.type === "gas"
          ? activeState.source.sheetName
          : ""),
      sheetNames: sourceSessionSnapshot.sheetNames,
      pendingCount,
      canExportCsv,
      busy:
        this.session.isBusy("source-request") ||
        this.session.isBusy("transition"),
      errorMessage:
        this.session.getSnapshot().errorMessage ||
        this.sourceErrorMessage ||
        "",
    };

    const outboxPanelModel = buildOutboxPanelModel(
      this.eventRegistry,
      states,
      {
        processing: this.session.isBusy("outbox-retry"),
        resultMessage: this.outboxResultMessage || "",
        errorMessage: this.outboxErrorMessage || "",
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

    const activeOption = this.activeDeleteScope
      ? deleteOptions.find(
          (opt) =>
            opt.scope.type === this.activeDeleteScope.type &&
            (opt.scope.type === "all-events" ||
              (opt.scope.ref.eventId === this.activeDeleteScope.ref?.eventId &&
                opt.scope.ref.dayId === this.activeDeleteScope.ref?.dayId)),
        ) || null
      : null;

    const deleteDialogModel = {
      open: Boolean(this.activeDeleteScope),
      scope: this.activeDeleteScope,
      option: activeOption,
      eventDayLabel: activeRefLabel,
      busy: this.session.isBusy("storage-delete"),
      errorMessage: this.deleteErrorMessage || "",
    };

    this.ui?.updateSettingsState({
      eventDayOptions: options,
      selectedEventId: this.activeRef?.eventId || "",
      selectedDayId: this.activeRef?.dayId || "",
      sourceManagerModel,
      outboxPanelModel,
      deleteOptions,
      deleteDialogModel,
    });
  }

  openSourceDiffDialog(sourceLabel, diffViewModel, errorMessage = "") {
    const dialog = document.getElementById("source-diff-dialog");
    const activePreview = this.session.getActivePreview();
    if (!dialog || !activePreview) return;

    dialog.model = {
      open: true,
      previewId: activePreview.previewId,
      sourceLabel,
      diff: diffViewModel,
      busy: this.session.isBusy("preview-apply"),
      errorMessage,
    };
  }

  closeSourceDiffDialog() {
    const dialog = document.getElementById("source-diff-dialog");
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
    const activePreview = this.session.getActivePreview();
    if (activePreview) {
      this.circleDataSourceController?.cancelPreview(activePreview.previewId);
      this.session.setPreview(null);
    }
    this.closeSourceDiffDialog();
  }

  /** Delegates outbox retry requests to the GasSyncCoordinator. */
  async handleGasRetryRequest(detail) {
    if (
      !detail ||
      (detail.ref !== null &&
        detail.ref !== undefined &&
        !isEventDayRef(detail.ref))
    ) {
      return;
    }
    const ref = detail.ref || undefined;
    this.suppressSessionModelUpdates = true;
    const requestToken = this.session.nextRequestToken();
    this.session.setBusy("outbox-retry", true);
    this.outboxResultMessage = "";
    this.outboxErrorMessage = "";
    this.updateManagementModels();

    try {
      const processed = this.pendingGasUpdatesController
        ? await this.pendingGasUpdatesController.retryAll(ref)
        : 0;
      if (!this.session.isLatestRequestToken(requestToken)) return;
      this.session.setBusy("outbox-retry", false);

      this.ui.showToast(`GAS同期完了 (${processed}件送信)`);
      this.outboxResultMessage = `送信完了 (${processed}件)`;
    } catch (_error) {
      if (!this.session.isLatestRequestToken(requestToken)) return;
      this.session.setBusy("outbox-retry", false);
      this.outboxErrorMessage = "再送処理中にエラーが発生しました。";
      this.ui.showToast("再送エラー", "error");
    } finally {
      this.suppressSessionModelUpdates = false;
      if (this.session.isLatestRequestToken(requestToken)) {
        this.updateManagementModels();
        this.ui?.updateCounts?.(this);
      }
    }
  }

  /** Opens the delete dialog for a chosen deletion scope. */
  handleDeleteOptionSelect(scope) {
    if (!isDeleteScope(scope)) return;
    const options = this.ui.els.settingsArea?.deleteOptions || [];
    const option = options.find((candidate) => {
      if (candidate.scope.type !== scope.type) return false;
      if (scope.type === "all-events") return true;
      return sameEventDayRef(candidate.scope.ref, scope.ref);
    });
    if (!option || option.blocked) return;

    this.activeDeleteScope = option.scope;
    this.deleteErrorMessage = "";
    this.updateManagementModels();
  }

  /** Closes the delete dialog without changing local data. */
  handleDeleteDialogCancel() {
    this.activeDeleteScope = null;
    this.deleteErrorMessage = "";
    this.updateManagementModels();
  }

  /** Verifies scope & confirmation and performs safe local data deletion. */
  async handleStorageDeleteRequest(detail) {
    if (!detail || typeof detail !== "object" || !isDeleteScope(detail.scope)) {
      return;
    }
    const { scope, confirmation } = detail;
    if (scope.type === "all-events" && confirmation !== "全イベントを削除") {
      return;
    }

    const token = this.session.nextRequestToken();
    const activeRefBeforeDelete = this.activeRef
      ? { ...this.activeRef }
      : null;
    this.session.setBusy("storage-delete", true);
    this.deleteErrorMessage = "";
    this.updateManagementModels();

    try {
      const deletionScope =
        scope.type === "all-events"
          ? { kind: "all-event-days" }
          : {
              kind: scope.type === "circles" ? "circle-source" : scope.type,
              eventDay: scope.ref,
            };
      await this.localDataDeletionUseCase.execute(deletionScope);
      if (!this.session.isLatestRequestToken(token)) return;

      this.session.setBusy("storage-delete", false);
      this.activeDeleteScope = null;

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
        const nextRef =
          remainingList.length > 0
            ? remainingList[0]
            : {
                eventId: this.eventRegistry.events[0].eventId,
                dayId: this.eventRegistry.events[0].days[0].dayId,
              };
        const nextState = this.eventDayRepository.load(nextRef);
        if (nextState) {
          this.eventDayRepository.rememberLastOpenedEventDay(nextRef);
          this.activeEventDaySession.setActiveEventDay(nextRef, nextState);
        } else {
          await this.openEventDay(nextRef);
        }

        if (!this.activeRef) {
          renderMapBootstrapError(
            document,
            new Error("No active event/day remains after deletion"),
          );
          return;
        }
      } else if (activeRefSourceDeleted) {
        this.invalidateNavigationForSourceChange(activeRefBeforeDelete);
        this.ui.showTarget(null);
        this.updateManagementModels();
        this.ui.updateCounts(this);
      } else {
        this.updateManagementModels();
        this.ui.updateCounts(this);
      }
      this.ui.showToast("データを削除しました");
    } catch (_error) {
      if (!this.session.isLatestRequestToken(token)) return;
      this.session.setBusy("storage-delete", false);
      if (activeRefBeforeDelete && !this.activeRef) {
        renderMapBootstrapError(
          document,
          new Error("No active event/day remains after deletion"),
        );
        return;
      }
      this.deleteErrorMessage = "データの削除に失敗しました。";
      this.updateManagementModels();
      this.ui.showToast("削除エラー", "error");
    }
  }

  /** Verifies exact confirmation text and discards selected outbox entries. */
  async handleGasDiscardRequest(detail) {
    if (
      !isEventDayRef(detail?.ref) ||
      !Array.isArray(detail.ids) ||
      !detail.ids.every((id) => typeof id === "string" && id.length > 0) ||
      detail.confirmation !== "未送信を破棄"
    ) {
      return;
    }

    try {
      this.discardOutboxEntries(
        detail.ref,
        detail.ids,
        new Date().toISOString(),
      );
      this.outboxResultMessage = "選択した未送信データを破棄しました";
      this.outboxErrorMessage = "";
      this.ui.showToast("未送信データを破棄しました");
    } catch (_error) {
      this.outboxErrorMessage = "未送信データの破棄に失敗しました";
      this.ui.showToast("破棄エラー", "error");
    } finally {
      this.updateManagementModels();
      this.ui?.updateCounts?.(this);
    }
  }

  /**
   * 初期化実行
   */
  async init(manifest, initialRef = null, loadedRegistry = null) {
    if (loadedRegistry) {
      this.eventRegistry = loadedRegistry.registry;
      this.eventRegistryUrl = loadedRegistry.registryUrl;
    } else {
      await this.loadEventRegistry();
    }

    const devDemoEnabled = isDevDemoEnabled(window.location);
    if (devDemoEnabled) {
      const demoData = createDevDemoData();
      this.spreadsheetTitle = demoData.spreadsheetTitle;
      const demoRef = { eventId: "demo-v1", dayId: "day1" };
      const now = new Date().toISOString();
      const purchased = new Set(demoData.purchasedList);
      const held = new Set(demoData.holdList);
      const circleStates = {};
      for (const circle of demoData.wantToBuy) {
        if (purchased.has(circle.space))
          circleStates[circle.space] = "purchased";
        else if (held.has(circle.space)) circleStates[circle.space] = "held";
      }
      const demoState = {
        schemaVersion: 2,
        source: { type: "csv", fileName: "demo-ui.csv" },
        sourceGeneration: "demo-ui",
        circles: demoData.wantToBuy,
        circleStates,
        gasOutbox: [],
        timestamps: { createdAt: now, updatedAt: now, sourceUpdatedAt: now },
      };
      this.eventDayRepository.save(demoRef, demoState);
      this.activeEventDaySession.setActiveEventDay(demoRef, demoState);
    } else {
      const isRegisteredRef = (ref) => {
        const event = this.eventRegistry?.events.find(
          (candidate) => candidate.eventId === ref?.eventId,
        );
        return Boolean(event?.days.some((day) => day.dayId === ref?.dayId));
      };
      let activeRef = initialRef || this.eventDayRepository.getLastOpenedEventDay();
      if (!activeRef || !isRegisteredRef(activeRef)) {
        const defaultEvent = this.eventRegistry?.events[0];
        if (!defaultEvent || defaultEvent.days.length === 0) {
          renderMapBootstrapError(
            document,
            new Error("Event registry has no selectable event/day"),
          );
          return;
        }
        activeRef = {
          eventId: defaultEvent.eventId,
          dayId: defaultEvent.days[0].dayId,
        };
      }

      try {
        await this.openEventDay(activeRef);
        this.currentManifest = manifest;
      } catch (error) {
        console.error("Failed to open initial event day:", error);
        renderMapBootstrapError(document, error);
        return;
      }
    }

    this.ui.init(this, {
      onSetNextTarget: (circle) => this.handleSetNextTarget(circle),
      onSelectTarget: (circle) => this.handleSelectTarget(circle),
      onPreviewRoute: () => this.handlePreviewRoute(),
      onConfirmRoute: () => this.handleConfirmRoute(),
      onCancelRoute: () => this.handleCancelRoute(),
    });
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
    if (this.activeRef && this.activeState) {
      const pendingCircleSpaces = this.activeState.circles
        .filter(
          (c) =>
            !c.removedFromSource &&
            (this.activeState.circleStates[c.space] === undefined ||
              this.activeState.circleStates[c.space] === "pending"),
        )
        .map((c) => c.space);

      const startupResult = this.navigationRuntimeController.initStartup({
        eventId: this.activeRef.eventId,
        dayId: this.activeRef.dayId,
        bundleVersion: manifest?.bundleVersion || "",
        circleStates: this.activeState.circleStates,
        pendingCircleSpaces,
      });

      if (startupResult.shouldShowResumeDialog && startupResult.snapshot) {
        this.activeResumeSnapshot = startupResult.snapshot;
        const dialog = document.getElementById("navigation-resume-dialog");
        if (dialog) {
          dialog.targetSpace = startupResult.snapshot.navState.targetSpace;
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

  /** Cleanup event listeners and coordinator timers. */
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    this.transitionToken += 1;
    this.selectionToken += 1;
    this.managementSession?.stop();
    this.ui?.stop?.();
    this.disposeSyncCoordinator();
    for (const remove of this.ownedEventListeners.splice(0)) remove();
    for (const timer of this.ownedTimers) clearTimeout(timer);
    this.ownedTimers.clear();
    for (const cancel of this.ownedTimerCancels.values()) cancel();
    this.ownedTimerCancels.clear();
    this.navigationRuntimeController.dispose();
    if (this.settingsEscapeHandler) {
      document.removeEventListener("keydown", this.settingsEscapeHandler);
      this.settingsEscapeHandler = null;
    }
    for (const id of [
      "toggle-settings",
      "btn-open-gallery",
      "btn-search",
      "btn-purchased",
      "btn-hold",
      "btn-reset-all",
    ]) {
      const element = document.getElementById(id);
      if (element) element.onclick = null;
    }
  }

  /** Atomically applies one Route Guidance state transition through its Session. */
  replaceRouteGuidanceSnapshot(changes) {
    this.routeGuidanceSession.replaceSnapshot({
      ...this.routeGuidanceSession.getSnapshot(),
      ...changes,
    });
  }

  /** Derives the next circle from the current Route Guidance order. */
  getNextTarget(snapshot = this.routeGuidanceSession.getSnapshot()) {
    const nextSpace = snapshot.navigationState?.bestOrder.find(
      (space) => space !== snapshot.navigationState.targetSpace,
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
      selectionState: snapshot.selectionStatus,
      selectionMessage: this.selectionMessage,
      fitMode,
    };
  }

  /** Persist the current navigation state when all snapshot identity fields exist. */
  saveNavigationSnapshot() {
    const activeRef = this.activeRef;
    const bundleVersion = this.currentManifest?.bundleVersion;
    const navState = this.routeGuidanceSession.getSnapshot().navigationState;
    if (!activeRef || !bundleVersion || !navState?.areaId) return;

    const snapshot = {
      schemaVersion: 1,
      eventId: activeRef.eventId,
      dayId: activeRef.dayId,
      areaId: navState.areaId,
      bundleVersion,
      matrixRef: this.navigationMatrixRef || null,
      navState,
      optimizationTimeLimitMs: this.optimizationTimeLimitMs,
      savedAt: new Date().toISOString(),
    };
    try {
      this.navigationRuntimeController.saveSnapshot(
        activeRef.eventId,
        activeRef.dayId,
        snapshot,
      );
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
      this.navigationRuntimeController.clearSnapshot(ref.eventId, ref.dayId);
    } catch (error) {
      console.warn("Navigation snapshot could not be cleared.", error);
      this.ui.showToast("案内状態の削除に失敗しました", "warning");
    }
  }

  /** Invalidate runtime navigation and caches after circle identity changes. */
  invalidateNavigationForSourceChange(ref) {
    this.clearNavigationSnapshot(ref);
    try {
      this.matrixRepository.deleteByEventDay(ref.eventId, ref.dayId);
    } catch (error) {
      console.warn(
        "Distance matrix could not be cleared after source update.",
        error,
      );
    }
    this.resetNavigationRuntimeState();
  }

  resetNavigationRuntimeState() {
    this.navigationMatrixRef = null;
    this.activeResumeSnapshot = null;
    this.currentStartSpace = "";
    this.replaceRouteGuidanceSnapshot({
      navigationState: null,
      currentDestination: null,
      currentRoute: null,
      selectedDestination: null,
      selectedRoute: null,
    });
  }

  /** Copy exact grid distance and adopted endpoint onto a circle view model. */
  targetWithRoute(target, route) {
    if (!target || !route) return target;
    return {
      ...target,
      gridDistance: Math.round(route.cost),
      mapPosition: route.targetPosition,
    };
  }

  /** Resolve an exact same-area route using cached, runtime-validated assets. */
  async planGridRoute(startSpace, targetSpace, options = {}) {
    if (!areSpacesInSameArea(startSpace, targetSpace, this.routeMapAreaCatalog)) return null;
    const area = findAreaForSpace(startSpace, this.routeMapAreaCatalog);
    const assets = await this.loadGridRouteAssets(area);
    if (!assets) return null;
    return planRoute(
      assets.pointsPayload,
      assets.gridMeta,
      assets.gridBytes,
      startSpace,
      targetSpace,
      options,
    );
  }

  /** Select a pin without changing the active destination or route. */
  async handleSelectTarget(circle) {
    if (
      !circle ||
      this.routeGuidanceSession.getSnapshot().selectionStatus === "comparing"
    )
      return;

    const token = ++this.selectionToken;
    this.replaceRouteGuidanceSnapshot({
      selectedDestination: circle,
      selectedRoute: null,
      selectionStatus: "loading",
    });
    this.selectionMessage = "候補経路を計算中…";
    this.ui.showNavigation(this.getNavigationContext("preserve"));

    const currentRoute = this.routeGuidanceSession.getSnapshot().currentRoute;
    if (
      !currentRoute ||
      !areSpacesInSameArea(
        this.currentStartSpace,
        circle.space,
        this.routeMapAreaCatalog,
      )
    ) {
      if (token !== this.selectionToken) return;
      this.replaceRouteGuidanceSnapshot({ selectionStatus: "error" });
      this.selectionMessage = "同じ地図エリアの正式な経路を計算できません";
      this.ui.showNavigation(this.getNavigationContext("preserve"));
      return;
    }

    try {
      const route = await this.planGridRoute(
        this.currentStartSpace,
        circle.space,
        { startPosition: currentRoute.startPosition },
      );
      if (token !== this.selectionToken) return;
      if (!route) {
        this.replaceRouteGuidanceSnapshot({ selectionStatus: "error" });
        this.selectionMessage = "候補地点までの経路を探索できません";
      } else {
        this.replaceRouteGuidanceSnapshot({
          selectedRoute: route,
          selectedDestination: this.targetWithRoute(circle, route),
          selectionStatus:
            circle.space ===
            this.routeGuidanceSession.getSnapshot().currentDestination?.space
              ? "idle"
              : "ready",
        });
        this.selectionMessage = "";
      }
    } catch (error) {
      if (token !== this.selectionToken) return;
      console.warn("Selected target route could not be calculated.", error);
      this.replaceRouteGuidanceSnapshot({ selectionStatus: "error" });
      this.selectionMessage =
        "候補経路の読込に失敗しました。もう一度お試しください";
    }

    const fitMode =
      this.routeGuidanceSession.getSnapshot().selectionStatus === "ready"
        ? "comparison"
        : "preserve";
    this.ui.showNavigation(this.getNavigationContext(fitMode));
  }

  /** Enter the two-route comparison state after a candidate route is ready. */
  handlePreviewRoute() {
    const snapshot = this.routeGuidanceSession.getSnapshot();
    if (snapshot.selectionStatus !== "ready" || !snapshot.selectedRoute) return;
    this.replaceRouteGuidanceSnapshot({ selectionStatus: "comparing" });
    this.ui.showNavigation(this.getNavigationContext("comparison"));
  }

  /** Promote the compared candidate to the active destination without recalculation. */
  handleConfirmRoute() {
    const snapshot = this.routeGuidanceSession.getSnapshot();
    if (
      snapshot.selectionStatus !== "comparing" ||
      !snapshot.selectedDestination ||
      !snapshot.selectedRoute
    )
      return;
    this.replaceRouteGuidanceSnapshot({
      currentDestination: snapshot.selectedDestination,
      currentRoute: snapshot.selectedRoute,
      selectionStatus: "idle",
    });
    this.selectionMessage = "";
    this.ui.showNavigation(this.getNavigationContext("current"));
    this.ui.showToast(`目的地を ${snapshot.selectedDestination.space} に変更しました`);
  }

  /** Leave comparison while retaining the selected target details. */
  handleCancelRoute() {
    if (this.routeGuidanceSession.getSnapshot().selectionStatus !== "comparing")
      return;
    this.replaceRouteGuidanceSnapshot({ selectionStatus: "ready" });
    this.ui.showNavigation(this.getNavigationContext("comparison"));
  }

  /**
   * 手動で目的地を設定
   */
  async handleSetNextTarget(circle) {
    if (!circle) return;

    // The dev-only UI fixture intentionally has no production map bundle.
    if (isDevDemoEnabled(window.location)) {
      return this.handleSetNextTargetDevDemo(circle);
    }

    this.selectionToken += 1;
    const currentNavigationState =
      this.routeGuidanceSession.getSnapshot().navigationState;
    const currentPosition = currentNavigationState?.currentPosition;
    if (!currentNavigationState || !currentPosition) {
      this.ui.showToast(
        "現在地が確定していないため、目的地を変更できません",
        "error",
      );
      return;
    }

    this.ui.showLoading();
    let route = null;
    try {
      const lockedFrom = currentNavigationState.lockedFirstLeg?.from;
      if (lockedFrom?.type === "start") {
        const area = this.routeMapAreaCatalog
          .getAllMapAreas()
          .find((candidate) => candidate.id === lockedFrom.areaId);
        const assets = area ? await this.loadGridRouteAssets(area) : null;
        if (assets) {
          route = planRouteFromGridIndex(
            assets.pointsPayload,
            assets.gridMeta,
            assets.gridBytes,
            currentPosition.gridIndex,
            circle.space,
          );
        }
      } else if (lockedFrom?.type === "circle") {
        route = await this.planGridRoute(lockedFrom.space, circle.space);
      }
    } catch (error) {
      console.warn(
        "Selected target grid distance could not be calculated.",
        error,
      );
    }
    if (!route) {
      this.ui.showToast(
        "経路の再構築に失敗したため、目的地を変更できません",
        "error",
      );
      return;
    }

    let manualTargetResult;
    try {
      manualTargetResult = this.orchestrationService.handleManualTarget(
        currentNavigationState,
        circle.space,
      );
    } catch (error) {
      console.warn("Manual target change could not be applied.", error);
      this.ui.showToast("目的地を変更できませんでした", "error");
      return;
    }

    this.currentStartSpace =
      currentPosition.source === "arrived-circle"
        ? currentPosition.circleSpace || ""
        : "";
    const target = this.targetWithRoute(circle, route);
    this.replaceRouteGuidanceSnapshot({
      navigationState: manualTargetResult.navState,
      currentRoute: route,
      currentDestination: target,
      selectedDestination: target,
      selectedRoute: route,
      selectionStatus: "idle",
    });
    this.selectionMessage = "";
    this.ui.showNavigation(this.getNavigationContext("current"));
    this.ui.showToast(`目的地を ${circle.space} に設定しました`);
    this.saveNavigationSnapshot();
  }

  readCurrentSpace() {
    const areaId = document.getElementById("loc-ewsn").value;
    const area = this.routeMapAreaCatalog
      .getAllMapAreas()
      .find((candidate) => candidate.id === areaId);
    const currentSpace = buildSpaceFromLocation({
      areaName: area?.prefixes[0] || "",
      label: document.getElementById("loc-label").value,
      number: document.getElementById("loc-number").value,
    });

    if (!currentSpace) {
      this.ui.showToast("現在地の番号は1〜99で入力してください");
    }
    return currentSpace;
  }

  /** Legacy gallery target behavior used only by the dev UI fixture. */
  async handleSetNextTargetDevDemo(circle) {
    this.selectionToken += 1;
    const currentSpace = this.readCurrentSpace();
    if (!currentSpace) return;

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
    this.ui.showNavigation(this.getNavigationContext("current"));
    this.ui.showToast(`目的地を ${circle.space} に設定しました`);
  }

  /**
   * イベントリスナーの設定
   */
  setupEvents() {
    // 設定ボタン
    const settingsToggle = document.getElementById("toggle-settings");
    settingsToggle.onclick = () => {
      const isOpen = !this.ui.els.settingsArea.open;
      if (!isOpen) {
        this.clearActivePreviewIfAny();
        this.session.onSettingsClose();
        this.sourceErrorMessage = "";
        this.outboxResultMessage = "";
        this.outboxErrorMessage = "";
        this.ui.setSettingsError("");
        this.updateManagementModels();
      }
      this.ui.toggleSettings(document.getElementById("toggle-settings"));
    };

    this.settingsEscapeHandler = (event) => {
      if (event.key !== "Escape" || !this.ui.els.settingsArea.open) return;
      event.preventDefault();
      settingsToggle.click();
      settingsToggle.focus();
    };
    this.addOwnedEventListener(document, "keydown", this.settingsEscapeHandler);

    const btnOpenGallery = document.getElementById("btn-open-gallery");
    if (btnOpenGallery) {
      btnOpenGallery.onclick = () => {
        const areaId = document.getElementById("loc-ewsn").value;
        const area = this.routeMapAreaCatalog
          .getAllMapAreas()
          .find((candidate) => candidate.id === areaId);
        this.ui.showGallery(area?.name || areaId, false);
      };
    }

    const settings = this.ui.els.settingsArea;

    this.addOwnedEventListener(settings, "gas-retry-request", (e) => {
      this.handleGasRetryRequest(e.detail);
    });

    this.addOwnedEventListener(
      settings,
      "optimization-time-limit-change",
      (e) => {
        const value = Number(e.detail?.searchTimeLimitMs);
        if ([5000, 10000, 15000].includes(value)) {
          this.optimizationTimeLimitMs = value;
          if (this.routeGuidanceSession.getSnapshot().navigationState)
            this.saveNavigationSnapshot();
        }
      },
    );

    this.addOwnedEventListener(settings, "gas-discard-request", (e) => {
      this.handleGasDiscardRequest(e.detail);
    });

    this.addOwnedEventListener(settings, "delete-option-select", (e) => {
      this.handleDeleteOptionSelect(e.detail.scope);
    });

    this.addOwnedEventListener(settings, "storage-delete-request", (e) => {
      this.handleStorageDeleteRequest(e.detail);
    });

    this.addOwnedEventListener(settings, "storage-delete-cancel", () => {
      this.handleDeleteDialogCancel();
    });

    const resumeDialog = document.getElementById("navigation-resume-dialog");
    if (resumeDialog) {
      this.addOwnedEventListener(resumeDialog, "resume-confirm", () => {
        this.handleResumeConfirm();
      });
      this.addOwnedEventListener(resumeDialog, "resume-reset-start", () => {
        this.handleResumeResetStart();
      });
    }

    // 各種ボタンアクション
    document.getElementById("btn-search").onclick = () => this.searchNext();

    document.getElementById("btn-purchased").onclick = () =>
      this.handleAction("purchase");
    document.getElementById("btn-hold").onclick = () =>
      this.handleAction("hold");

    document.getElementById("btn-reset-all").onclick = () => this.handleReset();

    // 保留リストリセットのコールバック設定 (StatsRenderer経由)
    if (this.ui.statsRenderer) {
      this.ui.statsRenderer.setOnHoldListReset(() => {
        this.handleResetHold();
      });
    }
  }

  /**
   * データ更新処理
   */
  async refreshData(force = false) {
    void force;
    this.ui.setSettingsError("GAS同期はPhase 2では利用できません");
    this.ui.showToast("GAS同期はPhase 2では利用できません");
  }

  async loadGridRouteAssets(area) {
    if (!area?.id) {
      return null;
    }
    if (!area.pointsFile || !area.gridMetaFile || !area.gridFile) return null;
    try {
      const assets = await this.routeMapAssetsLoader.loadMapAssets({
        areaId: area.id,
        assets: {
          points: area.pointsFile,
          gridMeta: area.gridMetaFile,
          grid: area.gridFile,
        },
      });
      return {
        pointsPayload: parsePointsPayload(assets.points),
        gridMeta: parseGridMeta(assets.gridMetadata),
        gridBytes: assets.gridBytes,
      };
    } catch (error) {
      console.warn("Grid distance assets could not be loaded.", error);
      return null;
    }
  }

  async rankCandidatesByGrid(currentSpace, candidates) {
    const area = findAreaForSpace(currentSpace, this.routeMapAreaCatalog);
    if (!area) return null;

    const sameAreaCandidates = [];
    const otherCandidates = [];
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

    const ranked = rankCandidatesByGridDistance(
      assets.pointsPayload,
      assets.gridMeta,
      assets.gridBytes,
      currentSpace,
      sameAreaCandidates,
    );
    const reachable = ranked
      .filter((item) => Number.isFinite(item.distance))
      .map((item) => ({
        ...item.candidate,
        gridDistance: Math.round(item.distance),
        ...(item.position ? { mapPosition: item.position } : {}),
      }));

    if (reachable.length === 0) return null;

    const unreachable = ranked
      .filter((item) => !Number.isFinite(item.distance))
      .map((item) => item.candidate);
    const fallbackRemainder = solveNearestNeighbor(
      currentSpace,
      [...unreachable, ...otherCandidates],
      this.routeMapAreaCatalog.getAllMapAreas(),
    ).slice(1);

    return [...reachable, ...fallbackRemainder];
  }

  /**
   * 次の目的地検索処理
   */
  searchNext(startSpace = "", notifyComplete = true) {
    if (isDevDemoEnabled(window.location)) {
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

    this.selectionToken += 1;
    this.ui.showLoading();

    // UI描画をブロックしないように非同期実行
    return new Promise((resolve) =>
      this.scheduleTimeout(
        async () => {
          const allCandidates = this.getUnvisited();
          if (allCandidates.length === 0) {
            this.clearNavigationSnapshot();
            this.resetNavigationRuntimeState();
            this.ui.showTarget(null);
            if (notifyComplete)
              this.ui.showToast("全てのサークルを回りました！");
            resolve();
            return;
          }

          // Initial navigation start via NavigationOrchestrationService
          const area = findAreaForSpace(
            currentSpace,
            this.routeMapAreaCatalog,
          );
          if (!area) {
            this.ui.showToast("現在地のエリアを特定できませんでした", "error");
            resolve();
            return;
          }

          // Each C108 area has an independent grid/session. Do not ask the
          // active area's points/grid assets to resolve circles from another
          // area; those remain pending until the user switches maps and sets a
          // start position there.
          const candidates = allCandidates.filter(
            (candidate) =>
              findAreaForSpace(candidate.space, this.routeMapAreaCatalog)?.id ===
              area.id,
          );
          if (candidates.length === 0) {
            this.ui.showToast(
              "現在のエリアに未訪問の候補がありません。地図を切り替えて始点を設定してください",
              "warning",
            );
            resolve();
            return;
          }

          const assets = await this.loadGridRouteAssets(area);
          if (!assets) {
            this.ui.showToast(
              "グリッド経路アセットの読み込みに失敗しました",
              "error",
            );
            resolve();
            return;
          }

          const startPortalIndex = this.findPointPortalIndex(
            assets.pointsPayload,
            assets.gridMeta,
            currentSpace,
          );

          if (startPortalIndex === null) {
            this.ui.showToast(
              "現在地のグリッド位置を特定できませんでした",
              "error",
            );
            resolve();
            return;
          }

          const startPointPosition = this.findPointPortalPosition(
            assets.pointsPayload,
            assets.gridMeta,
            currentSpace,
          );
          if (!startPointPosition) {
            this.ui.showToast(
              "現在地の表示位置を特定できませんでした",
              "error",
            );
            resolve();
            return;
          }

          const startPosition = {
            areaId: area.id,
            gridIndex: startPortalIndex,
            ...startPointPosition,
            source: "manual-start",
          };

          try {
            await this.routeGuidanceController.startFromCurrentLocation({
              eventDay: this.activeRef || {
                eventId: this.currentManifest?.eventId || "runtime",
                dayId: "active",
              },
              startPosition,
              pendingCircles: candidates,
            });
          } catch (error) {
            console.warn("Route guidance could not be started.", error);
            this.ui.showToast(
              "経路の再構築に失敗したため、案内を開始できませんでした",
              "error",
            );
            resolve();
            return;
          }

          const guidanceSnapshot = this.routeGuidanceSession.getSnapshot();
          const displayTarget = this.targetWithRoute(
            guidanceSnapshot.currentDestination,
            guidanceSnapshot.currentRoute,
          );
          this.currentStartSpace = currentSpace;
          this.replaceRouteGuidanceSnapshot({
            currentDestination: displayTarget,
            selectedDestination: displayTarget,
            selectionStatus: "idle",
          });
          this.selectionMessage = "";
          this.ui.showNavigation(this.getNavigationContext("current"));

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

    this.selectionToken += 1;
    this.ui.showLoading();

    return new Promise((resolve) =>
      this.scheduleTimeout(
        async () => {
          const candidates = this.getUnvisited();
          if (candidates.length === 0) {
            this.replaceRouteGuidanceSnapshot({
              currentDestination: null,
              currentRoute: null,
              selectedDestination: null,
              selectedRoute: null,
            });
            this.ui.showTarget(null);
            if (notifyComplete)
              this.ui.showToast("全てのサークルを回りました！");
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
              : solveNearestNeighbor(
                  currentSpace,
                  candidates,
                  this.routeMapAreaCatalog.getAllMapAreas(),
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
            this.replaceRouteGuidanceSnapshot({
              currentRoute: route,
              currentDestination: target,
              selectedDestination: target,
              selectedRoute: route,
              selectionStatus: "idle",
            });
            this.selectionMessage = "";
            this.ui.showNavigation(this.getNavigationContext("current"));
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
  async handleAction(type) {
    const guidanceSnapshot = this.routeGuidanceSession.getSnapshot();
    if (guidanceSnapshot.selectionStatus === "comparing") return;
    const actionTarget =
      guidanceSnapshot.selectedDestination || guidanceSnapshot.currentDestination;
    if (!actionTarget) return;

    const space = actionTarget.space;
    const sheetName = actionTarget.sheetName || "";
    try {
      if (type === "purchase") {
        this.addPurchased(space, sheetName);
        this.ui?.showToast(`${space} 購入！`);
      } else {
        this.addHold(space, sheetName);
        this.ui?.showToast(`${space} 保留`);
      }
    } catch (error) {
      this.reportLocalMutationFailure(error);
      return;
    }

    if (this.activeState?.source.type === "gas") {
      this.flushOutboxWithDiagnostic();
    }

    this.ui.updateCounts(this);
    this.updateManagementModels();
    this.ui.updateCurrentLocation(space); // 現在地を更新

    if (isDevDemoEnabled(window.location)) {
      void this.handleDevDemoAction(space);
      return;
    }

    if (type === "purchase" && guidanceSnapshot.navigationState) {
      const activeState = guidanceSnapshot.navigationState;
      const area = this.routeMapAreaCatalog
        .getAllMapAreas()
        .find((candidate) => candidate.id === activeState.areaId);
      const assets = area ? await this.loadGridRouteAssets(area) : null;
      const arrivedGridIndex = assets
        ? this.findPointPortalIndex(
            assets.pointsPayload,
            assets.gridMeta,
            space,
          )
        : null;
      const arrivedSvgPosition = assets
        ? this.findPointPortalPosition(
            assets.pointsPayload,
            assets.gridMeta,
            space,
          )
        : null;
      if (
        !activeState.areaId ||
        arrivedGridIndex === null ||
        !arrivedSvgPosition
      ) {
        this.ui.showToast(
          "現在地を確定できないため、次の案内へ進めません",
          "error",
        );
        return;
      }

      const arrivedPosition = {
        areaId: activeState.areaId,
        gridIndex: arrivedGridIndex,
        svgX: arrivedSvgPosition.svgX,
        svgY: arrivedSvgPosition.svgY,
        source: "arrived-circle",
        circleSpace: space,
      };
      let arrivedState;
      let purchasedState;
      try {
        arrivedState = this.orchestrationService.handleArrival(
          activeState,
          arrivedPosition,
        );
        purchasedState =
          this.orchestrationService.handlePurchaseNext(arrivedState);
      } catch (error) {
        console.warn("Purchase navigation state update failed.", error);
        return;
      }

      const nextTargetSpace = purchasedState.targetSpace;
      if (!nextTargetSpace) {
        this.replaceRouteGuidanceSnapshot({
          navigationState: purchasedState,
          currentDestination: null,
          currentRoute: null,
          selectedDestination: null,
          selectedRoute: null,
        });
        this.ui.showTarget(null);
        this.saveNavigationSnapshot();
        return;
      }

      const nextTarget = this.wantToBuy.find(
        (candidate) => candidate.space === nextTargetSpace,
      );
      if (!nextTarget) return;

      let route = null;
      try {
        const lockedFrom = purchasedState.lockedFirstLeg?.from;
        if (lockedFrom?.type === "circle") {
          route = await this.planGridRoute(lockedFrom.space, nextTargetSpace);
        } else if (lockedFrom?.type === "start") {
          const area = this.routeMapAreaCatalog
            .getAllMapAreas()
            .find((candidate) => candidate.id === lockedFrom.areaId);
          const assets = area ? await this.loadGridRouteAssets(area) : null;
          if (assets) {
            route = planRouteFromGridIndex(
              assets.pointsPayload,
              assets.gridMeta,
              assets.gridBytes,
              lockedFrom.gridIndex,
              nextTargetSpace,
            );
          }
        }
      } catch (error) {
        console.warn("Purchased target route could not be calculated.", error);
      }
      if (!route) {
        this.ui.showToast(
          "次の目的地への経路を再構築できませんでした。現在の案内を保持します",
          "error",
        );
        return;
      }

      const target = this.targetWithRoute(nextTarget, route);
      this.replaceRouteGuidanceSnapshot({
        navigationState: purchasedState,
        currentDestination: target,
        currentRoute: route,
        selectedDestination: target,
        selectedRoute: route,
      });
      this.ui.showNavigation(this.getNavigationContext("current"));
      this.saveNavigationSnapshot();
      return;
    }

    if (type !== "hold" || !guidanceSnapshot.navigationState) return;

    let holdResult;
    try {
      holdResult = this.orchestrationService.handleBeforeArrivalHold(
        guidanceSnapshot.navigationState,
      );
    } catch (error) {
      console.warn("Hold navigation state update failed.", error);
      return;
    }

    const nextTargetSpace = holdResult.navState.targetSpace;
    if (!nextTargetSpace) {
      this.ui.showTarget(null);
      this.clearNavigationSnapshot(this.activeRef);
      this.resetNavigationRuntimeState();
      return;
    }

    const nextTarget = this.wantToBuy.find(
      (candidate) => candidate.space === nextTargetSpace,
    );
    if (!nextTarget) return;

    const lockedFrom = holdResult.navState.lockedFirstLeg?.from;
    let route = null;
    try {
      if (lockedFrom?.type === "start") {
        const area = this.routeMapAreaCatalog
          .getAllMapAreas()
          .find((candidate) => candidate.id === lockedFrom.areaId);
        const assets = area ? await this.loadGridRouteAssets(area) : null;
        if (assets) {
          route = planRouteFromGridIndex(
            assets.pointsPayload,
            assets.gridMeta,
            assets.gridBytes,
            guidanceSnapshot.navigationState.currentPosition?.gridIndex ??
              lockedFrom.gridIndex,
            nextTargetSpace,
          );
        }
      } else if (lockedFrom?.type === "circle") {
        route = await this.planGridRoute(lockedFrom.space, nextTargetSpace);
      }
    } catch (error) {
      console.warn("Held target route could not be calculated.", error);
    }
    if (!route) {
      this.ui.showToast(
        "次の目的地への経路を再構築できませんでした。現在の案内を保持します",
        "error",
      );
      return;
    }

    const target = this.targetWithRoute(nextTarget, route);
    this.replaceRouteGuidanceSnapshot({
      navigationState: holdResult.navState,
      currentDestination: target,
      currentRoute: route,
      selectedDestination: target,
      selectedRoute: route,
    });
    this.ui.showNavigation(this.getNavigationContext("current"));
    this.saveNavigationSnapshot();
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
      if (this.activeState?.source.type === "gas") {
        this.flushOutboxWithDiagnostic();
      }
      this.clearNavigationSnapshot();
      this.resetNavigationRuntimeState();
      this.ui.updateCounts(this);
      this.ui.showTarget(null); // 表示クリア
      this.ui.els.targetSection.classList.add("hidden");
      this.ui.els.targetEmpty.classList.remove("hidden");
      this.ui.showToast("リセットしました");
    }
  }

  /** Show a recoverable diagnostic when the local mutation could not be saved. */
  reportLocalMutationFailure(error) {
    console.error("Failed to save local purchase state:", error);
    this.ui.showToast(
      "端末への保存に失敗しました。操作は反映されていません。",
      "error",
    );
  }

  /** Process GAS after local success and report failures without rolling back. */
  async flushOutboxWithDiagnostic() {
    try {
      const result = await this.flushActiveOutbox();
      if (result.error) {
        this.ui.showToast(
          "GAS同期に失敗しました。未送信データは端末に保持されています。",
          "warning",
        );
      }
    } catch (error) {
      console.error("Failed to process GAS outbox:", error);
      this.ui.showToast(
        "GAS同期に失敗しました。未送信データは端末に保持されています。",
        "warning",
      );
    }
  }

  /**
   * 案内再開の確定処理
   */
  async handleResumeConfirm() {
    if (!this.activeResumeSnapshot) return;

    const snapshot = this.activeResumeSnapshot;
    const resumeResult =
      this.navigationRuntimeController.resumeFromSnapshot(snapshot);

    const targetSpace = resumeResult.navState.targetSpace;
    const lockedLeg = resumeResult.navState.lockedFirstLeg;

    const targetCircle = targetSpace
      ? this.wantToBuy.find((c) => c.space === targetSpace) || null
      : null;

    if (!targetCircle) {
      const dialog = document.getElementById("navigation-resume-dialog");
      if (dialog) {
        dialog.errorMessage =
          "目的地が見つかりません。始点を再設定してください";
      }
      this.ui.showToast(
        "目的地が見つかりません。始点を再設定してください",
        "error",
      );
      return;
    }

    let route = null;
    if (lockedLeg?.from) {
      if (lockedLeg.from.type === "start") {
        const area = this.routeMapAreaCatalog
          .getAllMapAreas()
          .find((a) => a.id === lockedLeg.from.areaId) ||
          findAreaForSpace(targetCircle.space, this.routeMapAreaCatalog) ||
          this.routeMapAreaCatalog.getAllMapAreas()[0] || {
            id: lockedLeg.from.areaId,
          };
        const assets = area ? await this.loadGridRouteAssets(area) : null;
        if (assets) {
          route = planRouteFromGridIndex(
            assets.pointsPayload,
            assets.gridMeta,
            assets.gridBytes,
            lockedLeg.from.gridIndex,
            targetCircle.space,
          );
        }
      } else if (lockedLeg.from.type === "circle") {
        route = await this.planGridRoute(
          lockedLeg.from.space,
          targetCircle.space,
        );
      }
    }

    // Geometry reconstruction failed: preserve activeResumeSnapshot so user can retry or reset start
    if (!route) {
      const dialog = document.getElementById("navigation-resume-dialog");
      if (dialog) {
        dialog.errorMessage =
          "経路の再構築に失敗しました。始点を設定し直してください";
      }
      this.ui.showToast(
        "経路の再構築に失敗しました。始点を設定し直してください",
        "error",
      );
      return;
    }

    // Geometry reconstruction succeeded: dismiss dialog and discard snapshot lock
    this.activeResumeSnapshot = null;
    this.navigationMatrixRef = resumeResult.matrixRef;
    this.optimizationTimeLimitMs = resumeResult.optimizationTimeLimitMs;
    const dialog = document.getElementById("navigation-resume-dialog");
    if (dialog) {
      dialog.errorMessage = "";
      dialog.open = false;
    }

    this.currentStartSpace =
      lockedLeg.from.type === "circle" ? lockedLeg.from.space : "";
    const target = this.targetWithRoute(targetCircle, route);
    this.replaceRouteGuidanceSnapshot({
      navigationState: resumeResult.navState,
      currentDestination: target,
      currentRoute: route,
      selectedDestination: target,
      selectedRoute: route,
      selectionStatus: "idle",
    });
    this.selectionMessage = "";

    this.ui.showNavigation(this.getNavigationContext("current"));
    this.ui.showToast(
      `前回の案内（目的地: ${targetCircle.space}）を再開しました`,
    );

    // Warm-start ALNS worker background optimization if matrix exists
    if (!resumeResult.matrixRef) {
      this.ui.showToast(
        "距離行列が見つからないため、最適化を開始できませんでした",
        "error",
      );
      return;
    }

    const storedMatrix = this.matrixRepository.load(resumeResult.matrixRef);
    if (!storedMatrix) {
      this.ui.showToast(
        "保存済みの距離行列を読み込めないため、最適化を開始できませんでした",
        "error",
      );
      return;
    }

    // Validate storedMatrix
    const matrixAreaId = storedMatrix.areaId;
    const matrixSpaces = storedMatrix.spaces;
    const matrixSize = storedMatrix.size;
    const distances = storedMatrix.distances;

    const isMatrixValid =
      typeof matrixAreaId === "string" &&
      matrixAreaId === resumeResult.navState.areaId &&
      Array.isArray(matrixSpaces) &&
      Number.isInteger(matrixSize) &&
      matrixSpaces.length === matrixSize &&
      Array.isArray(distances) &&
      distances.length === matrixSize * matrixSize;

    if (!isMatrixValid || !matrixSpaces.includes(targetSpace)) {
      this.ui.showToast(
        "保存済みの距離行列が現在の案内状態と一致しません",
        "error",
      );
      return;
    }

    // Filter pending circles present in stored matrix spaces
    const pendingCircles = this.wantToBuy.filter(
      (c) =>
        matrixSpaces.includes(c.space) &&
        (this.activeState?.circleStates[c.space] ?? "pending") === "pending",
    );
    const pendingSpaces = pendingCircles.map((c) => c.space);

    // Sub-matrix extraction: N_sub x N_sub
    const nSub = pendingSpaces.length;
    const subDistances = new Array(nSub * nSub).fill(Infinity);
    for (let i = 0; i < nSub; i++) {
      const origI = matrixSpaces.indexOf(pendingSpaces[i]);
      for (let j = 0; j < nSub; j++) {
        const origJ = matrixSpaces.indexOf(pendingSpaces[j]);
        subDistances[i * nSub + j] = distances[origI * matrixSize + origJ];
      }
    }

    const startArea =
      lockedLeg?.from?.type === "start"
        ? this.routeMapAreaCatalog
            .getAllMapAreas()
            .find((a) => a.id === lockedLeg.from.areaId) ||
          findAreaForSpace(targetCircle.space, this.routeMapAreaCatalog)
        : lockedLeg?.from?.type === "circle"
          ? findAreaForSpace(lockedLeg.from.space, this.routeMapAreaCatalog)
          : null;

    const assets = startArea ? await this.loadGridRouteAssets(startArea) : null;
    const startIndex =
      lockedLeg?.from?.type === "start"
        ? lockedLeg.from.gridIndex
        : lockedLeg?.from?.type === "circle" && assets
          ? this.findPointPortalIndex(
              assets.pointsPayload,
              assets.gridMeta,
              lockedLeg.from.space,
            )
          : null;
    const endpointIndexes = assets
      ? pendingCircles.map((circle) =>
          this.findPointPortalIndex(
            assets.pointsPayload,
            assets.gridMeta,
            circle.space,
          ),
        )
      : [];

    if (
      !assets ||
      startIndex === null ||
      endpointIndexes.some((index) => index === null)
    ) {
      this.ui.showToast(
        "始点距離の計算に失敗したため、最適化を開始できませんでした",
        "error",
      );
      return;
    }

    const startDistanceToCircles = Array.from(
      distancesFromStartToEndpoints(
        startIndex,
        {
          grid: assets.gridBytes,
          cols: assets.gridMeta.cols,
          rows: assets.gridMeta.rows,
          cellSize: assets.gridMeta.cell_size,
        },
        endpointIndexes,
      ),
    );

    if (
      startDistanceToCircles.some(
        (distance) =>
          typeof distance !== "number" ||
          !Number.isFinite(distance) ||
          distance < 0,
      )
    ) {
      this.ui.showToast(
        "始点距離が不正なため、最適化を開始できませんでした",
        "error",
      );
      return;
    }

    try {
      this.launchAlnsWorkerJob({
        areaId: matrixAreaId,
        startDistanceToCircles,
        pendingCircles,
        subDistances,
        fixedFirstTarget: resumeResult.fixedFirstTarget,
        searchTimeLimitMs: resumeResult.optimizationTimeLimitMs,
        initialSolutions: resumeResult.initialSolutions,
      });
    } catch (error) {
      console.error("Failed to start ALNS optimization", error);
      this.ui.showToast("最適化の開始に失敗しました", "error");
    }
  }

  findPointPortalIndex(pointsPayload, gridMeta, space) {
    const [, identifier, number] = parseSpace(
      space,
      this.routeMapAreaCatalog.getAllMapAreas(),
    );
    const point = pointsPayload?.points?.find(
      (candidate) =>
        candidate.space === space ||
        (candidate.identifier === identifier &&
          Number(candidate.number) === number),
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

  findPointPortalPosition(pointsPayload, gridMeta, space) {
    const [, identifier, number] = parseSpace(
      space,
      this.routeMapAreaCatalog.getAllMapAreas(),
    );
    const point = pointsPayload?.points?.find(
      (candidate) =>
        candidate.space === space ||
        (candidate.identifier === identifier &&
          Number(candidate.number) === number),
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

  /** Helper method to launch ALNS worker job and bind message handler. */
  launchAlnsWorkerJob(params) {
    const updatedNavState =
      this.navigationRuntimeController.launchAlnsOptimization(
        {
          navState: this.routeGuidanceSession.getSnapshot().navigationState,
          areaId: params.areaId,
          startDistanceToCircles: params.startDistanceToCircles,
          pendingCircles: params.pendingCircles,
          distanceMatrix: params.subDistances,
          fixedFirstTarget: params.fixedFirstTarget,
          searchTimeLimitMs: params.searchTimeLimitMs,
          initialSolutions: params.initialSolutions,
        },
        (nextNavState) => {
          this.replaceRouteGuidanceSnapshot({ navigationState: nextNavState });
          this.ui.showNavigation(this.getNavigationContext("current"));
          this.saveNavigationSnapshot();
        },
      );
    this.replaceRouteGuidanceSnapshot({ navigationState: updatedNavState });
  }

  /**
   * 始点再設定処理（navigation stateのみ破棄し、circle stateとdistance matrixは保持）
   */
  handleResumeResetStart() {
    this.clearNavigationSnapshot();
    this.resetNavigationRuntimeState();

    const dialog = document.getElementById("navigation-resume-dialog");
    if (dialog) {
      dialog.errorMessage = "";
      dialog.open = false;
    }

    this.ui.showToast("始点を設定し直します");
  }

  /** Continue the legacy purchase/hold demo flow without entering production navigation. */
  handleDevDemoAction(space) {
    return this.searchNextDevDemo(space, false);
  }
}

/** Load the selected map bundle via event registry before creating application controllers. */
async function bootstrapApp(existingApp) {
  let manifest;
  let registry;
  let registryUrl;
  let targetRef;
  try {
    ({ registry, registryUrl } = await existingApp.loadEventRegistry());
    targetRef = existingApp.eventDayRepository.getLastOpenedEventDay();

    const isValidRef =
      targetRef &&
      registry.events.some(
        (e) =>
          e.eventId === targetRef.eventId &&
          e.days.some((d) => d.dayId === targetRef.dayId),
      );

    if (!isValidRef) {
      const defaultEvent = registry.events[0];
      targetRef = {
        eventId: defaultEvent.eventId,
        dayId: defaultEvent.days[0].dayId,
      };
    }

    const event = registry.events.find((e) => e.eventId === targetRef.eventId);
    if (!event) throw new Error("Last-opened event is not in registry");
    if (registryUrl) {
      const manifestUrl = resolveEventMapManifestUrl(registryUrl, event);
      manifest = await loadRuntimeMapBundleManifestFromUrl(
        manifestUrl,
        event.eventId,
      );
    } else {
      manifest =
        existingApp.currentManifest ??
        {
          schemaVersion: 1,
          eventId: event.eventId,
          displayName: event.displayName,
          areas: [],
        };
    }
    existingApp.routeMapAreaCatalog.initializeMapAreas(manifest.areas);
  } catch (error) {
    console.error("Map bundle initialization failed.", error);
    renderMapBootstrapError(document, error);
    return;
  }

  await existingApp.init(manifest, targetRef, { registry, registryUrl });
}
