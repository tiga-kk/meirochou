import type { MapArea } from "../domain/map-area";
import { InMemoryMapAreaCatalog } from "./in-memory-map-area-catalog";

function normalizeMapAreas(
  areas: readonly Record<string, unknown>[],
): readonly MapArea[] {
  return areas.map((area) =>
    Object.freeze({
      ...area,
      areaId: typeof area.id === "string" ? area.id : area.areaId,
      displayName: typeof area.name === "string" ? area.name : area.displayName,
      prefixes: Array.isArray(area.prefixes) ? area.prefixes : [],
      labels: Object.freeze(Array.isArray(area.labels) ? area.labels : []),
      assets:
        area.assets && typeof area.assets === "object"
          ? area.assets
          : typeof area.pointsFile === "string" &&
              typeof area.gridMetaFile === "string" &&
              typeof area.gridFile === "string"
            ? {
                points: area.pointsFile,
                gridMeta: area.gridMetaFile,
                grid: area.gridFile,
              }
            : undefined,
    }),
  ) as readonly MapArea[];
}

/** Runtime map-area owner shared by the legacy renderers during migration. */
const catalog = new InMemoryMapAreaCatalog();

export const runtimeMapAreaCatalog = {
  getAllMapAreas: () => catalog.getAllMapAreas(),
  getMapArea: (areaId: string) => catalog.getMapArea(areaId),
  findMapAreaForCircleSpace: (space: string) =>
    catalog.findMapAreaForCircleSpace(space),
  initializeMapAreas: (areas: readonly Record<string, unknown>[]) => {
    if (catalog.getAllMapAreas().length > 0)
      throw new Error("Map areas are already initialized");
    catalog.initializeMapAreas(normalizeMapAreas(areas));
  },
  replaceMapAreas: (areas: readonly Record<string, unknown>[]) =>
    catalog.replaceMapAreas(normalizeMapAreas(areas)),
};
