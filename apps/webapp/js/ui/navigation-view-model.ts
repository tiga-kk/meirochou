import { TspSolver } from "../tsp-solver.js";
import type { Circle, MapPoint, PointsPayload } from "../types/domain";

interface ImageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PaddingSize {
  x: number;
  y: number;
}

type Padding = number | Partial<PaddingSize>;
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
  purchasedList?: string[];
  holdList?: string[];
  positionOverrides?: Map<string, MapPoint>;
  pointIndex?: Map<string, MapPoint[]>;
  requireIndexedPositions?: boolean;
}

/** Returns a safe absolute external URL or an empty string when unsupported. */
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

const LABEL_ORDER =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨあいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめabcdefghijklmnopqrstuvwxyz";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function labelIndex(label: string): number {
  const index = LABEL_ORDER.indexOf(label);
  return index >= 0 ? index : 0;
}

export function buildSpaceFromLocation({
  areaName,
  label,
  number,
}: {
  areaName: unknown;
  label: unknown;
  number: unknown;
}): string | null {
  const normalizedArea = typeof areaName === "string" ? areaName.trim() : "";
  const normalizedLabel = typeof label === "string" ? label.trim() : "";
  const normalizedNumber = Number(number);

  if (
    !normalizedArea ||
    !normalizedLabel ||
    !Number.isInteger(normalizedNumber) ||
    normalizedNumber < 1 ||
    normalizedNumber > 99
  ) {
    return null;
  }

  return `${normalizedArea[0]}${normalizedLabel[0]}${normalizedNumber}`;
}

export function calculateContainedImageBox({
  containerWidth,
  containerHeight,
  imageWidth,
  imageHeight,
}: {
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
}): ImageBox {
  const containerRatio = containerWidth / containerHeight;
  const imageRatio = imageWidth / imageHeight;

  if (imageRatio > containerRatio) {
    const width = containerWidth;
    const height = width / imageRatio;
    return {
      left: 0,
      top: (containerHeight - height) / 2,
      width,
      height,
    };
  }

  const height = containerHeight;
  const width = height * imageRatio;
  return {
    left: (containerWidth - width) / 2,
    top: 0,
    width,
    height,
  };
}

export function calculateMapPinSize({
  imageWidth,
  renderedWidth,
  sourceSize,
  minSize = 2,
}: {
  imageWidth: number;
  renderedWidth: number;
  sourceSize: number;
  minSize?: number;
}): number {
  const safeMinimum = Number.isFinite(minSize) && minSize > 0 ? minSize : 2;
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(renderedWidth) ||
    !Number.isFinite(sourceSize) ||
    imageWidth <= 0 ||
    renderedWidth <= 0 ||
    sourceSize <= 0
  ) {
    return safeMinimum;
  }

  return Math.max(safeMinimum, sourceSize * (renderedWidth / imageWidth));
}

export function calculateNativeImageScale({
  imageWidth,
  renderedWidth,
  minimumScale = 5,
  maximumScale = 16,
}: {
  imageWidth: number;
  renderedWidth: number;
  minimumScale?: number;
  maximumScale?: number;
}): number {
  const safeMinimum =
    Number.isFinite(minimumScale) && minimumScale > 0 ? minimumScale : 5;
  const safeMaximum =
    Number.isFinite(maximumScale) && maximumScale >= safeMinimum
      ? maximumScale
      : safeMinimum;

  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(renderedWidth) ||
    imageWidth <= 0 ||
    renderedWidth <= 0
  ) {
    return safeMinimum;
  }

  return clamp(imageWidth / renderedWidth, safeMinimum, safeMaximum);
}

function normalizePadding(padding: Padding): PaddingSize {
  if (typeof padding === "number") {
    return {
      x: Math.max(0, padding),
      y: Math.max(0, padding),
    };
  }

  return {
    x: Math.max(0, Number(padding?.x) || 0),
    y: Math.max(0, Number(padding?.y) || 0),
  };
}

function pointToLayerPixels(point: MapPoint, contentBox: ImageBox): MapPoint {
  return {
    x: contentBox.left + contentBox.width * (point.x / 100),
    y: contentBox.top + contentBox.height * (point.y / 100),
  };
}

