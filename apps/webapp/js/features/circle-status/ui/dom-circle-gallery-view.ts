// @ts-nocheck
import { parseSpace } from "../../../shared/domain/space-parser";
import {
  collectGalleryPriorities,
  galleryPriority,
  selectGalleryCircles,
  sortGalleryCirclesByMapPosition,
} from "./gallery-view-model";
import {
  GestureZoomController,
  setupResizableMap,
  setupSwipeAction,
} from "../../../utils/gesture-zoom-controller.js";
import { DialogFocusController } from "../../../ui/dialog-focus";

/**
 * モーダル管理クラス
 * PDF（画像）モーダルおよびギャラリーモーダルの制御を担当
 */
export class DomCircleGalleryView {
  constructor(mapAreaCatalog, loadGalleryPoints = null) {
    this.els = {
      pdfModal: document.getElementById("pdf-modal"),
      pdfImage: document.getElementById("pdf-modal-image"),
      btnClosePdf: document.getElementById("btn-close-pdf"),
      modalImageContainer: document.getElementById("modal-image-container"),
      btnSetTarget: document.getElementById("btn-set-target"),

      galleryModal: document.getElementById("gallery-modal"),
      galleryGrid: document.getElementById("gallery-grid"),
      btnCloseGallery: document.getElementById("btn-close-gallery"),
      btnGalleryHelp: document.getElementById("btn-gallery-help"),

      // Gallery Map
      galleryMapContainer: document.getElementById("gallery-map-container"),
      galleryMapHeader: document.getElementById("gallery-map-header"),
      galleryMapImage: document.getElementById("gallery-map-image"),
      galleryMapScroll: document.getElementById("gallery-map-scroll"),
    };

    this.onSetNextTarget = null;
    this.currentCircle = null;
    this.uiManager = null;
    this.dataManager = null;
    this.mapAreaCatalog = mapAreaCatalog;
    this.loadGalleryPoints = loadGalleryPoints;
    this.pdfFocusController = this.els.pdfModal
      ? new DialogFocusController(this.els.pdfModal, {
          onEscape: () => this.hidePdfModal(),
        })
      : null;
    this.els.pdfModal?.setAttribute("role", "dialog");
    this.els.pdfModal?.setAttribute("aria-modal", "true");

    // Gallery state
    this.currentTargets = [];
    this.activePriorities = null;
    this.galleryPointsByAreaId = new Map();
    this.galleryRenderGeneration = 0;
    this.saleMentionSpaces = new Set();
    this.currentGalleryScope = { kind: "all-unvisited" };
    this.inFlightPurchases = new Set();
    this.hintKey = "comipath:ui:v2:gallery-swipe-hint-seen";
    this.hintTimer = null;
    this.undoSnackbar = null;
    this.undoTimer = null;

    // フィルタボタンへの参照は init で取得
  }

  /**
   * 目的地設定コールバックを登録
   */
  setOnSetNextTargetCallback(callback) {
    this.onSetNextTarget = callback;
  }

  /**
   * 初期化: イベントリスナーとズーム機能の設定
   */
  init(uiManager, dataManager) {
    this.uiManager = uiManager;
    this.dataManager = dataManager;

    if (this.els.btnClosePdf) {
      this.els.btnClosePdf.addEventListener("click", () => this.hidePdfModal());
    }
    if (this.els.btnCloseGallery) {
      this.els.btnCloseGallery.addEventListener("click", () =>
        this.hideGalleryModal(),
      );
    }

    if (this.els.btnSetTarget) {
      this.els.btnSetTarget.addEventListener("click", () => {
        if (this.onSetNextTarget && this.currentCircle) {
          this.onSetNextTarget(this.currentCircle);
          this.hidePdfModal();
          this.hideGalleryModal(); // ギャラリーも閉じる
        }
      });
    }

    if (this.els.btnGalleryHelp) {
      this.els.btnGalleryHelp.addEventListener("click", () =>
        this.showSwipeHint({ force: true }),
      );
    }

    if (this.els.modalImageContainer && this.els.pdfImage) {
      new GestureZoomController(
        this.els.modalImageContainer,
        this.els.pdfImage,
      );
    }

    // ギャラリーマップのズーム
    if (this.els.galleryMapScroll && this.els.galleryMapImage) {
      new GestureZoomController(
        this.els.galleryMapScroll,
        this.els.galleryMapImage,
      );
    }

    // ギャラリーマップのリサイズ
    if (this.els.galleryMapContainer && this.els.galleryMapHeader) {
      setupResizableMap(
        this.els.galleryMapContainer,
        this.els.galleryMapHeader,
      );
    }

  }

