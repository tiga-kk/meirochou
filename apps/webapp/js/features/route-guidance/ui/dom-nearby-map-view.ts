// @ts-nocheck

import { GestureZoomController } from "../../../utils/gesture-zoom-controller.js";
import type { Circle, MapPoint } from "../../event-day/public-api";
import type {
  MapArea,
  MapAreaCatalog,
  RouteMapAssets,
  RouteMapAssetsLoader,
} from "../public-api";
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
  private renderToken = 0;

  constructor(
    mapAreaCatalog: MapAreaCatalog,
    assetsLoader: RouteMapAssetsLoader,
    circleReader: ActiveCircleReader,
  ) {
    this.mapAreaCatalog = mapAreaCatalog;
    this.assetsLoader = assetsLoader;
    this.circleReader = circleReader;
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
        <div id="nearby-map-viewport" class="nearby-map-viewport">
          <div id="nearby-map-layer" class="nearby-map-transform-layer">
            <img id="nearby-map-image" class="nearby-map-image" alt="" />
            <div id="nearby-map-pin-layer" class="nearby-map-pin-layer"></div>
          </div>
        </div>
        <p id="nearby-map-error" class="nearby-map-error" role="status" aria-live="polite"></p>
      </div>`;
    this.renderAreaOptions();
    this.surface.querySelector("#btn-close-nearby-map")?.addEventListener("click", () => this.close());
    this.surface.querySelector("#nearby-map-area")?.addEventListener("change", (event) => {
      void this.selectArea((event.target as HTMLSelectElement).value);
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
    this.surface.querySelector("#nearby-map-image")?.addEventListener("load", () => this.applyViewportLayout());
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
    this.surface.classList.add("hidden");
    this.opener?.focus();
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
      this.renderPins(assets);
    } catch (error) {
      if (token === this.renderToken) {
        console.warn("Nearby map assets could not be loaded.", error);
        this.setError("地図データを読み込めませんでした");
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
    const circles = this.circleReader.getAllCircles().filter((circle) => areaForSpace(circle.space, area ? [area] : []) === area);
    const pins = buildMapPins(circles, {
      purchasedList: circles.filter((circle) => this.circleReader.getCircleStatus(circle.space) === "purchased").map((circle) => circle.space),
      holdList: circles.filter((circle) => this.circleReader.getCircleStatus(circle.space) === "held").map((circle) => circle.space),
      pointIndex: points ?? undefined,
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

  private setError(message: string): void {
    const error = this.surface?.querySelector("#nearby-map-error");
    if (error) error.textContent = message;
  }
}
