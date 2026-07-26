import "./components/comipath-settings";
import "./components/source-diff-dialog";
import { parseGasWebAppUrl } from "./api/gas-api-client";
import { Config } from "./config.js";
import { loadEventRegistryWithUrl } from "./data/event-registry";
import { CsvValidationError, DataManager } from "./data-manager.js";
import { createDevDemoData, isDevDemoEnabled } from "./dev-demo-data.js";
import {
  loadRuntimeMapBundleManifestFromUrl,
  renderMapBootstrapError,
  resolveEventMapManifestUrl,
} from "./map-manifest-loader";
import { planRoute, rankCandidatesByGridDistance } from "./route-planner";
import { EventDayRepository } from "./state/event-day-repository";
import { StorageDeletionService } from "./state/storage-deletion-service";
import { StorageService } from "./state/storage-service";
import { TspSolver } from "./tsp-solver.js";
import { parseGridMeta, parsePointsPayload } from "./types/boundary-parsers";
import { downloadCsv, formatCsvExportFilename } from "./ui/csv-download";
import { ManagementSession } from "./ui/management-session";
import {
  buildDeleteOptions,
  buildEventDayOptions,
  buildOutboxPanelModel,
  formatSourceDiff,
  formatSourceSummary,
} from "./ui/management-view-model";
import { buildSpaceFromLocation } from "./ui/navigation-view-model";
import { UIManager } from "./ui-manager.js";

function formatSourceApplyError(error) {
  switch (error?.name) {
    case "StaleCsvPreviewError":
    case "StaleGasPreviewError":
    case "StaleSourceStateError":
      return "プレビューが古くなっています。最新のソースを読み込んで再試行してください。";
    case "PendingOutboxError":
      return "未送信の操作があるため適用できません。同期完了後に再試行してください。";
    case "StorageWriteError":
      return "保存に失敗しました。空き容量やブラウザ設定を確認して再試行してください。";
    default:
      return "ソースデータの適用に失敗しました。最新のプレビューを取得して再試行してください。";
  }
}

