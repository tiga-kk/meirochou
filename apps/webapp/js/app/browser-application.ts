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
  buildSourceManagerPanelModel,
  buildStorageDeleteDialogModel,
} from "../shared/ui/management-view-model";
import {
  bindBrowserEvents,
  type BindBrowserEventsDependencies,
} from "./bind-browser-events";

/** Validates an event/day reference at the browser event boundary. */
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

function toDeleteScope(scope) {
  if (!scope) return null;
  if (scope.kind === "all-event-days") {
    return { type: "all-events" };
  }
  return {
    type: scope.kind === "circle-source" ? "circles" : scope.kind,
    ref: { ...scope.eventDay },
  };
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

/**
 * アプリケーションのメインコントローラー
 */
export class BrowserApplication {
  constructor(options = {}) {
    this.started = false;
    this.stopped = false;
    this.document = options.document ?? globalThis.document;
    this.window = options.window ?? globalThis.window;
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
      !options?.localDataDeletionController ||
      !routeGuidanceDependencies ||
      !routeGuidanceDependencies.routeGuidanceSession ||
      !routeGuidanceDependencies.routeMapAreaCatalog ||
      !routeGuidanceDependencies.routeMapAssetsLoader ||
      !routeGuidanceDependencies.snapshotRepository ||
      !routeGuidanceDependencies.matrixRepository ||
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
    this.loadEventRegistryOperation = eventDayDependencies.loadEventRegistry;
    this.completeCircleVisit = options.completeCircleVisit;
    this.eventRegistry = eventDayDependencies.eventRegistry ?? null;
    this.eventRegistryUrl = eventDayDependencies.eventRegistryUrl ?? null;
    this.localDataDeletionController = options.localDataDeletionController;
    this.spreadsheetTitle = "";
    this.routeGuidanceSession = routeGuidanceDependencies.routeGuidanceSession;
    this.routeMapAreaCatalog = routeGuidanceDependencies.routeMapAreaCatalog;
    this.routeMapAssetsLoader = routeGuidanceDependencies.routeMapAssetsLoader;
    this.snapshotRepository = routeGuidanceDependencies.snapshotRepository;
    this.matrixRepository = routeGuidanceDependencies.matrixRepository;
    this.navigationRuntimeController =
      routeGuidanceDependencies.navigationRuntimeController;
    this.routeGuidanceController = routeGuidanceDependencies.routeGuidanceController;
    const baseSession = options.circleDataSourceSession;
    this.circleDataSourceSession = baseSession;
    this.session = baseSession;
    this.circleDataSourceController = options.circleDataSourceController;
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
    this.currentManifest = null;
    this.transitionToken = 0;
    this.isTransitioning = false;
    this.sourceErrorMessage = "";
    this.outboxResultMessage = "";
    this.outboxErrorMessage = "";
    this.suppressSessionModelUpdates = false;
    this.deleteErrorMessage = "";
    this.outboxRetryBusy = false;
    this.outboxRequestVersion = 0;
    this.localDeletionBusy = false;
    this.localDeletionRequestVersion = 0;
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

  showToast(message, type) {
    this.ui?.showToast?.(message, type);
  }

  getSpreadsheetTitle() {
    return this.spreadsheetTitle || "";
  }

  toggleSettings(target) {
    if (this.ui.els.settingsArea?.open) this.closeSettings();
    this.ui.toggleSettings(target);
  }

  closeSettings() {
    this.clearActivePreviewIfAny();
    this.circleDataSourceController.cancelCurrentRequest();
    this.outboxRequestVersion += 1;
    this.localDeletionRequestVersion += 1;
    this.outboxRetryBusy = false;
    this.localDeletionBusy = false;
    this.localDataDeletionController.cancelDeletion();
    this.sourceErrorMessage = "";
    this.outboxResultMessage = "";
    this.outboxErrorMessage = "";
    this.deleteErrorMessage = "";
    this.ui.setSettingsError("");
    this.updateManagementModels();
  }

  showGalleryForArea(areaId) {
    const area = this.routeMapAreaCatalog
      .getAllMapAreas()
      .find((candidate) => candidate.id === areaId);
    this.ui.showGallery(area?.name || areaId, false);
  }

  handleOptimizationTimeLimitChange(detail) {
    const value = Number(detail?.searchTimeLimitMs);
    if (value !== 5000 && value !== 10000 && value !== 15000) return;
    this.routeGuidanceController.setOptimizationTimeLimit(value);
    if (this.routeGuidanceSession.getSnapshot().navigationState) {
      this.saveNavigationSnapshot();
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

  async addPurchased(space) {
    if (!this.activeRef || !this.activeState) throw new Error("No event/day is open");
    const result = await this.completeCircleVisit({
      eventDay: this.activeRef,
      circleSpace: space,
      nextStatus: "purchased",
      expectedSourceGeneration: this.activeState.sourceGeneration,
    });
    return result.statusResult.state;
  }

  async addHold(space) {
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
        errorMessage: sourceSessionSnapshot.errorMessage,
      },
      transitionBusy: this.isTransitioning,
      sourceErrorMessage: this.sourceErrorMessage,
    });

    const outboxPanelModel = buildOutboxPanelModel(
      this.eventRegistry,
      states,
      {
        processing: this.outboxRetryBusy,
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

    const deleteDialogModel = buildStorageDeleteDialogModel({
      selectedScope: toDeleteScope(
        this.localDataDeletionController.getSelectedScope(),
      ),
      deleteOptions,
      eventDayLabel: activeRefLabel,
      busy: this.localDeletionBusy,
      errorMessage: this.deleteErrorMessage || "",
    });

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
    const dialog = this.document.getElementById("source-diff-dialog");
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
    const dialog = this.document.getElementById("source-diff-dialog");
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
    const requestVersion = ++this.outboxRequestVersion;
    this.outboxRetryBusy = true;
    this.outboxResultMessage = "";
    this.outboxErrorMessage = "";
    this.updateManagementModels();

    try {
      const processed = this.pendingGasUpdatesController
        ? await this.pendingGasUpdatesController.retryAll(ref)
        : 0;
      if (requestVersion !== this.outboxRequestVersion) return;
      this.outboxRetryBusy = false;

      this.ui.showToast(`GAS同期完了 (${processed}件送信)`);
      this.outboxResultMessage = `送信完了 (${processed}件)`;
    } catch (_error) {
      if (requestVersion !== this.outboxRequestVersion) return;
      this.outboxRetryBusy = false;
      this.outboxErrorMessage = "再送処理中にエラーが発生しました。";
      this.ui.showToast("再送エラー", "error");
    } finally {
      this.suppressSessionModelUpdates = false;
      if (requestVersion === this.outboxRequestVersion) {
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

    this.localDataDeletionController.selectDeletionScope(option.scope);
    this.deleteErrorMessage = "";
    this.updateManagementModels();
  }

  /** Closes the delete dialog without changing local data. */
  handleDeleteDialogCancel() {
    this.localDataDeletionController.cancelDeletion();
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

    const requestVersion = ++this.localDeletionRequestVersion;
    const activeRefBeforeDelete = this.activeRef
      ? { ...this.activeRef }
      : null;
    this.localDeletionBusy = true;
    this.deleteErrorMessage = "";
    this.localDataDeletionController.selectDeletionScope(scope);
    this.updateManagementModels();

    try {
      await this.localDataDeletionController.confirmDeletion(scope);
      if (requestVersion !== this.localDeletionRequestVersion) return;

      this.localDeletionBusy = false;

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
            this.document,
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
      if (requestVersion !== this.localDeletionRequestVersion) return;
      this.localDeletionBusy = false;
      if (activeRefBeforeDelete && !this.activeRef) {
        renderMapBootstrapError(
          this.document,
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

    const devDemoEnabled = isDevDemoEnabled(this.window.location);
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
            this.document,
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
        renderMapBootstrapError(this.document, error);
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

      const startupResult = this.routeGuidanceController.initializeResumeStartup({
        eventDay: this.activeRef,
        bundleVersion: manifest?.bundleVersion || "",
        circleStates: this.activeState.circleStates,
        pendingCircleSpaces,
      });

      if (startupResult.kind === "ready") {
        const dialog = this.document.getElementById("navigation-resume-dialog");
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

  /** Cleanup event listeners and coordinator timers. */
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    this.transitionToken += 1;
    this.routeGuidanceController.invalidatePendingDestinationSelection();
    this.managementSession?.stop();
    this.ui?.stop?.();
    this.eventBindingCleanup?.();
    this.eventBindingCleanup = null;
    this.disposeSyncCoordinator();
    for (const timer of this.ownedTimers) clearTimeout(timer);
    this.ownedTimers.clear();
    for (const cancel of this.ownedTimerCancels.values()) cancel();
    this.ownedTimerCancels.clear();
    this.navigationRuntimeController.dispose();
    this.pendingGasUpdatesController?.stop?.();
    this.localDataDeletionController?.stop?.();
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
    this.currentStartSpace = "";
    this.routeGuidanceController.resetRuntimeState();
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

    this.selectionMessage = "候補経路を計算中…";
    const selection = this.routeGuidanceController.selectDestination(
      circle.space,
      this.wantToBuy,
    );
    this.ui.showNavigation(this.getNavigationContext("preserve"));
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
    this.ui.showNavigation(this.getNavigationContext(fitMode));
  }

  /** Enter the two-route comparison state after a candidate route is ready. */
  handlePreviewRoute() {
    if (!this.routeGuidanceController.compareSelectedDestination()) return;
    this.ui.showNavigation(this.getNavigationContext("comparison"));
  }

  /** Promote the compared candidate to the active destination without recalculation. */
  handleConfirmRoute() {
    const destination =
      this.routeGuidanceController.confirmSelectedDestination();
    if (!destination) return;
    this.selectionMessage = "";
    this.ui.showNavigation(this.getNavigationContext("current"));
    this.ui.showToast(`目的地を ${destination.space} に変更しました`);
  }

  /** Leave comparison while retaining the selected target details. */
  handleCancelRoute() {
    if (!this.routeGuidanceController.cancelDestinationComparison()) return;
    this.ui.showNavigation(this.getNavigationContext("comparison"));
  }

  /**
   * 手動で目的地を設定
   */
  async handleSetNextTarget(circle) {
    if (!circle) return;

    // The dev-only UI fixture intentionally has no production map bundle.
    if (isDevDemoEnabled(this.window.location)) {
      return this.handleSetNextTargetDevDemo(circle);
    }

    this.ui.showLoading();
    const result = await this.routeGuidanceController.setManualDestination(
      circle.space,
      this.wantToBuy,
    );
    if (result.kind === "ignored" || result.kind === "stale") return;
    if (result.kind === "missing-position") {
      this.ui.showToast(
        "現在地が確定していないため、目的地を変更できません",
        "error",
      );
      return;
    }
    if (result.kind === "route-unavailable") {
      this.ui.showToast(
        "経路の再構築に失敗したため、目的地を変更できません",
        "error",
      );
      return;
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
      return;
    }
    const currentPosition =
      this.routeGuidanceSession.getSnapshot().navigationState.currentPosition;
    this.currentStartSpace =
      currentPosition.source === "arrived-circle"
        ? currentPosition.circleSpace || ""
        : "";
    this.selectionMessage = "";
    this.ui.showNavigation(this.getNavigationContext("current"));
    this.ui.showToast(`目的地を ${circle.space} に設定しました`);
    this.saveNavigationSnapshot();
  }

  readCurrentSpace() {
    const areaId = this.document.getElementById("loc-ewsn").value;
    const area = this.routeMapAreaCatalog
      .getAllMapAreas()
      .find((candidate) => candidate.id === areaId);
    const currentSpace = buildSpaceFromLocation({
      areaName: area?.prefixes[0] || "",
      label: this.document.getElementById("loc-label").value,
      number: this.document.getElementById("loc-number").value,
    });

    if (!currentSpace) {
      this.ui.showToast("現在地の番号は1〜99で入力してください");
    }
    return currentSpace;
  }

  /** Legacy gallery target behavior used only by the dev UI fixture. */
  async handleSetNextTargetDevDemo(circle) {
    this.routeGuidanceController.invalidatePendingDestinationSelection();
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
    this.pendingGasUpdatesController?.start?.();
    this.localDataDeletionController?.start?.();
    this.eventBindingCleanup?.();
    // The settings-shell binder forwards toggleSettings(this.document.getElementById("toggle-settings")).
    this.eventBindingCleanup = bindBrowserEvents({
      application: this as unknown as BindBrowserEventsDependencies["application"],
      document: this.document,
    }).stop;
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

    this.routeGuidanceController.invalidatePendingDestinationSelection();
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

    this.routeGuidanceController.invalidatePendingDestinationSelection();
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
    if (type !== "purchase" && type !== "hold") return;
    const actionTarget =
      guidanceSnapshot.selectedDestination || guidanceSnapshot.currentDestination;
    if (!actionTarget) return;

    const space = actionTarget.space;
    let visitResult;
    try {
      visitResult = await this.completeCircleVisit({
        eventDay: this.activeRef,
        circleSpace: space,
        nextStatus: type === "purchase" ? "purchased" : "held",
        expectedSourceGeneration: this.activeState.sourceGeneration,
      });
    } catch (error) {
      this.reportLocalMutationFailure(error);
      return;
    }

    this.ui?.showToast(
      type === "purchase" ? `${space} 購入！` : `${space} 保留`,
    );

    if (this.activeState?.source.type === "gas") {
      this.flushOutboxWithDiagnostic();
    }

    this.ui.updateCounts(this);
    this.updateManagementModels();
    this.ui.updateCurrentLocation(space); // 現在地を更新

    if (isDevDemoEnabled(this.window.location)) {
      void this.handleDevDemoAction(space);
      return;
    }

    const routeResult = visitResult.routeGuidanceResult;
    if (routeResult.kind === "advanced") {
      this.ui.showNavigation(this.getNavigationContext("current"));
      this.saveNavigationSnapshot();
      return;
    }

    if (routeResult.kind === "finished") {
      this.ui.showTarget(null);
      if (type === "purchase") this.saveNavigationSnapshot();
      else this.clearNavigationSnapshot(this.activeRef);
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
    if (!this.activeRef || !this.activeState) return;
    const resumeResult = await this.routeGuidanceController.resumeSavedGuidance(
      this.activeRef,
      this.wantToBuy,
      this.activeState.circleStates,
    );

    const dialog = this.document.getElementById("navigation-resume-dialog");
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
    this.ui.showNavigation(this.getNavigationContext("current"));
    this.ui.showToast(
      `前回の案内（目的地: ${resumeResult.targetSpace}）を再開しました`,
    );
    if (resumeResult.warningMessage) {
      this.ui.showToast(resumeResult.warningMessage, "error");
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

  /**
   * 始点再設定処理（navigation stateのみ破棄し、circle stateとdistance matrixは保持）
   */
  handleResumeResetStart() {
    this.clearNavigationSnapshot();
    this.routeGuidanceController.resetRuntimeState();
    this.currentStartSpace = "";

    const dialog = this.document.getElementById("navigation-resume-dialog");
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
    renderMapBootstrapError(existingApp.document, error);
    return;
  }

  await existingApp.init(manifest, targetRef, { registry, registryUrl });
}
