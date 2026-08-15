import { parseSpace } from "./space-parser";

export interface WallClassifiablePoint {
  readonly group_id?: unknown;
  readonly identifier?: unknown;
}

/** Derives wall identifiers from one map area's W_* point metadata. */
export function collectWallIdentifiers(
  points: readonly WallClassifiablePoint[],
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const point of points) {
    if (
      typeof point.group_id === "string" &&
      point.group_id.startsWith("W_") &&
      typeof point.identifier === "string" &&
      point.identifier.trim()
    ) {
      result.add(point.identifier.trim());
    }
  }
  return result;
}

/** Resolves a circle's derived queue class without changing the circle. */
export function resolveCircleQueueClass(
  space: string,
  wallIdentifiers: ReadonlySet<string>,
): "normal" | "wall" {
  const [, identifier] = parseSpace(space);
  return identifier && wallIdentifiers.has(identifier) ? "wall" : "normal";
}
