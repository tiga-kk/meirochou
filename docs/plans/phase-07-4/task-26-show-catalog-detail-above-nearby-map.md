# Phase 7.4 Task 26: お品書き詳細を地図より前面に表示

## 目的

独立「地図」画面の`お品書きを見る`から既存catalog detailを開いたとき、nearby mapを閉じなくても詳細を前面で確認でき、閉じると元cardへ戻れるnested dialog契約を作る。

## 対象外

- 新しいcatalog viewerの実装。
- nearby mapをdetail表示のたびに閉じること。
- mapのarea、origin、filter、zoom stateをdetail表示で初期化すること。

## 前提と依存関係

Task 25完了。cardはmap外のcatalog panelに存在する。

## 読むべき文書と既存実装

- `docs/specs/2026-08-14-phase-07-4-motion-and-map-workspace-redesign.md`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/ui/dialog-focus.ts`
- `apps/webapp/css/modals.css`
- `apps/webapp/css/maps.css`
- `tests/circle-detail.test.ts`
- `tests/dialog-focus.test.ts`
- `tests/nearby-map-view.test.ts`

## 対象ファイル

### 新規作成

なし。既存detail/modal infrastructureを再利用する。

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/css/modals.css`
- `apps/webapp/css/maps.css`
- `tests/circle-detail.test.ts`
- `tests/dialog-focus.test.ts`
- `tests/nearby-map-view.test.ts`
- `tests/e2e/webapp.spec.ts`

### 削除

なし。

`apps/webapp/js/ui/dialog-focus.ts`は既存`DialogFocusController`をそのまま再利用し、このTaskでは変更しない。nested modalで不足が見つかった場合も、まず`DomCircleGalleryView`側の利用方法を修正し、helperの契約拡張を安易に行わない。

## インターフェース変更

nearby mapのcatalog callbackは、focus return先を渡せるようにする。

```ts
type ShowCatalogFromNearbyMap = (
  circle: Circle,
  opener: HTMLElement,
) => void;
```

`DomRouteGuidanceView.showPdfModal()` / `DomCircleGalleryView.showPdfModal()`へ次のoptionを追加する。

```ts
showPdfModal(source, options?: { returnFocus?: HTMLElement | null }): void
```

`DomCircleGalleryView`は`#pdf-modal`専用の`DialogFocusController`を一つ所有し、`showPdfModal()`で`activate(returnFocus)`、`hidePdfModal()`で`deactivate()`する。これによりfocus returnを既存helperへ統一する。

## layer契約

CSSでnearby mapとcatalog detailの上下関係を明示する。単に同じ`z-index:10000`へ置かない。

```text
base UI < nearby map < catalog detail
```

実数値は既存gallery等と衝突しないnamed custom propertyへ集約し、testは相対関係を確認する。

## 実装手順

1. E2Eでnearby mapを開きcardの`お品書きを見る`を押した後、`#pdf-modal`がvisibleかつnearby mapより前面であるRED testを書く。
2. 同testでnearby mapが閉じていないこと、area/filter/origin/zoom stateが保持されることも先に固定する。
3. `DomNearbyMapView`からcallbackへ押下button自身を`opener`として渡す。
4. BrowserApplication/DomRouteGuidanceViewを経由して既存`DomCircleGalleryView.showPdfModal()`へ`returnFocus`を渡す。新しい画像detail DOMを作らない。
5. `DomCircleGalleryView`で既存`DialogFocusController`を`#pdf-modal`へ適用し、showでactivate、hideでdeactivateする。
6. `modals.css`と`maps.css`のlayer custom propertyを整理し、detailをnearby mapより上へ置く。
7. detail表示中のEscapeは`DialogFocusController`のonEscapeから`hidePdfModal()`だけを呼び、同イベントでnearby mapまで閉じないことを確認する。
8. detail close後に元の`お品書きを見る`buttonへfocusを戻す。buttonがDOMから消えた場合はDialogFocusController既存fallbackに任せる。
9. もう一度Escapeしたときにnearby mapが閉じることをE2Eで確認する。
10. detailを開閉してもselected card、origin、filter、map transformが変わらないことを確認する。

## テスト方針

z-indexの文字列存在だけではなく、実ブラウザでdetailの中央点がnearby mapではなくdetail要素へhit-testされる、またはcomputed stackingでdetailが前面であることを証明する。

focus testは「close buttonが存在する」だけではなく、open→detail focus→close→元buttonという遷移を確認する。

## 検証コマンド

```bash
npx vitest run --root . tests/circle-detail.test.ts tests/dialog-focus.test.ts tests/nearby-map-view.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "お品書き|地図|Escape|focus"
npm run check:webapp
npm run test:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- nearby mapを閉じずにcatalog detailが前面表示される。
- 既存detail viewerと`DialogFocusController`を再利用し、二重実装しない。
- Escapeはdetailを先に閉じ、nearby mapは残る。
- detail close後に元card/buttonへfocusが戻る。
- もう一度Escapeするとnearby mapが閉じる。
- detail開閉でnearby mapのarea、filters、origin、selected card、zoom/pan stateが失われない。

## 予定コミットメッセージ

```text
fix(webapp): show catalog detail above nearby map
```
