# Phase 7.4 タスク7: 地図上のお品書きカード・leader line・重なり回避

## 目的

Task 6の上位候補を、要望画像のように地図上のcircle anchorとお品書きカードをleader lineで結んで表示する。5〜20件を対象に、単純で決定的な配置で重なりを抑える。

## 対象外

- physics simulation。
- 外部layout library。
- カードからの購入・保留。
- カードからRoute Guidance current targetを直接変更する機能。
- OCR。

## 前提と依存関係

Task 6完了。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/css/gallery.css`
- `apps/webapp/css/maps.css`
- 既存PDF/画像拡大modal

## 対象ファイル

### 作成

- `apps/webapp/js/features/route-guidance/ui/nearby-catalog-layout.ts`
- `tests/nearby-catalog-layout.test.ts`

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/css/maps.css`
- 既存のお品書き拡大表示へ接続する必要最小限のapp/view file
- E2E

### 削除

なし。

## 実装手順

1. anchorとカード矩形から決定的配置を返す純粋関数へREDを追加する。
2. 各anchorについて、上・下・左・右・斜め等の固定候補位置を同じ順番で評価する。
3. stage境界からはみ出す候補へpenalty、既配置cardと重なる候補へoverlap面積penalty、anchorから遠い候補へ小さい距離penaltyを与え、最小scoreを選ぶ。
4. score同値時のtie-breakを候補位置順で固定する。ランダム値を使わない。
5. 地図stage内にcard layerとleader SVG layerを置き、map transform layerと一緒にpan / zoomさせる。zoomごとの再レイアウトloopは作らない。
6. cardには`space`、priority、`tweet`画像を表示する。画像なし/読込失敗は既存Gallery相当のplaceholder。
7. leader lineはcard矩形の近い辺からanchorまで引き、cardとcircleの対応が分かるようにする。
8. card tapは既存のお品書き拡大表示を呼ぶ。購入・保留・現在地変更のactionは置かない。
9. filter / limit / origin / area変更時だけ候補とlayoutを再生成する。

## テスト方針

- 同じ入力は同じ配置。
- card数が5 / 10 / 15 / 20を超えない。
- 余裕があるfixtureではcard同士が重ならない。
- 密集fixtureでは完全回避不能でも、決定的な最小penalty配置を返す。
- leaderが正しいspace anchorへ対応する。
- `tweet`なし/読込失敗でplaceholder。
- card tapが既存拡大表示へ接続され、Route Guidance stateは変わらない。
- pan / zoom後もcardとleaderが同じtransform layerで追従する。

## 検証コマンド

```bash
npx vitest run --root . tests/nearby-catalog-layout.test.ts tests/nearby-map-view.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "周辺|お品書き|地図"
npm run check:webapp
git diff --check
```

## 受入条件

- 指定件数のお品書きが地図上へ表示される。
- space / priorityが確認できる。
- leader lineで元circle位置との対応が分かる。
- 5〜20件で不要な常駐layout処理を使わない。
- card tapで既存のお品書き拡大表示が開く。
- 周辺map操作だけでRoute Guidanceを変更しない。

## 予定コミットメッセージ

```text
feat(phase-07-4): overlay nearby catalogs on map
```