  /** Updates gallery warning badges without reordering or rerendering cards. */
  setSaleMentionSpaces(spaces) {
    this.saleMentionSpaces = new Set(spaces);
    this.applySaleMentionBadges();
  }

  /** Invalidates pending point loads and closes the modal during app shutdown. */
  dispose() {
    this.galleryRenderGeneration += 1;
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = null;
    this.hidePdfModal();
    this.hideGalleryModal();
  }

  /**
   * 優先度フィルターの切り替え
   */
  togglePriorityFilter(priority, btnElement) {
    if (this.activePriorities === null) {
      this.activePriorities = [priority];
      document
        .querySelectorAll("#gallery-filter-controls .filter-btn")
        .forEach((btn) => {
          btn.classList.toggle("active", btn === btnElement);
        });
    } else if (this.activePriorities.includes(priority)) {
      this.activePriorities = this.activePriorities.filter(
        (p) => p !== priority,
      );
      btnElement.classList.remove("active");
      if (this.activePriorities.length === 0) this.activePriorities = null;
    } else {
      this.activePriorities.push(priority);
      btnElement.classList.add("active");
    }
    this.renderGallery();
  }

  sortTargets(targets) {
    const areas = this.mapAreaCatalog?.getAllMapAreas?.() || [];
    return sortGalleryCirclesByMapPosition(targets, {
      areas,
      pointsByAreaId: this.galleryPointsByAreaId,
      resolveAreaId: (space) => {
        const [areaName] = parseSpace(space, areas);
        return areas.find((area) => area.name === areaName)?.id ?? null;
      },
    });
  }

  /**
   * PDF(画像)モーダルを表示
   * @param {string|Object} source - 画像URL または サークルデータオブジェクト
   */
  showPdfModal(source, options = {}) {
    if (!this.els.pdfModal || !this.els.pdfImage) return;

    let url = "";
    this.currentCircle = null;

    if (typeof source === "string") {
      // URL文字列の場合 (地図など)
      url = source;
      this.els.btnSetTarget.style.display = "none";
    } else if (source && typeof source === "object") {
      // サークルデータの場合
      url = source.tweet;
      this.currentCircle = source;
      this.els.btnSetTarget.style.display = "block";
    }

    this.els.pdfModal.classList.remove("hidden");
    this.pdfFocusController?.activate(options.returnFocus ?? null);
    this.els.pdfImage.src = url;
    if (this.els.pdfImage.resetZoom) {
      this.els.pdfImage.resetZoom();
    }
  }

  /**
   * PDFモーダルを非表示
   */
  hidePdfModal() {
    if (!this.els.pdfModal || !this.els.pdfImage) return;
    this.els.pdfModal.classList.add("hidden");
    this.els.pdfImage.src = "";
    this.currentCircle = null;
    this.pdfFocusController?.deactivate();
  }

  /** ギャラリーモーダルを指定スコープで表示 */
  showGallery(scope) {
    if (!this.els.galleryModal || !this.els.galleryGrid || !this.dataManager)
      return;

    this.activePriorities = null;
    this.currentGalleryScope = scope;
    const areas = this.mapAreaCatalog?.getAllMapAreas?.() || [];
    const resolveAreaId = (space) => {
      const [areaName] = parseSpace(space, areas);
      return areas.find((area) => area.name === areaName)?.id ?? null;
    };
    this.currentTargets = selectGalleryCircles({
      scope,
      unvisited: this.dataManager.getUnvisited(),
      wantToBuy: this.dataManager.wantToBuy,
      holdSpaces: new Set(this.dataManager.holdList),
      resolveAreaId,
    });
    const generation = ++this.galleryRenderGeneration;

    // 地図表示処理（著作権保護のため無効化）
    if (this.els.galleryMapContainer) {
      this.els.galleryMapContainer.classList.add("hidden");
    }

    this.renderGallery();
    this.els.galleryModal.classList.remove("hidden");
    this.showSwipeHint();
    void this.loadPointsForGallery(generation, areas);
  }

