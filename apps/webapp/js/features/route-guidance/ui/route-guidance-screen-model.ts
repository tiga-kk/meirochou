import type { Circle } from "../../event-day/public-api";
import type { RouteResult } from "../domain/routing/grid-route-types";

export interface RouteGuidanceScreenModelInput {
  readonly currentDestination: Circle | null;
  readonly nextDestination: Circle | null;
  readonly startSpace: string;
}

export interface RouteGuidanceScreenModel {
  readonly statusLabel: string;
  readonly space: string;
  readonly distanceLabel: string;
  readonly priorityLabel: string;
  readonly sheetNameLabel: string;
  readonly nextLabel: string;
  readonly accountLabel: string;
  readonly accountUrl: string;
  readonly catalogUrl: string;
  readonly hasCatalogImage: boolean;
}

function normalizeExternalUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function normalizeCatalogImageUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") return "";
  if (value.startsWith("data:image/")) return value;
  return normalizeExternalUrl(value);
}

export function formatRouteDistance(
  route: Pick<RouteResult, "cost" | "physicalPixelLength">,
  metersPerPixel?: number,
): string {
  const hasScale =
    typeof metersPerPixel === "number" &&
    Number.isFinite(metersPerPixel) &&
    metersPerPixel > 0;
  if (hasScale && Number.isFinite(route.physicalPixelLength)) {
    return `約 ${Math.round(route.physicalPixelLength * metersPerPixel)} m`;
  }
  if (hasScale) return "距離 -";
  return Number.isFinite(route.cost)
    ? `距離 ${Math.round(route.cost)}`
    : "距離 -";
}

function formatDistance(circle: Circle, startSpace: string): string {
  const distance = Number(circle.gridDistance);
  const fallbackDistance = calculateFallbackDistance(startSpace, circle.space);
  const resolvedDistance = Number.isFinite(distance)
    ? distance
    : fallbackDistance;
  if (!Number.isFinite(resolvedDistance)) return "距離 -";
  const rounded = Math.round(resolvedDistance);
  return rounded >= 10000 ? "別エリア" : `距離 ${rounded}`;
}

function calculateFallbackDistance(
  startSpace: string,
  targetSpace: string,
): number {
  if (startSpace.length < 2 || targetSpace.length < 2) return Number.NaN;
  if (startSpace[0] !== targetSpace[0]) return 10000;
  const startLabel = startSpace[1];
  const targetLabel = targetSpace[1];
  const startNumber = Number.parseInt(startSpace.slice(2), 10) || 0;
  const targetNumber = Number.parseInt(targetSpace.slice(2), 10) || 0;
  const normalizedStart = startNumber > 32 ? 64 - startNumber : startNumber;
  const normalizedTarget = targetNumber > 32 ? 64 - targetNumber : targetNumber;
  return (
    Math.abs(startLabel.charCodeAt(0) - targetLabel.charCodeAt(0)) * 7 +
    Math.abs(normalizedStart - normalizedTarget)
  );
}

/** Builds route guidance text while keeping DOM and browser concerns outside the feature. */
export function buildRouteGuidanceScreenModel(
  input: RouteGuidanceScreenModelInput,
): RouteGuidanceScreenModel {
  const target = input.currentDestination;
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

  const accountUrl = normalizeExternalUrl(target.account);
  const catalogUrl = normalizeCatalogImageUrl(target.tweet);
  const accountName = accountUrl.replace(/\/$/, "").split("/").pop() ?? "";

  return {
    statusLabel: "次の目的地",
    space: target.space,
    distanceLabel: formatDistance(target, input.startSpace),
    priorityLabel: `優先度 ${target.priority || "通常"}`,
    sheetNameLabel: target.sheetName ? `シート: ${target.sheetName}` : "",
    nextLabel: input.nextDestination
      ? `次 ${input.nextDestination.space}`
      : "次 なし",
    accountLabel: accountName ? `@${accountName}` : "",
    accountUrl,
    catalogUrl,
    hasCatalogImage: Boolean(catalogUrl),
  };
}
