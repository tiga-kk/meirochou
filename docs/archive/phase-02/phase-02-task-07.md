# Phase 2 Task 7 Safety Replan

**Status:** 完了。Commit `1b95c5f`。

実装後の自己レビューでlegacy previewの対象event/day再検証を追加し、回帰テストを通過した。

## Goal

既存の地図向けgetterと購入・保留操作を、選択中のevent/dayのLocalStorage stateだけへ接続する。Phase 2ではCSVの初回作成・確認済み置換までを提供し、GAS通信、GAS source作成、outbox、管理画面は導入しない。

## Non-negotiable boundaries

- 起動時、URL query、購入操作、onlineイベントのいずれからもGAS GET/POSTを行わない。
- 旧 `SyncQueue`、`webAppURL`、`selectedSheets`、`comiketData` を通常経路で読み書きしない。旧データは明示legacy previewだけが読む。
- `openEventDay(ref)` はregistryに存在するrefだけを開く。無いstateはCSV未設定の空stateとして作成する。
- 初回CSV importだけが直接stateを作成できる。既存stateのCSV置換はpreview IDを経由し、UIはそのIDだけをapplyへ渡す。
- source generationは初回CSV作成と確認済みCSV置換でだけ更新する。購入・保留・履歴操作、preview作成、CSV exportでは変更しない。
- legacy applyは新stateの保存成功後も旧keyを消さない。旧key削除はPhase 4の明示削除操作として別確認にする。

## Required interfaces

```ts
interface CsvReplacementPreview {
  previewId: string;
  ref: EventDayRef;
  expectedSourceGeneration: string;
  incomingHash: string;
  fileName: string;
  diff: SourceDiff;
  expiresAt: string;
}

openEventDay(ref: EventDayRef): Promise<LocalEventDayState>;
importInitialCsv(ref: EventDayRef, fileName: string, text: string): Promise<LocalEventDayState>;
previewCsvReplacement(ref: EventDayRef, fileName: string, text: string): Promise<CsvReplacementPreview>;
applyCsvReplacement(previewId: string): LocalEventDayState;
exportCsv(ref: EventDayRef): string;
previewLegacyImport(target: EventDayRef): LegacyImportPreview;
applyLegacyImport(target: EventDayRef, previewId: string): LocalEventDayState;
```

`applyCsvReplacement` は、previewのref、現在のsourceGeneration、入力hash、有効期限を再検証する。いずれかが違う場合は保存せずstale errorを返す。将来のoutbox lockはPhase 3 `SourceSettingsService` が同じapply直前境界で追加する。

## Execution order

1. **Isolate legacy GAS behavior (RED → GREEN).** `DataManager` と `App` の通常起動・購入・更新経路から旧GAS URL、`SyncQueue`、自動更新を外す。既存地図UIはCSV未設定時に設定ダイアログを出さず、空のevent/dayとして安全に起動する。旧GAS LocalStorageを読むのはlegacy previewだけに限定する。
2. **Add typed state adapters.** `unknown` から検証するlegacy decoder、`CircleRecord` ⇄ 地図表示用 `Circle` の変換、履歴timestampを失わないstate mutationを小さなモジュールへ分ける。`any` は追加しない。
3. **Implement initial CSV creation.** registry検証済みrefに空stateしかない場合だけCSVを直接保存する。ファイル名・sourceGeneration・timestampをstateへ保存し、再読込後にも同じcircle内容となることをテストする。
4. **Implement stale-safe CSV preview/apply.** pure diffの結果と入力hashをmemory previewへ保存し、apply時に二重適用・generation変更・期限切れを拒否する。apply成功時だけgenerationを更新し、購入・保留・履歴・redoを保持する。
5. **Connect local mutations.** purchase/hold/undo/redo/resetはactive stateをrepository経由で保存する。削除済みsource rowと履歴参照を保持し、失敗時は画面上のstateを変更しない。
6. **Replan map selection, do not fake it.** 複数eventのregistryをDataManagerで選べても、現在のloaderは互換alias（先頭event）だけを読む。event境界の地図切替はPhase 4 Task 2で、registry mapBundle URLのruntime解決、manifest.eventId照合、map/route/selection cacheの原子的resetとともに実装する。Task 7では別eventを地図画面から選択可能にしない。
7. **Verify before approval.** `npm run test:webapp`、`npm run check:webapp`、`npm run build:webapp`、`npm run verify:webapp:build`、`npx biome check` を実行する。地図・購入操作に触れた場合は `npm run test:e2e` も実行する。ステージ差分、検証結果、提案コミットを提示し、ユーザー承認後だけcommitする。

## Required tests

- event/day切替でstate・購入・保留・履歴が分離される。
- 空stateのCSV初回作成、既存stateのpreview/apply、stale preview、二重apply、hash不一致、generation不一致、期限切れ。
- GAS URLが保存済みでも起動・purchase・holdがfetch/POSTしない。
- legacy invalid rowはpreviewで診断され、apply失敗時も旧keyと既存stateを残す。
- default eventだけが固定map aliasを使う。複数eventの地図切替はPhase 4までUI/APIで公開しない。
