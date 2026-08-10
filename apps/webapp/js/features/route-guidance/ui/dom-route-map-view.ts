// @ts-nocheck

import { GestureZoomController } from "../../../utils/gesture-zoom-controller.js";
import {
  buildMapPins,
  buildMapPointIndex,
  calculateContainedImageBox,
  calculateFitTransform,
  calculateMapPinSize,
  calculateNativeImageScale,
} from "./route-map-pin-model";
import { buildRouteOverlaySvg } from "./route-overlay-svg";

function findAreaForSpace(space, mapAreaCatalog) {
  if (!space || typeof space !== "string") return null;

  const cleanedSpace = space.trim();
  if (cleanedSpace.length < 2) return null;

  const prefixChar = cleanedSpace[0];
  const labelChar = cleanedSpace[1];

  return (
    mapAreaCatalog.getAllMapAreas().find((area) => {
      const prefixMatch = area.prefixes.includes(prefixChar);
      return prefixMatch && area.labels.includes(labelChar);
    }) || null
  );
}

function areSpacesInSameArea(spaceA, spaceB, mapAreaCatalog) {
  const areaA = findAreaForSpace(spaceA, mapAreaCatalog);
  const areaB = findAreaForSpace(spaceB, mapAreaCatalog);
  return Boolean(areaA && areaB && areaA.id === areaB.id);
}

export function getRouteStartSpaceForMap(startSpace, targetSpace, mapAreaCatalog) {
  if (!startSpace || !targetSpace) return "";
  return areSpacesInSameArea(startSpace, targetSpace, mapAreaCatalog) ? startSpace : "";
}

function readPixelBox(element) {
  if (!element) return null;

  const left = Number.parseFloat(element.style.left) || element.offsetLeft || 0;
  const top = Number.parseFloat(element.style.top) || element.offsetTop || 0;
  const width =
    element.clientWidth || Number.parseFloat(element.style.width) || 0;
  const height =
    element.clientHeight || Number.parseFloat(element.style.height) || 0;

  if (!width || !height) return null;

  return { left, top, width, height };
}

export function getPinSourceSize(state) {
  if (state === "next") return 12;
  if (state === "start") return 10;
  return 8;
}

/**
 * 地図描画クラス
 * メイン画面の地図表示、更新、リンク生成を担当
 */
export class DomRouteMapView {
  constructor(uiManager, mapAreaCatalog) {
    this.uiManager = uiManager;
    this.mapAreaCatalog = mapAreaCatalog;
    this.els = {
      mapContainer: document.getElementById("target-map-container"),
      navigationMap: document.getElementById("navigation-map"),
      navigationMapLayer: document.getElementById("navigation-map-layer"),
      navigationMapImage: document.getElementById("navigation-map-image"),
      pinLayer: document.getElementById("navigation-pin-layer"),
      mapLinksContainer: document.getElementById("map-links-container"),
    };

    this.zoomHelper = null;
    this.pointIndexCache = new Map();
    this.renderToken = 0;
    this.lastNavigationTarget = null;
    this.lastNavigationContext = null;
    this.navigationMapImageLoadListenerAttached = false;

    this.init();
  }

  /**
   * 初期化
   */
  init() {
    if (this.els.mapLinksContainer) {
      this.els.mapLinksContainer.innerHTML = "";
      this.els.mapLinksContainer.classList.add("hidden");
    }
    if (this.els.mapContainer) {
      this.els.mapContainer.classList.add("hidden");
    }

    if (
      this.els.navigationMap &&
      this.els.navigationMapLayer &&
      !this.zoomHelper
    ) {
      this.zoomHelper = new GestureZoomController(
        this.els.navigationMap,
        this.els.navigationMapLayer,
      );
    }

    if (
      this.els.navigationMapImage &&
      !this.navigationMapImageLoadListenerAttached
    ) {
      this.els.navigationMapImage.addEventListener("load", () => {
        if (this.lastNavigationContext) {
          this.renderNavigation(this.lastNavigationContext);
        }
      });
      this.navigationMapImageLoadListenerAttached = true;
    }
  }

  /**
   * 地図リンクボタンの生成 (無効化)
   */
  renderMapLinks() {
    if (this.els.mapLinksContainer) {
      this.els.mapLinksContainer.innerHTML = "";
      this.els.mapLinksContainer.classList.add("hidden");
    }
  }

