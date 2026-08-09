import type { Circle, MapPoint } from "../../event-day/public-api";

interface ImageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface PointsPayload {
  image?: { width?: number; height?: number };
  points?: readonly {
    identifier?: unknown;
    number?: unknown;
    center_x?: unknown;
    center_y?: unknown;
  }[];
}
type Padding = number | { x?: number; y?: number };
type PinState = "todo" | "done" | "hold" | "next" | "selected" | "start";

export interface MapPin extends MapPoint {
  circle: Circle | null;
  space: string;
  state: PinState;
  baseState: PinState;
}
interface BuildMapPinsOptions {
  currentTargetSpace?: string;
  selectedSpace?: string;
  startSpace?: string;
  purchasedList?: readonly string[];
  holdList?: readonly string[];
  positionOverrides?: Map<string, MapPoint>;
  pointIndex?: Map<string, MapPoint[]>;
  requireIndexedPositions?: boolean;
}

export function normalizeExternalUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function buildSpaceFromLocation(input: {
  areaName: unknown;
  label: unknown;
  number: unknown;
}): string | null {
  const area = typeof input.areaName === "string" ? input.areaName.trim() : "";
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const number = Number(input.number);
  if (!area || !label || !Number.isInteger(number) || number < 1 || number > 99)
    return null;
  return `${area[0]}${label[0]}${number}`;
}

export function calculateContainedImageBox(input: {
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
}): ImageBox {
  const { containerWidth, containerHeight, imageWidth, imageHeight } = input;
  const containerRatio = containerWidth / containerHeight;
  const imageRatio = imageWidth / imageHeight;
  if (imageRatio > containerRatio) {
    const width = containerWidth;
    const height = width / imageRatio;
    return { left: 0, top: (containerHeight - height) / 2, width, height };
  }
  const height = containerHeight;
  const width = height * imageRatio;
  return { left: (containerWidth - width) / 2, top: 0, width, height };
}

export function calculateMapPinSize(input: {
  imageWidth: number;
  renderedWidth: number;
  sourceSize: number;
  minSize?: number;
}): number {
  const min =
    Number.isFinite(input.minSize) && (input.minSize ?? 0) > 0
      ? (input.minSize ?? 2)
      : 2;
  if (
    ![input.imageWidth, input.renderedWidth, input.sourceSize].every(
      Number.isFinite,
    ) ||
    input.imageWidth <= 0 ||
    input.renderedWidth <= 0 ||
    input.sourceSize <= 0
  )
    return min;
  return Math.max(
    min,
    input.sourceSize * (input.renderedWidth / input.imageWidth),
  );
}

export function calculateNativeImageScale(input: {
  imageWidth: number;
  renderedWidth: number;
  minimumScale?: number;
  maximumScale?: number;
}): number {
  const min =
    Number.isFinite(input.minimumScale) && (input.minimumScale ?? 0) > 0
      ? (input.minimumScale ?? 5)
      : 5;
  const max =
    Number.isFinite(input.maximumScale) && (input.maximumScale ?? 0) >= min
      ? (input.maximumScale ?? min)
      : 16;
  if (
    !Number.isFinite(input.imageWidth) ||
    !Number.isFinite(input.renderedWidth) ||
    input.imageWidth <= 0 ||
    input.renderedWidth <= 0
  )
    return min;
  return Math.max(min, Math.min(max, input.imageWidth / input.renderedWidth));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
function parseSpace(space: string): { label: string; number: number } {
  const match = /^.([A-Za-zぁ-んァ-ン])([0-9]+)/.exec(space);
  return { label: match?.[1] ?? "", number: Number(match?.[2] ?? 0) };
}
function pointKey(identifier: unknown, number: unknown): string {
  const n = Number.parseInt(String(number), 10);
  return identifier && Number.isFinite(n) ? `${identifier}:${n}` : "";
}

export function calculateFitTransform(input: {
  containerWidth: number;
  containerHeight: number;
  contentBox: ImageBox | null;
  points: MapPoint[];
  padding?: Padding;
  minScale?: number;
  maxScale?: number;
}): { scale: number; x: number; y: number } {
  const minScale = Number.isFinite(input.minScale) ? (input.minScale ?? 1) : 1;
  const maxScale = Math.max(
    minScale,
    Number.isFinite(input.maxScale) ? (input.maxScale ?? minScale) : minScale,
  );
  const fallback = { scale: minScale, x: 0, y: 0 };
  const box = input.contentBox;
  if (
    input.containerWidth <= 0 ||
    input.containerHeight <= 0 ||
    !box ||
    box.width <= 0 ||
    box.height <= 0 ||
    input.points.length < 2
  )
    return fallback;
  const points = input.points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({
      x: box.left + (box.width * p.x) / 100,
      y: box.top + (box.height * p.y) / 100,
    }));
  if (points.length < 2) return fallback;
  const padding =
    typeof input.padding === "number"
      ? { x: Math.max(0, input.padding), y: Math.max(0, input.padding) }
      : {
          x: Math.max(0, input.padding?.x ?? 0),
          y: Math.max(0, input.padding?.y ?? 0),
        };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const availableWidth = input.containerWidth - padding.x * 2;
  const availableHeight = input.containerHeight - padding.y * 2;
  if (availableWidth <= 0 || availableHeight <= 0) return fallback;
  const scale = clamp(
    Math.min(
      maxX > minX ? availableWidth / (maxX - minX) : maxScale,
      maxY > minY ? availableHeight / (maxY - minY) : maxScale,
    ),
    minScale,
    maxScale,
  );
  return {
    scale,
    x: input.containerWidth / 2 - ((minX + maxX) / 2) * scale,
    y: input.containerHeight / 2 - ((minY + maxY) / 2) * scale,
  };
}

