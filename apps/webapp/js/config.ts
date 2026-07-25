import type { MapBundleAreaV1 } from "./types/domain";

export type AreaDefinition = MapBundleAreaV1;

let areaDefinitions: readonly AreaDefinition[] = Object.freeze([]);
let areasInitialized = false;

function freezeArea(area: AreaDefinition): AreaDefinition {
  return Object.freeze({
    ...area,
    prefixes: Object.freeze([...area.prefixes]),
    labels: Object.freeze([...area.labels]),
  });
}

export const Config = {
  /** Runtime-validated areas. Empty until the map manifest has loaded. */
  get AREAS(): readonly AreaDefinition[] {
    return areaDefinitions;
  },

  /** Install validated map areas once before any application controller is created. */
  initializeAreas(areas: readonly AreaDefinition[]): void {
    if (areasInitialized) throw new Error("Map areas are already initialized");
    Config.replaceAreas(areas);
    areasInitialized = true;
  },

  /** Replace validated map areas when the active event map changes. */
  replaceAreas(areas: readonly AreaDefinition[]): void {
    if (areas.length === 0) throw new Error("Map areas must not be empty");
    areaDefinitions = Object.freeze(areas.map(freezeArea));
  },

  STORAGE_KEYS: {
    PURCHASED: "purchasedList",
    HOLD: "holdList",
    HISTORY: "actionHistory",
    DATA: "comiketData",
    URL: "webAppURL",
    SYNC_QUEUE: "syncQueue",
    SELECTED_SHEETS: "selectedSheets",
    REDO_STACK: "redoStack",
  },
} as const;
