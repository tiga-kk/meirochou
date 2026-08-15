import {
  collectCirclePriorities,
  normalizeCirclePriority,
} from "../../../shared/domain/circle-priority-filter";
import { parseSpace, type SpaceArea } from "../../../shared/domain/space-parser";
import {
  collectWallIdentifiers,
  resolveCircleQueueClass,
} from "../../../shared/domain/wall-circle-classification";

export type GalleryScope =
  | { readonly kind: "all-unvisited" }
  | { readonly kind: "area"; readonly areaId: string }
  | { readonly kind: "hold"; readonly areaId?: string };

export function galleryPriority(value: unknown): number | null {
  return normalizeCirclePriority(value);
}

export function collectGalleryPriorities(
  circles: readonly { priority?: unknown }[],
): number[] {
  return collectCirclePriorities(circles);
}

export interface GalleryLayoutPoint {
  readonly group_id?: string;
  readonly identifier: string;
  readonly number: string | number;
  readonly center_x: number;
  readonly center_y: number;
}

export interface GallerySortContext {
  readonly areas: readonly SpaceArea[];
  readonly pointsByAreaId: ReadonlyMap<string, readonly GalleryLayoutPoint[]>;
  readonly resolveAreaId: (space: string) => string | null;
}

interface GallerySortKey {
  readonly areaName: string;
  readonly anchorIdentifier: string;
  readonly anchorNumber: number;
  readonly wallRank: number;
  readonly distanceSquared: number;
  readonly originalIdentifier: string;
  readonly originalNumber: number;
  readonly originalSpace: string;
}

function spaceKey(space: string, areas: readonly SpaceArea[]): {
  readonly areaName: string;
  readonly identifier: string;
  readonly number: number;
} {
  const [areaName, identifier, number] = parseSpace(space, areas);
  return { areaName, identifier, number };
}

function compareSortKeys(left: GallerySortKey, right: GallerySortKey): number {
  return left.areaName.localeCompare(right.areaName) ||
    left.anchorIdentifier.localeCompare(right.anchorIdentifier) ||
    left.anchorNumber - right.anchorNumber ||
    left.wallRank - right.wallRank ||
    left.distanceSquared - right.distanceSquared ||
    left.originalIdentifier.localeCompare(right.originalIdentifier) ||
    left.originalNumber - right.originalNumber ||
    left.originalSpace.localeCompare(right.originalSpace);
}

/** Sorts gallery circles by space, anchoring wall circles to nearby normal points. */
export function sortGalleryCirclesByMapPosition<T extends { readonly space: string }>(
  circles: readonly T[],
  context: GallerySortContext,
): T[] {
  const keyed = circles.map((circle, index) => {
    const original = spaceKey(circle.space, context.areas);
    const areaId = context.resolveAreaId(circle.space);
    const points = areaId ? context.pointsByAreaId.get(areaId) ?? [] : [];
    const wallIdentifiers = collectWallIdentifiers(points);
    const isWall = resolveCircleQueueClass(circle.space, wallIdentifiers) === "wall";
    let key: GallerySortKey = {
      areaName: original.areaName,
      anchorIdentifier: original.identifier,
      anchorNumber: original.number,
      wallRank: 0,
      distanceSquared: 0,
      originalIdentifier: original.identifier,
      originalNumber: original.number,
      originalSpace: circle.space,
    };
    if (isWall) {
      const sourcePoints = points.filter(
        (point) => point.identifier === original.identifier && Number(point.number) === original.number,
      );
      const normalPoints = points.filter((point) => !wallIdentifiers.has(point.identifier));
      let nearest: { point: GalleryLayoutPoint; distanceSquared: number } | null = null;
      for (const source of sourcePoints) {
        for (const candidate of normalPoints) {
          const distanceSquared = (source.center_x - candidate.center_x) ** 2 +
            (source.center_y - candidate.center_y) ** 2;
          if (!nearest || distanceSquared < nearest.distanceSquared ||
            (distanceSquared === nearest.distanceSquared &&
              `${candidate.identifier}:${candidate.number}` < `${nearest.point.identifier}:${nearest.point.number}`)) {
            nearest = { point: candidate, distanceSquared };
          }
        }
      }
      if (nearest) {
        key = {
          ...key,
          anchorIdentifier: nearest.point.identifier,
          anchorNumber: Number(nearest.point.number),
          wallRank: 1,
          distanceSquared: nearest.distanceSquared,
        };
      }
    }
    return { circle, index, key };
  });
  return keyed
    .sort((left, right) => compareSortKeys(left.key, right.key) || left.index - right.index)
    .map(({ circle }) => circle);
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
