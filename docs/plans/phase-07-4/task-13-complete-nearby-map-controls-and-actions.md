# Phase 7.4 タスク13: 周辺地図の絞り込みcontrolsとcard actionを接続

## 目的

内部実装だけ存在していたpriority・件数・hold filterを人間が操作できるようにし、周辺カードを選択して「お品書きを見る」「目的地にする」を実行できるUI契約を用意する。

## 対象外

- カードの最終的な非重複配置。Task 15で行う。
- 新しいrouting use case。
- 周辺検索基準地点をRoute Guidanceの現在地として保存すること。
- 周辺地図から購入・保留を行うこと。

## 前提と依存関係

Task 10〜12と独立して実装できる。Task 15がこのTaskのcard selection/action契約を使う。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/nearby-circle-model.ts`
- `apps/webapp/js/shared/domain/circle-priority-filter.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/css/maps.css`

## 対象ファイル

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/css/maps.css`
- `tests/nearby-circle-model.test.ts`
- `tests/e2e/webapp.spec.ts`

### 削除

なし。

## 実装手順

1. nearby surfaceへpriority chip、件数5/10/15/20、`保留も表示`を追加する。
2. priority chipはGallery/routeと同じ完全一致・複数選択規則を使い、未選択を「すべて」とする。
3. controls変更時は`setNearbyFilters()`または同じ一箇所のstate更新へ接続し、`rankNearbyCircles()`の処理順を変えない。
4. card DOMを単一button前提から、選択可能container + 明示actionを持てる構造へ変更する。nested buttonを作らない。
5. card選択は`selectedSpace`をsurface内だけで保持し、選択cardへ`aria-selected`等の状態と前面化用classを付ける。
6. 「お品書きを見る」は既存`onShowCatalog`へ接続する。
7. 「目的地にする」用callbackを`DomNearbyMapView` constructorへ追加し、`BrowserApplication`から`handleSetNextTarget(circle)`へ接続する。
8. 目的地変更成功後のsurface close有無は、既存目的地画面が確認できるよう成功時に閉じる。失敗時は開いたまま既存error/toastを見せる。
9. filter変更で選択中cardが候補から消えた場合はselectionを解除する。

## テスト方針

- priority 10/9複数選択が候補へ反映される。
- 5/10/15/20件の各UIが上限へ反映される。
- hold off/onが候補へ反映される。
- card選択でactionが表示される。
- 「お品書きを見る」が既存catalog表示へ到達する。
- 「目的地にする」が`handleSetNextTarget`相当の既存manual destination経路へ一度だけ到達する。
- current position未確定時は既存error契約を維持する。

## 検証コマンド

```bash
npx vitest run --root . tests/nearby-circle-model.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "周辺|地図|優先度|目的地"
npm run check:webapp
git diff --check
```

## 受入条件

- 周辺地図だけでpriority・件数・holdを操作できる。
- cardを選択し、お品書き表示と目的地変更を明示操作できる。
- manual destination処理を二重実装していない。
- Route Guidance current positionを周辺originで上書きしていない。

## 予定コミットメッセージ

```text
feat(phase-07-4): complete nearby map controls and actions
```