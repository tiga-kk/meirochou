# Phase 7.4 タスク17: 地図viewport中心の配置位置を常時表示

## 目的

地図を拡大・移動して周辺識別子が見えなくなっても、現在見ている範囲の中心がどの配置付近かを常に把握できるようにする。

## 対象外

- GPS等による実世界現在地表示。
- 地図上の全ラベルをsticky表示すること。
- 新しい空間index library。

## 前提と依存関係

Task 11のzoom transform通知を再利用する。独立周辺地図ではTask 14の最終layoutを前提にする。

## 読むべき文書と既存実装

- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- C108 `points.json`のidentifier / number / center座標契約

## 対象ファイル

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/index.html`（通常経路地図の表示欄が必要な場合）
- `apps/webapp/css/target.css`
- `apps/webapp/css/maps.css`
- `tests/e2e/webapp.spec.ts`

### 作成候補

- nearest pointの純粋ロジックを既存testへ置きにくい場合のみ`tests/map-viewport-center.test.ts`

### 削除

なし。

## 実装手順

1. viewport中心のscreen座標を、`GestureZoomController`の`scale/x/y`とstage layoutから元画像座標へ逆変換する純粋処理を用意する。
2. overscrollで中心が画像外へ出た場合は画像境界へclampする。
3. `points.json`の全有効pointから元画像座標に最も近いpointを求め、identifier + numberを返す。ユーザーのcircle listだけに限定しない。
4. 通常route mapではarea display名と組み合わせ、`表示中心: 東7 J23付近`相当をmap付近の固定欄へ表示する。
5. standalone nearby mapにも同じ意味の欄を追加する。
6. pan/zoom transform通知を受けて更新するが、数千point探索をpointermoveごとに同期多重実行しない。100ms程度のthrottleまたは同等の軽量制御を使う。
7. area変更・image load・reset時にも値を更新する。
8. 表示中心の更新だけでroute planning / nearby ranking / card image loadを起動しない。

## テスト方針

- scale=1中央で期待pointを返す。
- zoom + pan後に別pointへ更新される。
- overscroll時は画像内pointへclampされる。
- route mapとnearby mapで同じnearest規則を使う。
- transform連打時に更新処理が無制限に同期実行されない。

## 検証コマンド

```bash
npx vitest run --root . tests/map-viewport-center.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "表示中心|地図|ズーム"
npm run check:webapp
git diff --check
```

`tests/map-viewport-center.test.ts`を作成しなかった場合は、nearest処理を追加した既存focused testを代わりに実行する。

## 受入条件

- 通常経路地図と周辺地図の双方で「表示中心: ...付近」が見える。
- pan/zoomに追従して内容が変わる。
- circle inputに存在しない配置点も`points.json`から表示できる。
- 操作体感を悪化させる過剰な探索を追加していない。

## 予定コミットメッセージ

```text
feat(phase-07-4): show map viewport center location
```