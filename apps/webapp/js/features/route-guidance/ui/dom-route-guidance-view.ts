// @ts-nocheck

import { CustomSelect } from "../../../components/custom-select.js";
import { parseSpace } from "../../../shared/domain/space-parser";
import { DomUserNotificationView } from "../../../shared/ui/dom-user-notification-view";
import {
  DomCircleGalleryView,
  DomCircleProgressView,
} from "../../circle-status/public-api";
import { classifyCatalogOrientation } from "./catalog-orientation";
import { DomRouteMapView } from "./dom-route-map-view";
import {
  buildRouteGuidanceScreenModel,
  formatRouteDistance,
} from "./route-guidance-screen-model";

function hasUsableMapScale(area) {
  return (
    typeof area?.metersPerPixel === "number" &&
    Number.isFinite(area.metersPerPixel) &&
    area.metersPerPixel > 0
  );
}

/**
 * Route guidance DOM view and its adjacent browser-owned controls.
 * DOM操作、表示更新を担当
 */
export class DomRouteGuidanceView {
  constructor(mapAreaCatalog) {
    this.mapAreaCatalog = mapAreaCatalog;
    this.dataManager = null;
    this.onSetNextTarget = null; // コールバック
    this.onSelectTarget = null;
    this.onPreviewRoute = null;
    this.onConfirmRoute = null;
    this.onCancelRoute = null;
    this.lastNavigationState = null;
    this.candidatePreviewTarget = null;
    this.candidatePreviewOutsideClick = null;
    this.candidatePreviewEscape = null;
    this.targetDetailEscape = null;
    this.statsRenderer = new DomCircleProgressView(this, mapAreaCatalog);
    this.modalManager = new DomCircleGalleryView(mapAreaCatalog);
    this.mapRenderer = new DomRouteMapView(this, mapAreaCatalog);

    this.els = {
      spreadsheetTitle: document.getElementById("spreadsheet-title"),
      settingsArea: document.getElementById("settings-area"),
      settingsToggle: document.getElementById("toggle-settings"),

      locEwsn: document.getElementById("loc-ewsn"),
      locLabel: document.getElementById("loc-label"),
      headerAreaMark: document.getElementById("header-area-mark"),
      headerAreaTitle: document.getElementById("header-area-title"),
      headerMapVersion: document.getElementById("header-map-version"),
      locNumber: document.getElementById("loc-number"),
      targetSection: document.getElementById("target-content"),
      candidatePreviewSurface: document.getElementById(
        "candidate-preview-surface",
      ),
      targetDetail: document.getElementById("next-target"),
      targetDetailPanel: document.getElementById("target-detail"),
      toggleTargetDetail: document.getElementById("btn-toggle-target-detail"),
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
      btnCloseRouteSelection: document.getElementById(
        "btn-close-route-selection",
      ),
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

    this.notificationView = new DomUserNotificationView(this.els.toast, 3000);
    this.customSelects = {};
    this.setTargetDetailExpanded(false);
    this.els.toggleTargetDetail?.addEventListener("click", () => {
      this.setTargetDetailExpanded(!this.detailExpanded);
    });
    this.targetDetailEscape = (event) => {
      if (event.key !== "Escape" || !this.detailExpanded) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setTargetDetailExpanded(false);
      this.els.toggleTargetDetail?.focus();
    };
    document.addEventListener("keydown", this.targetDetailEscape);
  }

  setTargetDetailExpanded(expanded) {
    this.detailExpanded = Boolean(expanded);
    if (this.els.targetDetailPanel) {
      this.els.targetDetailPanel.hidden = !this.detailExpanded;
    }
    this.els.toggleTargetDetail?.setAttribute(
      "aria-expanded",
      String(this.detailExpanded),
    );
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
    this.onCloseRouteSelection = callbacks.onCloseRouteSelection || null;

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
    if (this.mapAreaCatalog.getAllMapAreas()) {
      this.mapAreaCatalog.getAllMapAreas().forEach((area) => {
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
    if (this.els.btnCloseRouteSelection) {
      this.els.btnCloseRouteSelection.onclick = () =>
        this.onCloseRouteSelection?.();
    }
  }

  // --- Modal Delegate Methods ---

  showPdfModal(source, options = {}) {
    this.modalManager.showPdfModal(source, options);
  }

  setRouteMotionPreference(preference) {
    this.mapRenderer.setRouteMotionPreference(preference);
  }

  showGallery(scope) {
    this.modalManager.showGallery(scope);
  }

  showUndoSnackbar(space) {
    this.modalManager.showUndoSnackbar(space);
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
    if (this.mapAreaCatalog.getAllMapAreas()) {
      const area = this.mapAreaCatalog
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
    const area = this.mapAreaCatalog
      .getAllMapAreas()
      .find((candidate) => candidate.id === this.els.locEwsn.value);
    if (!area) return;
    this.els.headerAreaMark.textContent = area.prefixes.join("/");
    this.els.headerAreaTitle.textContent = area.name;
  }

  /** Render the active route and an independently selected map target. */
  showNavigation(state) {
    this.closeCandidatePreview();
    this.lastNavigationState = state;
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
      this.els.targetSection.classList.remove("candidate-selection");
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
      this.els.targetDetail?.setAttribute("data-catalog-orientation", "none");
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
    if (isPreview) this.setTargetDetailExpanded(true);
    const detailRoute = isPreview ? state.selectedRoute : currentRoute;
    const detailArea = this.mapAreaCatalog.findMapAreaForCircleSpace(
      detailTarget.space,
    );
    const getDistanceLabel = (target, route, area) =>
      route
        ? formatRouteDistance(route, area?.metersPerPixel)
        : hasUsableMapScale(area)
          ? "距離 -"
          : buildRouteGuidanceScreenModel({
              currentDestination: target,
              nextDestination: null,
              startSpace,
            }).distanceLabel;
    const distanceLabel =
      selectionState === "loading"
        ? "距離 計算中"
        : selectionState === "error"
          ? "距離 計算不可"
          : getDistanceLabel(detailTarget, detailRoute, detailArea);

    this.els.heading.textContent = currentViewModel.space;
    if (this.els.targetStartSpace)
      this.els.targetStartSpace.textContent = startSpace || "-";
    if (this.els.targetRouteLog) {
      const currentArea = this.mapAreaCatalog.findMapAreaForCircleSpace(
        currentTarget.space,
      );
      const currentDistance = getDistanceLabel(
        currentTarget,
        currentRoute,
        currentArea,
      );
      this.els.targetRouteLog.textContent = currentDistance;
    }
    this.renderTargetDetails(
      detailTarget,
      startSpace,
      isPreview ? null : nextTarget,
      {
        statusLabel: isPreview ? "変更候補" : "お品書き",
        distanceLabel,
        showCandidateDetails: isPreview,
      },
    );

    const comparing = selectionState === "comparing";
    this.els.targetSection.classList.toggle("candidate-selection", isPreview);
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
    if (this.els.btnCloseRouteSelection) {
      this.els.btnCloseRouteSelection.disabled = comparing;
    }
    this.els.routeChangeConfirmation?.classList.toggle("hidden", !comparing);
    if (comparing) {
      const currentArea = this.mapAreaCatalog.findMapAreaForCircleSpace(
        currentTarget.space,
      );
      const candidateArea = this.mapAreaCatalog.findMapAreaForCircleSpace(
        detailTarget.space,
      );
      this.els.routeChangeCurrent.textContent = currentTarget.space;
      this.els.routeChangeCurrentDistance.textContent = getDistanceLabel(
        currentTarget,
        currentRoute,
        currentArea,
      );
      this.els.routeChangeCandidate.textContent = detailTarget.space;
      this.els.routeChangeCandidateDistance.textContent = getDistanceLabel(
        detailTarget,
        state.selectedRoute,
        candidateArea,
      );
    }
    if (this.els.btnPurchased) this.els.btnPurchased.disabled = isPreview;
    if (this.els.btnHold) this.els.btnHold.disabled = isPreview;

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
    if (this.els.selectedTargetSpace) {
      this.els.selectedTargetSpace.textContent =
        options.showCandidateDetails === false ? "" : viewModel.space;
    }
    if (this.els.targetSheetName) {
      this.els.targetSheetName.textContent = viewModel.sheetNameLabel;
      this.els.targetSheetName.classList.toggle(
        "hidden",
        !viewModel.sheetNameLabel,
      );
    }
    this.els.priority.textContent = viewModel.priorityLabel;
    this.els.subTargetSpace.textContent = options.showCandidateDetails
      ? `候補 ${viewModel.space}`
      : "";
    this.els.dist.textContent =
      options.showCandidateDetails === false
        ? ""
        : options.showCandidateDetails
          ? options.distanceLabel || viewModel.distanceLabel
          : "";

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
      this.els.targetDetail?.setAttribute("data-catalog-orientation", "none");
      this.els.tweetEmbed.innerHTML = "";
      const placeholder = document.createElement("div");
      placeholder.className = "catalog-placeholder";
      placeholder.textContent = "No Image";
      placeholder.onclick = () => this.modalManager.showPdfModal(target);
      this.els.tweetEmbed.appendChild(placeholder);
    };

    this.els.targetDetail?.setAttribute("data-catalog-orientation", "none");
    this.els.tweetEmbed.innerHTML = "";
    if (viewModel.hasCatalogImage) {
      const img = document.createElement("img");
      img.alt = "お品書き";
      img.loading = "lazy";
      img.onload = () => {
        if (!this.els.tweetEmbed.contains(img)) return;
        this.els.targetDetail?.setAttribute(
          "data-catalog-orientation",
          classifyCatalogOrientation({
            width: img.naturalWidth,
            height: img.naturalHeight,
          }),
        );
      };
      img.onerror = () => renderCatalogPlaceholder(img);
      img.src = viewModel.catalogUrl;
      img.onclick = () => this.modalManager.showPdfModal(target); // ModalManagerへ委譲
      this.els.tweetEmbed.appendChild(img);
    } else {
      renderCatalogPlaceholder();
    }
  }

  showCandidatePreview(target, anchor = null) {
    const surface = this.els.candidatePreviewSurface;
    if (!target || !surface) return;

    this.closeCandidatePreview();
    this.candidatePreviewTarget = target;
    const state = this.lastNavigationState || {};
    const screenModel = buildRouteGuidanceScreenModel({
      currentDestination: target,
      nextDestination: null,
      startSpace: state.startSpace || "",
    });

    surface.innerHTML = "";
    const card = document.createElement("article");
    card.className = "candidate-preview-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", `変更候補 ${target.space}`);
    card.addEventListener("click", (event) => event.stopPropagation());

    const header = document.createElement("div");
    header.className = "candidate-preview-header";
    const title = document.createElement("strong");
    title.textContent = "変更候補";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "candidate-preview-close";
    closeButton.setAttribute("aria-label", "候補を閉じる");
    closeButton.textContent = "×";
    closeButton.onclick = () =>
      this.closeCandidatePreview({ cancelSelection: true });
    header.append(title, closeButton);
    card.appendChild(header);

    const space = document.createElement("strong");
    space.className = "candidate-preview-space";
    space.textContent = target.space;
    card.appendChild(space);

    const meta = document.createElement("div");
    meta.className = "candidate-preview-meta";
    const distance = document.createElement("span");
    distance.textContent = Number.isFinite(Number(target.gridDistance))
      ? `距離 ${Math.round(Number(target.gridDistance))}`
      : screenModel.distanceLabel;
    const priority = document.createElement("span");
    priority.textContent = screenModel.priorityLabel;
    meta.append(distance, priority);
    card.appendChild(meta);

    if (screenModel.hasCatalogImage) {
      const image = document.createElement("img");
      image.className = "candidate-preview-thumbnail";
      image.alt = `${target.space} お品書き`;
      image.loading = "lazy";
      image.src = screenModel.catalogUrl;
      card.appendChild(image);
    }
    if (screenModel.accountUrl) {
      const account = document.createElement("a");
      account.className = "candidate-preview-account";
      account.href = screenModel.accountUrl;
      account.target = "_blank";
      account.rel = "noopener noreferrer";
      account.textContent = screenModel.accountLabel;
      card.appendChild(account);
    }

    const actions = document.createElement("div");
    actions.className = "candidate-preview-actions";
    const compareButton = document.createElement("button");
    compareButton.type = "button";
    compareButton.className = "btn btn-primary";
    compareButton.textContent = "経路を比較";
    compareButton.onclick = () => {
      const selected = this.candidatePreviewTarget;
      this.closeCandidatePreview();
      if (selected) this.onSelectTarget?.(selected);
    };
    const changeButton = document.createElement("button");
    changeButton.type = "button";
    changeButton.className = "btn btn-secondary";
    changeButton.textContent = "行き先変更";
    changeButton.onclick = () => {
      const selected = this.candidatePreviewTarget;
      this.closeCandidatePreview();
      if (selected) this.onSetNextTarget?.(selected);
    };
    actions.append(compareButton, changeButton);
    card.appendChild(actions);
    surface.appendChild(card);

    const containerRect = this.els.targetSection?.getBoundingClientRect();
    const anchorRect = anchor?.getBoundingClientRect?.();
    if (containerRect && anchorRect) {
      const cardWidth = Math.min(320, Math.max(220, containerRect.width - 24));
      const left = Math.max(
        8,
        Math.min(
          anchorRect.left - containerRect.left,
          containerRect.width - cardWidth - 8,
        ),
      );
      const top = Math.max(8, anchorRect.bottom - containerRect.top + 8);
      surface.style.left = `${left}px`;
      surface.style.top = `${top}px`;
      surface.style.width = `${cardWidth}px`;
    }
    surface.classList.remove("hidden");

    this.candidatePreviewOutsideClick = (event) => {
      if (!surface.contains(event.target)) {
        this.closeCandidatePreview({ cancelSelection: true });
      }
    };
    this.candidatePreviewEscape = (event) => {
      if (event.key === "Escape") {
        this.closeCandidatePreview({ cancelSelection: true });
      }
    };
    document.addEventListener("click", this.candidatePreviewOutsideClick);
    document.addEventListener("keydown", this.candidatePreviewEscape);
  }

  closeCandidatePreview({ cancelSelection = false } = {}) {
    const surface = this.els?.candidatePreviewSurface;
    const selectionState = this.lastNavigationState?.selectionState;
    const shouldCancelSelection =
      cancelSelection &&
      ["loading", "ready", "error", "comparing"].includes(selectionState);
    if (this.candidatePreviewOutsideClick) {
      document.removeEventListener("click", this.candidatePreviewOutsideClick);
      this.candidatePreviewOutsideClick = null;
    }
    if (this.candidatePreviewEscape) {
      document.removeEventListener("keydown", this.candidatePreviewEscape);
      this.candidatePreviewEscape = null;
    }
    this.candidatePreviewTarget = null;
    if (surface) {
      surface.classList.add("hidden");
      surface.innerHTML = "";
    }
    if (shouldCancelSelection) this.onCloseRouteSelection?.();
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

  updateMapVersion(version) {
    if (!this.els.headerMapVersion) return;

    const normalizedVersion = typeof version === "string" ? version.trim() : "";
    this.els.headerMapVersion.textContent = normalizedVersion
      ? `ver ${normalizedVersion}`
      : "";
    this.els.headerMapVersion.title = normalizedVersion;
    this.els.headerMapVersion.classList.toggle("hidden", !normalizedVersion);
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
    this.notificationView.showNotification(msg, type);
  }

  stop() {
    this.notificationView.stop();
  }

  /**
   * 現在地表示を更新
   */
  updateCurrentLocation(space) {
    const [ewsn, label, number] = parseSpace(
      space,
      this.mapAreaCatalog.getAllMapAreas(),
    );
    const area = this.mapAreaCatalog
      .getAllMapAreas()
      .find((candidate) => (candidate.name ?? candidate.displayName) === ewsn);
    this.els.locEwsn.value = area?.areaId ?? ewsn;
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