export function calculateFitTransform({
  containerWidth,
  containerHeight,
  contentBox,
  points,
  padding = 48,
  minScale = 1,
  maxScale = 5,
}: {
  containerWidth: number;
  containerHeight: number;
  contentBox: ImageBox | null;
  points: MapPoint[];
  padding?: Padding;
  minScale?: number;
  maxScale?: number;
}): { scale: number; x: number; y: number } {
  const safeMinScale = Number.isFinite(minScale) ? minScale : 1;
  const safeMaxScale = Math.max(
    safeMinScale,
    Number.isFinite(maxScale) ? maxScale : safeMinScale,
  );
  const fallback = { scale: safeMinScale, x: 0, y: 0 };

  if (
    !Number.isFinite(containerWidth) ||
    !Number.isFinite(containerHeight) ||
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    !contentBox ||
    !Number.isFinite(contentBox.left) ||
    !Number.isFinite(contentBox.top) ||
    !Number.isFinite(contentBox.width) ||
    !Number.isFinite(contentBox.height) ||
    contentBox.width <= 0 ||
    contentBox.height <= 0 ||
    !Array.isArray(points) ||
    points.length < 2
  ) {
    return fallback;
  }

  const layerPoints = points
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map((point) => pointToLayerPixels(point, contentBox));

  if (layerPoints.length < 2) return fallback;

  const paddingSize = normalizePadding(padding);
  const availableWidth = containerWidth - paddingSize.x * 2;
  const availableHeight = containerHeight - paddingSize.y * 2;
  if (availableWidth <= 0 || availableHeight <= 0) return fallback;

  const xs = layerPoints.map((point) => point.x);
  const ys = layerPoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scaleX = spanX > 0 ? availableWidth / spanX : safeMaxScale;
  const scaleY = spanY > 0 ? availableHeight / spanY : safeMaxScale;
  const scale = clamp(Math.min(scaleX, scaleY), safeMinScale, safeMaxScale);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  let x = containerWidth / 2 - centerX * scale;
  let y = containerHeight / 2 - centerY * scale;

  const shiftIntoPadding = (
    currentOffset: number,
    minPoint: number,
    maxPoint: number,
    viewportSize: number,
    paddingAxis: number,
  ): number => {
    let nextOffset = currentOffset;
    const screenMin = minPoint * scale + nextOffset;
    const screenMax = maxPoint * scale + nextOffset;

    if (screenMin < paddingAxis) {
      nextOffset += paddingAxis - screenMin;
    }
    if (screenMax > viewportSize - paddingAxis) {
      nextOffset -= screenMax - (viewportSize - paddingAxis);
    }

    return nextOffset;
  };

  if (spanX * scale <= availableWidth) {
    x = shiftIntoPadding(x, minX, maxX, containerWidth, paddingSize.x);
  }
  if (spanY * scale <= availableHeight) {
    y = shiftIntoPadding(y, minY, maxY, containerHeight, paddingSize.y);
  }

  return { scale, x, y };
}

function pointKey(identifier: unknown, number: unknown): string {
  if (!identifier) return "";

  const normalizedNumber = Number.parseInt(String(number), 10);
  if (!Number.isFinite(normalizedNumber)) return "";

  return `${identifier}:${normalizedNumber}`;
}

export function buildMapPointIndex(
  payload: PointsPayload,
): Map<string, MapPoint[]> {
  const width = Number(payload?.image?.width);
  const height = Number(payload?.image?.height);
  const points = Array.isArray(payload?.points) ? payload.points : [];
  const index = new Map<string, MapPoint[]>();

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return index;
  }

  points.forEach((point) => {
    const key = pointKey(point?.identifier, point?.number);
    const centerX = Number(point?.center_x);
    const centerY = Number(point?.center_y);

    if (!key || !Number.isFinite(centerX) || !Number.isFinite(centerY)) return;

    const matches = index.get(key) || [];
    matches.push({
      x: (centerX / width) * 100,
      y: (centerY / height) * 100,
    });
    index.set(key, matches);
  });

  return index;
}

export function getPinPosition(space: string): MapPoint {
  const [, label, number] = TspSolver.parseSpace(space);
  const labelOffset = labelIndex(label);
  const blockColumn = labelOffset % 8;
  const blockRow = Math.floor(labelOffset / 8) % 4;
  const numberOffset = Number.isFinite(number) ? number : 0;

  return {
    x: clamp(10 + blockColumn * 10 + (numberOffset % 10) * 0.8, 8, 88),
    y: clamp(18 + blockRow * 15 + Math.floor(numberOffset / 10) * 4, 16, 82),
  };
}

