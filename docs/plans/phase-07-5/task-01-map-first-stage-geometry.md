# Phase 7.5 Task 1: 共通map-first stage geometryを確立

## 目的

route mapとnearby mapが同じ「大きいviewport内でaspect維持したstageをclip/panする」規則を使えるpure geometry contractを作る。

## 対象外

- route画面DOMの並べ替え。
- nearby controls/cardの変更。
- ALNS変更。
- `overflow: hidden`の撤廃。

## 前提と依存関係

Phase 7.4 Task 27完了。

## 読むべき文書と既存実装

- `docs/specs/2026-08-14-phase-07-5-map-first-ui-and-alns-visualization-design.md`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/nearby-map-workspace-layout.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/route-guidance/ui/map-stage-layout.ts`
- `tests/map-stage-layout.test.ts`

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `tests/nearby-map-workspace-layout.test.ts`
- `tests/route-map-view-contract.test.ts`

### 削除

なし。

## Interfaces

```ts
export interface MapStageLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  imageWidth: number;
  imageHeight: number;
  minimumShortSideOccupancy?: number;
}

export interface MapStageLayout {
  viewportWidth: number;
  viewportHeight: number;
  stageWidth: number;
  stageHeight: number;
  initialX: number;
  initialY: number;
  mode: "contain" | "bounded-cover";
}

export function calculateMapStageLayout(
  input: MapStageLayoutInput,
): MapStageLayout | null;
```

`minimumShortSideOccupancy`のdefaultは0.8。containで短辺占有率が0.8以上ならcontain、0.8未満なら`0.8 * coverScale`以上へ上げるbounded-coverとする。

## 実装手順

1. 390x608、644x638、1024x700と、横長/縦長画像のRED testを書く。
2. focused testを実行し、helper未実装によるFAILを確認する。
3. `calculateMapStageLayout()`をpure functionとして実装する。
4. nearby側の重複したcontain/bounded-cover計算をhelperへ置換する。
5. route側はまだviewport高さを変更せず、現在の実測viewport幅・高さに対するstage計算だけhelperへ寄せる。
6. route/nearby双方でimage aspect ratio、中心配置、crop後pan可能なstage寸法をtestする。
7. focused tests、`npm run check:webapp`、`git diff --check`を通す。
8. commitする。

## テスト方針

CSSやDOMの見た目ではなくgeometryをpure testする。横長画像でも`stageWidth / stageHeight === imageWidth / imageHeight`を保証する。

## 検証コマンド

```bash
npx vitest run --root . tests/map-stage-layout.test.ts tests/nearby-map-workspace-layout.test.ts tests/route-map-view-contract.test.ts
npm run check:webapp
git diff --check
```

## 受入条件

- route/nearbyで同じstage sizing contractを利用できる。
- aspect ratioを壊さない。
- bounded-cover時もstage外へUIがはみ出さない。
- route UIの高さはこのTaskではまだ変更しない。

## 予定コミットメッセージ

```text
refactor(phase-07-5): share map stage layout
```
