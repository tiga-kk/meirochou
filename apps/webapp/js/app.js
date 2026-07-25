import "./components/comipath-settings";
import { parseGasWebAppUrl } from "./api/gas-api-client";
import { Config } from "./config.js";
import { loadEventRegistryWithUrl } from "./data/event-registry";
import { CsvValidationError, DataManager } from "./data-manager.js";
import { createDevDemoData, isDevDemoEnabled } from "./dev-demo-data.js";
import {
  loadMapBundleManifestFromUrl,
  renderMapBootstrapError,
  resolveEventMapManifestUrl,
} from "./map-manifest-loader";
import { planRoute, rankCandidatesByGridDistance } from "./route-planner";
import { EventDayRepository } from "./state/event-day-repository";
import { StorageService } from "./state/storage-service";
import { TspSolver } from "./tsp-solver.js";
import { parseGridMeta, parsePointsPayload } from "./types/boundary-parsers";
import { ManagementSession } from "./ui/management-session";
import {
  buildEventDayOptions,
  formatSourceSummary,
} from "./ui/management-view-model";
import { buildSpaceFromLocation } from "./ui/navigation-view-model";
import { UIManager } from "./ui-manager.js";

function findAreaForSpace(space) {
  if (!space || typeof space !== "string") return null;

  const cleanedSpace = space.trim();
  if (cleanedSpace.length < 2) return null;

  const prefixChar = cleanedSpace[0];
  const labelChar = cleanedSpace[1];

  return (
    Config.AREAS.find(
      (area) =>
        area.prefixes.includes(prefixChar) && area.labels.includes(labelChar),
    ) || null
  );
}

function areSpacesInSameArea(spaceA, spaceB) {
  const areaA = findAreaForSpace(spaceA);
  const areaB = findAreaForSpace(spaceB);
  return Boolean(areaA && areaB && areaA.id === areaB.id);
}

/** Accepts only a validated GAS source shape at the App/component boundary. */
function safeGasSource(value) {
  if (
    !value ||
    typeof value !== "object" ||
    value.type !== "gas" ||
    typeof value.gasUrl !== "string" ||
    typeof value.sheetName !== "string" ||
    value.sheetName.trim() === ""
  ) {
    return null;
  }

  try {
    return {
      type: "gas",
      gasUrl: parseGasWebAppUrl(value.gasUrl),
      sheetName: value.sheetName,
    };
  } catch {
    return null;
  }
}

/** Redacts CSV cell-bearing parser messages before showing them in the UI. */
function formatCsvIssue(message) {
  if (message === "Missing required field: space") return message;
  if (message === "Invalid priority value: must be a number") return message;
  if (message.startsWith("Missing required header column")) {
    return "Missing required header column";
  }
  if (message.startsWith("Duplicate space:")) return "Duplicate space";
  if (message.startsWith("Syntax error:")) return "CSV syntax error";
  return "Invalid CSV data";
}

/**
 * アプリケーションのメインコントローラー
 */
export class App {
  constructor() {
    this.dm = new DataManager();
    this.ui = new UIManager();
    this.session = new ManagementSession();
    this.currentTarget = null;
    this.currentRoute = null;
    this.currentStartSpace = "";
    this.nextTarget = null;
    this.selectedTarget = null;
    this.selectedRoute = null;
    this.selectionState = "idle";
    this.selectionMessage = "";
    this.selectionToken = 0;
    this.routeAssetsCache = new Map();
    this.currentManifest = null;
    this.transitionToken = 0;
    this.isTransitioning = false;

    this.draftGasUrl = "";
    this.selectedSheetName = "";
    this.fetchedSheetNames = [];
    this.sourceErrorMessage = "";
  }