/** Validates an event/day reference at the App's DOM event boundary. */
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
    this.outboxResultMessage = "";
    this.outboxErrorMessage = "";

    this.activeDeleteScope = null;
    this.deleteErrorMessage = "";

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

  get storageDeletionService() {
    return new StorageDeletionService(
      this.dm.repository,
      this.dm.sourceSettings,
      () =>
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `gen-${Date.now()}`,
    );
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
    const activeCircleCount = activeState
      ? activeState.circles.filter((circle) => !circle.removedFromSource).length
      : 0;
    const canExportCsv = activeCircleCount > 0;

    const sourceManagerModel = {
      activeRef: activeRef ? { ...activeRef } : null,
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
      canExportCsv,
      busy:
        this.session.isBusy("source-request") ||
        this.session.isBusy("transition"),
      errorMessage: this.sourceErrorMessage || "",
    };

    const outboxPanelModel = buildOutboxPanelModel(
      this.dm.eventRegistry,
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
          eventDayCount: this.dm.repository.list().length,
          activeCircleCount: activeState ? activeState.circles.length : 0,
          activityCount: activeState
            ? activeState.purchased.length + activeState.hold.length
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

    this.ui.updateSettingsState({
      eventDayOptions: options,
      selectedEventId: this.dm.activeRef?.eventId || "",
      selectedDayId: this.dm.activeRef?.dayId || "",
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
      if (activePreview.kind === "csv") {
        this.dm.cancelCsvPreview(activePreview.previewId);
      } else {
        this.dm.cancelGasPreview(activePreview.previewId);
      }
    }
    this.closeSourceDiffDialog();
  }

  async handleSourcePreviewApply(previewId) {
    const activePreview = this.session.getActivePreview();
    if (!activePreview || activePreview.previewId !== previewId) return;

    if (
      !this.dm.activeRef ||
      this.dm.activeRef.eventId !== activePreview.ref.eventId ||
      this.dm.activeRef.dayId !== activePreview.ref.dayId
    ) {
      this.handleSourcePreviewCancel();
      return;
    }

    this.session.setBusy("preview-apply", true);
    const dialog = document.getElementById("source-diff-dialog");
    if (dialog?.model) {
      dialog.model = { ...dialog.model, busy: true, errorMessage: "" };
    }

    try {
      if (activePreview.kind === "csv") {
        this.dm.applyCsvReplacement(previewId);
      } else {
        this.dm.applyGasPreview(previewId);
      }

      this.session.clearPreview();
      this.session.setBusy("preview-apply", false);
      this.closeSourceDiffDialog();
      this.updateManagementModels();
      this.ui.updateCounts(this.dm);
      if (this.dm.wantToBuy.length > 0) {
        this.searchNext("", false);
      } else {
        this.ui.showTarget(null);
      }
      this.ui.showToast("ソースデータを適用しました");
    } catch (err) {
      this.session.setBusy("preview-apply", false);
      const errorMessage = formatSourceApplyError(err);
      if (dialog?.model) {
        dialog.model = { ...dialog.model, busy: false, errorMessage };
      }
    }
  }

  handleSourcePreviewCancel() {
    this.clearActivePreviewIfAny();
    this.session.clearPreview();
    this.updateManagementModels();
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
      this.openSourceDiffDialog(file.name, formatSourceDiff(preview.diff));
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

  /** Export active event/day state as a downloadable CSV. */
  handleCsvExportRequest(ref) {
    if (
      !isEventDayRef(ref) ||
      !this.dm.activeRef ||
      !sameEventDayRef(ref, this.dm.activeRef) ||
      !this.dm.activeState
    ) {
      return;
    }
    const activeCirclesCount = this.dm.activeState.circles.filter(
      (circle) => !circle.removedFromSource,
    ).length;
    if (activeCirclesCount === 0) return;

    try {
      const csv = this.dm.exportCsv(this.dm.activeRef);
      const filename = formatCsvExportFilename(this.dm.activeRef, new Date());
      downloadCsv(csv, filename, this.downloadAdapter);
      this.ui.showToast("CSVをダウンロードしました");
    } catch (_err) {
      this.sourceErrorMessage = "CSVのエクスポートに失敗しました。";
      this.updateManagementModels();
      this.ui.showToast("CSVエクスポートエラー", "error");
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
      this.openSourceDiffDialog(
        normalizedSource.sheetName,
        formatSourceDiff(preview.diff),
      );
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
    const ref = detail.ref || null;
    const requestToken = this.session.nextRequestToken();
    this.session.setBusy("outbox-retry", true);
    this.outboxResultMessage = "";
    this.outboxErrorMessage = "";
    this.updateManagementModels();

    try {
      const summary = await this.dm.syncCoordinator.retry(ref);
      if (!this.session.isLatestRequestToken(requestToken)) return;
      this.session.setBusy("outbox-retry", false);

      if (summary.sent > 0 && summary.pending === 0) {
        this.ui.showToast(`GAS同期完了 (${summary.sent}件送信)`);
        this.outboxResultMessage = `送信完了 (${summary.sent}件)`;
      } else if (summary.sent > 0 && summary.pending > 0) {
        this.ui.showToast(
          `一部送信完了 (${summary.sent}件送信 / 残り${summary.pending}件)`,
          "warning",
        );
        this.outboxResultMessage = `一部送信完了 (${summary.sent}件送信 / 残り${summary.pending}件)`;
      } else if (summary.failures.length > 0) {
        this.ui.showToast("GAS同期に失敗しました", "error");
        this.outboxErrorMessage =
          "再送に失敗しました。時間をおいて再試行してください。";
      }
    } catch (_error) {
      if (!this.session.isLatestRequestToken(requestToken)) return;
      this.session.setBusy("outbox-retry", false);
      this.outboxErrorMessage = "再送処理中にエラーが発生しました。";
      this.ui.showToast("再送エラー", "error");
    } finally {
      if (this.session.isLatestRequestToken(requestToken)) {
        this.updateManagementModels();
        this.ui.updateCounts(this.dm);
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
    const activeRefBeforeDelete = this.dm.activeRef
      ? { ...this.dm.activeRef }
      : null;
    this.session.setBusy("storage-delete", true);
    this.deleteErrorMessage = "";
    this.updateManagementModels();

    const now = new Date().toISOString();
    try {
      const result = this.storageDeletionService.delete(scope, now);
      if (!this.session.isLatestRequestToken(token)) return;

      this.session.setBusy("storage-delete", false);
      this.activeDeleteScope = null;

      const activeRefDeleted =
        scope.type === "all-events"
          ? activeRefBeforeDelete !== null
          : result.deletedRefs.some((ref) =>
              sameEventDayRef(ref, activeRefBeforeDelete),
            );

      if (activeRefDeleted) {
        this.dm.activeRef = null;
        this.dm.activeState = null;

        const remainingList = this.dm.repository.list();
        if (remainingList.length > 0) {
          await this.handleEventDaySelect(remainingList[0]);
        } else {
          const defaultRef = {
            eventId: this.dm.eventRegistry.events[0].eventId,
            dayId: this.dm.eventRegistry.events[0].days[0].dayId,
          };
          await this.handleEventDaySelect(defaultRef);
        }

        if (!this.dm.activeRef) {
          renderMapBootstrapError(
            document,
            new Error("No active event/day remains after deletion"),
          );
          return;
        }
      } else {
        this.updateManagementModels();
        this.ui.updateCounts(this.dm);
      }
      this.ui.showToast("データを削除しました");
    } catch (_error) {
      if (!this.session.isLatestRequestToken(token)) return;
      this.session.setBusy("storage-delete", false);
      if (activeRefBeforeDelete && !this.dm.activeRef) {
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
      this.dm.discardOutboxEntries(
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
      this.ui.updateCounts(this.dm);
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

    this.clearActivePreviewIfAny();
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
      Config.replaceAreas(prepared.manifest.areas);

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
        await this.searchNext("", false);
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
      this.updateManagementModels();
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
        this.clearActivePreviewIfAny();
        this.session.onSettingsClose();
        this.draftGasUrl = "";
        this.selectedSheetName = "";
        this.fetchedSheetNames = [];
        this.sourceErrorMessage = "";
        this.outboxResultMessage = "";
        this.outboxErrorMessage = "";
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

    settings.addEventListener("csv-export-request", (e) => {
      this.handleCsvExportRequest(e.detail.ref);
    });

    settings.addEventListener("gas-sheets-request", (e) => {
      this.handleGasSheetsRequest(e.detail.gasUrl);
    });

    settings.addEventListener("gas-preview-request", (e) => {
      this.handleGasPreviewRequest(e.detail.source, e.detail.mode);
    });

    settings.addEventListener("gas-retry-request", (e) => {
      this.handleGasRetryRequest(e.detail);
    });

    settings.addEventListener("gas-discard-request", (e) => {
      this.handleGasDiscardRequest(e.detail);
    });

    settings.addEventListener("delete-option-select", (e) => {
      this.handleDeleteOptionSelect(e.detail.scope);
    });

    settings.addEventListener("storage-delete-request", (e) => {
      this.handleStorageDeleteRequest(e.detail);
    });

    settings.addEventListener("storage-delete-cancel", () => {
      this.handleDeleteDialogCancel();
    });

    const diffDialog = document.getElementById("source-diff-dialog");
    if (diffDialog) {
      diffDialog.addEventListener("source-preview-apply", (e) => {
        this.handleSourcePreviewApply(e.detail.previewId);
      });
      diffDialog.addEventListener("source-preview-cancel", () => {
        this.handleSourcePreviewCancel();
      });
    }

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
      return Promise.resolve();
    }

    const currentSpace = startSpace || this.readCurrentSpace();
    if (!currentSpace) return Promise.resolve();

    this.selectionToken += 1;
    this.ui.showLoading();

    // UI描画をブロックしないように非同期実行
    return new Promise((resolve) =>
      setTimeout(async () => {
        const candidates = this.dm.getUnvisited();
        if (candidates.length === 0) {
          this.currentTarget = null;
          this.currentRoute = null;
          this.selectedTarget = null;
          this.selectedRoute = null;
          this.ui.showTarget(null);
          if (notifyComplete) this.ui.showToast("全てのサークルを回りました！");
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
          console.warn("Grid candidate ranking failed; using fallback.", error);
        }
        let path;
        try {
          path = gridRanked
            ? [{ space: currentSpace, isStart: true }, ...gridRanked]
            : TspSolver.solve(currentSpace, candidates);
        } catch (error) {
          console.warn("Candidate ordering failed; using source order.", error);
          path = [{ space: currentSpace, isStart: true }, ...candidates];
        }

        // path[0]は現在地、path[1]が次の目的地
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
          this.currentRoute = route;
          this.currentTarget = this.targetWithRoute(path[1], route);
          this.nextTarget = path.length > 2 ? path[2] : null;
          this.selectedTarget = this.currentTarget;
          this.selectedRoute = route;
          this.selectionState = "idle";
          this.selectionMessage = "";
          this.ui.showNavigation(this.getNavigationContext("current"));
        }
        resolve();
      }, 50),
    );
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
    this.updateManagementModels();
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
    manifest = await loadRuntimeMapBundleManifestFromUrl(
      manifestUrl,
      event.eventId,
    );
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
