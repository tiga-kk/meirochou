import type { MapArea, MapAreaCatalog } from "../domain/map-area";

export class InMemoryMapAreaCatalog implements MapAreaCatalog {
  private areas: readonly MapArea[] = [];

  constructor(initialAreas: readonly MapArea[] = []) {
    this.areas = Object.freeze([...initialAreas]);
  }

  getAllMapAreas(): readonly MapArea[] {
    return this.areas;
  }

  getMapArea(areaId: string): MapArea | null {
    return this.areas.find((a) => a.areaId === areaId) ?? null;
  }

  findMapAreaForCircleSpace(circleSpace: string): MapArea | null {
    const exact = this.areas.find((a) => a.circleSpaces?.includes(circleSpace));
    if (exact) return exact;

    const cleaned = circleSpace.trim();
    if (cleaned.length < 2) return null;
    const prefix = cleaned[0];
    const label = cleaned[1];
    return (
      this.areas.find(
        (area) =>
          area.prefixes?.includes(prefix) && area.labels?.includes(label),
      ) ?? null
    );
  }

  initializeMapAreas(areas: readonly MapArea[]): void {
    if (this.areas.length === 0) {
      this.areas = Object.freeze([...areas]);
    }
  }

  replaceMapAreas(areas: readonly MapArea[]): void {
    this.areas = Object.freeze([...areas]);
  }
}
