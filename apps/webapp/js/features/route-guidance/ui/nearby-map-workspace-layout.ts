export type NearbyMapWorkspaceMode = "narrow" | "medium" | "wide";

export interface NearbyMapWorkspaceLayout {
  readonly mode: NearbyMapWorkspaceMode;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly cardColumns: 2 | 3;
  readonly initialMapScaleMode: "contain" | "bounded-cover";
}

export interface NearbyMapWorkspaceLayoutInput {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly controlsHeight: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function calculateNearbyMapWorkspaceLayout(
  input: NearbyMapWorkspaceLayoutInput,
): NearbyMapWorkspaceLayout {
  const width = isPositive(input.viewportWidth) ? input.viewportWidth : 390;
  const height = isPositive(input.viewportHeight) ? input.viewportHeight : 844;
  const controlsHeight = Number.isFinite(input.controlsHeight) && input.controlsHeight >= 0
    ? input.controlsHeight
    : 160;
  const imageWidth = isPositive(input.imageWidth) ? input.imageWidth : 1;
  const imageHeight = isPositive(input.imageHeight) ? input.imageHeight : 1;
  const availableHeight = Math.max(240, height - controlsHeight);
  const mode: NearbyMapWorkspaceMode =
    width >= 900 ? "wide" : width >= 600 ? "medium" : "narrow";

  let mapWidth = width;
  let mapHeight = availableHeight;
  let panelWidth = width;
  let panelHeight = 0;
  let cardColumns: 2 | 3 = mode === "medium" ? 3 : 2;

  if (mode === "wide") {
    panelWidth = Math.min(340, Math.max(280, Math.round(width * 0.31)));
    mapWidth = Math.max(1, width - panelWidth - 12);
    panelHeight = availableHeight;
    cardColumns = 2;
  } else {
    const mapRatio = mode === "medium" ? 0.62 : 0.55;
    mapHeight = Math.round(
      Math.min(availableHeight - 180, Math.max(mode === "medium" ? 400 : 320, availableHeight * mapRatio)),
    );
    mapHeight = Math.min(availableHeight, mapHeight);
    panelHeight = Math.max(1, availableHeight - mapHeight);
  }

  const containScale = Math.min(mapWidth / imageWidth, mapHeight / imageHeight);
  const occupiedWidth = containScale * imageWidth;
  const occupiedHeight = containScale * imageHeight;
  const occupiedShortSide = Math.min(
    occupiedWidth / mapWidth,
    occupiedHeight / mapHeight,
  );

  return {
    mode,
    mapWidth: Math.round(mapWidth),
    mapHeight: Math.round(mapHeight),
    panelWidth: Math.round(panelWidth),
    panelHeight: Math.round(panelHeight),
    cardColumns,
    initialMapScaleMode: occupiedShortSide < 0.8 ? "bounded-cover" : "contain",
  };
}
