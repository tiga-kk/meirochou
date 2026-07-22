# Phase 2 Public Data Contracts

本ドキュメントは、Phase 2完了時点（Task 7コミット `1b95c5f`）における ComiPath Webapp のデータ契約、LocalStorage構造、CSV契約およびTypeScriptサービスAPIを規定する。

## 1. サポート範囲と現在の制限事項

- **LocalStorageが単一端末における唯一の正本（Single source of truth）** である。データはブラウザのLocalStorage内に閉じて保持される。
- **ウェブアプリのアセット読み込み完了後のLocalStorage保持機能のみを保証する**。Service Workerや一般のオフラインキャッシング保証は含まない。
- **GAS同期・ネットワーク連携機能は未実装** である。Phase 2のデータサービスは完全ローカル動作し、自動通信を行わない。
- **管理UIおよびイベント/日付切替UIは未実装** である。データアクセスは TypeScript API 経由のみ提供される。
- **ソース管理UI（CSV選択、preview確認、apply実行など）は未実装** である。CSV操作は記載したTypeScript APIを直接呼び出す利用者に限られる。

## 2. イベント / 日付 / ソースジェネレーションの識別ルール

- **識別子 (ID) のフォーマット**: `eventId` および `dayId` は正規表現 `/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/` に適合する必要がある。先頭は英数字、以降は英数字・`_`・`-`のみ許容（1〜64文字）。空白のトリムやパディングは行わず、無効な文字が含まれる場合はパースエラーとなる。
- **LocalStorageキーの分離**: `eventId + dayId` の組み合わせによって各イベント・日付ごとのデータが独立して保存・管理される。
- **`sourceGeneration` によるソース識別**: 空のCSV状態の作成、CSV初回インポート、またはソース置換の確定時に、検証済みの新しい `sourceGeneration` が割り当てられる。
- **`sourceGeneration` が不変な操作**: 購入・未購入切替、保留・解除、Undo / Redo、リセット、プレビュー作成、CSVエクスポート等のローカル状態変更操作では `sourceGeneration` は変更されない。

## 3. `LocalEventDayState` フィールド仕様 (`schemaVersion: 1`)

`schemaVersion: 1` における `LocalEventDayState` の構造は以下の通りである。`eventId` と `dayId` は保存キーと`EventDayRef`で管理され、state payload内のフィールドではない。

| フィールド名 | 型 | 説明 |
|---|---|---|
| `schemaVersion` | `1` | スキーマバージョン（固定値 `1`） |
| `source` | `DataSource` | ソース定義（例: `{ type: "csv", fileName: "demo-day1.csv" }`） |
| `sourceGeneration` | `string` | ソース生成識別子 |
| `circles` | `CircleRecord[]` | 配置・サークル情報一覧 |
| `purchased` | `string[]` | 購入済みスペース一覧 |
| `hold` | `string[]` | 保留スペース一覧 |
| `history` | `HistoryEntry[]` | 操作履歴 |
| `redo` | `HistoryEntry[]` | Redo用操作履歴スタック |
| `gasOutbox` | `GasOutboxEntry[]` | Phase 2では常に空のGAS送信待ち配列 |
| `timestamps` | `object` | `createdAt`、`updatedAt`、`sourceUpdatedAt`（ISO 8601文字列） |

### `CircleRecord` フィールド仕様

| フィールド名 | 型 | 説明 |
|---|---|---|
| `space` | `string` | スペース識別子 (例: `"A-01"`) |
| `priority` | `number \| undefined` | 優先度 |
| `account` | `string \| undefined` | アカウント名 / X ID等 |
| `tweet` | `string \| undefined` | 告知リンク等の文字列 |
| `memo` | `string \| undefined` | メモ |
| `isSale` | `string \| undefined` | 頒布物情報 (`"x"` の場合購入済み扱い) |
| `removedFromSource` | `boolean \| undefined` | ソースから削除された行フラグ |

## 4. CSVインポート契約とエラー挙動

