# Phase 7.4 タスク2: priority判定規則の共通化

## 目的

Galleryに既にあるpriorityの数値化・複数完全一致フィルター規則を、Gallery・周辺地図・Route Guidanceから同じ意味で利用できる小さな共通ロジックへ切り出す。

## 対象外

- UIの追加。
- Route Guidanceへの実接続。
- priority閾値検索。
- priorityの保存形式変更。
- Circle domain modelの大規模変更。

## 前提と依存関係

なし。Task 1と並行可能。

## 読むべき文書と既存実装

- `apps/webapp/js/features/circle-status/ui/gallery-view-model.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/features/event-day/domain/event-day-types.ts`
- `tests/architecture-boundaries.test.mjs`

## 対象ファイル

### 作成

- `apps/webapp/js/shared/domain/circle-priority-filter.ts`
- `tests/circle-priority-filter.test.ts`

### 変更

- `apps/webapp/js/features/circle-status/ui/gallery-view-model.ts`
- 必要なら既存Gallery test

### 削除

なし。

## 実装手順

1. 純粋関数のREDを追加する。
2. `normalizeCirclePriority(value: unknown): number | null`を作る。有限数値だけを返し、空文字・非数値は`null`。
3. `collectCirclePriorities(circles): number[]`を作る。重複を除去し降順。
4. `matchesCirclePriority(circle, selectedPriorities)`を作る。`null`または空選択は全件一致、選択時は完全一致。
5. `filterCirclesByPriority(circles, selectedPriorities)`を作る。入力順序を維持する。
6. `gallery-view-model.ts`の既存`galleryPriority` / `collectGalleryPriorities`は既存公開契約を壊さない形で共通関数へ委譲する。Galleryの挙動を変更しない。
7. architecture checkで`shared/domain`の利用が既存境界に反しないことを確認する。違反する場合はallowlistを増やさず、既存feature public APIの適切な所有場所へ移す。

## テスト方針

- `10`、`"10"` → 10。
- `""`、空白、`undefined`、`NaN`、`Infinity` → `null`。
- 未選択 → 全件。
- `[10]` → 10だけ。
- `[10, 9]` → 10または9。
- priority未設定は選択時に不一致。
- collect結果は重複なし・降順。
- Galleryの既存priority filter結果が変更されない。

## 検証コマンド

```bash
npx vitest run --root . tests/circle-priority-filter.test.ts
npm run check:webapp
npm run test:webapp
git diff --check
```

## 受入条件

- priority判定規則が一つの純粋ロジックで定義される。
- Galleryの外部挙動が変わらない。
- Route Guidanceや周辺地図がGallery UI moduleをdeep importする必要がない。
- architecture allowlistを増やしていない。

## 予定コミットメッセージ

```text
refactor(phase-07-4): share priority filter semantics
```
