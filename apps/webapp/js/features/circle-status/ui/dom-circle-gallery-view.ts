// @ts-nocheck
import { parseSpace } from "../../../shared/domain/space-parser";
import {
  GestureZoomController,
  setupResizableMap,
  setupSwipeAction,
} from "../../../utils/gesture-zoom-controller.js";

/**
 * モーダル管理クラス
 * PDF（画像）モーダルおよびギャラリーモーダルの制御を担当
 */
export class DomCircleGalleryView {
  constructor(mapAreaCatalog) {
    this.els = {
      pdfModal: document.getElementById("pdf-modal"),
      pdfImage: document.getElementById("pdf-modal-image"),
      btnClosePdf: document.getElementById("btn-close-pdf"),
      modalImageContainer: document.getElementById("modal-image-container"),
      btnSetTarget: document.getElementById("btn-set-target"),

      galleryModal: document.getElementById("gallery-modal"),
      galleryGrid: document.getElementById("gallery-grid"),
      btnCloseGallery: document.getElementById("btn-close-gallery"),

      // Sort buttons
      btnSortSpace: document.getElementById("btn-sort-space"),
      btnSortPriority: document.getElementById("btn-sort-priority"),

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

    // Gallery state
    this.currentTargets = [];
    this.activePriorities = null;
    this.sortMode = "priority"; // 'space' | 'priority'
    this.currentGalleryArea = null; // エリア保持用
    this.currentGalleryIsHold = false; // 保留リストかどうか
    this.inFlightPurchases = new Set();
    this.hintKey = "comipath:ui:v1:gallery-swipe-hint-seen";
    this.hintTimer = null;

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

    // ギャラリーフィルターボタン設定
    const filterBtns = document.querySelectorAll(
      "#gallery-filter-controls .filter-btn",
    );
    filterBtns.forEach((btn) => {
      btn.classList.remove("active");
      btn.onclick = () => {
        const p = Number.parseInt(btn.dataset.priority, 10);
        this.togglePriorityFilter(p, btn);
      };
    });

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

    // Sort buttons events
    if (this.els.btnSortSpace) {
      this.els.btnSortSpace.addEventListener("click", () =>
        this.changeSortMode("space"),
      );
    }
    if (this.els.btnSortPriority) {
      this.els.btnSortPriority.addEventListener("click", () =>
        this.changeSortMode("priority"),
      );
    }
  }

  /**
   * ソートモードを変更して再描画
   */
  changeSortMode(mode) {
    if (this.sortMode === mode) return;
    this.sortMode = mode;

    // UI update
    if (mode === "space") {
      if (this.els.btnSortSpace) this.els.btnSortSpace.classList.add("active");
      if (this.els.btnSortPriority)
        this.els.btnSortPriority.classList.remove("active");
    } else {
      if (this.els.btnSortSpace)
        this.els.btnSortSpace.classList.remove("active");
      if (this.els.btnSortPriority)
        this.els.btnSortPriority.classList.add("active");
    }

    this.renderGallery();
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
    } else {
      this.activePriorities.push(priority);
      btnElement.classList.add("active");
    }
    this.renderGallery();
  }

  /**
   * ターゲットリストを現在のモードでソート
   */
  sortTargets(targets) {
    const sorted = [...targets];

    // Helper to get priority value
    const getPriorityVal = (p) => {
      // 数値の場合（10, 9, 8...）
      const num = parseFloat(p);
      if (!Number.isNaN(num)) return num;
      return 0;
    };

    sorted.sort((a, b) => {
      if (this.sortMode === "priority") {
        const pA = getPriorityVal(a.priority);
        const pB = getPriorityVal(b.priority);
        if (pA !== pB) return pB - pA; // Descending
      }

      // Secondary sort (or primary if mode is 'space'): Space order
      const areas = this.mapAreaCatalog?.getAllMapAreas?.() || [];
      const [h1, l1, n1] = parseSpace(a.space, areas);
      const [h2, l2, n2] = parseSpace(b.space, areas);

      if (h1 !== h2) return h1.localeCompare(h2);
      if (l1 !== l2) return l1.localeCompare(l2);
      return n1 - n2;
    });

    return sorted;
  }

  /**
   * PDF(画像)モーダルを表示
   * @param {string|Object} source - 画像URL または サークルデータオブジェクト
   */
  showPdfModal(source) {
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
  }

