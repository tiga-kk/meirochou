# ComiPath Public Data Contracts (Phase 3)

本ドキュメントは、ComiPath Webapp のデータ契約、LocalStorage構造、CSV/GAS契約および TypeScript サービス API を規定する。

## 1. サポート範囲と現在の仕様

- **LocalStorageが単一端末における唯一の正本（Single source of truth）** である。データはブラウザのLocalStorage内に閉じて保持される。
- **データソース形式**: CSV または GAS (Google Apps Script) スプレッドシートが利用可能で、各 event/day は一つのCSVまたは一つのGASシートを参照する。
- **GAS同期エンジン (Phase 3)**:
  - **ローカルファーストの購入変更**: 購入・解除操作は即座に `LocalStorage` へ保存され、同期要求は `gasOutbox` に永続化キューイングされる。
  - **自動バックグラウンド処理**: アプリ起動時および `online` イベント受信時に `GasSyncCoordinator` が FIFO 順で送信を自動再試行する。
  - **キャッシュ優先**: 起動時にキャッシュ済み状態を開く際は不要な GET 通信を行わない。
- **管理UI (Phase 4)**: 送信キュー視覚化やソース設定用フォーム UI は Phase 4 で提供予定である。Phase 3 ではサービス API としてバックグラウンド動作する。

## 2. イベント / 日付 / ソースジェネレーションの識別ルール

- **識別子 (ID) のフォーマット**: `eventId` および `dayId` は正規表現 `/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/` に適合する必要がある。先頭は英数字、以降は英数字・`_`・`-`のみ許容（1〜64文字）。
- **LocalStorageキーの分離**: `eventId + dayId` の組み合わせによって各イベント・日付ごとのデータが独立して保存・管理される。
  - 状態キー: `comipath:v1:<eventId>:<dayId>:state`
  - インデックスキー: `comipath:v1:index:event-days`
  - 最終閲覧キー: `comipath:v1:last-opened`
- **`sourceGeneration` によるソース識別**: ソース作成、初期インポート、ソース置換の確定時に新しい `sourceGeneration` が割り当てられる。
- **GASの `sheetName`**: GAS source は `gasUrl` と `sheetName` の組で対象シートを一意に指定する。シート一覧取得は `?action=getSheets`、円データ取得は `?sheets=<url-encoded-sheetName>` の明示GETで行う。

## 3. `LocalEventDayState` フィールド仕様 (`schemaVersion: 1`)

`schemaVersion: 1` における `LocalEventDayState` の構造:

| フィールド名 | 型 | 説明 |
|---|---|---|
| `schemaVersion` | `1` | スキーマバージョン（固定値 `1`） |
| `source` | `DataSource` | ソース定義 (`CsvDataSource` または `GasDataSource`) |
| `sourceGeneration` | `string` | ソース生成識別子 |
| `circles` | `CircleRecord[]` | 配置・サークル情報一覧 |
| `purchased` | `string[]` | 購入済みスペース一覧 |
| `hold` | `string[]` | 保留スペース一覧 |
| `history` | `HistoryEntry[]` | 操作履歴 |
| `redo` | `HistoryEntry[]` | Redo用操作履歴スタック |
| `gasOutbox` | `GasOutboxEntry[]` | GAS送信待ちキュー |
| `timestamps` | `object` | `createdAt`、`updatedAt`、`sourceUpdatedAt`（ISO 8601文字列） |

### `GasOutboxEntry` フィールド仕様

| フィールド名 | 型 | 説明 |
|---|---|---|
| `id` | `string` | エントリ固有のユニークID |
| `eventId` | `string` | 対象イベントID |
| `dayId` | `string` | 対象日付ID |
| `sourceGeneration` | `string` | 生成時のソースジェネレーション |
| `gasUrl` | `string` | 送信先GAS WebApp URL |
| `sheetName` | `string` | 対象シート名 |
| `space` | `string` | スペース識別子 |
| `purchased` | `boolean` | 希望購入状態 (`true`: 購入済, `false`: 未購入/取り消し) |
| `createdAt` | `string` | 作成日時 (ISO 8601) |
| `attempts` | `number` | 送信試行回数 (0以上) |
| `lastError` | `string \| null` | 直近エラーの分類 (`http-<status>`, `network`, `timeout`, `server-contract`) |

## 4. GAS 同期とエラー安全境界

- **同一スペース操作の集約 (Coalescing)**: `attempts === 0` の未送信エントリが存在する状態で同一スペースの購入状態を変更した場合、最新の希望状態へ上書き統合される。
- **送信失敗と保持**: 通信エラー（ネットワーク切断、500エラー等）が発生してもローカルストレージの購入状態はロールバックされず、`gasOutbox` にエントリが残り、`lastError` に安全なカテゴリが記録される。
- **ロック保護 (`SourceSettingsService`)**: `gasOutbox` に未送信エントリが存在する場合、ソースURLの変更、シート名の変更、またはイベント/日付の削除はロックされる（明示的な棄却操作が必要）。

## 5. CSV / GAS インポート・置換 (Preview / Apply)

- **CSVインポート / 置換**: `importInitialCsv`, `previewCsvReplacement`, `applyCsvReplacement`
- **GASプレビュー / 初期取込 / 置換 / 更新**: `previewInitialGasImport`, `previewGasSourceReplacement`, `previewGasRefresh`, `applyGasPreview`, `cancelGasPreview`
- メモリ内にのみ保持される Preview は有効期限および `sourceGeneration` 指紋チェックにより安全に管理され、不整合なデータ適用を防止する。

## 6. TypeScript サービス API 一覧 (`DataManager` / Phase 3)

```ts
openEventDay(ref: EventDayRef): Promise<LocalEventDayState>;
addPurchased(space: string, sheetName?: string): void;
addHold(space: string, sheetName?: string): void;
undoLastAction(): HistoryEntry | null;
flushActiveOutbox(): Promise<GasOutboxResult>;
startSyncCoordinator(): void;
disposeSyncCoordinator(): void;
previewGasRefresh(ref: EventDayRef): Promise<GasRefreshPreview>;
applyGasPreview(previewId: string): LocalEventDayState;
cancelGasPreview(previewId: string): void;
retryAllPending(): Promise<GasSyncSummary>;
disposeSyncCoordinator(): void;
```

`addHold` はGAS送信待ちを作らない。購入・購入解除・undo/redo/resetのGAS状態変更だけが、ローカル状態と同じ保存で `gasOutbox` に追加される。
