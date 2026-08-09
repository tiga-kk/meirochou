export interface ContainedImageLayout {
  width: number;
  height: number;
  scale: number;
}

export function calculateContainedImageLayout(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): ContainedImageLayout {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return { width: 0, height: 0, scale: 1 };
  }
  const scale = Math.min(
    containerWidth / imageWidth,
    containerHeight / imageHeight,
  );
  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
    scale,
  };
}

export function getPinSourceSize(): { width: number; height: number } {
  return { width: 32, height: 32 };
}

export function getRouteStartSpaceForMap(
  startSpace: string,
  targetSpace: string,
): string {
  if (!startSpace || !targetSpace) return "";
  const startArea = startSpace.slice(0, 1);
  const targetArea = targetSpace.slice(0, 1);
  return startArea === targetArea ? startSpace : "";
}
