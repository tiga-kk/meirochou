import {
  type DistanceMatrixRepository,
  parseStoredDistanceMatrix,
  type StoredDistanceMatrix,
} from "./distance-matrix";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys?(): string[];
}

export class LocalStorageDistanceMatrixRepository
  implements DistanceMatrixRepository
{
  private readonly PREFIX = "comipath:matrix:";
  private readonly REF_PREFIX = "comipath:matrix-ref:";

  constructor(private readonly storage: StorageLike = localStorage) {}

  load(cacheKey: string): StoredDistanceMatrix | null {
    try {
      const raw = this.storage.getItem(this.PREFIX + cacheKey);
      if (!raw) return null;
      return parseStoredDistanceMatrix(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  save(matrix: StoredDistanceMatrix): boolean {
    try {
      this.storage.setItem(
        this.PREFIX + matrix.cacheKey,
        JSON.stringify(matrix),
      );
      return true;
    } catch {
      return false;
    }
  }

  saveWithRef(
    eventId: string,
    dayId: string,
    matrix: StoredDistanceMatrix,
  ): boolean {
    const saved = this.save(matrix);
    if (!saved) return false;

    try {
      const refKey = `${this.REF_PREFIX}${eventId}:${dayId}`;
      const existingRaw = this.storage.getItem(refKey);
      const keys: string[] = existingRaw ? JSON.parse(existingRaw) : [];
      if (!keys.includes(matrix.cacheKey)) {
        keys.push(matrix.cacheKey);
        this.storage.setItem(refKey, JSON.stringify(keys));
      }
      return true;
    } catch {
      return false;
    }
  }

  deleteByEventDay(eventId: string, dayId: string): void {
    try {
      const refKey = `${this.REF_PREFIX}${eventId}:${dayId}`;
      const existingRaw = this.storage.getItem(refKey);
      if (existingRaw) {
        const keys: string[] = JSON.parse(existingRaw);
        for (const cacheKey of keys) {
          this.storage.removeItem(this.PREFIX + cacheKey);
        }
        this.storage.removeItem(refKey);
      }
    } catch {
      // Ignore errors on delete
    }
  }
}