  /**
   * ターゲットに応じた地図表示の更新 (常に非表示)
   * @param {string} space - サークルスペース文字列
   */
  updateMap(space) {
    const area = findAreaForSpace(space, this.mapAreaCatalog);
    if (!area) {
      if (this.els.navigationMap)
        this.els.navigationMap.classList.add("hidden");
      if (this.els.navigationMapImage)
        this.els.navigationMapImage.removeAttribute("src");
      this.resetPinLayerBox();
      return null;
    }

    if (
      this.els.navigationMapImage &&
      this.els.navigationMapImage.getAttribute("src") !== area.mapFile
    ) {
      this.els.navigationMapImage.src = area.mapFile;
      this.els.navigationMapImage.alt = `${area.name} 配置図`;
      this.resetPinLayerBox();
    }
    if (this.els.navigationMap)
      this.els.navigationMap.classList.remove("hidden");
    return area;
  }

  resetPinLayerBox() {
    if (!this.els.pinLayer) return;

    this.els.pinLayer.style.left = "";
    this.els.pinLayer.style.top = "";
    this.els.pinLayer.style.right = "";
    this.els.pinLayer.style.bottom = "";
    this.els.pinLayer.style.width = "";
    this.els.pinLayer.style.height = "";
  }

  updatePinLayerBox() {
    const layer = this.els.navigationMapLayer;
    const image = this.els.navigationMapImage;
    const pinLayer = this.els.pinLayer;
    if (!layer || !image || !pinLayer) return;

    const containerWidth = layer.clientWidth;
    const containerHeight = layer.clientHeight;
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;

    if (!containerWidth || !containerHeight || !imageWidth || !imageHeight) {
      this.resetPinLayerBox();
      return;
    }

    const box = calculateContainedImageBox({
      containerWidth,
      containerHeight,
      imageWidth,
      imageHeight,
    });

    pinLayer.style.left = `${box.left}px`;
    pinLayer.style.top = `${box.top}px`;
    pinLayer.style.right = "auto";
    pinLayer.style.bottom = "auto";
    pinLayer.style.width = `${box.width}px`;
    pinLayer.style.height = `${box.height}px`;

    this.zoomHelper?.setMaxScale(
      calculateNativeImageScale({
        imageWidth,
        renderedWidth: box.width,
      }),
    );
  }

