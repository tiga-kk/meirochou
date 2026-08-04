import { CustomSelect } from "./components/custom-select.js";
import { DomCircleGalleryView } from "./features/circle-status/ui/dom-circle-gallery-view";
import { DomCircleProgressView } from "./features/circle-status/ui/dom-circle-progress-view";
import { runtimeMapAreaCatalog } from "./features/route-guidance/infrastructure/runtime-map-area-catalog";
import { DomRouteMapView } from "./features/route-guidance/ui/dom-route-map-view";
import { buildRouteGuidanceScreenModel } from "./features/route-guidance/ui/route-guidance-screen-model";
import { TspSolver } from "./tsp-solver.js";

/**
 * UI管理クラス
 * DOM操作、表示更新を担当
 */
export class UIManager {
  constructor() {
    this.dataManager = null;
    this.onSetNextTarget = null; // コールバック
    this.onSelectTarget = null;
    this.onPreviewRoute = null;
    this.onConfirmRoute = null;
    this.onCancelRoute = null;
    this.statsRenderer = new DomCircleProgressView(this, runtimeMapAreaCatalog);
    this.modalManager = new DomCircleGalleryView();
    this.mapRenderer = new DomRouteMapView(this);

    this.els = {
      spreadsheetTitle: document.getElementById("spreadsheet-title"),
      settingsArea: document.getElementById("settings-area"),
      settingsToggle: document.getElementById("toggle-settings"),

      locEwsn: document.getElementById("loc-ewsn"),
      locLabel: document.getElementById("loc-label"),
      headerAreaMark: document.getElementById("header-area-mark"),
      headerAreaTitle: document.getElementById("header-area-title"),
      locNumber: document.getElementById("loc-number"),
      targetSection: document.getElementById("target-content"),
      targetEmpty: document.getElementById("target-empty"),
      targetLoading: document.getElementById("target-loading"),
      heading: document.getElementById("target-space-heading"),
      targetStatusLabel: document.getElementById("target-status-label"),
      selectedTargetSpace: document.getElementById("selected-target-space"),
      targetSheetName: document.getElementById("target-sheet-name"),
      targetStartSpace: document.getElementById("target-start-space"),
      targetRouteLog: document.getElementById("target-route-log"),
      dist: document.getElementById("target-dist"),
      priority: document.getElementById("target-priority"),
      subTargetSpace: document.getElementById("sub-target-space"),
      tweetLink: document.getElementById("target-tweet-link"),
      tweetEmbed: document.getElementById("tweet-embed-container"),
      routeSelectionControls: document.getElementById(
        "route-selection-controls",
      ),
      routeSelectionMessage: document.getElementById("route-selection-message"),
      btnPreviewRoute: document.getElementById("btn-preview-route"),
      routeChangeConfirmation: document.getElementById(
        "route-change-confirmation",
      ),
      routeChangeCurrent: document.getElementById("route-change-current"),
      routeChangeCurrentDistance: document.getElementById(
        "route-change-current-distance",
      ),
      routeChangeCandidate: document.getElementById("route-change-candidate"),
      routeChangeCandidateDistance: document.getElementById(
        "route-change-candidate-distance",
      ),
      btnConfirmRoute: document.getElementById("btn-confirm-route-change"),
      btnCancelRoute: document.getElementById("btn-cancel-route-change"),
      btnPurchased: document.getElementById("btn-purchased"),
      btnHold: document.getElementById("btn-hold"),

      toast: document.getElementById("toast"),

      // Counts
      cntE456: document.getElementById("count-e456"),
      cntE7: document.getElementById("count-e7"),
      cntW12: document.getElementById("count-w12"),
      cntS12: document.getElementById("count-s12"),
      cntHoldE456: document.getElementById("count-hold-e456"),
      cntHoldE7: document.getElementById("count-hold-e7"),
      cntHoldW12: document.getElementById("count-hold-w12"),
      cntHoldS12: document.getElementById("count-hold-s12"),
    };

    this.toastTimer = null;
    this.customSelects = {};
  }

