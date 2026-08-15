import type { EventDayRef } from "../../event-day/public-api";
import {
  buildXPostCacheKey,
  type XPostCache,
  type XPostCacheEntry,
} from "../domain/x-post-cache-model";

export const X_POST_CACHE_DB_NAME = "comipath-x-posts-v1";
export const X_POST_CACHE_STORE_NAME = "accountDays";

export class BrowserIndexedDbXPostCache implements XPostCache {
  private readonly indexedDB: IDBFactory | undefined;
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  constructor(options: { readonly indexedDB?: IDBFactory } = {}) {
    this.indexedDB = options.indexedDB ?? globalThis.indexedDB;
  }

  async get(ref: EventDayRef, handle: string): Promise<XPostCacheEntry | null> {
    const db = await this.open();
    return (await this.request<XPostCacheEntry | undefined>(
      db.transaction(X_POST_CACHE_STORE_NAME, "readonly").objectStore(X_POST_CACHE_STORE_NAME).get(buildXPostCacheKey(ref, handle)),
    )) ?? null;
  }

  async put(entry: XPostCacheEntry): Promise<void> {
    const db = await this.open();
    await this.transaction(db, "readwrite", (store) => { store.put(entry); });
  }

  async deleteEventDay(ref: EventDayRef): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(X_POST_CACHE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(X_POST_CACHE_STORE_NAME);
    const entries = await this.request<XPostCacheEntry[]>(store.getAll());
    for (const entry of entries) {
      if (entry.eventId === ref.eventId && entry.dayId === ref.dayId) store.delete(entry.key);
    }
    await this.transactionDone(transaction);
  }

  async clear(): Promise<void> {
    const db = await this.open();
    await this.transaction(db, "readwrite", (store) => { store.clear(); });
  }

  dispose(): void {
    this.opening = null;
    this.db?.close();
    this.db = null;
  }

  private open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening;
    if (!this.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable"));
    this.opening = new Promise((resolve, reject) => {
      const request = this.indexedDB!.open(X_POST_CACHE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(X_POST_CACHE_STORE_NAME)) {
          request.result.createObjectStore(X_POST_CACHE_STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.opening = null;
        resolve(this.db);
      };
      request.onerror = () => {
        this.opening = null;
        reject(request.error ?? new Error("IndexedDB open failed"));
      };
    });
    return this.opening;
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    });
  }

  private transaction(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => void,
  ): Promise<void> {
    const transaction = db.transaction(X_POST_CACHE_STORE_NAME, mode);
    action(transaction.objectStore(X_POST_CACHE_STORE_NAME));
    return this.transactionDone(transaction);
  }

  private transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
  }
}