  async loadPointsForGallery(generation, areas) {
    if (!this.loadGalleryPoints) return;
    const areaIds = [...new Set(this.currentTargets.map((circle) => {
      const [areaName] = parseSpace(circle.space, areas);
      return areas.find((area) => area.name === areaName)?.id ?? null;
    }).filter(Boolean))];
    await Promise.all(areaIds.map(async (areaId) => {
      if (this.galleryPointsByAreaId.has(areaId)) return;
      const area = areas.find((candidate) => candidate.id === areaId);
      if (!area) return;
      try {
        const payload = await this.loadGalleryPoints(area);
        this.galleryPointsByAreaId.set(
          areaId,
          Array.isArray(payload) ? payload : payload?.points ?? [],
        );
      } catch (error) {
        console.warn("Gallery map points could not be loaded.", error);
      }
    }));
    if (generation !== this.galleryRenderGeneration || this.els.galleryModal.classList.contains("hidden")) return;
    this.renderGallery();
  }

  showSwipeHint({ force = false } = {}) {
    if (!this.els.galleryModal || this.els.galleryModal.querySelector(".gallery-swipe-hint")) return;
    if (!force) {
      try {
        if (window.localStorage.getItem(this.hintKey) === "1") return;
      } catch {
        return;
      }
    }

    const hint = document.createElement("div");
    hint.className = "gallery-swipe-hint";
    hint.innerHTML =
      '<strong>外側へスワイプして購入済みにできます</strong><span class="gallery-swipe-hint-demo" aria-hidden="true"><span class="gallery-swipe-hint-demo-card">←　→</span></span>';
    hint.onclick = () => {
      hint.remove();
      if (this.hintTimer) clearTimeout(this.hintTimer);
      this.hintTimer = null;
    };
    this.els.galleryModal.appendChild(hint);
    try {
      window.localStorage.setItem(this.hintKey, "1");
    } catch {
      // UI hint is optional when storage is unavailable.
    }
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      hint.remove();
      this.hintTimer = null;
    }, 3500);
  }

  renderPriorityFilters() {
    const controls = document.getElementById("gallery-filter-controls");
    if (!controls) return;
    controls.querySelectorAll(".filter-btn").forEach((btn) => btn.remove());
    collectGalleryPriorities(this.currentTargets).forEach((priority) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter-btn";
      button.dataset.priority = String(priority);
      button.textContent = String(priority);
      button.classList.toggle(
        "active",
        this.activePriorities?.includes(priority) ?? false,
      );
      button.onclick = () => this.togglePriorityFilter(priority, button);
      controls.appendChild(button);
    });
  }

  getGalleryEmptyMessage() {
    if (this.activePriorities !== null) {
      return "この条件に一致するサークルはありません";
    }
    if (this.currentGalleryScope.kind === "all-unvisited") {
      return "未訪問サークルはありません";
    }
    if (this.currentGalleryScope.kind === "area") {
      return "このエリアに未訪問サークルはありません";
    }
    return "保留サークルはありません";
  }

  /**
   * ギャラリーの中身を描画
   */
  renderGallery() {
    this.els.galleryGrid.innerHTML = "";
    this.renderPriorityFilters();

    // フィルタリング適用
    const filteredTargets =
      this.activePriorities === null
        ? this.currentTargets
        : this.currentTargets.filter((c) => {
            const priority = galleryPriority(c.priority);
            return priority !== null && this.activePriorities.includes(priority);
          });

    const targets = this.sortTargets(filteredTargets);

    if (targets.length === 0) {
      const msg = document.createElement("div");
      msg.textContent = this.getGalleryEmptyMessage();
      msg.style.color = "white";
      msg.style.padding = "1rem";
      msg.style.gridColumn = "1 / -1";
      this.els.galleryGrid.appendChild(msg);
    } else {
      targets.forEach((c) => {
        const item = document.createElement("div");
        item.className = "gallery-item";
        item.dataset.space = c.space;

        const renderPlaceholder = () => {
          item.querySelector("img")?.remove();
          if (!item.querySelector(".no-image-placeholder")) {
            const placeholder = document.createElement("div");
            placeholder.className = "no-image-placeholder";
            placeholder.innerHTML =
              '<i class="fa-regular fa-image"></i><span>No Image</span>';
            item.prepend(placeholder);
          }
        };

        item.onclick = () => {
          this.showPdfModal(c);
        };
        if (c.tweet) {
          const img = document.createElement("img");
          img.loading = "lazy";
          img.onload = function () {
            if (this.naturalWidth > this.naturalHeight) {
              item.classList.add("wide");
            }
          };
          img.onerror = renderPlaceholder;
          img.src = c.tweet;
          item.appendChild(img);
        } else {
          renderPlaceholder();
        }

        // サークル情報
        const info = document.createElement("div");
        info.className = "circle-info";

        const name = document.createElement("div");
        name.className = "circle-name";
        // 優先度を表示
        const priorityVal = galleryPriority(c.priority);
        const prioritySpan =
          priorityVal !== null
            ? `<span class="gallery-priority"><i class="fa-solid fa-star"></i>${priorityVal}</span>`
            : "";
        name.innerHTML = `${c.space}${prioritySpan}`;
        info.appendChild(name);

        if (this.saleMentionSpaces.has(c.space)) {
          const badge = document.createElement("span");
          badge.className = "gallery-sale-mention";
          badge.setAttribute("aria-label", "完売・売り切れ関連投稿あり");
          badge.textContent = "完売関連";
          info.appendChild(badge);
        }

        // Twitter Link
        if (c.account) {
          const twLink = document.createElement("a");
          twLink.href = c.account;
          twLink.target = "_blank";
          twLink.className = "gallery-twitter-link";
          twLink.innerHTML = '<i class="fa-brands fa-twitter"></i>';
          twLink.onclick = (e) => e.stopPropagation();
          info.appendChild(twLink);
        }

        // 購入ボタン
        const buyBtn = document.createElement("button");
        buyBtn.className = "gallery-btn-buy";
        buyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        buyBtn.onclick = (e) => {
          e.stopPropagation();
          this.handleGalleryPurchase(c, item);
        };
        info.appendChild(buyBtn);

        item.appendChild(info);

        // スワイプアクション
        setupSwipeAction(item, () => {
          return this.handleGalleryPurchase(c, item);
        }, {
          resetOnSuccess: false,
          getAllowedDirection: () => {
            if (item.classList.contains("wide")) return "both";
            const gridRect = this.els.galleryGrid.getBoundingClientRect();
            const itemRect = item.getBoundingClientRect();
            return itemRect.left + itemRect.width / 2 < gridRect.left + gridRect.width / 2
              ? "left"
              : "right";
          },
        });

        this.els.galleryGrid.appendChild(item);
      });
    }
    this.applySaleMentionBadges();
  }

  applySaleMentionBadges() {
    this.els.galleryGrid?.querySelectorAll(".gallery-item[data-space]").forEach((item) => {
      const info = item.querySelector(".circle-info");
      if (!info) return;
      const existing = info.querySelector(".gallery-sale-mention");
      const mentioned = this.saleMentionSpaces.has(item.dataset.space || "");
      if (mentioned && !existing) {
        const badge = document.createElement("span");
        badge.className = "gallery-sale-mention";
        badge.setAttribute("aria-label", "完売・売り切れ関連投稿あり");
        badge.textContent = "完売関連";
        info.appendChild(badge);
      } else if (!mentioned) {
        existing?.remove();
      }
    });
  }

  /**
   * ギャラリーからの購入処理
   */
  async handleGalleryPurchase(circle, item = null) {
    if (!this.dataManager || this.inFlightPurchases.has(circle.space)) return false;

    const space = circle.space;
    this.inFlightPurchases.add(space);
    if (item) {
      item.classList.add("is-purchasing");
      item.querySelector(".gallery-btn-buy")?.setAttribute("disabled", "");
    }
    try {
      await this.dataManager.addPurchased(space);
    } catch (error) {
      item?.classList.remove("is-purchasing");
      item?.querySelector(".gallery-btn-buy")?.removeAttribute("disabled");
      this.uiManager?.showToast(
        "端末への保存に失敗しました。操作は反映されていません。",
        "error",
      );
      this.inFlightPurchases.delete(space);
      return false;
    }

    if (this.uiManager) this.uiManager.showToast(`${space} 購入完了`);

    // ギャラリーデータを更新（購入済みを除外）して再描画
    // 現在のリストから削除
    this.currentTargets = this.currentTargets.filter((c) => c.space !== space);
    const leavingItem = item || [...this.els.galleryGrid.querySelectorAll("[data-space]")]
      .find((candidate) => candidate.dataset.space === space);
    if (leavingItem) this.startGalleryItemExit(leavingItem);
    this.showUndoSnackbar(space);

    // メイン画面のカウントも更新
    if (this.uiManager) this.uiManager.updateCounts(this.dataManager);
    this.inFlightPurchases.delete(space);
    return true;
  }

  startGalleryItemExit(item) {
    item.style.removeProperty("transform");
    item.style.removeProperty("opacity");
    item.style.removeProperty("transition");
    item.classList.remove("is-purchasing");
    item.classList.add("is-purchased-leaving");
    const remove = () => {
      if (item.parentNode) item.remove();
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      remove();
      return;
    }
    let timer = setTimeout(remove, 260);
    item.addEventListener("transitionend", () => {
      clearTimeout(timer);
      remove();
    }, { once: true });
  }

  showUndoSnackbar(space) {
    this.undoSnackbar?.remove();
    if (this.undoTimer) clearTimeout(this.undoTimer);
    const snackbar = document.createElement("div");
    snackbar.className = "gallery-undo-snackbar";
    snackbar.setAttribute("role", "status");
    const message = document.createElement("span");
    message.textContent = `${space}を購入済みにしました`;
    snackbar.appendChild(message);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "元に戻す";
    button.onclick = async () => {
      button.disabled = true;
      const restored = await this.dataManager?.undoLastPurchase?.();
      if (restored) {
        this.refreshGalleryTargets();
        snackbar.remove();
      } else {
        button.disabled = false;
        this.uiManager?.showToast("購入を元に戻せませんでした", "error");
      }
    };
    snackbar.appendChild(button);
    const container = this.els.galleryModal && !this.els.galleryModal.classList.contains("hidden")
      ? this.els.galleryModal
      : document.body;
    container.appendChild(snackbar);
    this.undoSnackbar = snackbar;
    this.undoTimer = setTimeout(() => {
      snackbar.remove();
      this.undoSnackbar = null;
    }, 5000);
  }

  refreshGalleryTargets() {
    const areas = this.mapAreaCatalog?.getAllMapAreas?.() || [];
    const resolveAreaId = (space) => {
      const [areaName] = parseSpace(space, areas);
      return areas.find((area) => area.name === areaName)?.id ?? null;
    };
    this.currentTargets = selectGalleryCircles({
      scope: this.currentGalleryScope,
      unvisited: this.dataManager.getUnvisited(),
      wantToBuy: this.dataManager.wantToBuy,
      holdSpaces: new Set(this.dataManager.holdList),
      resolveAreaId,
    });
    this.renderGallery();
  }

  /**
   * ギャラリーモーダルを非表示
   */
  hideGalleryModal() {
    if (!this.els.galleryModal || !this.els.galleryGrid) return;
    this.galleryRenderGeneration += 1;
    this.els.galleryModal.classList.add("hidden");
    this.els.galleryGrid.innerHTML = "";
    this.undoSnackbar?.remove();
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoSnackbar = null;
    this.els.galleryModal.querySelector(".gallery-swipe-hint")?.remove();
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = null;
  }
}