  /**
   * 初期化処理
   */
  init(dataManager, callbacks = {}) {
    this.dataManager = dataManager;
    this.onSetNextTarget = callbacks.onSetNextTarget || null;
    this.onSelectTarget = callbacks.onSelectTarget || null;
    this.onPreviewRoute = callbacks.onPreviewRoute || null;
    this.onConfirmRoute = callbacks.onConfirmRoute || null;
    this.onCancelRoute = callbacks.onCancelRoute || null;

    // サブマネージャーの初期化
    this.modalManager.setOnSetNextTargetCallback(this.onSetNextTarget);
    this.modalManager.init(this, dataManager);

    // MapRenderer logic
    if (this.mapRenderer.init) {
      this.mapRenderer.init();
    }

    // 設定読み込み
    this.updateSettingsState({
      gasUrl: "",
      selectedSheets: [],
    });
    this.updateSpreadsheetTitle(dataManager.getSpreadsheetTitle());

    // 統計情報の初期化
    this.statsRenderer.init();

    // セレクトボックス初期化 (EWSN) - Runtime MapAreaCatalogを使用
    this.els.locEwsn.innerHTML = "";
    if (runtimeMapAreaCatalog.getAllMapAreas()) {
      runtimeMapAreaCatalog.getAllMapAreas().forEach((area) => {
        const opt = document.createElement("option");
        opt.value = area.id;
        opt.textContent = area.name;
        this.els.locEwsn.appendChild(opt);
      });
    }

    // カスタムセレクトの適用
    this.customSelects.ewsn = new CustomSelect(this.els.locEwsn, () => {
      this.updateLabelOptions(true);
      this.updateAreaHeader();
    });
    this.customSelects.label = new CustomSelect(this.els.locLabel);

    // ラベル初期化
    this.updateLabelOptions(true);
    this.updateAreaHeader();

    this.updateCounts(dataManager);

    if (this.els.btnPreviewRoute) {
      this.els.btnPreviewRoute.onclick = () => this.onPreviewRoute?.();
    }
    if (this.els.btnConfirmRoute) {
      this.els.btnConfirmRoute.onclick = () => this.onConfirmRoute?.();
    }
    if (this.els.btnCancelRoute) {
      this.els.btnCancelRoute.onclick = () => this.onCancelRoute?.();
    }
  }

  // --- Modal Delegate Methods ---

  showPdfModal(source) {
    this.modalManager.showPdfModal(source);
  }

  showGallery(areaKey, isHold = false) {
    this.modalManager.showGallery(areaKey, isHold);
  }

  // --- Sheet List Delegate Methods ---

  renderSheetList(sheets, selectedSheets, _onChangeCallback) {
    this.updateSettingsState({ sheets, selectedSheets });
  }

  updateSettingsState(state) {
    const settings = this.els.settingsArea;
    if (!settings) return;
    Object.entries(state).forEach(([key, value]) => {
      settings[key] = value;
    });
  }

  setSettingsBusy(busy) {
    this.updateSettingsState({ busy: Boolean(busy) });
  }

  setSettingsError(message = "") {
    this.updateSettingsState({ errorMessage: message });
  }

  /**
   * 現在地のプルダウン更新
   */
  updateLabelOptions(updateCustom = false) {
    const selected = this.els.locEwsn.value;
    this.els.locLabel.innerHTML = "";

    // Runtime MapAreaCatalogから該当エリアを検索
    let labels = [];
    if (runtimeMapAreaCatalog.getAllMapAreas()) {
      const area = runtimeMapAreaCatalog
        .getAllMapAreas()
        .find((a) => a.id === selected);
      if (area) {
        labels = area.labels;
      }
    }

    labels.forEach((val) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      this.els.locLabel.appendChild(opt);
    });

