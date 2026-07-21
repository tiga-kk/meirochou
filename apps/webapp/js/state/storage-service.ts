export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const fallbackStorage = new Map<string, string>();

function getStorage(): StorageAdapter {
  try {
    if (
      typeof localStorage !== "undefined" &&
      typeof localStorage.getItem === "function" &&
      typeof localStorage.setItem === "function" &&
      typeof localStorage.removeItem === "function"
    ) {
      return localStorage;
    }
  } catch {
    // Some embedded browsers expose the property but block access.
  }

  return {
    getItem: (key) => fallbackStorage.get(key) ?? null,
    setItem: (key, value) => {
      fallbackStorage.set(key, value);
    },
    removeItem: (key) => {
      fallbackStorage.delete(key);
    },
  };
}

export class StorageService {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter = getStorage()) {
    this.storage = storage;
  }

  getJson<T>(key: string, fallback: T): T {
    const raw = this.storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }

  setJson<T>(key: string, value: T): void {
    this.storage.setItem(key, JSON.stringify(value));
  }

  getString(key: string, fallback = ""): string {
    return this.storage.getItem(key) || fallback;
  }

  setString(key: string, value: string): void {
    this.storage.setItem(key, value);
  }

  remove(key: string): void {
    this.storage.removeItem(key);
  }
}