function getMapPointPosition(
  space: string,
  pointIndex?: Map<string, MapPoint[]>,
): MapPoint | null {
  if (!pointIndex?.get) return null;

  const [, label, number] = TspSolver.parseSpace(space);
  const positions = pointIndex.get(pointKey(label, number));
  return Array.isArray(positions) ? positions[0] || null : positions || null;
}

export function formatTargetViewModel(
  target: Circle | null,
  startSpace = "",
  nextTarget: Circle | null = null,
) {
  if (!target) {
    return {
      statusLabel: "完了",
      space: "COMPLETE",
      distanceLabel: "-",
      priorityLabel: "-",
      sheetNameLabel: "",
      nextLabel: "次 なし",
      accountLabel: "",
      accountUrl: "",
      catalogUrl: "",
      hasCatalogImage: false,
    };
  }

  const gridDistance = Number(target.gridDistance);
  const hasGridDistance = Number.isFinite(gridDistance);
  const dist = hasGridDistance
    ? Math.round(gridDistance)
    : startSpace
      ? TspSolver.calcDist(startSpace, target.space)
      : null;

  const accountUrl = normalizeExternalUrl(target.account);

  return {
    statusLabel: "次の目的地",
    space: target.space,
    distanceLabel:
      dist === null ? "距離 -" : dist >= 10000 ? "別エリア" : `距離 ${dist}`,
    priorityLabel: `優先度 ${target.priority || "通常"}`,
    sheetNameLabel: target.sheetName ? `シート: ${target.sheetName}` : "",
    nextLabel: nextTarget ? `次 ${nextTarget.space}` : "次 なし",
    accountLabel: accountUrl
      ? `@${accountUrl.replace(/\/$/, "").split("/").pop()}`
      : "",
    accountUrl,
    catalogUrl: target.tweet || "",
    hasCatalogImage: Boolean(target.tweet),
  };
}

export function buildMapPins(
  circles: Circle[],
  options: BuildMapPinsOptions = {},
): MapPin[] {
  const selectedSpace = options.selectedSpace || "";
  const currentTargetSpace = options.currentTargetSpace ?? selectedSpace;
  const previewSpace = options.currentTargetSpace ? selectedSpace : "";
  const startSpace = options.startSpace || "";
  const purchased = new Set(options.purchasedList || []);
  const hold = new Set(options.holdList || []);
  const positionOverrides = options.positionOverrides;
  const seen = new Set<string>();

  const pins = circles.reduce<MapPin[]>((result, circle) => {
    if (!circle?.space || seen.has(circle.space)) return result;

    seen.add(circle.space);
    const indexedPosition =
      positionOverrides?.get?.(circle.space) ||
      circle.mapPosition ||
      getMapPointPosition(circle.space, options.pointIndex);
    if (!indexedPosition && options.requireIndexedPositions) return result;
    const position = indexedPosition || getPinPosition(circle.space);
    let baseState: PinState = "todo";
    if (purchased.has(circle.space)) {
      baseState = "done";
    } else if (hold.has(circle.space)) {
      baseState = "hold";
    }
    let state: PinState = baseState;
    if (circle.space === currentTargetSpace) {
      state = "next";
    } else if (circle.space === previewSpace) {
      state = "selected";
    }

    result.push({
      circle,
      space: circle.space,
      state,
      baseState,
      x: position.x,
      y: position.y,
    });

    return result;
  }, []);

  if (
    startSpace &&
    startSpace !== currentTargetSpace &&
    startSpace !== previewSpace
  ) {
    const existingPin = pins.find((pin) => pin.space === startSpace);
    if (existingPin) {
      existingPin.state = "start";
      existingPin.baseState = "start";
    } else {
      const indexedPosition =
        positionOverrides?.get?.(startSpace) ||
        getMapPointPosition(startSpace, options.pointIndex);
      if (!indexedPosition && options.requireIndexedPositions) return pins;
      const position = indexedPosition || getPinPosition(startSpace);
      pins.push({
        circle: null,
        space: startSpace,
        state: "start",
        baseState: "start",
        x: position.x,
        y: position.y,
      });
    }
  }

  return pins;
}
