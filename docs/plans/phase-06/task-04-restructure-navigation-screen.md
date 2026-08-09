# Phase 6 Task 4: 地図とお品書きを主役にメイン画面を再構成する

## 目的

地図へ重なっている情報表示と重複したカードを整理し、地図とお品書きの可視領域を優先した実用的なナビゲーション画面へ変更する。

## 対象外

- 候補サークル用bottom sheetの完成（Task 5）
- 巡回予定画面（Task 6）
- 一覧モーダルの2列化（Task 7）
- 使い方画面（Task 8）

## 前提と依存関係

- Task 1〜3完了後に実施する。
- Route Guidanceの状態契約はTask 1で確定したものを使う。

## 読むべき文書と既存実装

- `apps/webapp/index.html`
- `apps/webapp/css/base.css`
- `apps/webapp/css/target.css`
- `apps/webapp/css/tokens.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-screen-model.ts`
- `tests/e2e/webapp.spec.ts`

## 対象ファイル

### 作成

なし。

### 変更

- `apps/webapp/index.html`
- `apps/webapp/css/base.css`
- `apps/webapp/css/target.css`
- 必要な場合だけ`apps/webapp/css/tokens.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-screen-model.ts`
- 関連unit/E2E test

### 削除

なし。不要になったDOM要素やCSS selectorは同じTaskで削除する。

## 実装手順

1. `.navigation-map`内部から、現在の`.route-card`と`.map-log`に相当する大きな情報オーバーレイを除去する。
2. 地図外にコンパクトな案内バーを設け、最低限次を横方向中心で表示する。
   - 現在の目的地
   - 現在区間の距離
   - 必要なら次の目的地
3. 現在地入力を「現在地」という独立した大きなcardから、一行中心のコンパクトな操作領域へする。ラベル、番号、検索操作の利用可能性は維持する。
4. 地図をナビゲーション画面で最も大きい領域として維持し、狭いモバイル画面でも上部オーバーレイで隠さない。
5. お品書き画像を地図直下の主要コンテンツとして配置する。
6. 優先度、次の目的地、Twitter/Xリンク、sheet名等はお品書きより上に大きなカードとして積まず、補助行へまとめる。
7. Twitter/Xリンクはテキストで大きな縦幅を取らず、意味の分かるラベルまたはアイコン付き補助リンクとして保持する。
8. 購入済み/保留ボタンは44px以上の操作領域を維持し、画面下部で見つけやすくする。safe-area insetを考慮する。
9. headerは情報表示より操作導線を優先し、「一覧」に加えてTask 6/8で追加する導線を置ける横方向の余地を確保する。
10. 色、太線、inset shadow、mono/明朝/ゴシックの混在を必要な用途へ絞る。地図案内で装飾的なカードを追加して問題を隠さない。
11. 既存DOM idを必要なく変更しない。変更が必要なidは同TaskでViewとE2Eを更新する。
12. mobile screenshotを確認し、単にカードを小さくしただけではなく情報階層が地図→お品書き→行動→補助情報の順になっていることを確認する。

## テスト方針

- Navigation ViewModelの表示値自体は変えず、配置変更による欠落がないことをunit testで確認する。
- E2Eで地図が表示され、購入済み/保留、お品書き、現在地入力が操作できることを確認する。
- `NEXT`/`FROM`/`ROUTE`の旧overlay DOMが地図上に残っていないことをcontract testで確認する。
- 200% text zoomでも主要操作が隠れない。
- keyboard focus-visibleを維持する。

## 検証コマンド

```bash
npx vitest run tests/route-guidance-screen-model.test.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run test:e2e:ci
git diff --check
```

visual snapshot差分はこのTaskの意図したレイアウト変更として個別に確認する。更新判断はTask 9でも再確認する。

## 受入条件

- 地図に大きな`NEXT`/`FROM`/`ROUTE`カードが重ならない。
- 地図とお品書きが補助情報より大きく表示される。
- 現在地、購入済み、保留、設定、一覧の既存操作を失わない。
- UIの主要階層が不要なカードの入れ子に依存しない。

## 予定コミットメッセージ

`feat(ui): prioritize map and catalog content`
