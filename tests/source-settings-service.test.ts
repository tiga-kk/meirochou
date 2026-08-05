import { beforeEach, describe, expect, it } from "vitest";
import {
  LocalStorageCircleDataSourceSettings,
} from "../apps/webapp/js/features/circle-data-source/infrastructure/local-storage-circle-data-source-settings";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  shouldFailSet = false;
  shouldFailGet = false;

  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    if (this.shouldFailGet) throw new Error("Storage get failed");
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.shouldFailSet) throw new Error("Storage write failed");
    this.store.set(key, value);
  }
}

describe("LocalStorageCircleDataSourceSettings", () => {
  let memoryStorage: MemoryStorage;
  let settingsService: LocalStorageCircleDataSourceSettings;

  beforeEach(() => {
    memoryStorage = new MemoryStorage();
    settingsService = new LocalStorageCircleDataSourceSettings(memoryStorage);
  });

  it("returns empty object when storage is empty", () => {
    const loaded = settingsService.load();
    expect(loaded).toEqual({});
  });

  it("saves and loads valid circle data source settings", () => {
    const settings = {
      gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
      selectedSheetName: "Day1",
    };
    settingsService.save(settings);

    const loaded = settingsService.load();
    expect(loaded).toEqual(settings);
  });

  it("handles corrupted JSON gracefully without crashing", () => {
    memoryStorage.setItem("comipath:source-settings", "{ invalid json }");
    const loaded = settingsService.load();
    expect(loaded).toEqual({});
  });

  it("handles non-object JSON payloads gracefully", () => {
    memoryStorage.setItem("comipath:source-settings", JSON.stringify("string-payload"));
    const loaded = settingsService.load();
    expect(loaded).toEqual({});
  });

  it("ignores non-string properties in storage payload", () => {
    memoryStorage.setItem(
      "comipath:source-settings",
      JSON.stringify({ gasUrl: 12345, selectedSheetName: true }),
    );
    const loaded = settingsService.load();
    expect(loaded.gasUrl).toBeUndefined();
    expect(loaded.selectedSheetName).toBeUndefined();
  });

  it("safely handles storage read exception during load", () => {
    memoryStorage.shouldFailGet = true;
    const loaded = settingsService.load();
    expect(loaded).toEqual({});
  });

  it("safely handles storage write exception during save without throwing", () => {
    memoryStorage.shouldFailSet = true;
    expect(() => {
      settingsService.save({
        gasUrl: "https://script.google.com/macros/s/test/exec",
      });
    }).not.toThrow();
  });
});