  /** Rebuild the management selector and source manager models from registry and local state. */
  updateManagementModels() {
    if (!this.dm.eventRegistry) return;
    const states = this.dm.repository
      .list()
      .map((ref) => ({
        ref,
        state: this.dm.repository.load(ref),
      }))
      .filter((item) => item.state !== null);

    const options = buildEventDayOptions(
      this.dm.eventRegistry,
      states,
      this.dm.activeRef,
    );

    const activeState = this.dm.activeState;
    const activeRef = this.dm.activeRef;
    const eventObj = activeRef
      ? this.dm.eventRegistry.events.find(
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

    const sourceManagerModel = {
      activeRefLabel,
      source: sourceSummary,
      sourceType,
      gasUrlInput:
        this.draftGasUrl ||
        (activeState?.source.type === "gas" ? activeState.source.gasUrl : ""),
      selectedSheetName:
        this.selectedSheetName ||
        (activeState?.source.type === "gas"
          ? activeState.source.sheetName
          : ""),
      sheetNames: this.fetchedSheetNames || [],
      pendingCount,
      busy:
        this.session.isBusy("source-request") ||
        this.session.isBusy("transition"),
      errorMessage: this.sourceErrorMessage || "",
    };

    this.ui.updateSettingsState({
      eventDayOptions: options,
      selectedEventId: this.dm.activeRef?.eventId || "",
      selectedDayId: this.dm.activeRef?.dayId || "",
      sourceManagerModel,
    });
  }

  /** Handle CSV file preview request without saving or applying. */
  async handleCsvPreviewRequest(file) {
    if (
      !file ||
      typeof file.name !== "string" ||
      !/\.csv$/i.test(file.name) ||
      typeof file.size !== "number" ||
      file.size < 0 ||
      !this.dm.activeRef ||
      !this.dm.activeState
    ) {
      this.sourceErrorMessage = "拡張子が .csv のファイルを選択してください。";
      this.updateManagementModels();
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.sourceErrorMessage = "ファイルサイズは5MB以下にしてください。";
      this.updateManagementModels();
      return;
    }

    const token = this.session.beginSourceRequest();
    const activeRef = { ...this.dm.activeRef };
    const expectedGeneration = this.dm.activeState.sourceGeneration;

    try {
      const text = await file.text();
      if (
        !this.session.isLatestRequestToken(token) ||
        !this.dm.activeRef ||
        this.dm.activeRef.eventId !== activeRef.eventId ||
        this.dm.activeRef.dayId !== activeRef.dayId ||
        this.dm.activeState?.sourceGeneration !== expectedGeneration
      ) {
        return;
      }

      const preview = await this.dm.previewCsvReplacement(
        activeRef,
        file.name,
        text,
      );

      if (
        !this.session.isLatestRequestToken(token) ||
        !this.dm.activeRef ||
        this.dm.activeRef.eventId !== activeRef.eventId ||
        this.dm.activeRef.dayId !== activeRef.dayId ||
        this.dm.activeState?.sourceGeneration !== expectedGeneration
      ) {
        return;
      }

      this.session.setActivePreview({
        kind: "csv",
        ref: activeRef,
        previewId: preview.previewId,
        expectedSourceGeneration: expectedGeneration,
      });
      this.sourceErrorMessage = "";
      this.updateManagementModels();
    } catch (err) {
      if (!this.session.isLatestRequestToken(token)) return;
      if (err instanceof CsvValidationError) {
        const issuesSummary = err.issues
          .map(
            (i) => `[${i.row}行目 ${i.column}列] ${formatCsvIssue(i.message)}`,
          )
          .join("; ");
        this.sourceErrorMessage = `CSVデータの検証エラー: ${issuesSummary}`;
      } else {
        this.sourceErrorMessage = "CSVプレビューの生成に失敗しました。";
      }
      this.updateManagementModels();
    } finally {
      if (this.session.isLatestRequestToken(token)) {
        this.session.setBusy("source-request", false);
        this.session.setGasAbortController(null);
        this.updateManagementModels();
      }
    }
  }

  /** Fetch sheet names for a given GAS Web App URL without persisting the URL. */
  async handleGasSheetsRequest(gasUrl) {
    if (!gasUrl || !this.dm.activeRef || !this.dm.activeState) return;

    let normalizedUrl;
    try {
      normalizedUrl = parseGasWebAppUrl(gasUrl);
    } catch {
      this.sourceErrorMessage =
        "有効なGoogle Apps ScriptのWebApp URLを入力してください。";
      this.updateManagementModels();
      return;
    }

    const token = this.session.beginSourceRequest();
    const activeRef = { ...this.dm.activeRef };
    const expectedGeneration = this.dm.activeState.sourceGeneration;
    const controller = new AbortController();

    this.session.setGasAbortController(controller);
    this.draftGasUrl = normalizedUrl;
    this.sourceErrorMessage = "";
    this.updateManagementModels();

    try {
      const res = await this.dm.client.fetchSheetList(
        normalizedUrl,
        controller.signal,
      );
      if (
        !this.session.isLatestRequestToken(token) ||
        !this.dm.activeRef ||
        this.dm.activeRef.eventId !== activeRef.eventId ||
        this.dm.activeRef.dayId !== activeRef.dayId ||
        this.dm.activeState?.sourceGeneration !== expectedGeneration
      ) {
        return;
      }

      this.fetchedSheetNames = res.sheets || [];
      this.selectedSheetName = this.fetchedSheetNames[0] || "";
      this.sourceErrorMessage = "";
    } catch (_err) {
      if (!this.session.isLatestRequestToken(token)) return;
      this.fetchedSheetNames = [];
      this.selectedSheetName = "";
      this.sourceErrorMessage =
        "スプレッドシート一覧の取得に失敗しました。URLを確認してください。";
    } finally {
      if (this.session.isLatestRequestToken(token)) {
        this.session.setBusy("source-request", false);
        this.session.setGasAbortController(null);
        this.updateManagementModels();
      }
    }
  }

  /** Stage a GAS preview for initial import, replacement, or refresh. */
  async handleGasPreviewRequest(source, requestedMode) {
    void requestedMode;
    const normalizedSource = safeGasSource(source);
    if (!normalizedSource || !this.dm.activeRef || !this.dm.activeState) {
      this.sourceErrorMessage =
        "有効なWebApp URLとシート名を指定してください。";
      this.updateManagementModels();
      return;
    }

    const activeState = this.dm.activeState;
    const activeRef = { ...this.dm.activeRef };
    const expectedGeneration = activeState.sourceGeneration;

    // Validate mode against persisted source
    let validatedMode = "replacement";
    if (
      activeState.source.type === "csv" &&
      activeState.source.fileName === "empty.csv" &&
      activeState.circles.length === 0
    ) {
      validatedMode = "initial";
    } else if (
      activeState.source.type === "gas" &&
      activeState.source.gasUrl === normalizedSource.gasUrl &&
      activeState.source.sheetName === normalizedSource.sheetName
    ) {
      validatedMode = "refresh";
    } else {
      validatedMode = "replacement";
    }

    const token = this.session.beginSourceRequest();
    const controller = new AbortController();

    this.session.setGasAbortController(controller);
    this.sourceErrorMessage = "";
    this.updateManagementModels();

    try {
      let preview;
      if (validatedMode === "initial") {
        preview = await this.dm.refreshService.previewInitialImport(
          activeRef,
          normalizedSource,
          controller.signal,
        );
      } else if (validatedMode === "replacement") {
        preview = await this.dm.refreshService.previewReplacement(
          activeRef,
          normalizedSource,
          controller.signal,
        );
      } else {
        preview = await this.dm.refreshService.previewRefresh(
          activeRef,
          controller.signal,
        );
      }

      if (
        !this.session.isLatestRequestToken(token) ||
        !this.dm.activeRef ||
        this.dm.activeRef.eventId !== activeRef.eventId ||
        this.dm.activeRef.dayId !== activeRef.dayId ||
        this.dm.activeState?.sourceGeneration !== expectedGeneration
      ) {
        return;
      }

      this.session.setActivePreview({
        kind: "gas",
        ref: activeRef,
        previewId: preview.previewId,
        mode: validatedMode,
        expectedSourceGeneration: expectedGeneration,
      });
      this.sourceErrorMessage = "";
    } catch (_err) {
      if (!this.session.isLatestRequestToken(token)) return;
      this.sourceErrorMessage = "GASプレビューの取得に失敗しました。";
    } finally {
      if (this.session.isLatestRequestToken(token)) {
        this.session.setBusy("source-request", false);
        this.session.setGasAbortController(null);
        this.updateManagementModels();
      }
    }
  }

  /** Prepare and atomically commit a registry-approved event/day transition. */
  async handleEventDaySelect(ref) {
    if (
      !ref ||
      typeof ref !== "object" ||
      typeof ref.eventId !== "string" ||
      typeof ref.dayId !== "string"
    ) {
      return;
    }

    const event = this.dm.eventRegistry?.events.find(
      (candidate) => candidate.eventId === ref.eventId,
    );
    if (!event?.days.some((day) => day.dayId === ref.dayId)) return;

    const focusTarget = document.activeElement;
    if (
      this.isTransitioning ||
      (this.dm.activeRef &&
        this.dm.activeRef.eventId === ref.eventId &&
        this.dm.activeRef.dayId === ref.dayId)
    ) {
      return;
    }

    this.session.onEventDayChange();
    this.draftGasUrl = "";
    this.selectedSheetName = "";
    this.fetchedSheetNames = [];
    this.sourceErrorMessage = "";

    const token = ++this.transitionToken;
    this.isTransitioning = true;
    this.session.setBusy("transition", true);
    this.ui.setSettingsBusy(true);
    this.ui.setSettingsError("");

    try {
      const transitionService = this.dm.getTransitionService(
        this.currentManifest,
      );
      const prepared = await transitionService.prepare(ref);
      if (token !== this.transitionToken) return;

      const committedState = transitionService.commit(prepared);
      this.currentManifest = prepared.manifest;
      Config.initializeAreas(prepared.manifest.areas);

      this.dm.activateCommittedState(prepared.ref, committedState);

      this.currentTarget = null;
      this.currentRoute = null;
      this.selectedTarget = null;
      this.selectedRoute = null;
      this.nextTarget = null;
      this.selectionState = "idle";
      this.selectionMessage = "";
      this.routeAssetsCache.clear();

      this.ui.updateAreaHeader();
      this.ui.updateCounts(this.dm);
      this.updateManagementModels();

      if (this.dm.wantToBuy.length > 0) {
        this.searchNext("", false);
      } else {
        this.ui.showTarget(null);
      }

      this.ui.showToast(
        `${prepared.event.displayName} ${prepared.ref.dayId} へ切り替えました`,
      );
    } catch (error) {
      if (token !== this.transitionToken) return;
      console.error("Event/Day transition failed:", error);
      this.updateManagementModels();
      this.ui.setSettingsError(
        "イベント・日程の切り替えに失敗しました。以前の表示を維持しています。",
      );
      this.ui.showToast("切り替えに失敗しました", "error");
    } finally {
      if (token === this.transitionToken) {
        this.isTransitioning = false;
        this.session.setBusy("transition", false);
        this.ui.setSettingsBusy(false);
        this.updateManagementModels();
        if (focusTarget instanceof HTMLElement) focusTarget.focus();
      }
    }
  }

  /**
   * 初期化実行
   */
  async init(manifest, initialRef = null, loadedRegistry = null) {
    if (loadedRegistry) {
      this.dm.eventRegistry = loadedRegistry.registry;
      this.dm.eventRegistryUrl = loadedRegistry.registryUrl;
    } else {
      await this.dm.loadEventRegistry();
    }

    const devDemoEnabled = isDevDemoEnabled(window.location);
    if (devDemoEnabled) {
      const demoData = createDevDemoData();
      this.dm.wantToBuy = demoData.wantToBuy;
      this.dm.spreadsheetTitle = demoData.spreadsheetTitle;
      this.dm.purchasedList = demoData.purchasedList;
      this.dm.holdList = demoData.holdList;
    } else {
      const isRegisteredRef = (ref) => {
        const event = this.dm.eventRegistry?.events.find(
          (candidate) => candidate.eventId === ref?.eventId,
        );
        return Boolean(event?.days.some((day) => day.dayId === ref?.dayId));
      };
      let activeRef = initialRef || this.dm.repository.getLastOpened();
      if (!activeRef || !isRegisteredRef(activeRef)) {
        const defaultEvent = this.dm.eventRegistry?.events[0];
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
        await this.dm.openEventDay(activeRef);
        this.currentManifest = manifest;
      } catch (error) {
        console.error("Failed to open initial event day:", error);
        renderMapBootstrapError(document, error);
        return;
      }
    }

    this.ui.init(this.dm, {
      onSetNextTarget: (circle) => this.handleSetNextTarget(circle),
      onSelectTarget: (circle) => this.handleSelectTarget(circle),
      onPreviewRoute: () => this.handlePreviewRoute(),
      onConfirmRoute: () => this.handleConfirmRoute(),
      onCancelRoute: () => this.handleCancelRoute(),
    });
    this.setupEvents();

    if (devDemoEnabled) {
      this.ui.updateCounts(this.dm);
      this.ui.showToast("UIデモデータを表示中");
      this.searchNext();
      return;
    }

    this.ui.updateCounts(this.dm);
    this.updateManagementModels();

    // スタートアップ時に非同期でバックグラウンド同期コーディネーターを起動
    this.dm.startSyncCoordinator();

    // データがあれば初期表示
    if (this.dm.wantToBuy.length > 0) {
      this.ui.showToast("データ読み込み済み");
      this.searchNext("", false);
    } else {
      this.ui.showToast("CSVデータ未設定。空のイベント・日程で起動しました");
    }
  }

  /** Cleanup event listeners and coordinator timers. */
  dispose() {
    this.dm.disposeSyncCoordinator();
  }

  /** Build the complete render contract shared by the sheet and map. */
  getNavigationContext(fitMode = "preserve") {
    return {
      currentTarget: this.currentTarget,
      currentRoute: this.currentRoute,
      selectedTarget: this.selectedTarget || this.currentTarget,
      selectedRoute: this.selectedRoute,
      startSpace: this.currentStartSpace,
      nextTarget: this.nextTarget,
      selectionState: this.selectionState,
      selectionMessage: this.selectionMessage,
      fitMode,
    };
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
    if (!areSpacesInSameArea(startSpace, targetSpace)) return null;
    const area = findAreaForSpace(startSpace);
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
    if (!circle || this.selectionState === "comparing") return;

    const token = ++this.selectionToken;
    this.selectedTarget = circle;
    this.selectedRoute = null;
    this.selectionState = "loading";
    this.selectionMessage = "候補経路を計算中…";
    this.ui.showNavigation(this.getNavigationContext("preserve"));

    if (
      !this.currentRoute ||
      !areSpacesInSameArea(this.currentStartSpace, circle.space)
    ) {
      if (token !== this.selectionToken) return;
      this.selectionState = "error";
      this.selectionMessage = "同じ地図エリアの正式な経路を計算できません";
      this.ui.showNavigation(this.getNavigationContext("preserve"));
      return;
    }

    try {
      const route = await this.planGridRoute(
        this.currentStartSpace,
        circle.space,
        { startPosition: this.currentRoute.startPosition },
      );
      if (token !== this.selectionToken) return;
      if (!route) {
        this.selectionState = "error";
        this.selectionMessage = "候補地点までの経路を探索できません";
      } else {
        this.selectedRoute = route;
        this.selectedTarget = this.targetWithRoute(circle, route);
        this.selectionState =
          circle.space === this.currentTarget?.space ? "idle" : "ready";
        this.selectionMessage = "";
      }
    } catch (error) {
      if (token !== this.selectionToken) return;
      console.warn("Selected target route could not be calculated.", error);
      this.selectionState = "error";
      this.selectionMessage =
        "候補経路の読込に失敗しました。もう一度お試しください";
    }

    const fitMode = this.selectionState === "ready" ? "comparison" : "preserve";
    this.ui.showNavigation(this.getNavigationContext(fitMode));
  }

  /** Enter the two-route comparison state after a candidate route is ready. */
  handlePreviewRoute() {
    if (this.selectionState !== "ready" || !this.selectedRoute) return;
    this.selectionState = "comparing";
    this.ui.showNavigation(this.getNavigationContext("comparison"));
  }

  /** Promote the compared candidate to the active destination without recalculation. */
  handleConfirmRoute() {
    if (
      this.selectionState !== "comparing" ||
      !this.selectedTarget ||
      !this.selectedRoute
    )
      return;
    this.currentTarget = this.selectedTarget;
    this.currentRoute = this.selectedRoute;
    this.nextTarget = null;
    this.selectionState = "idle";
    this.selectionMessage = "";
    this.ui.showNavigation(this.getNavigationContext("current"));
    this.ui.showToast(`目的地を ${this.currentTarget.space} に変更しました`);
  }

  /** Leave comparison while retaining the selected target details. */
  handleCancelRoute() {
    if (this.selectionState !== "comparing") return;
    this.selectionState = "ready";
    this.ui.showNavigation(this.getNavigationContext("comparison"));
  }

  /**
   * 手動で目的地を設定
   */
  async handleSetNextTarget(circle) {
    if (!circle) return;

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
    this.currentRoute = route;
    this.currentTarget = this.targetWithRoute(gridTarget || circle, route);
    this.selectedTarget = this.currentTarget;
    this.selectedRoute = route;
    this.nextTarget = null;
    this.selectionState = "idle";
    this.selectionMessage = "";
    this.ui.showNavigation(this.getNavigationContext("current"));
    this.ui.showToast(`目的地を ${circle.space} に設定しました`);
  }

  readCurrentSpace() {
    const areaId = document.getElementById("loc-ewsn").value;
    const area = Config.AREAS.find((candidate) => candidate.id === areaId);
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

  /**
   * イベントリスナーの設定
   */
  setupEvents() {
    // 設定ボタン
    document.getElementById("toggle-settings").onclick = () => {
      const isOpen = !this.ui.els.settingsArea.open;
      if (!isOpen) {
        this.session.onSettingsClose();
        this.draftGasUrl = "";
        this.selectedSheetName = "";
        this.fetchedSheetNames = [];
        this.sourceErrorMessage = "";
        this.ui.setSettingsError("");
        this.updateManagementModels();
      }
      this.ui.toggleSettings(document.getElementById("toggle-settings"));
    };

    const btnOpenGallery = document.getElementById("btn-open-gallery");
    if (btnOpenGallery) {
      btnOpenGallery.onclick = () => {
        const areaId = document.getElementById("loc-ewsn").value;
        const area = Config.AREAS.find((candidate) => candidate.id === areaId);
        this.ui.showGallery(area?.name || areaId, false);
      };
    }

    const settings = this.ui.els.settingsArea;
    settings.addEventListener("event-day-select", (e) => {
      this.handleEventDaySelect(e.detail);
    });

    settings.addEventListener("csv-preview-request", (e) => {
      this.handleCsvPreviewRequest(e.detail.file);
    });

    settings.addEventListener("gas-sheets-request", (e) => {
      this.handleGasSheetsRequest(e.detail.gasUrl);
    });

    settings.addEventListener("gas-preview-request", (e) => {
      this.handleGasPreviewRequest(e.detail.source, e.detail.mode);
    });

    // 各種ボタンアクション
    document.getElementById("btn-search").onclick = () => this.searchNext();

    document.getElementById("btn-purchased").onclick = () =>
      this.handleAction("purchase");
    document.getElementById("btn-hold").onclick = () =>
      this.handleAction("hold");

    // Undo / Redo
    document.getElementById("btn-undo").onclick = () => this.handleUndo();
    document.getElementById("btn-redo").onclick = () => this.handleRedo();

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
    if (!area?.pointsFile || !area?.gridMetaFile || !area?.gridFile)
      return null;

    const cached = this.routeAssetsCache.get(area.id);
    if (cached !== undefined) return cached;

    const loadPromise = Promise.all([
      fetch(area.pointsFile).then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load ${area.pointsFile}: ${response.status}`,
          );
        }
        return response.json().then(parsePointsPayload);
      }),
      fetch(area.gridMetaFile).then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load ${area.gridMetaFile}: ${response.status}`,
          );
        }
        return response.json().then(parseGridMeta);
      }),
      fetch(area.gridFile).then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load ${area.gridFile}: ${response.status}`,
          );
        }
        return response.arrayBuffer();
      }),
    ])
      .then(([pointsPayload, gridMeta, gridBuffer]) => ({
        pointsPayload,
        gridMeta,
        gridBytes: new Uint8Array(gridBuffer),
      }))
      .catch((error) => {
        console.warn("Grid distance assets could not be loaded.", error);
        return null;
      });

    this.routeAssetsCache.set(area.id, loadPromise);
    const assets = await loadPromise;
    this.routeAssetsCache.set(area.id, assets);
    return assets;
  }

  async rankCandidatesByGrid(currentSpace, candidates) {
    const area = findAreaForSpace(currentSpace);
    if (!area) return null;

    const sameAreaCandidates = [];
    const otherCandidates = [];
    candidates.forEach((candidate) => {
      if (areSpacesInSameArea(currentSpace, candidate?.space)) {
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
    const fallbackRemainder = TspSolver.solve(currentSpace, [
      ...unreachable,
      ...otherCandidates,
    ]).slice(1);

    return [...reachable, ...fallbackRemainder];
  }

  /**
   * 次の目的地検索処理
   */
  searchNext(startSpace = "", notifyComplete = true) {
    if (this.dm.wantToBuy.length === 0) {
      this.ui.showToast("データがありません");
      return;
    }

    const currentSpace = startSpace || this.readCurrentSpace();
    if (!currentSpace) return;

    this.selectionToken += 1;
    this.ui.showLoading();

    // UI描画をブロックしないように非同期実行
    setTimeout(async () => {
      const candidates = this.dm.getUnvisited();
      if (candidates.length === 0) {
        this.currentTarget = null;
        this.currentRoute = null;
        this.selectedTarget = null;
        this.selectedRoute = null;
        this.ui.showTarget(null);
        if (notifyComplete) this.ui.showToast("全てのサークルを回りました！");
        return;
      }

      const gridRanked = await this.rankCandidatesByGrid(
        currentSpace,
        candidates,
      );
      const path = gridRanked
        ? [{ space: currentSpace, isStart: true }, ...gridRanked]
        : TspSolver.solve(currentSpace, candidates);

      // path[0]は現在地、path[1]が次の目的地
      if (path.length > 1) {
        const route = await this.planGridRoute(currentSpace, path[1].space);
        this.currentStartSpace = currentSpace;
        this.currentRoute = route;
        this.currentTarget = this.targetWithRoute(path[1], route);
        this.nextTarget = path.length > 2 ? path[2] : null;
        this.selectedTarget = this.currentTarget;
        this.selectedRoute = route;
        this.selectionState = "idle";
        this.selectionMessage = "";
        this.ui.showNavigation(this.getNavigationContext("current"));
      }
    }, 50);
  }

  /**
   * 購入・保留アクション
   */
  async handleAction(type) {
    if (this.selectionState === "comparing") return;
    const actionTarget = this.selectedTarget || this.currentTarget;
    if (!actionTarget) return;

    const space = actionTarget.space;
    const sheetName = actionTarget.sheetName || "";
    try {
      if (type === "purchase") {
        this.dm.addPurchased(space, sheetName);
        this.ui.showToast(`${space} 購入！`);
      } else {
        this.dm.addHold(space, sheetName);
        this.ui.showToast(`${space} 保留`);
      }
    } catch (error) {
      this.reportLocalMutationFailure(error);
      return;
    }

    if (this.dm.activeState?.source.type === "gas") {
      this.flushOutboxWithDiagnostic();
    }

    this.ui.updateCounts(this.dm);
    this.ui.updateCurrentLocation(space); // 現在地を更新
    this.searchNext(space, false); // 到着地点から自動で次を検索
  }

  /**
   * 取り消し処理
   */
  async handleUndo() {
    let action;
    try {
      action = this.dm.undoLastAction();
    } catch (error) {
      this.reportLocalMutationFailure(error);
      return;
    }
    if (action) {
      if (this.dm.activeState?.source.type === "gas") {
        this.flushOutboxWithDiagnostic();
      }
      this.ui.showToast(`${action.space} の操作を取り消しました`);
      this.ui.updateCounts(this.dm);
      this.ui.updateCurrentLocation(action.space); // 現在地を元に戻す
      // 画面は更新しない（現在地が変わっていないため）
    } else {
      this.ui.showToast("履歴がありません");
    }
  }

  /**
   * やり直し処理 (Redo)
   */
  async handleRedo() {
    let action;
    try {
      action = this.dm.redoAction();
    } catch (error) {
      this.reportLocalMutationFailure(error);
      return;
    }
    if (action) {
      if (this.dm.activeState?.source.type === "gas") {
        this.flushOutboxWithDiagnostic();
      }
      this.ui.showToast(`${action.space} の操作をやり直しました`);
      this.ui.updateCounts(this.dm);
      this.ui.updateCurrentLocation(action.space); // 現在地を更新
      this.searchNext(action.space); // 到着地点から次を自動検索
    } else {
      this.ui.showToast("やり直す操作がありません");
    }
  }

  /**
   * 全リセット処理
   */
  handleReset() {
    if (confirm("本当にリセットしますか？")) {
      try {
        this.dm.resetAll();
      } catch (error) {
        this.reportLocalMutationFailure(error);
        return;
      }
      if (this.dm.activeState?.source.type === "gas") {
        this.flushOutboxWithDiagnostic();
      }
      this.ui.updateCounts(this.dm);
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
      const result = await this.dm.flushActiveOutbox();
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
   * 保留リセット処理
   */
  handleResetHold() {
    if (this.dm.holdList.length === 0) return;
    if (confirm("保留リストをクリアしますか？")) {
      this.dm.resetHold();
      this.ui.updateCounts(this.dm);
      this.ui.showToast("保留リストをクリアしました");
    }
  }
}

/** Load the selected map bundle via event registry before creating application controllers. */
async function bootstrapApp() {
  let manifest;
  let registry;
  let registryUrl;
  let targetRef;
  try {
    ({ registry, registryUrl } = await loadEventRegistryWithUrl());
    const tempStorage = new StorageService();
    const tempRepo = new EventDayRepository(tempStorage);
    targetRef = tempRepo.getLastOpened();

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
    const manifestUrl = resolveEventMapManifestUrl(registryUrl, event);
    manifest = await loadMapBundleManifestFromUrl(manifestUrl);
    Config.initializeAreas(manifest.areas);
  } catch (error) {
    console.error("Map bundle initialization failed.", error);
    renderMapBootstrapError(document, error);
    return;
  }

  const app = new App();
  await app.init(manifest, targetRef, { registry, registryUrl });
}

// アプリ起動
document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApp();
});
