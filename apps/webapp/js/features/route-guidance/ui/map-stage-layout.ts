export interface MapStageLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  imageWidth: number;
  imageHeight: number;
  minimumShortSideOccupancy?: number;
}

export interface MapStageLayout {
  viewportWidth: number;
  viewportHeight: number;
  stageWidth: number;
  stageHeight: number;
  initialX: number;
  initialY: number;
  mode: "contain" | "bounded-cover";
}

export function calculateMapStageLayout(
  input: MapStageLayoutInput,
): MapStageLayout | null {
  if (
    ![
      input.viewportWidth,
      input.viewportHeight,
      input.imageWidth,
      input.imageHeight,
    ].every((value) => Number.isFinite(value) && value > 0)
  ) {
    return null;
  }

  const minimumShortSideOccupancy = Number.isFinite(input.minimumShortSideOccupancy)
    ? Math.min(1, Math.max(0, input.minimumShortSideOccupancy ?? 0.8))
    : 0.8;
  const containScale = Math.min(
    input.viewportWidth / input.imageWidth,
    input.viewportHeight / input.imageHeight,
  );
  const containWidth = input.imageWidth * containScale;
  const containHeight = input.imageHeight * containScale;
  const shortSideOccupancy = Math.min(
    containWidth / input.viewportWidth,
    containHeight / input.viewportHeight,
  );
  const mode = shortSideOccupancy >= minimumShortSideOccupancy
    ? "contain"
    : "bounded-cover";
  const scale = mode === "contain"
    ? containScale
    : Math.max(
        containScale,
        minimumShortSideOccupancy * Math.max(
          input.viewportWidth / input.imageWidth,
          input.viewportHeight / input.imageHeight,
        ),
      );
  const stageWidth = input.imageWidth * scale;
  const stageHeight = input.imageHeight * scale;

  return {
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    stageWidth,
    stageHeight,
    initialX: (input.viewportWidth - stageWidth) / 2,
    initialY: (input.viewportHeight - stageHeight) / 2,
    mode,
  };
}