  /**
   * ギャラリーモーダルを表示
   * @param {string} areaKey - エリアキー (例: "東456")
   * @param {boolean} isHold - 保留リストかどうか
   */
  showGallery(areaKey, isHold = false) {
    if (!this.els.galleryModal || !this.els.galleryGrid || !this.dataManager)
      return;

    this.activePriorities = null;
    document
      .querySelectorAll("#gallery-filter-controls .filter-btn")
      .forEach((btn) => {
        btn.classList.remove("active");
      });
    this.currentGalleryArea = areaKey;
    this.currentGalleryIsHold = isHold;
    const areas = this.mapAreaCatalog?.getAllMapAreas?.() || [];

    // データ取得
    let targets = [];
    if (isHold) {
      targets = this.dataManager.wantToBuy.filter((c) => {
        if (!this.dataManager.holdList.includes(c.space)) return false;
        const [key] = parseSpace(c.space, areas);
        return key === areaKey;
      });
    } else {
      const unvisited = this.dataManager.getUnvisited();
      targets = unvisited.filter((c) => {
        const [key] = parseSpace(c.space, areas);
        return key === areaKey;
      });
    }

    this.currentTargets = targets;

    // 地図表示処理（著作権保護のため無効化）
    if (this.els.galleryMapContainer) {
      this.els.galleryMapContainer.classList.add("hidden");
    }

    this.renderGallery();
    this.els.galleryModal.classList.remove("hidden");
    this.showSwipeHintIfNeeded();
  }

  showSwipeHintIfNeeded() {
    if (!this.els.galleryModal || this.els.galleryModal.querySelector(".gallery-swipe-hint")) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(this.hintKey) === "1";
    } catch {
      return;
    }
    if (seen) return;

    const hint = document.createElement("div");
    hint.className = "gallery-swipe-hint";
    hint.innerHTML =
      '<strong>外側へスワイプして購入済みにできます</strong><span class="gallery-swipe-hint-arrows" aria-hidden="true">←　→</span>';
    hint.onclick = () => hint.remove();
    this.els.galleryModal.appendChild(hint);
    try {
      window.localStorage.setItem(this.hintKey, "1");
    } catch {
      // UI hint is optional when storage is unavailable.
    }
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => hint.remove(), 3500);
  }

  /**
   * ギャラリーの中身を描画
   */
  renderGallery() {
    this.els.galleryGrid.innerHTML = "";

    // フィルタリング適用
    const filteredTargets =
      this.activePriorities === null
        ? this.currentTargets
        : this.currentTargets.filter((c) => {
            const p = Number(c.priority);
            const pVal = Number.isNaN(p) ? 0 : p;
            return this.activePriorities.includes(pVal);
          });

    const targets = this.sortTargets(filteredTargets);

    if (targets.length === 0) {
      const msg = document.createElement("div");
      msg.textContent = "対象サークルはありません";
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
        const priorityVal = Number(c.priority);
        const prioritySpan =
          !Number.isNaN(priorityVal) && priorityVal > 0
            ? `<span class="gallery-priority"><i class="fa-solid fa-star"></i>${priorityVal}</span>`
            : "";
        name.innerHTML = `${c.space}${prioritySpan}`;
        info.appendChild(name);

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
          this.handleGalleryPurchase(c);
        };
        info.appendChild(buyBtn);

        item.appendChild(info);

        // スワイプアクション
        setupSwipeAction(item, () => {
          return this.handleGalleryPurchase(c, item);
        }, {
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
  }

  /**
   * ギャラリーからの購入処理
   */
  async handleGalleryPurchase(circle, item = null) {
    if (!this.dataManager || this.inFlightPurchases.has(circle.space)) return;

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
      return;
    }

    if (this.uiManager) this.uiManager.showToast(`${space} 購入完了`);

    // ギャラリーデータを更新（購入済みを除外）して再描画
    // 現在のリストから削除
    this.currentTargets = this.currentTargets.filter((c) => c.space !== space);
    this.renderGallery();

    // メイン画面のカウントも更新
    if (this.uiManager) this.uiManager.updateCounts(this.dataManager);
    this.inFlightPurchases.delete(space);
  }

  /**
   * ギャラリーモーダルを非表示
   */
  hideGalleryModal() {
    if (!this.els.galleryModal || !this.els.galleryGrid) return;
    this.els.galleryModal.classList.add("hidden");
    this.els.galleryGrid.innerHTML = "";
  }
}
