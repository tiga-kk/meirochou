# Phase 7.4 タスク10: 近接地図ピンの選択曖昧性を解消

## 目的

近接する複数サークルの44px操作領域が重なっても、ユーザーがタップした位置に最も近い候補を意図どおり選べるようにする。

## 対象外

- 44px touch target要件を撤廃すること。
- pinを一覧表示する新しいmodal。
- routingや候補経路計算の変更。

## 前提と依存関係

Task 1〜9実装済み。Task 11以降と独立して最初に修正する。

## 読むべき文書と既存実装

- `docs/reviews/phase-07-4-human-acceptance-failures.md`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/css/target.css`

## 対象ファイル

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/css/target.css`（必要な場合のみ）
- `tests/e2e/webapp.spec.ts`

### 作成

- `tests/route-map-pin-selection.test.ts`

### 削除

なし。

## 実装手順

1. 画面上で44px hit boxが重なる二つのpin fixtureを作り、各pin中心寄りのpointer位置から別々のcircleを選べないREDを作る。
2. pinの`space`、画面中心座標、選択可能状態から、pointer位置に最も近いpinを決める純粋な最近傍解決を追加する。
3. pointer操作時はDOMの`event.target`だけに依存せず、同じ近傍内の候補を比較して最寄りを`showCandidatePreview`へ渡す。
4. current/start/purchased等の選択不可pinを候補へ混ぜない。既存`selectionState === comparing`時の無効化も維持する。
5. keyboardによるbutton activationは既存のfocused buttonをそのまま選択し、pointer用最近傍処理で別pinへ差し替えない。
6. 見た目の小さい中心点と44px操作領域の分離を維持する。

## テスト方針

- 近接2pinの重複領域で、左寄りtapは左、右寄りtapは右を選ぶ。
- 同距離の場合のtie-breakは決定的にする。
- purchased/start等を誤選択しない。
- keyboard activationはfocus中のpinを選ぶ。
- 通常の離れたpin選択を壊さない。

## 検証コマンド

```bash
npx vitest run --root . tests/route-map-pin-selection.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "候補|ピン|行き先"
npm run check:webapp
git diff --check
```

## 受入条件

- 44pxの主要touch領域を維持している。
- 近接2pinをpointer位置によって個別に選択できる。
- keyboard操作を後退させていない。
- route calculationやSessionへ不要な変更を入れていない。

## 予定コミットメッセージ

```text
fix(phase-07-4): disambiguate nearby map pin selection
```