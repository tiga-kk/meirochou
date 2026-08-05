const STORAGE_KEY = "comipath:source-settings";

export interface CircleDataSourceSettings {
  readonly gasUrl?: string;
  readonly selectedSheetName?: string;
}

export class LocalStorageCircleDataSourceSettings {
  constructor(private readonly storage: Storage) {}

  load(): CircleDataSourceSettings {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return {};
      return {
        gasUrl: typeof parsed.gasUrl === "string" ? parsed.gasUrl : undefined,
        selectedSheetName:
          typeof parsed.selectedSheetName === "string"
            ? parsed.selectedSheetName
            : undefined,
      };
    } catch {
      return {};
    }
  }

  save(settings: CircleDataSourceSettings): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage errors in browser environments where quota/access is restricted
    }
  }
}
