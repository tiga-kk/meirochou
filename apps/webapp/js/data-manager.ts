import { GasApiClient } from "./api/gas-api-client";
import { Config } from "./config.js";
import { StorageService } from "./state/storage-service.js";
import type { SyncResult } from "./state/sync-queue.js";
import { SyncQueue } from "./state/sync-queue.js";
import type {
  ActionHistoryEntry,
  ActionType,
  CachedCircleData,
  Circle,
  SaleUpdatePayload,
} from "./types/domain";

/**
 * データ管理クラス
 * LocalStorageの読み書き、GASとの通信を担当
 */
export class DataManager {
  readonly storage: StorageService;
  readonly apiClient: GasApiClient;
  readonly syncQueue: SyncQueue<SaleUpdatePayload>;
  wantToBuy: Circle[];
  spreadsheetTitle: string;
  purchasedList: string[];
  holdList: string[];
  actionHistory: ActionHistoryEntry[];
  redoStack: ActionHistoryEntry[];
  selectedSheets: string[];

  constructor() {
    this.storage = new StorageService();
    this.apiClient = new GasApiClient();
    this.syncQueue = new SyncQueue(
      this.storage,
      Config.STORAGE_KEYS.SYNC_QUEUE,
    );

    // メモリ上にデータを保持
    const savedData = this.storage.getJson<CachedCircleData | null>(
      Config.STORAGE_KEYS.DATA,
      null,
    );
    this.wantToBuy = savedData ? savedData.wantToBuy : [];
    this.spreadsheetTitle = savedData?.spreadsheetTitle || "";

    this.purchasedList = this.storage.getJson(
      Config.STORAGE_KEYS.PURCHASED,
      [],
    );
    this.holdList = this.storage.getJson(Config.STORAGE_KEYS.HOLD, []);
    this.actionHistory = this.storage.getJson(Config.STORAGE_KEYS.HISTORY, []);
    this.redoStack = this.storage.getJson(Config.STORAGE_KEYS.REDO_STACK, []);

    // 選択されたシートリスト
    this.selectedSheets = this.storage.getJson(
      Config.STORAGE_KEYS.SELECTED_SHEETS,
      [],
    );
  }

  /**
   * 保存されているGASのWebアプリURLを取得
   */
  getGasUrl(): string {
    return this.storage.getString(Config.STORAGE_KEYS.URL);
  }

  /**
   * GASのWebアプリURLを保存
   */
  setGasUrl(url: string): void {
    const previousUrl = this.getGasUrl();
    this.storage.setString(Config.STORAGE_KEYS.URL, url);

    if (previousUrl && previousUrl !== url) {
      this.wantToBuy = [];
      this.spreadsheetTitle = "";
      this.selectedSheets = [];
      this.storage.remove(Config.STORAGE_KEYS.DATA);
      this.storage.remove(Config.STORAGE_KEYS.SELECTED_SHEETS);
    }
  }

  /**
   * 選択されているシートリストを取得
   */
  getSelectedSheets(): readonly string[] {
    return this.selectedSheets;
  }

  getSpreadsheetTitle(): string {
    return this.spreadsheetTitle;
  }

  /**
   * 選択されているシートリストを保存
   */
  setSelectedSheets(sheets: readonly string[]): void {
    this.selectedSheets = [...sheets];
    this.storage.setJson(
      Config.STORAGE_KEYS.SELECTED_SHEETS,
      this.selectedSheets,
    );
  }

  /**
   * GASからシート一覧を取得
   */
  async fetchSheetList(): Promise<string[]> {
    const baseUrl = this.getGasUrl();
    if (!baseUrl) throw new Error("URL未設定");
    const result = await this.apiClient.fetchSheetList(baseUrl);
    this.spreadsheetTitle = result.spreadsheetTitle;
    return result.sheets;
  }

  /**
   * スプレッドシートからデータを取得
   * @param {boolean} forceRefresh - キャッシュを無視して強制取得するか
   */
  async fetchFromSheet(forceRefresh = false): Promise<number> {
    const url = this.getGasUrl();
    if (!url) throw new Error("URL未設定");

    // 強制更新でなければLocalStorageのキャッシュを試す
    if (!forceRefresh) {
      const parsed = this.storage.getJson<CachedCircleData | null>(
        Config.STORAGE_KEYS.DATA,
        null,
      );
      if (parsed) {
        this.wantToBuy = parsed.wantToBuy || [];
        this.spreadsheetTitle = parsed.spreadsheetTitle || "";
        return this.wantToBuy.length;
      }
    }
    const result = await this.apiClient.fetchCircles(url, {
      selectedSheets: this.selectedSheets,
      forceRefresh,
    });
    this.wantToBuy = result.wantToBuy;
    this.spreadsheetTitle = result.spreadsheetTitle;
    // データをキャッシュ
    this.storage.setJson(Config.STORAGE_KEYS.DATA, {
      wantToBuy: this.wantToBuy,
      spreadsheetTitle: this.spreadsheetTitle,
    });
    return this.wantToBuy.length;
  }

  /**
   * GASへ更新情報を送信（キュー経由）
   */
  async syncUpdate(
    space: string | string[],
    isUndo = false,
    isBatch = false,
    sheetName = "",
  ): Promise<SyncResult> {
    const payload: SaleUpdatePayload = isBatch
      ? {
          action: "sale",
          spaces: Array.isArray(space) ? space : [space],
          undo: true,
        }
      : {
          action: "sale",
          space: Array.isArray(space) ? (space[0] ?? "") : space,
          undo: isUndo,
          ...(sheetName ? { sheetName } : {}),
        };

    this.addToQueue(payload);
    return this.processQueue();
  }

