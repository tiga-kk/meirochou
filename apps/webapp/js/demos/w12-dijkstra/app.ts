import {
  parseEventMapBundleManifest,
  parseGridMeta,
} from "../../types/boundary-parsers";
import type { EventMapAreaManifest, GridMeta } from "../../types/domain";
import {
  distanceToColor,
  findNearestWalkableIndex,
  pointerToGridCell,
  revealCountAtTime,
  runDijkstraTrace,
  type DijkstraTrace,
} from "./core";

const MANIFEST_URL = "/assets/maps/C108/manifest.json";
const TARGET_AREA_ID = "w12";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const elements = {
  mapStage: requiredElement<HTMLDivElement>("#mapStage"),
  mapImage: requiredElement<HTMLImageElement>("#mapImage"),
  heatCanvas: requiredElement<HTMLCanvasElement>("#heatCanvas"),
  originMarker: requiredElement<HTMLSpanElement>("#originMarker"),
  status: requiredElement<HTMLParagraphElement>("#statusText"),
  speed: requiredElement<HTMLSelectElement>("#speedSelect"),
  pause: requiredElement<HTMLButtonElement>("#pauseButton"),
  reset: requiredElement<HTMLButtonElement>("#resetButton"),
  startCell: requiredElement<HTMLElement>("#startCell"),
  visitedCells: requiredElement<HTMLElement>("#visitedCells"),
  maxDistance: requiredElement<HTMLElement>("#maxDistance"),
  computeTime: requiredElement<HTMLElement>("#computeTime"),
};

interface VisualizerState {
  gridMeta: GridMeta | null;
  gridBytes: Uint8Array | null;
  trace: DijkstraTrace | null;
  imageData: ImageData | null;
  revealedCount: number;
  animationFrameId: number | null;
  animationStartedAt: number;
  pauseStartedAt: number;
  accumulatedPauseMs: number;
  paused: boolean;
}

const state: VisualizerState = {
  gridMeta: null,
  gridBytes: null,
  trace: null,
  imageData: null,
  revealedCount: 0,
  animationFrameId: null,
  animationStartedAt: 0,
  pauseStartedAt: 0,
  accumulatedPauseMs: 0,
  paused: false,
};

function setStatus(message: string, error = false): void {
  elements.status.textContent = message;
  elements.status.dataset.state = error ? "error" : "normal";
}

function resolveAssetUrl(manifestUrl: string, relativePath: string): string {
  return new URL(relativePath, manifestUrl).href;
}

async function readJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`${label}の取得に失敗しました (${response.status})`);
  }
  return response.json();
}

async function loadW12Area(): Promise<void> {
  setStatus("W12の地図と歩行グリッドを読み込んでいます…");
  const manifestResponse = await fetch(MANIFEST_URL, { cache: "no-store" });
  const manifestJson = await readJson(manifestResponse, "C108 manifest.json");
  const manifest = parseEventMapBundleManifest(manifestJson);
  const area = manifest.areas.find(
    (candidate): candidate is EventMapAreaManifest =>
      candidate.areaId === TARGET_AREA_ID,
  );
  if (!area) throw new Error("C108 manifest.jsonにW12がありません");

  const mapUrl = resolveAssetUrl(MANIFEST_URL, area.assets.svg);
  const gridMetaUrl = resolveAssetUrl(MANIFEST_URL, area.assets.gridMeta);
  const gridUrl = resolveAssetUrl(MANIFEST_URL, area.assets.grid);
  const [gridMetaResponse, gridResponse] = await Promise.all([
    fetch(gridMetaUrl, { cache: "no-store" }),
    fetch(gridUrl, { cache: "no-store" }),
  ]);
  const gridMetaJson = await readJson(gridMetaResponse, "W12 grid-meta.json");
  if (!gridResponse.ok) {
    throw new Error(`W12 grid.binの取得に失敗しました (${gridResponse.status})`);
  }

  const gridMeta = parseGridMeta(gridMetaJson);
  const gridBytes = new Uint8Array(await gridResponse.arrayBuffer());
  if (gridBytes.length !== gridMeta.cols * gridMeta.rows) {
    throw new Error("W12 grid.binのセル数がgrid-meta.jsonと一致しません");
  }

  state.gridMeta = gridMeta;
  state.gridBytes = gridBytes;
  elements.mapImage.src = mapUrl;
  elements.mapStage.style.aspectRatio = `${gridMeta.width} / ${gridMeta.height}`;
  elements.heatCanvas.width = gridMeta.cols;
  elements.heatCanvas.height = gridMeta.rows;
  elements.mapStage.hidden = false;
  elements.reset.disabled = false;
  setStatus("地図上の通路をクリックしてください。");
}

function stopAnimation(): void {
  if (state.animationFrameId !== null) {
    cancelAnimationFrame(state.animationFrameId);
  }
  state.animationFrameId = null;
  state.paused = false;
  state.pauseStartedAt = 0;
  state.accumulatedPauseMs = 0;
  elements.pause.textContent = "一時停止";
}