  async loadPointIndex(area) {
    if (!area?.pointsFile) return null;

    const cached = this.pointIndexCache.get(area.id);
    if (cached !== undefined) return cached;

    const loadPromise = fetch(area.pointsFile)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load ${area.pointsFile}: ${response.status}`,
          );
        }
        return response.json();
      })
      .then((payload) => buildMapPointIndex(payload))
      .catch((error) => {
        console.warn("Map point index could not be loaded.", error);
        return null;
      });

    this.pointIndexCache.set(area.id, loadPromise);
    const pointIndex = await loadPromise;
    this.pointIndexCache.set(area.id, pointIndex);
    return pointIndex;
  }

  renderRouteOverlay(route, kind = "current") {
    if (!this.els.pinLayer || !route) return;

    const overlay = buildRouteOverlaySvg(route, document, kind);
    if (overlay) this.els.pinLayer.appendChild(overlay);
  }

  maybeFitRoutes({ currentRoute, selectedRoute, fitMode }) {
    if (!currentRoute || fitMode === "preserve" || !this.zoomHelper) return;

    const contentBox = readPixelBox(this.els.pinLayer);
    const containerWidth = this.els.navigationMap?.clientWidth || 0;
    const containerHeight = this.els.navigationMap?.clientHeight || 0;

    if (!contentBox || !containerWidth || !containerHeight) {
      return;
    }

    const points = [currentRoute.startPosition, currentRoute.targetPosition];
    if (fitMode === "comparison" && selectedRoute?.targetPosition) {
      points.push(selectedRoute.targetPosition);
    }

    const transform = calculateFitTransform({
      containerWidth,
      containerHeight,
      contentBox,
      points,
      padding: 48,
      minScale: this.zoomHelper.MIN_SCALE,
      maxScale: this.zoomHelper.MAX_SCALE,
    });

    this.zoomHelper.setTransform(transform);
  }

  applyPinSize(button, state) {
    if (!button) return;

    const pinSize = calculateMapPinSize({
      imageWidth: this.els.navigationMapImage?.naturalWidth,
      renderedWidth: this.els.pinLayer?.clientWidth,
      sourceSize: getPinSourceSize(state),
    });
    button.style.width = `${pinSize}px`;
    button.style.height = `${pinSize}px`;
  }

  /** Render active and candidate routes supplied by the application controller. */
  renderNavigation(context) {
    if (!this.els.pinLayer || !this.uiManager?.dataManager) return;
    const {
      currentTarget,
      currentRoute = null,
      selectedTarget = currentTarget,
      selectedRoute = null,
      startSpace = "",
      selectionState = "idle",
      itineraryEntries = [],
      fitMode = "current",
    } = context;
    this.lastNavigationTarget = currentTarget;
    this.lastNavigationContext = context;
    const area = this.updateMap(currentTarget?.space || "");
    this.updatePinLayerBox();
    const renderToken = ++this.renderToken;

    const dm = this.uiManager.dataManager;
    const circles = [
      currentTarget,
      selectedTarget,
      ...dm.getUnvisited(),
      ...dm.wantToBuy.filter((circle) => dm.holdList.includes(circle.space)),
    ].filter(Boolean);
    const cachedPointIndex = area ? this.pointIndexCache.get(area.id) : null;
    const pointIndex =
      cachedPointIndex instanceof Map ? cachedPointIndex : null;
    const startSpaceForMap = getRouteStartSpaceForMap(
      startSpace,
      currentTarget?.space || "",
      this.mapAreaCatalog,
    );
    const positionOverrides = new Map();
    if (currentRoute?.startPosition) {
      positionOverrides.set(startSpaceForMap, currentRoute.startPosition);
    }
    if (currentRoute?.targetPosition && currentTarget?.space) {
      positionOverrides.set(currentTarget.space, currentRoute.targetPosition);
    }
    if (selectedRoute?.targetPosition && selectedTarget?.space) {
      positionOverrides.set(selectedTarget.space, selectedRoute.targetPosition);
    }

    const pins = buildMapPins(circles, {
      currentTargetSpace: currentTarget?.space,
      selectedSpace: selectedTarget?.space,
      startSpace: startSpaceForMap,
      purchasedList: dm.purchasedList,
      holdList: dm.holdList,
      pointIndex,
      positionOverrides,
      requireIndexedPositions: Boolean(area?.pointsFile),
    });

    this.els.pinLayer.innerHTML = "";
    this.renderRouteOverlay(currentRoute, "current");
    if (selectionState === "comparing") {
      this.renderRouteOverlay(selectedRoute, "candidate");
    }

    pins.forEach((pin) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `map-pin ${pin.state}`;
      button.dataset.space = pin.space;
      button.dataset.state = pin.baseState;
      const itineraryEntry = itineraryEntries.find(
        (entry) =>
          entry.space === pin.space &&
          findAreaForSpace(entry.space, this.mapAreaCatalog)?.id === area?.id,
      );
      if (itineraryEntry) {
        button.classList.add("itinerary-pin");
        button.dataset.itineraryIndex = String(itineraryEntry.index);
        button.textContent = String(itineraryEntry.index);
        button.setAttribute(
          "aria-label",
          `${itineraryEntry.index}番 ${pin.space}${
            itineraryEntry.isCurrent ? "、現在の目的地" : ""
          }`,
        );
      }
      button.style.left = `${pin.x}%`;
      button.style.top = `${pin.y}%`;
      this.applyPinSize(button, pin.state);
      const normalPinLabel =
        pin.state === "start"
          ? `出発地点 ${pin.space}`
          : pin.state === "next"
            ? `現在の目的地 ${pin.space}`
            : pin.state === "selected"
              ? `候補選択中 ${pin.space}`
              : pin.state === "done"
                ? `購入済み ${pin.space}`
                : pin.state === "hold"
                  ? `保留中 ${pin.space}`
                  : `候補として選択可能 ${pin.space}`;
      button.setAttribute(
        "aria-label",
        itineraryEntry
          ? `${itineraryEntry.index}番、${normalPinLabel}`
          : normalPinLabel,
      );
      if (pin.circle && selectionState !== "comparing") {
        button.onclick = (event) => {
          event.stopPropagation();
          this.uiManager.previewTarget(pin.circle);
        };
      }
      if (selectionState === "comparing" && pin.circle) button.disabled = true;
      this.els.pinLayer.appendChild(button);
    });

    this.maybeFitRoutes({
      currentRoute,
      selectedRoute,
      fitMode,
    });

    if (
      area &&
      !(cachedPointIndex instanceof Map) &&
      cachedPointIndex !== null
    ) {
      this.loadPointIndex(area).then((loadedPointIndex) => {
        if (
          loadedPointIndex !== undefined &&
          this.renderToken === renderToken
        ) {
          this.renderNavigation(context);
        }
      });
    }
  }
}
