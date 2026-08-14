// @ts-nocheck

import { collectCirclePriorities } from "../../../shared/domain/circle-priority-filter";
import { parseSpace } from "../../../shared/domain/space-parser";
import { GestureZoomController } from "../../../utils/gesture-zoom-controller.js";
import type { Circle, MapPoint } from "../../event-day/public-api";
import type { GridMeta } from "../domain/routing/grid-route-types";
import { snapStartToWalkableCell } from "../domain/start-selection";
import type {
  MapArea,
  MapAreaCatalog,
  RouteMapAssets,
  RouteMapAssetsLoader,
} from "../public-api";
import {
  type NearbyCircleLimit,
  rankNearbyCircles,
} from "./nearby-circle-model";
import { calculateNearbyMapWorkspaceLayout } from "./nearby-map-workspace-layout";
import type { MapViewportPoint } from "./route-map-pin-model";
import {
  buildMapPins,
  buildMapPointIndex,
  buildMapViewportPoints,
  calculateMapPinSize,
  calculateNativeImageScale,
  calculateMinimumInteractiveMapHeight,
  findNearestMapViewportPoint,
  getPinPosition,
  normalizeExternalUrl,
} from "./route-map-pin-model";

type NearbyArea = MapArea & {
  id: string;
  name?: string;
  mapFile?: string;
};

interface ActiveCircleReader {
  getAllCircles(): readonly Circle[];
  getCircleStatus(space: string): string;
}

export interface NearbyMapOrigin {
  readonly gridIndex: number;
  readonly svgX: number;
  readonly svgY: number;
}

export interface StandaloneMapViewportLayoutInput {
  availableWidth: number;
  availableHeight: number;
  imageWidth: number;
  imageHeight: number;
  scaleMode?: "contain" | "bounded-cover";
}

export function calculateStandaloneMapViewportLayout(
  input: StandaloneMapViewportLayoutInput,
) {
  if (
    ![
      input.availableWidth,
      input.availableHeight,
      input.imageWidth,
      input.imageHeight,
    ].every((value) => Number.isFinite(value) && value > 0)
  ) {
    return null;
  }
  const containScale = Math.min(
    input.availableWidth / input.imageWidth,
    input.availableHeight / input.imageHeight,
  );
  const scale = input.scaleMode === "bounded-cover"
    ? Math.max(
        containScale,
        0.8 * Math.max(
          input.availableWidth / input.imageWidth,
          input.availableHeight / input.imageHeight,
        ),
      )
    : containScale;
  const stageWidth = input.imageWidth * scale;
  const stageHeight = input.imageHeight * scale;
  const minimumHeight = Math.min(
    input.availableHeight,
    calculateMinimumInteractiveMapHeight(input.availableWidth),
  );
  const naturalHeight =
    (input.availableWidth * input.imageHeight) / input.imageWidth;
  if (naturalHeight < minimumHeight) {
    const stageHeight = minimumHeight;
    const stageWidth = (stageHeight * input.imageWidth) / input.imageHeight;
    return {
      viewportWidth: input.availableWidth,
      viewportHeight: stageHeight,
      stageWidth,
      stageHeight,
      initialX: (input.availableWidth - stageWidth) / 2,
      initialY: 0,
    };
  }
  return {
    viewportWidth: input.availableWidth,
    viewportHeight: input.availableHeight,
    stageWidth,
    stageHeight,
    initialX: (input.availableWidth - stageWidth) / 2,
    initialY: (input.availableHeight - stageHeight) / 2,
  };
}

