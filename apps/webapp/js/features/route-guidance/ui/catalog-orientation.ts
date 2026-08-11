export type CatalogOrientation = "portrait" | "landscape" | "square" | "none";

export function classifyCatalogOrientation(input: {
  width: number;
  height: number;
  tolerance?: number;
}): CatalogOrientation {
  const { width, height, tolerance = 0.12 } = input;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return "none";
  }

  const ratio = width / height;
  if (ratio <= 1 - tolerance) return "portrait";
  if (ratio >= 1 + tolerance) return "landscape";
  return "square";
}