    if (updateCustom && this.customSelects.label) {
      this.customSelects.label.render();
    }
  }

  /** Reflect the selected manifest area in the compact field header. */
  updateAreaHeader() {
    const area = runtimeMapAreaCatalog
      .getAllMapAreas()
      .find((candidate) => candidate.id === this.els.locEwsn.value);
    if (!area) return;
    this.els.headerAreaMark.textContent = area.prefixes.join("/");
    this.els.headerAreaTitle.textContent = area.name;
  }

  /** Render the active route and an independently selected map target. */
  showNavigation(state) {
    const {
      currentTarget,
      currentRoute = null,
      selectedTarget = currentTarget,
      startSpace = "",
      nextTarget = null,
      selectionState = "idle",
      selectionMessage = "",
    } = state;

    this.els.targetLoading.classList.add("hidden");
    this.els.targetEmpty.classList.add("hidden");
    this.els.targetSection.classList.remove("hidden");

    if (!currentTarget) {
      // 全完了時の表示
      this.els.heading.textContent = "COMPLETE";
      if (this.els.targetStatusLabel)
        this.els.targetStatusLabel.textContent = "完了";
      if (this.els.selectedTargetSpace)
        this.els.selectedTargetSpace.textContent = "---";
      if (this.els.targetSheetName)
        this.els.targetSheetName.classList.add("hidden");
      if (this.els.targetStartSpace)
        this.els.targetStartSpace.textContent = startSpace || "-";
      if (this.els.targetRouteLog)
        this.els.targetRouteLog.textContent = "未訪問なし";
      this.els.dist.textContent = "-";
      this.els.priority.textContent = "-";
      this.els.subTargetSpace.textContent = "次 なし";
      this.els.tweetEmbed.innerHTML = "";
      this.els.routeSelectionControls?.classList.add("hidden");
      this.els.routeChangeConfirmation?.classList.add("hidden");
      // 地図非表示
      if (this.mapRenderer) this.mapRenderer.updateMap(""); // 空文字を送って隠す
      return;
    }

    const currentViewModel = buildRouteGuidanceScreenModel({
      currentDestination: currentTarget,
      nextDestination: nextTarget,
      startSpace,
    });
    const detailTarget = selectedTarget || currentTarget;
    const isPreview = detailTarget.space !== currentTarget.space;
    const distanceLabel =
      selectionState === "loading"
        ? "距離 計算中"
        : selectionState === "error"
          ? "距離 計算不可"
          : undefined;

    this.els.heading.textContent = currentViewModel.space;
    if (this.els.targetStartSpace)
      this.els.targetStartSpace.textContent = startSpace || "-";
    if (this.els.targetRouteLog) {
      const currentDistance = currentRoute
        ? `距離 ${Math.round(currentRoute.cost)}`
        : currentViewModel.distanceLabel;
      this.els.targetRouteLog.textContent = `${currentDistance} / ${currentViewModel.nextLabel}`;
    }
    this.renderTargetDetails(
      detailTarget,
      startSpace,
      isPreview ? null : nextTarget,
      {
        statusLabel: isPreview ? "選択中" : "次の目的地",
        distanceLabel,
      },
    );

    const comparing = selectionState === "comparing";
    this.els.routeSelectionControls?.classList.toggle(
      "hidden",
      !isPreview || comparing,
    );
    if (this.els.btnPreviewRoute) {
      this.els.btnPreviewRoute.disabled = selectionState !== "ready";
    }
    if (this.els.routeSelectionMessage) {
      this.els.routeSelectionMessage.textContent =
        selectionMessage ||
        (selectionState === "loading" ? "候補経路を計算中…" : "");
    }
    this.els.routeChangeConfirmation?.classList.toggle("hidden", !comparing);
    if (comparing) {
      this.els.routeChangeCurrent.textContent = currentTarget.space;
      this.els.routeChangeCurrentDistance.textContent = currentRoute
        ? `距離 ${Math.round(currentRoute.cost)}`
        : "距離 -";
      this.els.routeChangeCandidate.textContent = detailTarget.space;
      this.els.routeChangeCandidateDistance.textContent = state.selectedRoute
        ? `距離 ${Math.round(state.selectedRoute.cost)}`
        : "距離 -";
    }
    if (this.els.btnPurchased) this.els.btnPurchased.disabled = comparing;
    if (this.els.btnHold) this.els.btnHold.disabled = comparing;

    if (this.mapRenderer) {
      this.mapRenderer.renderNavigation(state);
    }
  }

  /** Backward-compatible empty/completion renderer used by reset flows. */
  showTarget(target, startSpace = "", nextTarget = null) {
    this.showNavigation({ currentTarget: target, startSpace, nextTarget });
  }

  renderTargetDetails(
    target,
    startSpace = "",
    nextTarget = null,
    options = {},
  ) {
    const viewModel = buildRouteGuidanceScreenModel({
      currentDestination: target,
      nextDestination: nextTarget,
      startSpace,
    });

    if (this.els.targetStatusLabel) {
      this.els.targetStatusLabel.textContent =
        options.statusLabel || viewModel.statusLabel;
    }
    if (this.els.selectedTargetSpace)
      this.els.selectedTargetSpace.textContent = viewModel.space;
    if (this.els.targetSheetName) {
      this.els.targetSheetName.textContent = viewModel.sheetNameLabel;
      this.els.targetSheetName.classList.toggle(
        "hidden",
        !viewModel.sheetNameLabel,
      );
    }
    this.els.priority.textContent = viewModel.priorityLabel;
    this.els.subTargetSpace.textContent = viewModel.nextLabel;
    this.els.dist.textContent =
      options.distanceLabel || viewModel.distanceLabel;

    // Twitterリンク
    if (viewModel.accountUrl) {
      this.els.tweetLink.href = viewModel.accountUrl;
      this.els.tweetLink.style.display = "block";
      this.els.tweetLink.innerHTML = `<i class="fa-brands fa-twitter"></i> ${viewModel.accountLabel}`;
      this.els.tweetLink.target = "_blank";
      this.els.tweetLink.rel = "noopener noreferrer";
    } else {
      this.els.tweetLink.style.display = "none";
    }

    // お品書き画像表示
    const renderCatalogPlaceholder = (failedImage = null) => {
      if (failedImage && !this.els.tweetEmbed.contains(failedImage)) return;
      this.els.tweetEmbed.innerHTML = "";
      const placeholder = document.createElement("div");
      placeholder.className = "catalog-placeholder";
      placeholder.textContent = "No Image";
      placeholder.onclick = () => this.modalManager.showPdfModal(target);
      this.els.tweetEmbed.appendChild(placeholder);
    };

    this.els.tweetEmbed.innerHTML = "";
    if (viewModel.hasCatalogImage) {
      const img = document.createElement("img");
      img.src = viewModel.catalogUrl;
      img.alt = "お品書き";
      img.loading = "lazy";
      img.onerror = () => renderCatalogPlaceholder(img);
      img.onclick = () => this.modalManager.showPdfModal(target); // ModalManagerへ委譲
      this.els.tweetEmbed.appendChild(img);
    } else {
      renderCatalogPlaceholder();
    }
  }

  previewTarget(target) {
    if (!target) return;
    if (this.onSelectTarget) this.onSelectTarget(target);
  }

  /**
   * 残り件数の更新
   */
  updateCounts(dm) {
    if (this.statsRenderer) {
      this.statsRenderer.updateCounts(dm);
    }
  }

  updateSpreadsheetTitle(title) {
    if (!this.els.spreadsheetTitle) return;

    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    this.els.spreadsheetTitle.textContent = normalizedTitle;
    this.els.spreadsheetTitle.title = normalizedTitle;
    this.els.spreadsheetTitle.classList.toggle("hidden", !normalizedTitle);
  }

  /**
   * 設定画面の開閉
   */
  toggleSettings(toggleButton = null) {
    const isOpen = !this.els.settingsArea.open;
    this.els.settingsArea.open = isOpen;
    toggleButton?.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) {
      this.els.settingsArea.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  showSettings() {
    this.els.settingsArea.open = true;
    this.els.settingsToggle?.setAttribute("aria-expanded", "true");
  }

  /**
   * 通知トーストの表示
   */
  showToast(msg, type = "info") {
    if (!this.els?.toast) return;
    this.els.toast.textContent = msg;
    this.els.toast.className = `show ${type}`;

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.els.toast.classList.remove("show");
    }, 3000);
  }

  /**
   * 現在地表示を更新
   */
  updateCurrentLocation(space) {
    const [ewsn, label, number] = TspSolver.parseSpace(space);
    this.els.locEwsn.value = ewsn;
    this.updateLabelOptions(true);
    this.els.locLabel.value = label;

    this.els.locNumber.value = number;

    if (this.customSelects.ewsn) this.customSelects.ewsn.updateTrigger();
    if (this.customSelects.label) this.customSelects.label.updateTrigger();
  }

  /**
   * ロード画面の表示
   */
  showLoading() {
    this.els.targetLoading.classList.remove("hidden");
  }
}
