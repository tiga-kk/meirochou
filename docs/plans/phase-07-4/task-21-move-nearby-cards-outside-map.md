# Phase 7.4 タスク21: 周辺お品書きカードを地図外へ移動

## 目的

独立した「地図」画面で、お品書きカードが地図を覆う問題を解消する。カードは地図viewport外の下部stripへ移し、地図自体は必要な分だけ縮小してよい。現在のleader lineは維持し、地図上anchorと外側cardを対応付ける。

## 対象外

- grid距離rankingの変更
- cardをmap transform layerへ戻すこと
- 外部layout library
- page全体の横スクロール

## 対象ファイル

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/css/maps.css`
- `tests/nearby-map-view.test.ts`
- `tests/e2e/webapp.spec.ts`

`nearby-catalog-layout.ts`と専用testはproductionから未使用になった場合だけ削除する。

## 実装手順

1. E2Eでcardのbounding boxと`#nearby-map-viewport`が交差しないことを先にREDで固定する。
2. DOMを「map viewport + 下部card strip + 両方を覆うleader SVG」に変更する。
3. card stripだけ`overflow-x: auto`を許可し、cardはranking順のflex itemとして並べる。
4. selected cardのactionを含めても200% text zoomでclipしない高さをstripへ確保する。
5. map viewport高さはdialog利用可能高さからcard stripの実測高さを引いて決める。Task 20のminimumを満たせる場合は維持する。
6. leader lineはwrapper座標系で、transform後のmap anchorからcard borderへ接続する。
7. map pan/zoomとcard strip scrollではcard DOMを再生成せず、既存leader lineの座標だけを更新する。
8. strip viewport外へ完全に出たcardへのleader lineは非表示にする。
9. card選択、`aria-selected`、「お品書きを見る」「目的地にする」、filter変更時selection解除を維持する。
10. `layoutNearbyCatalogCards()`が完全に未使用になった場合だけdead codeとして削除する。

## テスト方針

- cardが地図を覆わない。
- map anchorから外側cardへleader lineが届く。
- strip scroll後も線が対応cardへ追従する。
- pan/zoom/scrollで同じcard DOM nodeを維持する。
- 390px / 200% text zoomでpage全体に横overflowを作らない。

## 検証コマンド

```bash
npx vitest run --root . tests/nearby-map-view.test.ts tests/nearby-map-aspect-ratio.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "周辺|地図|leader|お品書き|目的地"
npm run check:webapp
git diff --check
```

## 受入条件

- お品書きカードが地図viewportを覆わない。
- cardは地図外のstripで閲覧・選択・操作できる。
- leader lineで地図上の位置とcardの対応を追える。
- Task 15で修正したtransform時DOM再生成禁止を維持する。

## 予定コミットメッセージ

```text
fix(phase-07-4): move nearby cards outside map
```
