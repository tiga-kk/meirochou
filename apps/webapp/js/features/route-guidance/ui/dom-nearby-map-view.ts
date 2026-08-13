// @ts-nocheck

import { GestureZoomController } from "../../../utils/gesture-zoom-controller.js";
import type { Circle, MapPoint } from "../../event-day/public-api";
import type {
  MapArea,
  MapAreaCatalog,
  RouteMapAssets,
  RouteMapAssetsLoader,
} from "../public-api";
import { snapStartToWalkableCell } from "../domain/start-selection";
import type { GridMeta } from "../domain/routing/grid-route-types";
import {
  rankNearbyCircles,
  type NearbyCircleLimit,
} from "./nearby-circle-model";
import { parseSpace } from "../../../shared/domain/space-parser";
import {
  buildMapPins,
  buildMapPointIndex,
  calculateMapPinSize,
  calculateMapViewportLayout,
  calculateNativeImageScale,
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
  private origin: NearbyMapOrigin | null = null;
  private nearbyCandidates: ReturnType<typeof rankNearbyCircles> = [];
  private selectedPriorities: readonly number[] | null = null;
  private includeHeld = false;
  private nearbyLimit: NearbyCircleLimit = 5;
  private selectionMode = false;
  private tapStart: { pointerId: number; clientX: number; clientY: number } | null = null;
  private renderToken = 0;
  private readonly currentLocationResolver: (() => string | null) | null;

  constructor(
    mapAreaCatalog: MapAreaCatalog,
    assetsLoader: RouteMapAssetsLoader,
    circleReader: ActiveCircleReader,
    currentLocationResolver: (() => string | null) | null = null,
  ) {
    this.mapAreaCatalog = mapAreaCatalog;
    this.assetsLoader = assetsLoader;
    this.circleReader = circleReader;
    this.currentLocationResolver = currentLocationResolver;
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
        <div id="nearby-map-viewport" class="nearby-map-viewport">
            <div id="nearby-map-layer" class="nearby-map-transform-layer">
            <img id="nearby-map-image" class="nearby-map-image" alt="" />
            <div id="nearby-map-pin-layer" class="nearby-map-pin-layer"></div>
            <span id="nearby-map-origin-marker" aria-label="検索基準地点"></span>
          </div>
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
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen()) this.close();
    });
    this.zoomHelper = new GestureZoomController(
      this.surface.querySelector("#nearby-map-viewport"),
      this.surface.querySelector("#nearby-map-layer"),
      { overscrollLimit: 18 },
    );
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
    this.surface.querySelector("#nearby-map-image")?.addEventListener("load", () => {
      this.applyViewportLayout();
      this.renderOriginMarker();
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
    this.updateNearbyCandidates();
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
    this.origin = null;
    this.nearbyCandidates = [];
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
    if (!layer) return;
    layer.replaceChildren();
    const area = this.activeArea;
    const points = assets ? buildMapPointIndex(assets.points) : null;
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
  }

  private applyViewportLayout(): void {
    const viewport = this.surface?.querySelector("#nearby-map-viewport") as HTMLElement | null;
    const stage = this.surface?.querySelector("#nearby-map-layer") as HTMLElement | null;
    const image = this.surface?.querySelector("#nearby-map-image") as HTMLImageElement | null;
    if (!viewport || !stage || !image?.naturalWidth || !image.naturalHeight) return;
    const layout = calculateMapViewportLayout({
      viewportWidth: viewport.clientWidth || viewport.getBoundingClientRect().width,
      viewportMaxHeight: 520,
      minimumInteractiveHeight: 220,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
    });
    viewport.style.height = `${layout.viewportHeight}px`;
    stage.style.width = `${layout.stageWidth}px`;
    stage.style.height = `${layout.stageHeight}px`;
    this.zoomHelper?.setMaxScale(calculateNativeImageScale({ imageWidth: image.naturalWidth, renderedWidth: stage.clientWidth }));
    this.zoomHelper?.setLayout({ containerWidth: layout.viewportWidth, containerHeight: layout.viewportHeight, stageWidth: layout.stageWidth, stageHeight: layout.stageHeight, baseX: layout.initialX, baseY: layout.initialY });
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
    this.renderPins(this.activeAssets);
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