export function clientPointToGridSelection(input: {
  clientX: number;
  clientY: number;
  stageRect: Pick<DOMRect, "left" | "top" | "width" | "height">;
  imageWidth: number;
  imageHeight: number;
  grid: Pick<GridMeta, "cell_size" | "cols" | "rows">;
}): { readonly svgX: number; readonly svgY: number; readonly col: number; readonly row: number } | null {
  const { clientX, clientY, stageRect, imageWidth, imageHeight, grid } = input;
  if (
    ![clientX, clientY, stageRect.left, stageRect.top, stageRect.width, stageRect.height, imageWidth, imageHeight, grid.cell_size, grid.cols, grid.rows].every(Number.isFinite) ||
    stageRect.width <= 0 || stageRect.height <= 0 || imageWidth <= 0 || imageHeight <= 0 ||
    grid.cell_size <= 0 || grid.cols <= 0 || grid.rows <= 0
  ) return null;

  const svgX = ((clientX - stageRect.left) / stageRect.width) * imageWidth;
  const svgY = ((clientY - stageRect.top) / stageRect.height) * imageHeight;
  const col = Math.floor(svgX / grid.cell_size);
  const row = Math.floor(svgY / grid.cell_size);
  if (svgX < 0 || svgY < 0 || svgX >= imageWidth || svgY >= imageHeight || col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
  return { svgX, svgY, col, row };
}

function areaId(area: NearbyArea): string {
  return area.id || area.areaId;
}

function areaForSpace(space: string, areas: readonly NearbyArea[]): NearbyArea | null {
  const prefix = space?.trim()?.[0];
  const label = space?.trim()?.[1];
  return areas.find((area) => area.prefixes?.includes(prefix) && area.labels?.includes(label)) ?? null;
}

export class DomNearbyMapView {
  readonly surface: HTMLElement | null;
  private readonly mapAreaCatalog: MapAreaCatalog;
  private readonly assetsLoader: RouteMapAssetsLoader;
  private readonly circleReader: ActiveCircleReader;
  private areas: readonly NearbyArea[];
  private readonly zoomHelper: GestureZoomController | null;
  private opener: HTMLElement | null = null;
  private activeArea: NearbyArea | null = null;
  private activeAssets: RouteMapAssets | null = null;
  private nearbyViewportPoints: readonly MapViewportPoint[] = [];
  private nearbyPointIndex: Map<string, MapPoint[]> | null = null;
  private origin: NearbyMapOrigin | null = null;
  private nearbyCandidates: ReturnType<typeof rankNearbyCircles> = [];
  private selectedPriorities: readonly number[] | null = null;
  private includeHeld = false;
  private nearbyLimit: NearbyCircleLimit = 5;
  private selectedSpace: string | null = null;
  private selectionMode = false;
  private tapStart: { pointerId: number; clientX: number; clientY: number } | null = null;
  private renderToken = 0;
  private nearbyMapResizeObserver: ResizeObserver | null = null;
  private nearbyViewportCenterTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly currentLocationResolver: (() => string | null) | null;
  private readonly onShowCatalog: ((circle: Circle) => void) | null;
  private readonly onSetNextTarget:
    ((circle: Circle) => Promise<boolean> | boolean) | null;

  constructor(
    mapAreaCatalog: MapAreaCatalog,
    assetsLoader: RouteMapAssetsLoader,
    circleReader: ActiveCircleReader,
    currentLocationResolver: (() => string | null) | null = null,
    onShowCatalog: ((circle: Circle) => void) | null = null,
    onSetNextTarget: ((circle: Circle) => Promise<boolean> | boolean) | null = null,
  ) {
    this.mapAreaCatalog = mapAreaCatalog;
    this.assetsLoader = assetsLoader;
    this.circleReader = circleReader;
    this.currentLocationResolver = currentLocationResolver;
    this.onShowCatalog = onShowCatalog;
    this.onSetNextTarget = onSetNextTarget;
    this.areas = mapAreaCatalog.getAllMapAreas().filter((area) => Boolean(area.id || area.areaId)) as readonly NearbyArea[];
    this.surface = document.getElementById("nearby-map-surface");
    if (!this.surface) {
      this.zoomHelper = null;
      return;
    }
    this.surface.setAttribute("role", "dialog");
    this.surface.setAttribute("aria-modal", "true");
    this.surface.setAttribute("aria-labelledby", "nearby-map-title");
    this.surface.classList.add("hidden");
    this.surface.innerHTML = `
      <div class="nearby-map-dialog">
        <div class="nearby-map-header">
          <h2 id="nearby-map-title">地図</h2>
          <button type="button" id="btn-close-nearby-map" class="btn-close-modal" aria-label="地図を閉じる">×</button>
        </div>
        <label class="nearby-map-area-label" for="nearby-map-area">エリア</label>
          <select id="nearby-map-area" class="nearby-map-area-select"></select>
        <div class="nearby-map-origin-controls">
          <button type="button" id="btn-nearby-use-current-location">現在地を使う</button>
          <button type="button" id="btn-nearby-select-origin">基準地点を変更</button>
        </div>
        <div id="nearby-map-controls" class="nearby-map-controls" aria-label="周辺地図の絞り込み">
          <div class="nearby-map-filter-group">
            <span class="nearby-map-filter-label">優先度</span>
            <div id="nearby-map-priority-filter" class="nearby-map-priority-filter"></div>
          </div>
          <label class="nearby-map-limit-label" for="nearby-map-limit">表示件数</label>
          <select id="nearby-map-limit" class="nearby-map-limit">
            <option value="5">5件</option>
            <option value="10">10件</option>
            <option value="15">15件</option>
            <option value="20">20件</option>
          </select>
          <label class="nearby-map-held-label">
            <input type="checkbox" id="nearby-map-include-held" />
            保留も表示
          </label>
        </div>
        <div id="nearby-map-workspace" class="nearby-map-workspace">
          <div id="nearby-map-viewport" class="nearby-map-viewport">
            <div id="nearby-map-layer" class="nearby-map-transform-layer">
            <img id="nearby-map-image" class="nearby-map-image" alt="" />
            <div id="nearby-map-pin-layer" class="nearby-map-pin-layer"></div>
            <span id="nearby-map-origin-marker" aria-label="検索基準地点"></span>
          </div>
          <p id="nearby-map-center" class="map-viewport-center" aria-live="polite">表示中心: ---</p>
          </div>
          <section id="nearby-map-catalog-panel" class="nearby-map-catalog-panel" aria-label="周辺お品書き">
            <div id="nearby-map-card-layer" class="nearby-map-card-layer"></div>
          </section>
          <svg id="nearby-map-leader-layer" class="nearby-map-leader-layer" aria-hidden="true"></svg>
        </div>
        <p id="nearby-map-error" class="nearby-map-error" role="status" aria-live="polite"></p>
      </div>`;
    this.renderAreaOptions();
    this.surface.querySelector("#btn-close-nearby-map")?.addEventListener("click", () => this.close());
    this.surface.querySelector("#nearby-map-area")?.addEventListener("change", (event) => {
      void this.selectArea((event.target as HTMLSelectElement).value);
    });
    this.surface.querySelector("#btn-nearby-select-origin")?.addEventListener("click", () => {
      this.selectionMode = true;
      this.setError("地図を1回タップして基準地点を選択してください");
    });
    this.surface.querySelector("#btn-nearby-use-current-location")?.addEventListener("click", () => {
      void this.useCurrentLocation();
    });
    this.surface.addEventListener("click", (event) => {
      if (event.target === this.surface) this.close();
    });
    this.renderNearbyControls();
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen()) this.close();
    });
    this.zoomHelper = new GestureZoomController(
      this.surface.querySelector("#nearby-map-viewport"),
      this.surface.querySelector("#nearby-map-layer"),
      {
        overscrollLimit: 18,
        onTransformChange: () => this.renderNearbyOverlay(),
      },
    );
    if (typeof ResizeObserver === "function") {
      const dialog = this.surface.querySelector(".nearby-map-dialog");
      this.nearbyMapResizeObserver = new ResizeObserver(() => {
        if (!this.activeAssets) return;
        this.applyViewportLayout();
        this.renderOriginMarker();
        this.renderPins(this.activeAssets);
      });
      if (dialog) this.nearbyMapResizeObserver.observe(dialog);
    }
    const viewport = this.surface.querySelector("#nearby-map-viewport");
    viewport?.addEventListener("pointerdown", (event) => {
      if (!this.selectionMode) return;
      this.tapStart = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    });
    viewport?.addEventListener("pointerup", (event) => {
      const start = this.tapStart;
      this.tapStart = null;
      if (!this.selectionMode || !start || start.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) > 8) return;
      this.selectOriginAt(event.clientX, event.clientY);
    });
    this.surface
      .querySelector("#nearby-map-catalog-panel")
      ?.addEventListener("scroll", () => this.updateCatalogOverlay());
    this.surface.querySelector("#nearby-map-image")?.addEventListener("load", () => {
      this.applyViewportLayout();
      this.renderOriginMarker();
      this.renderPins(this.activeAssets);
    });
  }

  isOpen(): boolean {
    return Boolean(this.surface && !this.surface.classList.contains("hidden"));
  }

  open(opener: HTMLElement | null = null, initialAreaId = ""): void {
    this.areas = this.mapAreaCatalog.getAllMapAreas().filter((area) => Boolean(area.id || area.areaId)) as readonly NearbyArea[];
    if (!this.surface || this.areas.length === 0) return;
    this.opener = opener;
    this.surface.classList.remove("hidden");
    this.renderAreaOptions();
    this.renderNearbyControls();
    const fallback = this.areas.find((area) =>
      this.circleReader.getAllCircles().some((circle) =>
        this.circleReader.getCircleStatus(circle.space) !== "purchased" && areaForSpace(circle.space, [area]),
      ),
    );
    const selected = this.areas.find((area) => areaId(area) === initialAreaId) ?? fallback ?? this.areas[0];
    void this.selectArea(areaId(selected));
    (this.surface.querySelector("#btn-close-nearby-map") as HTMLElement)?.focus();
  }

  close(): void {
    if (!this.surface) return;
    this.selectionMode = false;
    this.tapStart = null;
    this.surface.classList.add("hidden");
    this.opener?.focus();
  }

  getNearbyCandidates(): ReturnType<typeof rankNearbyCircles> {
    return [...this.nearbyCandidates];
  }

  setNearbyFilters(input: {
    selectedPriorities?: readonly number[] | null;
    includeHeld?: boolean;
    limit?: NearbyCircleLimit;
  }): void {
    if (input.selectedPriorities !== undefined) {
      this.selectedPriorities = input.selectedPriorities;
    }
    if (input.includeHeld !== undefined) this.includeHeld = input.includeHeld;
    if (input.limit !== undefined) this.nearbyLimit = input.limit;
    this.syncNearbyControlState();
    this.updateNearbyCandidates();
  }

  private renderNearbyControls(): void {
    const priorityContainer = this.surface?.querySelector(
      "#nearby-map-priority-filter",
    );
    const priorities = collectCirclePriorities(this.circleReader.getAllCircles());
    if (priorityContainer) {
      priorityContainer.replaceChildren();
      const selected = this.selectedPriorities ?? [];
      const all = document.createElement("button");
      all.type = "button";
      all.className = "priority-chip nearby-priority-chip";
      all.textContent = "すべて";
      all.setAttribute("aria-pressed", String(selected.length === 0));
      all.addEventListener("click", () =>
        this.setNearbyFilters({ selectedPriorities: null }),
      );
      priorityContainer.appendChild(all);
      for (const priority of priorities) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "priority-chip nearby-priority-chip";
        chip.textContent = String(priority);
        chip.setAttribute("aria-pressed", String(selected.includes(priority)));
        chip.addEventListener("click", () => {
          const current = this.selectedPriorities ?? [];
          const next = current.includes(priority)
            ? current.filter((value) => value !== priority)
            : [...current, priority];
          this.setNearbyFilters({
            selectedPriorities: next.length > 0 ? next : null,
          });
        });
        priorityContainer.appendChild(chip);
      }
    }
    this.syncNearbyControlState();
  }

  private syncNearbyControlState(): void {
    const selected = this.selectedPriorities ?? [];
    this.surface
      ?.querySelectorAll(".nearby-priority-chip")
      .forEach((chip) => {
        const value = chip.textContent === "すべて" ? null : Number(chip.textContent);
        chip.setAttribute(
          "aria-pressed",
          String(value === null ? selected.length === 0 : selected.includes(value)),
        );
      });
    const limit = this.surface?.querySelector("#nearby-map-limit") as HTMLSelectElement | null;
    if (limit) {
      limit.value = String(this.nearbyLimit);
      limit.onchange = () => {
        this.setNearbyFilters({
          limit: Number(limit.value) as NearbyCircleLimit,
        });
      };
    }
    const held = this.surface?.querySelector(
      "#nearby-map-include-held",
    ) as HTMLInputElement | null;
    if (held) {
      held.checked = this.includeHeld;
      held.onchange = () => this.setNearbyFilters({ includeHeld: held.checked });
    }
  }

  private renderAreaOptions(): void {
    const select = this.surface?.querySelector("#nearby-map-area") as HTMLSelectElement | null;
    if (!select) return;
    select.replaceChildren(...this.areas.map((area) => {
      const option = document.createElement("option");
      option.value = areaId(area);
      option.textContent = area.name ?? area.displayName ?? areaId(area);
      return option;
    }));
  }

  private async selectArea(id: string): Promise<void> {
    const area = this.areas.find((candidate) => areaId(candidate) === id);
    if (!area || !this.surface) return;
    this.activeArea = area;
    this.activeAssets = null;
    this.nearbyViewportPoints = [];
    this.origin = null;
    this.nearbyCandidates = [];
    this.selectedSpace = null;
    this.selectionMode = false;
    this.renderOriginMarker();
    const token = ++this.renderToken;
    const select = this.surface.querySelector("#nearby-map-area") as HTMLSelectElement;
    select.value = id;
    const image = this.surface.querySelector("#nearby-map-image") as HTMLImageElement;
    image.src = area.mapFile ?? "";
    image.alt = `${area.name ?? area.displayName ?? id} 配置図`;
    this.zoomHelper?.reset();
    this.setError("");
    try {
      const assets = await this.assetsLoader.loadMapAssets(area);
      if (token !== this.renderToken) return;
      this.activeAssets = assets;
      this.nearbyViewportPoints = buildMapViewportPoints(assets.points);
      this.updateNearbyCandidates();
      this.renderPins(assets);
    } catch (error) {
      if (token === this.renderToken) {
        console.warn("Nearby map assets could not be loaded.", error);
        this.setError("地図データを読み込めませんでした");
        this.activeAssets = null;
        this.nearbyCandidates = [];
        this.renderPins(null);
      }
    }
  }

  private renderPins(assets: RouteMapAssets | null): void {
    const layer = this.surface?.querySelector("#nearby-map-pin-layer") as HTMLElement | null;
    const cardLayer = this.surface?.querySelector("#nearby-map-card-layer") as HTMLElement | null;
    const leaderLayer = this.surface?.querySelector("#nearby-map-leader-layer") as SVGElement | null;
    if (!layer) return;
    layer.replaceChildren();
    cardLayer?.replaceChildren();
    leaderLayer?.replaceChildren();
    const area = this.activeArea;
    const points = assets ? buildMapPointIndex(assets.points) : null;
    this.nearbyPointIndex = points;
    const circles = this.origin
      ? this.nearbyCandidates.map(({ candidate }) => candidate)
      : this.circleReader.getAllCircles().filter((circle) => areaForSpace(circle.space, area ? [area] : []) === area);
    const positionOverrides = new Map(
      this.nearbyCandidates
        .filter(({ position }) => position)
        .map(({ candidate, position }) => [candidate.space, position as MapPoint]),
    );
    const pins = buildMapPins(circles, {
      purchasedList: circles.filter((circle) => this.circleReader.getCircleStatus(circle.space) === "purchased").map((circle) => circle.space),
      holdList: circles.filter((circle) => this.circleReader.getCircleStatus(circle.space) === "held").map((circle) => circle.space),
      pointIndex: points ?? undefined,
      positionOverrides,
      requireIndexedPositions: Boolean(area?.assets),
    });
    for (const pin of pins) {
      const element = document.createElement("span");
      element.className = `map-pin ${pin.state}`;
      element.dataset.space = pin.space;
      element.style.left = `${pin.x}%`;
      element.style.top = `${pin.y}%`;
      element.setAttribute("aria-label", pin.space);
      const size = calculateMapPinSize({ imageWidth: assets?.points.image.width, renderedWidth: layer.clientWidth, sourceSize: 10 });
      element.style.width = `${size}px`;
      element.style.height = `${size}px`;
      layer.appendChild(element);
    }
    this.renderCatalogCards(cardLayer, leaderLayer);
  }

  private renderNearbyOverlay(): void {
    this.updateCatalogOverlay();
    this.scheduleNearbyViewportCenterUpdate();
  }

  private scheduleNearbyViewportCenterUpdate(): void {
    if (this.nearbyViewportCenterTimer !== null) return;
    this.nearbyViewportCenterTimer = setTimeout(() => {
      this.nearbyViewportCenterTimer = null;
      this.updateNearbyViewportCenter();
    }, 100);
  }

  private updateNearbyViewportCenter(): void {
    const label = this.surface?.querySelector("#nearby-map-center") as HTMLElement | null;
    const viewport = this.surface?.querySelector("#nearby-map-viewport") as HTMLElement | null;
    const stage = this.surface?.querySelector("#nearby-map-layer") as HTMLElement | null;
    const image = this.surface?.querySelector("#nearby-map-image") as HTMLImageElement | null;
    if (!label || !viewport || !stage || !image?.naturalWidth || !image.naturalHeight || !this.activeArea || !this.activeAssets) {
      label && (label.textContent = "表示中心: ---");
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
      points: this.nearbyViewportPoints,
    });
    label.textContent = nearest
      ? `表示中心: ${this.activeArea.name ?? this.activeArea.displayName ?? areaId(this.activeArea)} ${nearest.identifier}${nearest.number}付近`
      : "表示中心: ---";
  }

  private renderCatalogCards(
    cardLayer: HTMLElement | null,
    leaderLayer: SVGElement | null,
  ): void {
    if (!cardLayer || !leaderLayer || !this.activeAssets || !this.activeArea || !this.origin) return;
    cardLayer.replaceChildren();
    leaderLayer.replaceChildren();
    const anchors = this.nearbyCandidates.map(({ candidate, position }) => ({
      candidate,
      position: position ?? this.nearbyPointIndex?.get(candidate.space)?.[0] ?? candidate.mapPosition ?? getPinPosition(candidate.space),
    }));
    for (const { candidate } of anchors) {
      const card = document.createElement("article");
      card.className = "nearby-catalog-card";
      card.dataset.space = candidate.space;
      card.setAttribute("role", "group");
      card.tabIndex = 0;
      card.setAttribute("aria-selected", String(this.selectedSpace === candidate.space));
      if (this.selectedSpace === candidate.space) card.classList.add("nearby-catalog-card--selected");
      card.setAttribute("aria-label", `${candidate.space} 周辺カード`);
      const selectCard = () => {
        this.selectedSpace =
          this.selectedSpace === candidate.space ? null : candidate.space;
        this.renderPins(this.activeAssets);
        this.applyViewportLayout();
      };
      card.addEventListener("click", (event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        if (event.detail > 0) return;
        selectCard();
      });
      card.addEventListener("pointerdown", (event) => event.stopPropagation());
      card.addEventListener("pointerup", (event) => {
        event.stopPropagation();
        if (!(event.target as HTMLElement).closest("button")) selectCard();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectCard();
      });
      const imageUrl = normalizeExternalUrl(candidate.tweet);
      const showPlaceholder = () => {
        card.querySelector("img")?.remove();
        if (card.querySelector(".no-image-placeholder")) return;
        const placeholder = document.createElement("span");
        placeholder.className = "no-image-placeholder";
        placeholder.innerHTML = '<i class="fa-regular fa-image"></i><span>No Image</span>';
        card.prepend(placeholder);
      };
      if (imageUrl) {
        const image = document.createElement("img");
        image.alt = `${candidate.space} お品書き`;
        image.loading = "lazy";
        image.src = imageUrl;
        image.addEventListener("error", showPlaceholder, { once: true });
        card.appendChild(image);
      } else {
        showPlaceholder();
      }
      const info = document.createElement("span");
      info.className = "nearby-catalog-card-info";
      const priority = candidate.priority === undefined || candidate.priority === null || String(candidate.priority).trim() === ""
        ? "未設定"
        : String(candidate.priority);
      const spaceLabel = document.createElement("strong");
      spaceLabel.textContent = candidate.space;
      const priorityLabel = document.createElement("span");
      priorityLabel.textContent = `優先度: ${priority}`;
      info.append(spaceLabel, priorityLabel);
      card.appendChild(info);
      const actions = document.createElement("div");
      actions.className = "nearby-catalog-card-actions";
      actions.hidden = this.selectedSpace !== candidate.space;
      const catalogButton = document.createElement("button");
      catalogButton.type = "button";
      catalogButton.textContent = "お品書きを見る";
      catalogButton.addEventListener("click", (event) => {
        event.stopPropagation();
        this.onShowCatalog?.({ ...candidate, tweet: imageUrl });
      });
      const targetButton = document.createElement("button");
      targetButton.type = "button";
      targetButton.textContent = "目的地にする";
      targetButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.selectNearbyTarget(candidate, imageUrl, targetButton);
      });
      actions.append(catalogButton, targetButton);
      card.appendChild(actions);
      cardLayer.appendChild(card);
    }
    this.updateCatalogOverlay();
  }

  private updateCatalogOverlay(): void {
    const cardLayer = this.surface?.querySelector("#nearby-map-card-layer") as HTMLElement | null;
    const leaderLayer = this.surface?.querySelector("#nearby-map-leader-layer") as SVGElement | null;
    const workspace = this.surface?.querySelector("#nearby-map-workspace") as HTMLElement | null;
    if (!cardLayer || !leaderLayer || !workspace || !this.activeArea || !this.origin) return;
    const viewport = this.surface?.querySelector("#nearby-map-viewport") as HTMLElement | null;
    const catalogPanel = this.surface?.querySelector("#nearby-map-catalog-panel") as HTMLElement | null;
    const workspaceRect = workspace.getBoundingClientRect();
    const workspaceWidth = workspace.clientWidth || workspaceRect.width || 1;
    const workspaceHeight = workspace.clientHeight || workspaceRect.height || 1;
    const stage = this.surface?.querySelector("#nearby-map-layer") as HTMLElement | null;
    if (!viewport || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    const panelRect = catalogPanel?.getBoundingClientRect() ?? null;
    const anchors = this.nearbyCandidates.map(({ candidate, position }) => ({
      candidate,
      position: position ?? this.nearbyPointIndex?.get(candidate.space)?.[0] ?? candidate.mapPosition ?? getPinPosition(candidate.space),
    }));
    const cardBySpace = new Map(
      [...cardLayer.querySelectorAll<HTMLElement>(".nearby-catalog-card")]
        .map((card) => [card.dataset.space, card] as const),
    );
    const lineByKey = new Map<string, SVGLineElement>();
    leaderLayer.querySelectorAll<SVGLineElement>("line").forEach((line) => {
      const className = line.classList.contains("nearby-map-leader")
        ? "nearby-map-leader"
        : "nearby-map-leader-underlay";
      lineByKey.set(`${line.dataset.space}:${className}`, line);
    });
    leaderLayer.setAttribute("viewBox", `0 0 ${workspaceWidth} ${workspaceHeight}`);
    for (const { candidate, position } of anchors) {
      const card = cardBySpace.get(candidate.space);
      if (!card) continue;
      const cardRect = card.getBoundingClientRect();
      const cardX = cardRect.left - workspaceRect.left;
      const cardY = cardRect.top - workspaceRect.top;
      const cardWidth = cardRect.width;
      const cardHeight = cardRect.height;
      const anchorX = stageRect.left - workspaceRect.left + (position.x / 100) * stageRect.width;
      const anchorY = stageRect.top - workspaceRect.top + (position.y / 100) * stageRect.height;
      const endX = Math.max(cardX, Math.min(anchorX, cardX + cardWidth));
      const endY = Math.max(cardY, Math.min(anchorY, cardY + cardHeight));
      const visibleEndX = Math.abs(endX - anchorX) < 1
        ? endX + (endX <= workspaceWidth / 2 ? 1 : -1)
        : endX;
      const visibleEndY = Math.abs(endY - anchorY) < 1
        ? endY + (endY <= workspaceHeight / 2 ? 1 : -1)
        : endY;
      const hasCardRect = cardWidth > 0 && cardHeight > 0;
      const hasPanelRect = Boolean(panelRect?.width && panelRect.height);
      const visible = hasCardRect &&
        (!hasPanelRect || (
          cardRect.right > panelRect.left &&
          cardRect.left < panelRect.right &&
          cardRect.bottom > panelRect.top &&
          cardRect.top < panelRect.bottom
        ));
      for (const className of ["nearby-map-leader-underlay", "nearby-map-leader"]) {
        const key = `${candidate.space}:${className}`;
        let line = lineByKey.get(key);
        if (!line) {
          line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.dataset.space = candidate.space;
          line.classList.add(className);
          leaderLayer.appendChild(line);
          lineByKey.set(key, line);
        }
        line.setAttribute("x1", String(anchorX));
        line.setAttribute("y1", String(anchorY));
        line.setAttribute("x2", String(visibleEndX));
        line.setAttribute("y2", String(visibleEndY));
        line.hidden = !visible;
      }
    }
  }

  private applyViewportLayout(): void {
    const viewport = this.surface?.querySelector("#nearby-map-viewport") as HTMLElement | null;
    const stage = this.surface?.querySelector("#nearby-map-layer") as HTMLElement | null;
    const image = this.surface?.querySelector("#nearby-map-image") as HTMLImageElement | null;
    const dialog = this.surface?.querySelector(".nearby-map-dialog") as HTMLElement | null;
    const workspace = this.surface?.querySelector("#nearby-map-workspace") as HTMLElement | null;
    const catalogPanel = this.surface?.querySelector("#nearby-map-catalog-panel") as HTMLElement | null;
    if (!viewport || !stage || !dialog || !workspace || !image?.naturalWidth || !image.naturalHeight) return;
    const workspaceWidth = workspace.clientWidth || workspace.getBoundingClientRect().width;
    const workspaceHeight = workspace.clientHeight || workspace.getBoundingClientRect().height;
    const layout = calculateNearbyMapWorkspaceLayout({
      viewportWidth: workspaceWidth,
      viewportHeight: workspaceHeight,
      controlsHeight: 0,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
    });
    workspace.dataset.mode = layout.mode;
    workspace.style.setProperty("--nearby-card-columns", String(layout.cardColumns));
    workspace.style.setProperty("--nearby-map-width", `${layout.mapWidth}px`);
    workspace.style.setProperty("--nearby-map-height", `${layout.mapHeight}px`);
    if (catalogPanel) {
      catalogPanel.style.setProperty("--nearby-panel-width", `${layout.panelWidth}px`);
      catalogPanel.style.setProperty("--nearby-panel-height", `${layout.panelHeight}px`);
    }
    const mapLayout = calculateStandaloneMapViewportLayout({
      availableWidth: layout.mapWidth,
      availableHeight: layout.mapHeight,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      scaleMode: layout.initialMapScaleMode,
    });
    if (!mapLayout) return;
    viewport.style.width = `${mapLayout.viewportWidth}px`;
    viewport.style.height = `${mapLayout.viewportHeight}px`;
    stage.style.width = `${mapLayout.stageWidth}px`;
    stage.style.height = `${mapLayout.stageHeight}px`;
    this.zoomHelper?.setMaxScale(calculateNativeImageScale({ imageWidth: image.naturalWidth, renderedWidth: mapLayout.stageWidth }));
    this.zoomHelper?.setLayout({ containerWidth: mapLayout.viewportWidth, containerHeight: mapLayout.viewportHeight, stageWidth: mapLayout.stageWidth, stageHeight: mapLayout.stageHeight, baseX: mapLayout.initialX, baseY: mapLayout.initialY });
    this.updateNearbyViewportCenter();
    this.updateCatalogOverlay();
  }

  private selectOriginAt(clientX: number, clientY: number): void {
    const image = this.surface?.querySelector("#nearby-map-image") as HTMLImageElement | null;
    const stage = this.surface?.querySelector("#nearby-map-layer") as HTMLElement | null;
    const assets = this.activeAssets;
    if (!image || !stage || !assets || !image.naturalWidth || !image.naturalHeight) {
      this.setError("地図データを読み込むまで基準地点を選択できません");
      return;
    }
    const selection = clientPointToGridSelection({
      clientX,
      clientY,
      stageRect: stage.getBoundingClientRect(),
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      grid: assets.gridMetadata,
    });
    if (!selection) {
      this.setError("地図の範囲内を選択してください");
      return;
    }
    const snapped = snapStartToWalkableCell(
      { svgX: selection.svgX, svgY: selection.svgY },
      assets.gridBytes,
      assets.gridMetadata,
      30,
    );
    if (!snapped) {
      this.setError("歩行可能な基準地点を選択できません");
      return;
    }
    this.origin = snapped;
    this.selectionMode = false;
    this.updateNearbyCandidates();
    this.renderOriginMarker();
    this.setError("");
  }

  private async useCurrentLocation(): Promise<void> {
    const space = this.currentLocationResolver?.() ?? null;
    if (!space) {
      this.setError("現在地を入力してください");
      return;
    }
    const area = areaForSpace(space, this.areas);
    if (!area) {
      this.setError("現在地のエリアを地図から解決できません");
      return;
    }
    if (this.activeArea !== area || !this.activeAssets) await this.selectArea(areaId(area));
    const assets = this.activeAssets;
    if (!assets) {
      this.setError("地図データを読み込めませんでした");
      return;
    }
    const [, identifier, number] = parseSpace(space);
    const point = assets.points.points.find((candidate) =>
      ((candidate as typeof candidate & { space?: string }).space === space) ||
      (candidate.identifier === identifier && Number(candidate.number) === number),
    );
    const portal = point?.portals?.[0];
    const snapped = portal && snapStartToWalkableCell(
      { svgX: Number(portal.x), svgY: Number(portal.y) },
      assets.gridBytes,
      assets.gridMetadata,
      30,
    );
    if (!snapped) {
      this.setError("現在地を歩行可能な基準地点へ解決できません");
      return;
    }
    this.origin = snapped;
    this.selectionMode = false;
    this.updateNearbyCandidates();
    this.renderOriginMarker();
    this.setError("");
  }

  private updateNearbyCandidates(): void {
    if (!this.origin || !this.activeArea || !this.activeAssets) {
      this.nearbyCandidates = [];
      return;
    }
    this.nearbyCandidates = rankNearbyCircles({
      pointsPayload: this.activeAssets.points,
      gridMeta: this.activeAssets.gridMetadata,
      gridBytes: this.activeAssets.gridBytes,
      originGridIndex: this.origin.gridIndex,
      area: this.activeArea,
      circles: this.circleReader.getAllCircles(),
      getCircleStatus: (space) => this.circleReader.getCircleStatus(space),
      selectedPriorities: this.selectedPriorities,
      includeHeld: this.includeHeld,
      limit: this.nearbyLimit,
    });
    if (
      this.selectedSpace &&
      !this.nearbyCandidates.some(({ candidate }) => candidate.space === this.selectedSpace)
    ) {
      this.selectedSpace = null;
    }
    this.renderPins(this.activeAssets);
  }

  private async selectNearbyTarget(
    candidate: Circle,
    tweet: string | null,
    button: HTMLButtonElement,
  ): Promise<void> {
    if (!this.onSetNextTarget) return;
    button.disabled = true;
    try {
      const changed = await this.onSetNextTarget({ ...candidate, tweet });
      if (changed) {
        this.selectedSpace = null;
        this.close();
      }
    } finally {
      button.disabled = false;
    }
  }

  private renderOriginMarker(): void {
    const marker = this.surface?.querySelector("#nearby-map-origin-marker") as HTMLElement | null;
    const image = this.surface?.querySelector("#nearby-map-image") as HTMLImageElement | null;
    if (!marker || !image?.naturalWidth || !image.naturalHeight || !this.origin) {
      if (marker) marker.hidden = true;
      return;
    }
    marker.hidden = false;
    marker.style.position = "absolute";
    marker.style.left = `${(this.origin.svgX / image.naturalWidth) * 100}%`;
    marker.style.top = `${(this.origin.svgY / image.naturalHeight) * 100}%`;
    marker.style.width = "18px";
    marker.style.height = "18px";
    marker.style.transform = "translate(-50%, -50%)";
    marker.style.border = "3px solid #b42318";
    marker.style.borderRadius = "50%";
    marker.style.background = "#fff";
    marker.style.zIndex = "2";
    marker.title = `検索基準 ${this.origin.gridIndex}`;
  }

  private setError(message: string): void {
    const error = this.surface?.querySelector("#nearby-map-error");
    if (error) error.textContent = message;
  }
}