- **ヘッダー契約**: エクスポート時のCSVヘッダーは厳密に `space,priority,isSale,account,tweet,memo` となる。
- **インポート時の必須カラム**: CSVインポート時には `space` カラムが必須であり、未設定または重複スペースが存在する場合はエラーとなる。
- **入力バリデーションとエラー通知**: 行・列レベルの問題（不正なCSV構文、必須フィールド欠落、重複スペース、数値でない優先度等）は `CsvIssue[]` として返却される。`DataManager`のインポート・preview APIでは保存前にエラーとなり、元の保存状態を一切変更しない。未使用の列は無視される。

## 5. 初回インポートと置換 (Preview / Apply) シーケンス

- **初回インポート (`importInitialCsv`)**: `empty.csv`の空stateに対してのみ呼び出し可能。データ、購入、保留、履歴、Redo、または別sourceが既に存在する場合は `Initial CSV import requires an empty state` エラーとなり、保存状態を変更しない。
- **ソース置換 (`previewCsvReplacement` / `applyCsvReplacement`)**:
  1. `previewCsvReplacement` を呼び出し、差分プレビューと有効期限付きの `previewId` を発行する。
  2. `applyCsvReplacement(previewId)` を実行して変更を確定する。
- **Apply時の安全再検証**: `applyCsvReplacement` 実行時、`previewId` の存在（二重適用を含む）、有効期限、入力ハッシュ、現在の `sourceGeneration`、ソース種別を再検証する。失敗時は`StaleCsvPreviewError`となり、ストレージ書き込み失敗時は`StorageWriteError`となる。いずれも変更を適用せず、以前の保存状態をそのまま維持する。

## 6. 購入・保留・履歴・Redoおよび削除行の保持契約

- **ローカル状態の保持**: ソースの置換を行っても、既存の購入 (`purchased`)、保留 (`hold`)、操作履歴 (`history`)、Redoスタック (`redo`) は保持される。
- **`isSale` による購入追加**: ソース更新時、`isSale` に `"x"` が指定されているサークルは新たに購入済みとして追加され得る。ただし、ソース側の `isSale` が空になってもローカルで既に購入済みの状態が勝手に解除されることはない。
- **ソースから削除された行 (`removedFromSource`)**: 以降のインポートでソースから消去されたサークル行は、データと履歴の整合性を保つため `removedFromSource: true` フラグを立ててストレージ上に保持される（アクティブなマップ表示からは非表示となる）。

## 7. レガシー Preview / Import の安全境界

- 旧バージョンのデータ構造からの移行は `previewLegacyImport` および `applyLegacyImport` の明示的な呼び出しによってのみ実行される。無効な行、対象ref不一致、既存の移行先stateは`LegacyImportError`となり、移行先と旧キーを変更しない。
- レガシーデータのプレビュー・インポートが成功しても、旧キー（レガシーLocalStorageキー）は自動削除されず、安全のため残される。

## 8. 現在の TypeScript サービス API (`DataManager`)

Phase 2で利用可能な `DataManager` の主要メソッド一覧:

```ts
openEventDay(ref: EventDayRef): Promise<LocalEventDayState>;
importInitialCsv(ref: EventDayRef, fileName: string, text: string): Promise<LocalEventDayState>;
previewCsvReplacement(ref: EventDayRef, fileName: string, text: string): Promise<CsvReplacementPreview>;
applyCsvReplacement(previewId: string): LocalEventDayState;
exportCsv(ref: EventDayRef): string;
previewLegacyImport(target: EventDayRef): LegacyImportPreview;
applyLegacyImport(target: EventDayRef, previewId: string): LocalEventDayState;
```

※ `importCsv` は初回インポート用の非推奨後方互換エイリアスであり、推奨APIは `importInitialCsv` である。

## 9. Phase 3 境界（GAS連携の非可用性）

- GAS（Google Apps Script）との通信機能（インポート、自動リフレッシュ、POST送信、送信待ちアウトボックスの再試行など）はPhase 3で実装予定であり、**Phase 2段階では利用できない**。