export function buildMapPointIndex(
  payload: PointsPayload,
): Map<string, MapPoint[]> {
  const width = Number(payload.image?.width);
  const height = Number(payload.image?.height);
  const result = new Map<string, MapPoint[]>();
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return result;
  for (const point of payload.points ?? []) {
    const key = pointKey(point.identifier, point.number);
    const x = Number(point.center_x);
    const y = Number(point.center_y);
    if (!key || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const list = result.get(key) ?? [];
    list.push({ x: (x / width) * 100, y: (y / height) * 100 });
    result.set(key, list);
  }
  return result;
}

export function getPinPosition(space: string): MapPoint {
  const { label, number } = parseSpace(space);
  const index =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンあいうえおかきくけこ".indexOf(
      label,
    );
  const safe = index < 0 ? 0 : index;
  return {
    x: clamp(10 + (safe % 8) * 10 + (number % 10) * 0.8, 8, 88),
    y: clamp(
      18 + (Math.floor(safe / 8) % 4) * 15 + Math.floor(number / 10) * 4,
      16,
      82,
    ),
  };
}

export function buildMapPins(
  circles: Circle[],
  options: BuildMapPinsOptions = {},
): MapPin[] {
  const selected = options.selectedSpace ?? "";
  const current = options.currentTargetSpace ?? selected;
  const preview = options.currentTargetSpace ? selected : "";
  const purchased = new Set(options.purchasedList ?? []);
  const hold = new Set(options.holdList ?? []);
  const seen = new Set<string>();
  const pins: MapPin[] = [];
  for (const circle of circles) {
    if (!circle?.space || seen.has(circle.space)) continue;
    seen.add(circle.space);
    const indexedPosition =
      options.positionOverrides?.get(circle.space) ??
      circle.mapPosition ??
      options.pointIndex?.get(
        pointKey(
          parseSpace(circle.space).label,
          parseSpace(circle.space).number,
        ),
      )?.[0];
    if (!indexedPosition && options.requireIndexedPositions) continue;
    const position = indexedPosition ?? getPinPosition(circle.space);
    const baseState: PinState = purchased.has(circle.space)
      ? "done"
      : hold.has(circle.space)
        ? "hold"
        : "todo";
    const state =
      circle.space === current
        ? "next"
        : circle.space === preview
          ? "selected"
          : baseState;
    pins.push({
      circle,
      space: circle.space,
      state,
      baseState,
      x: position.x,
      y: position.y,
    });
  }
  if (
    options.startSpace &&
    options.startSpace !== current &&
    options.startSpace !== preview &&
    !pins.some((pin) => pin.space === options.startSpace)
  ) {
    const indexedPosition =
      options.positionOverrides?.get(options.startSpace) ??
      options.pointIndex?.get(
        pointKey(
          parseSpace(options.startSpace).label,
          parseSpace(options.startSpace).number,
        ),
      )?.[0];
    if (indexedPosition || !options.requireIndexedPositions) {
      const position = indexedPosition ?? getPinPosition(options.startSpace);
      pins.push({
        circle: null,
        space: options.startSpace,
        state: "start",
        baseState: "start",
        x: position.x,
        y: position.y,
      });
    }
  }
  return pins;
}

export const getPinSourceSize = (state: PinState): number =>
  state === "next" ? 12 : state === "start" ? 10 : 8;
