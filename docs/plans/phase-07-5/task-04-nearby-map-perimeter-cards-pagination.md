# Phase 7.5 Task 4: 周辺cardをperimeter配置し10件単位paginationを追加

## 目的

お品書きを常時表示したまま地図を大きく保ち、10件までを一画面に非重複表示する。

## 対象外

- rankingアルゴリズム変更。
- 20件超の表示件数。
- force simulation。
- cardをmap viewport内へ重ねること。

## 前提と依存関係

Task 3完了。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/nearby-circle-model.ts`
- `apps/webapp/css/maps.css`
- Phase 7.4のleader line/detail実装

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/route-guidance/ui/nearby-catalog-pagination.ts`
- `apps/webapp/js/features/route-guidance/ui/nearby-catalog-perimeter-layout.ts`
- `tests/nearby-catalog-pagination.test.ts`
- `tests/nearby-catalog-perimeter-layout.test.ts`

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/css/maps.css`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `tests/nearby-map-view.test.ts`
- `tests/e2e/webapp.spec.ts`

### 削除

なし。既存layout helperの整理はこのTaskへ混ぜない。

## Interfaces

```ts
export interface NearbyCatalogPage<T> {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly startNumber: number;
  readonly endNumber: number;
  readonly total: number;
  readonly items: readonly T[];
}

export function paginateNearbyCatalog<T>(
  items: readonly T[],
  pageIndex: number,
  pageSize?: number,
): NearbyCatalogPage<T>;
```

`pageSize`のdefaultは10。

```ts
export type PerimeterEdge = "top" | "right" | "bottom" | "left";

export interface PerimeterSlot {
  readonly index: number;
  readonly edge: PerimeterEdge;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function buildNearbyPerimeterLayout(input: {
  workspaceWidth: number;
  workspaceHeight: number;
  itemCount: number;
  mode: "narrow" | "medium" | "wide";
}): {
  readonly mapRect: { x: number; y: number; width: number; height: number };
  readonly slots: readonly PerimeterSlot[];
};
```

narrow/mediumはtop/bottomへ最大5件ずつ、wideは四辺へ分配する。assignmentはanchorからslot内辺中央までの距離が短い順のdeterministic greedyとし、同距離はslot indexで決める。

## 実装手順

1. pagination RED: 5/10/15/20件のpage countとslice範囲を固定する。
2. perimeter RED: 390x844相当で10 slotが非重複、mapRectとslotが非重複、mapRectが正の操作領域を持つことを固定する。
3. wide RED: 1024pxで四辺slotを使い、中央mapを確保する。
4. pure helpersを実装する。
5. `DomNearbyMapView`へ`pageIndex`を追加し、area/origin/filter/hold/limit変更時だけ0へ戻す。
6. 5/10はpage controlを非表示、15/20だけ`前へ / 1–10 / 次へ`を表示する。
7. cardをslotへ配置する。画像はnatural aspectを維持し`max-width/max-height`内へcontainする。
8. selected card内にaction buttonを増築せず、`nearby-selection-toolbar`へ`お品書きを見る / 目的地にする`を表示する。
9. leader lineは既存二重線を維持し、anchorから実card rectの最寄り辺へ接続する。
10. pan/zoom/page変更時にcard DOMを毎frame作り直さない。page/filter candidateが変わった時だけ再構築し、transform時はleader座標だけ更新する。
11. 10件、15件、20件のE2Eを追加する。
12. focused verificationを通してcommitする。

## テスト方針

「10件存在する」だけでなく、10 cardのbounding rect同士とmap rectのintersection areaが0であることを確認する。15/20ではpage切替後のspace順も確認する。

## 検証コマンド

```bash
npx vitest run --root . tests/nearby-catalog-pagination.test.ts tests/nearby-catalog-perimeter-layout.test.ts tests/nearby-map-view.test.ts
npx playwright test tests/e2e/webapp.spec.ts --project=mobile-chromium
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- 5/10件は一度に全件表示。
- 15件は1〜10 / 11〜15。
- 20件は1〜10 / 11〜20。
- cardとmapが重ならない。
- card同士が重ならない。
- image aspect ratioを一律化しない。
- map操作中にcard DOMを再生成しない。

## 予定コミットメッセージ

```text
feat(phase-07-5): place nearby catalogs around map
```
