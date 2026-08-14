# Phase 7.4 Task 25: 独立地図をレスポンシブなワークスペースへ再設計

## 目的

独立「地図」画面の余白を地図とcatalog panelへ再配分し、地図を大きく保ちながら、お品書きを地図外の折り返しgridまたはside panelへ自然な縦横比で表示する。

## 対象外

- nearby ranking、priority semantics、origin計算の変更。
- leader lineの意味変更。
- cardを再びmap viewport上へ重ねること。
- 横一列だけのcard stripへ戻すこと。
- 新しいlayout libraryの導入。

## 前提と依存関係

Task 24後に実施することを推奨するが、motion実装へ依存しない。Task 13〜17で追加済みのcontrols、card action、leader line、center labelを維持する。

## 読むべき文書と既存実装

- `docs/specs/2026-08-14-phase-07-4-motion-and-map-workspace-redesign.md`
- `docs/reviews/phase-07-4-second-human-acceptance-failures.md`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/nearby-catalog-layout.ts`
- `apps/webapp/js/features/route-guidance/ui/catalog-orientation.ts`
- `apps/webapp/css/maps.css`
- `tests/nearby-map-view.test.ts`
- `tests/nearby-catalog-layout.test.ts`
- `tests/nearby-map-aspect-ratio.test.ts`

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/route-guidance/ui/nearby-map-workspace-layout.ts`
- `tests/nearby-map-workspace-layout.test.ts`

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/nearby-catalog-layout.ts`
- `apps/webapp/css/maps.css`
- `tests/nearby-map-view.test.ts`
- `tests/nearby-catalog-layout.test.ts`
- `tests/nearby-map-aspect-ratio.test.ts`
- `tests/e2e/webapp.spec.ts`

### 削除

横一列strip専用のCSS/layout処理は、新workspaceへ完全移行できた範囲で削除する。

## 追加するインターフェース

`nearby-map-workspace-layout.ts`へviewport geometryからlayout modeを返すpure helperを作る。

```ts
export type NearbyMapWorkspaceMode = "narrow" | "medium" | "wide";

export interface NearbyMapWorkspaceLayout {
  mode: NearbyMapWorkspaceMode;
  mapWidth: number;
  mapHeight: number;
  panelWidth: number;
  panelHeight: number;
  cardColumns: 2 | 3;
  initialMapScaleMode: "contain" | "bounded-cover";
}

export function calculateNearbyMapWorkspaceLayout(input: {
  viewportWidth: number;
  viewportHeight: number;
  controlsHeight: number;
  imageWidth: number;
  imageHeight: number;
}): NearbyMapWorkspaceLayout;
```

固定ケースとして少なくとも390x844、644x886、900px以上をtestする。644x886では現行スクリーンショットよりmap領域が明確に大きくなり、card panelが水平scrollを必要としないことを契約にする。

`bounded-cover`は、通常のcontainでmap画像がmap viewportの幅または高さの80%未満しか占めず大きなletterboxを生む場合に使う。画像aspect ratioを変えず、短辺方向をviewportの少なくとも80%まで拡大し、はみ出した長辺はpan可能にする。画像を歪めたり、cropした領域へ到達不能にしたりしない。

## DOM構成

`DomNearbyMapView`は次の責任分離にする。

```text
nearby-map-dialog
  compact controls
  nearby-map-workspace
    nearby-map-viewport
      map transform layer
      origin / pins / center label
    nearby-map-catalog-panel
      wrapping card grid
    nearby-map-leader-layer  (workspace全体のpointer-events:none overlay)
```

wideではworkspace内でmapとpanelを横並び、narrow/mediumでは縦並びにする。

## 実装手順

1. pure layout testへ390x844、644x886、900px以上のREDケースを追加する。特に644x886でmapが小さすぎる旧layoutと、水平stripを許す旧layoutを落とす。
2. contain時の画像占有率が80%未満になるfixtureを追加し、`bounded-cover`へ切り替わるRED testを書く。aspect ratio維持とpan可能範囲も固定する。
3. `calculateNearbyMapWorkspaceLayout()`を実装し、controlsの実測高を差し引いた残領域をmap/panelへ配分する。dialogは`100dvh`相当を使う。
4. controlsをcompact rowへ整理する。area/originとpriority/件数/holdを必要以上の縦余白で分離しない。44px targetは維持する。
5. `DomNearbyMapView`のcard layerをviewportからworkspaceのcatalog panelへ移す。cardはhorizontal flex stripではなくCSS gridで折り返す。
6. mediumの644px級では3列を第一候補、内容が44px操作領域を満たせない幅なら2列へ落とす。wideでは右side panel、narrowでは2列を基本とする。panel overflowは縦方向だけ許可する。
7. card画像の固定height/aspectを外し、`width:100%; height:auto; object-fit:contain`を基本にする。`classifyCatalogOrientation()`のclassで最大高等を補助しても、縦横を同じ比率へ強制しない。
8. leader SVGをworkspace全体へ移し、map anchorをworkspace座標、card端点をcardの実rectから解決する。pan/zoom/panel scroll時はline geometryだけ更新する。
9. 既存card DOMをpan/zoomのたびに再生成しないことを回帰testで維持する。
10. E2Eで5件表示時に水平card scrollが不要、cardがmapと交差しない、地図画像の占有率が80%以上、縦/横画像比が異なることを確認する。

## テスト方針

snapshotだけで合格させない。geometry testでmap領域、画像占有率、panel mode、列数、水平overflowなしを数値で証明し、E2Eで実DOMのcard rectとmap rectが交差しないことを確認する。

横長/縦長地図はaspect ratioを保持し、containで大きなletterboxが生じる場合だけbounded-coverを使う。初期cropを許しても、GestureZoomControllerで全領域へpanできることをtestする。

## 検証コマンド

```bash
npx vitest run --root . tests/nearby-map-workspace-layout.test.ts tests/nearby-map-view.test.ts tests/nearby-catalog-layout.test.ts tests/nearby-map-aspect-ratio.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "地図|nearby|お品書き|leader"
npm run check:webapp
npm run test:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- 390x844、644x886、900px以上で意図したresponsive modeになる。
- 644x886級で第二回確認時より地図が明確に大きい。
- containで大きなletterboxが出る場合も地図画像がmap viewportの短辺方向80%以上を占める。
- cropされた領域へpanで到達できる。
- cardはmapを覆わない。
- 5件で横一列stripを要求せず、水平scrollなしで2〜3列へ折り返す。
- narrowで必要な縦scrollは許容する。
- wideでは右side panelへ余白を活用する。
- 横長/縦長catalog画像が同じaspect ratioへ強制されない。
- leader lineの高コントラストとanchor対応を維持する。

## 予定コミットメッセージ

```text
feat(webapp): redesign nearby map workspace
```