  /**
   * 送信キューに追加
   */
  addToQueue(payload: SaleUpdatePayload): void {
    this.syncQueue.enqueue(payload);
  }

  /**
   * キューを処理して送信
   */
  async processQueue(): Promise<SyncResult> {
    return this.syncQueue.process({
      getUrl: () => this.getGasUrl(),
      send: (url, payload) => this.sendToGas(url, payload),
    });
  }

  /**
   * 実際の送信処理 (内部用)
   */
  async sendToGas(url: string, payload: SaleUpdatePayload): Promise<void> {
    return this.apiClient.sendSaleUpdate(url, payload);
  }

  /**
   * 購入リストに追加
   */
  addPurchased(space: string, sheetName = ""): void {
    if (!this.purchasedList.includes(space)) {
      this.purchasedList.push(space);
      this.saveList(Config.STORAGE_KEYS.PURCHASED, this.purchasedList);
      this.addHistory("purchase", space, sheetName);
    }
  }

  /**
   * 保留リストに追加
   */
  addHold(space: string, sheetName = ""): void {
    if (!this.holdList.includes(space)) {
      this.holdList.push(space);
      this.saveList(Config.STORAGE_KEYS.HOLD, this.holdList);
      this.addHistory("hold", space, sheetName);
    }
  }

  /**
   * 直前の操作を取り消す
   */
  undoLastAction(): ActionHistoryEntry | null {
    const last = this.actionHistory.pop();
    if (!last) return null;

    this.saveList(Config.STORAGE_KEYS.HISTORY, this.actionHistory);

    // Redoスタックに追加
    this.redoStack.push(last);
    this.saveList(Config.STORAGE_KEYS.REDO_STACK, this.redoStack);

    if (last.type === "purchase") {
      this.purchasedList = this.purchasedList.filter((s) => s !== last.space);
      this.saveList(Config.STORAGE_KEYS.PURCHASED, this.purchasedList);
    } else if (last.type === "hold") {
      this.holdList = this.holdList.filter((s) => s !== last.space);
      this.saveList(Config.STORAGE_KEYS.HOLD, this.holdList);
    }
    return last;
  }

  /**
   * 取り消した操作をやり直す
   */
  redoAction(): ActionHistoryEntry | null {
    const last = this.redoStack.pop();
    if (!last) return null;

    this.saveList(Config.STORAGE_KEYS.REDO_STACK, this.redoStack);

    // 履歴に戻す（addHistoryを使うとredoStackが消えてしまうので手動で）
    this.actionHistory.push(last);
    this.saveList(Config.STORAGE_KEYS.HISTORY, this.actionHistory);

    if (last.type === "purchase") {
      if (!this.purchasedList.includes(last.space)) {
        this.purchasedList.push(last.space);
        this.saveList(Config.STORAGE_KEYS.PURCHASED, this.purchasedList);
      }
    } else if (last.type === "hold") {
      if (!this.holdList.includes(last.space)) {
        this.holdList.push(last.space);
        this.saveList(Config.STORAGE_KEYS.HOLD, this.holdList);
      }
    }
    return last;
  }

  /**
   * 全データをリセット
   */
  resetAll(): string[] {
    const backup = [...this.purchasedList]; // バックアップ（一括Undo用）
    this.purchasedList = [];
    this.holdList = [];
    this.actionHistory = [];
    this.redoStack = [];

    this.storage.remove(Config.STORAGE_KEYS.PURCHASED);
    this.storage.remove(Config.STORAGE_KEYS.HOLD);
    this.storage.remove(Config.STORAGE_KEYS.HISTORY);
    this.storage.remove(Config.STORAGE_KEYS.REDO_STACK);
    return backup;
  }

  /**
   * 保留リストのみリセット
   */
  resetHold(): void {
    this.holdList = [];
    this.storage.remove(Config.STORAGE_KEYS.HOLD);
    this.actionHistory = this.actionHistory.filter((a) => a.type !== "hold");
    this.saveList(Config.STORAGE_KEYS.HISTORY, this.actionHistory);
    // Redoスタックも整合性が取れなくなるのでクリアする
    this.redoStack = [];
    this.storage.remove(Config.STORAGE_KEYS.REDO_STACK);
  }

  /**
   * 操作履歴に追加（内部用）
   */
  addHistory(type: ActionType, space: string, sheetName = ""): void {
    this.actionHistory.push({
      type,
      space,
      ...(sheetName ? { sheetName } : {}),
    });
    this.saveList(Config.STORAGE_KEYS.HISTORY, this.actionHistory);
    // 新しい操作が行われたらRedoスタックはクリア
    this.redoStack = [];
    this.storage.remove(Config.STORAGE_KEYS.REDO_STACK);
  }

  /**
   * LocalStorageへの保存（内部用）
   */
  saveList<T>(key: string, list: readonly T[]): void {
    this.storage.setJson(key, list);
  }

  /**
   * 未訪問（購入も保留もしていない）のリストを取得
   */
  getUnvisited(): Circle[] {
    return this.wantToBuy.filter(
      (c) =>
        !this.purchasedList.includes(c.space) &&
        !this.holdList.includes(c.space),
    );
  }
}
