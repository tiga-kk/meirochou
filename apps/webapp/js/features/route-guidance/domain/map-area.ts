export interface MapArea {
  readonly areaId: string;
  readonly displayName?: string;
  readonly circleSpaces?: readonly string[];
}

export interface MapAreaCatalog {
  getAllMapAreas(): readonly MapArea[];
  getMapArea(areaId: string): MapArea | null;
  findMapAreaForCircleSpace(circleSpace: string): MapArea | null;
  initializeMapAreas(areas: readonly MapArea[]): void;
  replaceMapAreas(areas: readonly MapArea[]): void;
}
