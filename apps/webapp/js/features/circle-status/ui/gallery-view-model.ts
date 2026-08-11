export type GalleryScope =
  | { readonly kind: "all-unvisited" }
  | { readonly kind: "area"; readonly areaId: string }
  | { readonly kind: "hold"; readonly areaId?: string };

export function galleryPriority(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const priority = Number(value);
  return Number.isFinite(priority) ? priority : null;
}

export function collectGalleryPriorities(
  circles: readonly { priority?: unknown }[],
): number[] {
  return [
    ...new Set(
      circles
        .map((circle) => galleryPriority(circle.priority))
        .filter((priority): priority is number => priority !== null),
    ),
  ].sort((left, right) => right - left);
}

export function selectGalleryCircles<T extends { space: string }>(input: {
  scope: GalleryScope;
  unvisited: readonly T[];
  wantToBuy: readonly T[];
  holdSpaces: ReadonlySet<string>;
  resolveAreaId: (space: string) => string | null;
}): T[] {
  const { scope, unvisited, wantToBuy, holdSpaces, resolveAreaId } = input;
  if (scope.kind === "all-unvisited") return [...unvisited];

  const source =
    scope.kind === "hold"
      ? wantToBuy.filter((circle) => holdSpaces.has(circle.space))
      : unvisited;
  if (!scope.areaId) return [...source];
  return source.filter(
    (circle) => resolveAreaId(circle.space) === scope.areaId,
  );
}