function clearHeatmap(): void {
  stopAnimation();
  const context = elements.heatCanvas.getContext("2d");
  context?.clearRect(0, 0, elements.heatCanvas.width, elements.heatCanvas.height);
  state.trace = null;
  state.imageData = null;
  state.revealedCount = 0;
  elements.originMarker.hidden = true;
  elements.startCell.textContent = "—";
  elements.visitedCells.textContent = "—";
  elements.maxDistance.textContent = "—";
  elements.computeTime.textContent = "—";
  elements.pause.disabled = true;
  if (state.gridMeta) setStatus("地図上の通路をクリックしてください。");
}

function paintSettledCells(from: number, to: number): void {
  if (!state.trace || !state.imageData) return;
  for (let cursor = from; cursor < to; cursor += 1) {
    const cellIndex: number = state.trace.settledOrder[cursor];
    const color = distanceToColor(
      state.trace.distances[cellIndex],
      state.trace.maxDistance,
    );
    const offset = cellIndex * 4;
    state.imageData.data[offset] = color.r;
    state.imageData.data[offset + 1] = color.g;
    state.imageData.data[offset + 2] = color.b;
    state.imageData.data[offset + 3] = color.a;
  }
}

function renderAnimation(timestamp: number): void {
  if (!state.trace || !state.imageData || state.paused) return;
  const durationMs = Number(elements.speed.value);
  const elapsedMs =
    timestamp - state.animationStartedAt - state.accumulatedPauseMs;
  const nextCount = revealCountAtTime(
    elapsedMs,
    durationMs,
    state.trace.settledOrder.length,
  );
  paintSettledCells(state.revealedCount, nextCount);
  state.revealedCount = nextCount;
  elements.heatCanvas
    .getContext("2d")
    ?.putImageData(state.imageData, 0, 0);
  elements.visitedCells.textContent = `${nextCount.toLocaleString()} / ${state.trace.visitedCount.toLocaleString()}`;

  if (nextCount < state.trace.settledOrder.length) {
    state.animationFrameId = requestAnimationFrame(renderAnimation);
    return;
  }
  state.animationFrameId = null;
  elements.pause.disabled = true;
  setStatus("探索完了。別の地点をクリックすると再計算します。");
}

function startAnimation(trace: DijkstraTrace): void {
  const context = elements.heatCanvas.getContext("2d");
  if (!context || !state.gridMeta) throw new Error("Canvasを初期化できません");
  stopAnimation();
  state.trace = trace;
  state.imageData = context.createImageData(
    state.gridMeta.cols,
    state.gridMeta.rows,
  );
  state.revealedCount = 0;
  state.animationStartedAt = performance.now();
  elements.pause.disabled = false;
  setStatus("最短距離の確定順を再生しています。");
  state.animationFrameId = requestAnimationFrame(renderAnimation);
}

function runFromPointer(event: PointerEvent): void {
  if (!state.gridMeta || !state.gridBytes) return;
  const bounds = elements.mapStage.getBoundingClientRect();
  const clickedCell = pointerToGridCell(
    event.clientX - bounds.left,
    event.clientY - bounds.top,
    bounds.width,
    bounds.height,
    state.gridMeta,
  );
  const startIndex = findNearestWalkableIndex(
    state.gridMeta,
    state.gridBytes,
    clickedCell.col,
    clickedCell.row,
  );
  const startCol = startIndex % state.gridMeta.cols;
  const startRow = Math.floor(startIndex / state.gridMeta.cols);
  const startedAt = performance.now();
  const trace = runDijkstraTrace(state.gridMeta, state.gridBytes, startIndex);
  const computeMs = performance.now() - startedAt;

  elements.originMarker.style.left = `${((startCol + 0.5) / state.gridMeta.cols) * 100}%`;
  elements.originMarker.style.top = `${((startRow + 0.5) / state.gridMeta.rows) * 100}%`;
  elements.originMarker.hidden = false;
  elements.startCell.textContent = `(${startCol}, ${startRow})`;
  elements.visitedCells.textContent = `0 / ${trace.visitedCount.toLocaleString()}`;
  elements.maxDistance.textContent = `${trace.maxDistance.toFixed(1)} px-cost`;
  elements.computeTime.textContent = `${computeMs.toFixed(2)} ms`;
  startAnimation(trace);
}

function togglePause(): void {
  if (!state.trace) return;
  if (!state.paused) {
    state.paused = true;
    state.pauseStartedAt = performance.now();
    if (state.animationFrameId !== null) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
    elements.pause.textContent = "再開";
    setStatus("一時停止中です。");
    return;
  }

  state.paused = false;
  state.accumulatedPauseMs += performance.now() - state.pauseStartedAt;
  state.pauseStartedAt = 0;
  elements.pause.textContent = "一時停止";
  setStatus("最短距離の確定順を再生しています。");
  state.animationFrameId = requestAnimationFrame(renderAnimation);
}

function restartAnimationAtSelectedSpeed(): void {
  if (!state.trace) return;
  const trace = state.trace;
  startAnimation(trace);
}

elements.mapStage.addEventListener("pointerdown", (event) => {
  try {
    runFromPointer(event);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
});
elements.pause.addEventListener("click", togglePause);
elements.reset.addEventListener("click", clearHeatmap);
elements.speed.addEventListener("change", restartAnimationAtSelectedSpeed);

loadW12Area().catch((error: unknown) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});
