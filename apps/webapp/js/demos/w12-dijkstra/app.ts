import {
  parseEventMapBundleManifest,
  parseGridMeta,
} from "../../types/boundary-parsers";
import type { GridMeta } from "../../types/domain";
import { resolveBundleAssetUrl } from "./asset-url";
import {
  distanceToColor,
  findNearestWalkableIndex,
  pointerToGridCell,
  revealCountAtTime,
  runDijkstraTrace,
  type DijkstraTrace,
} from "./core";
import { normalizeZoomPercent } from "./view-controls";

const MANIFEST_PATH = "/assets/maps/C108/manifest.json";

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

const ui = {
  stage: element<HTMLDivElement>("#mapStage"),
  map: element<HTMLImageElement>("#mapImage"),
  canvas: element<HTMLCanvasElement>("#heatCanvas"),
  marker: element<HTMLSpanElement>("#originMarker"),
  status: element<HTMLParagraphElement>("#statusText"),
  speed: element<HTMLSelectElement>("#speedSelect"),
  zoomRange: element<HTMLInputElement>("#zoomRange"),
  zoomOutput: element<HTMLOutputElement>("#zoomOutput"),
  pause: element<HTMLButtonElement>("#pauseButton"),
  reset: element<HTMLButtonElement>("#resetButton"),
  startCell: element<HTMLElement>("#startCell"),
  visited: element<HTMLElement>("#visitedCells"),
  maxDistance: element<HTMLElement>("#maxDistance"),
  computeTime: element<HTMLElement>("#computeTime"),
};

const state: {
  meta: GridMeta | null;
  grid: Uint8Array | null;
  trace: DijkstraTrace | null;
  pixels: ImageData | null;
  revealed: number;
  frame: number | null;
  startedAt: number;
  pausedAt: number;
  pauseTotal: number;
  paused: boolean;
} = {
  meta: null,
  grid: null,
  trace: null,
  pixels: null,
  revealed: 0,
  frame: null,
  startedAt: 0,
  pausedAt: 0,
  pauseTotal: 0,
  paused: false,
};

function setStatus(message: string, isError = false): void {
  ui.status.textContent = message;
  ui.status.dataset.state = isError ? "error" : "normal";
}

function applyZoom(value: number): void {
  const zoomPercent = normalizeZoomPercent(value);
  ui.zoomRange.value = String(zoomPercent);
  ui.zoomOutput.value = `${zoomPercent}%`;
  ui.stage.style.width = `${zoomPercent}%`;
}

