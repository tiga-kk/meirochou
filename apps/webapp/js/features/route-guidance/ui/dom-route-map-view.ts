// @ts-nocheck

import { GestureZoomController } from "../../../utils/gesture-zoom-controller.js";
import {
  buildMapPins,
  buildMapPointIndex,
  buildMapViewportPoints,
  calculateFitTransform,
  calculateMapPinSize,
  calculateNativeImageScale,
  findNearestMapViewportPoint,
  resolveNearestMapPin,
} from "./route-map-pin-model";
import { calculateMapStageLayout } from "./map-stage-layout";
import { buildRouteOverlaySvg } from "./route-overlay-svg";
import {
  normalizeRouteMotionPreference,
  resolveRouteMotionEnabled,
} from "./route-motion-preference";
import {
  createRouteMotionController,
  sampleRouteGeometry,
} from "./route-motion-controller";
import { buildOptimizationPreviewPoints } from "./optimization-preview-model";
import { parseSpace } from "../../../shared/domain/space-parser";

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

export function getRouteStartSpaceForMap(
  startSpace,
  targetSpace,
  mapAreaCatalog,
) {
  if (!startSpace || !targetSpace) return "";
  return areSpacesInSameArea(startSpace, targetSpace, mapAreaCatalog)
    ? startSpace
    : "";
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

export function calculateRouteOverlayStrokeWidth(scale) {
  const safeScale =
    Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.max(4, 12 / Math.sqrt(safeScale));
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
      viewportCenter: document.getElementById("navigation-map-center"),
      mapLinksContainer: document.getElementById("map-links-container"),
    };

    this.zoomHelper = null;
    this.pointIndexCache = new Map();
    this.viewportPointCache = new Map();
    this.renderToken = 0;
    this.lastNavigationTarget = null;
    this.lastNavigationContext = null;
    this.navigationMapImageLoadListenerAttached = false;
    this.navigationMapResizeObserver = null;
    this.currentRouteMotionContext = null;
    this.routeMotionController = null;
    this.routeMotionPreference = "system";
    this.routeMotionMediaQueryList = null;
    this.routeMotionMediaQueryListenerAttached = false;
    this.routeMotionVisibilityListenerAttached = false;
    this.routeMotionRenderedWidth = 0;
    this.viewportCenterTimer = null;
    this.latestOptimizationPreview = null;
    this.optimizationPreviewPointIndex = new Map();
    this.optimizationPreviewGestureActive = false;
    this.optimizationPreviewUpdateCount = 0;
    this.optimizationPreviewJobId = null;

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
        {
          overscrollLimit: 18,
          onTransformChange: ({ scale }) => {
            this.applyRouteOverlayStrokeWidth(scale);
            this.applyRouteMotionSpeed(scale);
            this.scheduleViewportCenterUpdate();
          },
          onGestureActivityChange: (active) => {
            this.routeMotionController?.setGestureActive(active);
            this.setOptimizationPreviewGestureActive(active);
          },
        },
      );
      if (typeof ResizeObserver === "function") {
        this.navigationMapResizeObserver = new ResizeObserver(() => {
          this.applyViewportLayout();
        });
        this.navigationMapResizeObserver.observe(this.els.navigationMap);
      }
    }

    if (
      !this.routeMotionMediaQueryListenerAttached &&
      typeof globalThis.matchMedia === "function"
    ) {
      this.routeMotionMediaQueryList = globalThis.matchMedia(
        "(prefers-reduced-motion: reduce)",
      );
      this.routeMotionMediaQueryList.addEventListener?.("change", () => {
        if (this.routeMotionPreference === "system") {
          this.applyRouteMotionPreference();
        }
      });
      this.routeMotionMediaQueryListenerAttached = true;
    }

    if (!this.routeMotionVisibilityListenerAttached) {
      document.addEventListener("visibilitychange", () => {
        this.applyRouteMotionPreference();
      });
      this.routeMotionVisibilityListenerAttached = true;
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
      this.zoomHelper?.reset();
    }
    if (this.els.navigationMap)
      this.els.navigationMap.classList.remove("hidden");
    return area;
  }

  resetPinLayerBox() {
    this.routeMotionRenderedWidth = 0;
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

    const imageWidth = image.naturalWidth;

    if (!imageWidth || !image.naturalHeight) {
      this.resetPinLayerBox();
      return;
    }

    this.zoomHelper?.setMaxScale(
      calculateNativeImageScale({
        imageWidth,
        renderedWidth: layer.clientWidth,
      }),
    );
    this.routeMotionRenderedWidth = layer.clientWidth;
    this.applyRouteOverlayStrokeWidth(this.zoomHelper?.state.scale ?? 1);
  }

  applyRouteOverlayStrokeWidth(scale) {
    const baseWidth = calculateRouteOverlayStrokeWidth(scale);
    this.els.pinLayer?.style.setProperty(
      "--route-overlay-stroke-width",
      `${baseWidth}px`,
    );
  }

  setRouteMotionPreference(preference) {
    this.routeMotionPreference = normalizeRouteMotionPreference(preference);
    this.applyRouteMotionPreference();
  }

  applyRouteMotionSpeed(scale) {
    const route = this.currentRouteMotionContext?.route;
    if (!route || !this.routeMotionController) return;
    this.routeMotionController.setSpeedScreenPxPerSecond(
      (160 * route.image.width) /
        Math.max(1, this.routeMotionRenderedWidth * scale),
    );
  }

  showOptimizationPreview(preview) {
    if (!preview) return;
    if (this.optimizationPreviewJobId !== preview.jobId) {
      this.optimizationPreviewJobId = preview.jobId;
      this.optimizationPreviewUpdateCount = 0;
    }
    this.optimizationPreviewUpdateCount += 1;
    this.latestOptimizationPreview = preview;
    if (!this.optimizationPreviewGestureActive) this.renderOptimizationPreview();
  }

  clearOptimizationPreview() {
    this.latestOptimizationPreview = null;
    this.optimizationPreviewJobId = null;
    this.optimizationPreviewUpdateCount = 0;
    this.els.pinLayer?.querySelector(".optimization-preview-overlay")?.remove();
    this.els.navigationMap?.querySelector(".optimization-preview-status")?.remove();
  }

  setOptimizationPreviewGestureActive(active) {
    this.optimizationPreviewGestureActive = Boolean(active);
    if (!this.optimizationPreviewGestureActive && this.latestOptimizationPreview) {
      this.renderOptimizationPreview();
    }
  }

  renderOptimizationPreview() {
    const preview = this.latestOptimizationPreview;
    const pinLayer = this.els.pinLayer;
    const navigationMap = this.els.navigationMap;
    if (!preview || !pinLayer || !navigationMap) return;
    const image = this.lastNavigationContext?.currentRoute?.image ?? {
      width: this.els.navigationMapImage?.naturalWidth,
      height: this.els.navigationMapImage?.naturalHeight,
    };
    const points = buildOptimizationPreviewPoints({
      currentPosition: this.lastNavigationContext?.currentPosition ?? null,
      bestOrder: preview.bestOrder,
      pointIndex: this.optimizationPreviewPointIndex,
    });
    let overlay = pinLayer.querySelector(".optimization-preview-overlay");
    if (points.length < 2 || !image?.width || !image?.height) {
      overlay?.remove();
      this.renderOptimizationPreviewStatus(preview, navigationMap);
      return;
    }
    if (!overlay) {
      overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      overlay.setAttribute("class", "optimization-preview-overlay");
      overlay.setAttribute("aria-hidden", "true");
      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      polyline.setAttribute("class", "optimization-preview-route");
      overlay.appendChild(polyline);
      pinLayer.appendChild(overlay);
    }
    overlay.setAttribute("viewBox", `0 0 ${image.width} ${image.height}`);
    overlay.setAttribute("preserveAspectRatio", "none");
    overlay.querySelector("polyline")?.setAttribute(
      "points",
      points.map((point) => `${point.x},${point.y}`).join(" "),
    );
    this.renderOptimizationPreviewStatus(preview, navigationMap);
  }

  renderOptimizationPreviewStatus(preview, navigationMap) {
    let status = navigationMap.querySelector(".optimization-preview-status");
    if (!status) {
      status = document.createElement("div");
      status.className = "optimization-preview-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      navigationMap.appendChild(status);
    }
    status.textContent = `探索中 ${Math.round(preview.elapsedMs)} / ${preview.searchTimeLimitMs}ms・best更新 ${this.optimizationPreviewUpdateCount}`;
  }

  applyRouteMotionPreference() {
    const enabled = resolveRouteMotionEnabled({
      preference: this.routeMotionPreference,
      prefersReducedMotion: this.routeMotionMediaQueryList?.matches ?? false,
    });
    this.els.navigationMap?.setAttribute(
      "data-route-motion",
      enabled ? "on" : "off",
    );
    if (!this.routeMotionController) return;
    this.routeMotionController.setEnabled(enabled);
    if (enabled && !document.hidden) this.routeMotionController.start();
    else this.routeMotionController.stop();
  }

  scheduleViewportCenterUpdate() {
    if (this.viewportCenterTimer !== null) return;
    this.viewportCenterTimer = setTimeout(() => {
      this.viewportCenterTimer = null;
      this.updateViewportCenter();
    }, 100);
  }

  updateViewportCenter() {
    const label = this.els.viewportCenter;
    if (!label) return;
    const area = findAreaForSpace(this.lastNavigationTarget?.space || "", this.mapAreaCatalog);
    const points = area ? this.viewportPointCache.get(area.id) : null;
    const viewport = this.els.navigationMap;
    const stage = this.els.navigationMapLayer;
    const image = this.els.navigationMapImage;
    if (!area || !points?.length || !viewport || !stage || !image?.naturalWidth || !image.naturalHeight) {
      label.textContent = "表示中心: ---";
      return;
    }
    const nearest = findNearestMapViewportPoint({
      viewportWidth: viewport.clientWidth || viewport.getBoundingClientRect().width,
      viewportHeight: viewport.clientHeight || viewport.getBoundingClientRect().height,
      stageWidth: stage.clientWidth || stage.getBoundingClientRect().width,
      stageHeight: stage.clientHeight || stage.getBoundingClientRect().height,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      transform: this.zoomHelper?.state ?? { scale: 1, x: 0, y: 0 },
      points,
    });
    label.textContent = nearest
      ? `表示中心: ${area.name ?? area.displayName ?? area.id} ${nearest.identifier}${nearest.number}付近`
      : "表示中心: ---";
  }

  applyViewportLayout() {
    const viewport = this.els.navigationMap;
    const stage = this.els.navigationMapLayer;
    const image = this.els.navigationMapImage;
    if (!viewport || !stage || !image?.naturalWidth || !image.naturalHeight)
      return;

    const viewportWidth =
      viewport.clientWidth || viewport.getBoundingClientRect().width;
    const viewportHeight =
      viewport.clientHeight || viewport.getBoundingClientRect().height;
    if (!viewportWidth || !viewportHeight) return;
    const layout = calculateMapStageLayout({
      viewportWidth,
      viewportHeight,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
    });
    if (!layout) return;
    this.routeMotionRenderedWidth = layout.stageWidth;
    stage.style.width = `${layout.stageWidth}px`;
    stage.style.height = `${layout.stageHeight}px`;
    stage.style.left = "0";
    stage.style.top = "0";
    this.els.pinLayer?.style.setProperty("inset", "0");
    this.zoomHelper?.setLayout({
      containerWidth: layout.viewportWidth,
      containerHeight: layout.viewportHeight,
      stageWidth: layout.stageWidth,
      stageHeight: layout.stageHeight,
      baseX: layout.initialX,
      baseY: layout.initialY,
    });
    this.updatePinLayerBox();
    this.updateViewportCenter();
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
      .then((payload) => {
        this.viewportPointCache.set(area.id, buildMapViewportPoints(payload));
        return buildMapPointIndex(payload);
      })
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
    if (!overlay) return;
    this.els.pinLayer.appendChild(overlay);
    if (kind === "current") {
      this.currentRouteMotionContext = { route, overlay };
      const cues = [...overlay.querySelectorAll(".route-motion-cue")];
      const scale = this.zoomHelper?.state.scale ?? 1;
      const renderedWidth = this.routeMotionRenderedWidth || route.image.width;
      const speed = (160 * route.image.width) / Math.max(1, renderedWidth * scale);
      this.routeMotionController = createRouteMotionController({
        cueCount: cues.length || 5,
        speedScreenPxPerSecond: speed,
        requestFrame: globalThis.requestAnimationFrame.bind(globalThis),
        cancelFrame: globalThis.cancelAnimationFrame.bind(globalThis),
        onFrame: (positions) => {
          positions.forEach((position, index) => {
            cues[index]?.setAttribute(
              "transform",
              `translate(${position.x} ${position.y})`,
            );
          });
        },
      });
      this.routeMotionController.setRouteGeometry(
        sampleRouteGeometry(route.points),
      );
      this.applyRouteMotionPreference();
    }
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
    this.applyViewportLayout();
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
    const imageWidth =
      this.els.navigationMapImage?.naturalWidth || currentRoute?.image?.width || 0;
    const imageHeight =
      this.els.navigationMapImage?.naturalHeight || currentRoute?.image?.height || 0;
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

    this.optimizationPreviewPointIndex = new Map(
      circles.flatMap((circle) => {
        const [, label, number] = parseSpace(circle?.space ?? "");
        const anchors = pointIndex?.get(`${label}:${number}`);
        return anchors
          ? [
              [
                circle.space,
                anchors.map((anchor) => ({
                  center_x: (anchor.x / 100) * imageWidth,
                  center_y: (anchor.y / 100) * imageHeight,
                })),
              ] as const,
            ]
          : [];
      }),
    );

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

    this.routeMotionController?.dispose();
    this.routeMotionController = null;
    this.els.pinLayer.innerHTML = "";
    this.currentRouteMotionContext = null;
    this.renderRouteOverlay(currentRoute, "current");
    const candidateRouteVisible =
      selectedTarget?.space &&
      currentTarget?.space &&
      selectedTarget.space !== currentTarget.space &&
      selectedRoute &&
      (selectionState === "ready" || selectionState === "comparing");
    if (candidateRouteVisible) {
      this.renderRouteOverlay(selectedRoute, "candidate");
    }

    const pinsBySpace = new Map(pins.map((pin) => [pin.space, pin]));
    const getSelectableButtons = () =>
      [...this.els.pinLayer.querySelectorAll("button.map-pin")].filter(
        (button) => pinsBySpace.get(button.dataset.space)?.selectable,
      );

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
      const selectable =
        Boolean(pin.circle) &&
        selectionState !== "comparing" &&
        !["next", "start", "done"].includes(pin.state);
      if (pin.circle && selectionState !== "comparing") {
        button.onclick = (event) => {
          event.stopPropagation();
          let selectedButton = event.currentTarget;
          if (event.detail > 0) {
            const candidate = resolveNearestMapPin({
              clientX: event.clientX,
              clientY: event.clientY,
              candidates: getSelectableButtons().map((candidateButton) => {
                const rect = candidateButton.getBoundingClientRect();
                return {
                  space: candidateButton.dataset.space || "",
                  centerX: rect.left + rect.width / 2,
                  centerY: rect.top + rect.height / 2,
                  selectable: true,
                };
              }),
            });
            const nearestButton = candidate
              ? getSelectableButtons().find(
                  (candidateButton) =>
                    candidateButton.dataset.space === candidate.space,
                )
              : null;
            if (nearestButton) selectedButton = nearestButton;
          }
          const selectedPin = pinsBySpace.get(selectedButton?.dataset.space);
          if (selectedPin?.circle) {
            this.uiManager.showCandidatePreview?.(
              selectedPin.circle,
              selectedButton,
            );
          }
        };
      }
      if (selectionState === "comparing" && pin.circle) button.disabled = true;
      pinsBySpace.set(pin.space, { ...pin, selectable });
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
    this.updateViewportCenter();
    if (
      this.latestOptimizationPreview &&
      !this.optimizationPreviewGestureActive
    ) {
      this.renderOptimizationPreview();
    }
  }
}
