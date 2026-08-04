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
    return (
      this.areas.find((a) => a.circleSpaces?.includes(circleSpace)) ?? null
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