async function fetchJson(url: string, label: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${label}の取得に失敗しました (${response.status})`);
  }
  return response.json();
}

async function loadW12(): Promise<void> {
  const manifest = parseEventMapBundleManifest(
    await fetchJson(MANIFEST_PATH, "C108 manifest.json"),
  );
  const area = manifest.areas.find((candidate) => candidate.areaId === "w12");
  if (!area) throw new Error("C108 manifest.jsonにW12がありません");

  const assetUrl = (path: string) =>
    resolveBundleAssetUrl(MANIFEST_PATH, path, window.location.href);
  const [metaJson, gridResponse] = await Promise.all([
    fetchJson(assetUrl(area.assets.gridMeta), "W12 grid-meta.json"),
    fetch(assetUrl(area.assets.grid), { cache: "no-store" }),
  ]);
  if (!gridResponse.ok) {
    throw new Error(`W12 grid.binの取得に失敗しました (${gridResponse.status})`);
  }

  state.meta = parseGridMeta(metaJson);
  state.grid = new Uint8Array(await gridResponse.arrayBuffer());
  if (state.grid.length !== state.meta.cols * state.meta.rows) {
    throw new Error("W12 grid.binのセル数がgrid-meta.jsonと一致しません");
  }

  ui.map.src = assetUrl(area.assets.svg);
  ui.stage.style.aspectRatio = `${state.meta.width} / ${state.meta.height}`;
  ui.canvas.width = state.meta.cols;
  ui.canvas.height = state.meta.rows;
  applyZoom(Number(ui.zoomRange.value));
  ui.stage.hidden = false;
  ui.reset.disabled = false;
  setStatus("地図上の通路をクリックしてください。");
}

function stopAnimation(): void {
  if (state.frame !== null) cancelAnimationFrame(state.frame);
  state.frame = null;
  state.paused = false;
  state.pausedAt = 0;
  state.pauseTotal = 0;
  ui.pause.textContent = "一時停止";
}

function clearHeatmap(): void {
  stopAnimation();
  ui.canvas
    .getContext("2d")
    ?.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
  state.trace = null;
  state.pixels = null;
  state.revealed = 0;
  ui.marker.hidden = true;
  ui.startCell.textContent = "—";
  ui.visited.textContent = "—";
  ui.maxDistance.textContent = "—";
  ui.computeTime.textContent = "—";
  ui.pause.disabled = true;
  if (state.meta) setStatus("地図上の通路をクリックしてください。");
}

function paint(from: number, to: number): void {
  if (!state.trace || !state.pixels) return;
  for (let cursor = from; cursor < to; cursor += 1) {
    const index: number = state.trace.settledOrder[cursor];
    const color = distanceToColor(
      state.trace.distances[index],
      state.trace.maxDistance,
    );
    const offset = index * 4;
    state.pixels.data.set([color.r, color.g, color.b, color.a], offset);
  }
}

function animate(timestamp: number): void {
  if (!state.trace || !state.pixels || state.paused) return;
  const count = revealCountAtTime(
    timestamp - state.startedAt - state.pauseTotal,
    Number(ui.speed.value),
    state.trace.visitedCount,
  );
  paint(state.revealed, count);
  state.revealed = count;
  ui.canvas.getContext("2d")?.putImageData(state.pixels, 0, 0);
  ui.visited.textContent = `${count.toLocaleString()} / ${state.trace.visitedCount.toLocaleString()}`;

  if (count < state.trace.visitedCount) {
    state.frame = requestAnimationFrame(animate);
  } else {
    state.frame = null;
    ui.pause.disabled = true;
    setStatus("探索完了。別の地点をクリックすると再計算します。");
  }
}

function play(trace: DijkstraTrace): void {
  if (!state.meta) return;
  const context = ui.canvas.getContext("2d");
  if (!context) throw new Error("Canvasを初期化できません");
  stopAnimation();
  state.trace = trace;
  state.pixels = context.createImageData(state.meta.cols, state.meta.rows);
  state.revealed = 0;
  state.startedAt = performance.now();
  ui.pause.disabled = false;
  setStatus("最短距離の確定順を再生しています。");
  state.frame = requestAnimationFrame(animate);
}

function runFromClick(event: PointerEvent): void {
  if (!state.meta || !state.grid) return;
  const bounds = ui.stage.getBoundingClientRect();
  const cell = pointerToGridCell(
    event.clientX - bounds.left,
    event.clientY - bounds.top,
    bounds.width,
    bounds.height,
    state.meta,
  );
  const startIndex = findNearestWalkableIndex(
    state.meta,
    state.grid,
    cell.col,
    cell.row,
  );
  const startedAt = performance.now();
  const trace = runDijkstraTrace(state.meta, state.grid, startIndex);
  const col = startIndex % state.meta.cols;
  const row = Math.floor(startIndex / state.meta.cols);

  ui.marker.style.left = `${((col + 0.5) / state.meta.cols) * 100}%`;
  ui.marker.style.top = `${((row + 0.5) / state.meta.rows) * 100}%`;
  ui.marker.hidden = false;
  ui.startCell.textContent = `(${col}, ${row})`;
  ui.visited.textContent = `0 / ${trace.visitedCount.toLocaleString()}`;
  ui.maxDistance.textContent = `${trace.maxDistance.toFixed(1)} px-cost`;
  ui.computeTime.textContent = `${(performance.now() - startedAt).toFixed(2)} ms`;
  play(trace);
}

function togglePause(): void {
  if (!state.trace) return;
  if (!state.paused) {
    state.paused = true;
    state.pausedAt = performance.now();
    if (state.frame !== null) cancelAnimationFrame(state.frame);
    state.frame = null;
    ui.pause.textContent = "再開";
    setStatus("一時停止中です。");
    return;
  }

  state.paused = false;
  state.pauseTotal += performance.now() - state.pausedAt;
  ui.pause.textContent = "一時停止";
  setStatus("最短距離の確定順を再生しています。");
  state.frame = requestAnimationFrame(animate);
}

ui.stage.addEventListener("pointerdown", (event) => {
  try {
    runFromClick(event);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
});
ui.pause.addEventListener("click", togglePause);
ui.reset.addEventListener("click", clearHeatmap);
ui.speed.addEventListener("change", () => {
  if (state.trace) play(state.trace);
});
ui.zoomRange.addEventListener("input", () => {
  applyZoom(Number(ui.zoomRange.value));
});

loadW12().catch((error: unknown) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});
