export interface SyncResult {
  synced: boolean;
  pending: number;
  error: Error | null;
}

interface JsonStorage {
  getJson<T>(key: string, fallback: T): T;
  setJson<T>(key: string, value: T): void;
}

interface SyncQueueItem<TPayload> {
  id: string;
  timestamp: number;
  payload: TPayload;
}

interface ProcessOptions<TPayload> {
  getUrl(): string;
  send(url: string, payload: TPayload): Promise<unknown>;
}

/** 永続化された更新を直列送信し、失敗分を次回再送のため保持する。 */
export class SyncQueue<TPayload> {
  private readonly storage: JsonStorage;
  private readonly storageKey: string;
  private readonly queue: SyncQueueItem<TPayload>[];
  private isProcessing = false;

  constructor(storage: JsonStorage, storageKey: string) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.queue = this.storage.getJson<SyncQueueItem<TPayload>[]>(
      this.storageKey,
      [],
    );
  }

  get items(): readonly SyncQueueItem<TPayload>[] {
    return this.queue;
  }

  enqueue(payload: TPayload): void {
    this.queue.push({
      id: Date.now() + Math.random().toString(36).substring(2),
      timestamp: Date.now(),
      payload,
    });
    this.persist();
  }

  async process({
    getUrl,
    send,
  }: ProcessOptions<TPayload>): Promise<SyncResult> {
    if (this.queue.length === 0) {
      return { synced: true, pending: 0, error: null };
    }
    if (this.isProcessing) {
      return {
        synced: false,
        pending: this.queue.length,
        error: new Error("同期処理がすでに実行中です"),
      };
    }

    const url = getUrl();
    if (!url) {
      return {
        synced: false,
        pending: this.queue.length,
        error: new Error("GAS URLが設定されていません"),
      };
    }

    this.isProcessing = true;
    let syncError: Error | null = null;

    try {
      while (this.queue.length > 0) {
        const item = this.queue[0];
        try {
          await send(url, item.payload);
          this.queue.shift();
          this.persist();
        } catch (e) {
          syncError = e instanceof Error ? e : new Error(String(e));
          console.error("Sync failed, retrying later:", e);
          break;
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return {
      synced: this.queue.length === 0,
      pending: this.queue.length,
      error: syncError,
    };
  }

  private persist(): void {
    this.storage.setJson(this.storageKey, this.queue);
  }
}
