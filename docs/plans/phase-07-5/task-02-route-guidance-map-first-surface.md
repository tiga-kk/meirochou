# Phase 7.5 Task 2: 経路画面をmap-first surfaceへ再構成

## 目的

経路案内画面の地図を大幅に拡大し、目的地詳細等の非本質UIを通常時に薄くする。

## 対象外

- current route計算、candidate route意味論、ALNS。
- purchase/holdの業務意味変更。
- catalog viewerの再実装。

## 前提と依存関係

Task 1完了。

## 読むべき文書と既存実装

- `apps/webapp/index.html`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/app/browser-application.ts`

## 対象ファイル

### 変更

- `apps/webapp/index.html`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `tests/navigation-view-model-split.test.ts`
- `tests/e2e/webapp.spec.ts`

### 新規作成

- `tests/route-map-first-layout.test.ts`

### 削除

なし。

## 実装手順

1. RED: 390px級viewportでnavigation mapが520pxを超えて拡大可能で、detailが初期collapsedであるtestを書く。
2. `index.html`を`compact summary -> map -> compact action bar -> collapsible detail`の順へ整理する。
3. `購入済`と`保留`はcollapsed detailの外へ移し、常時44px以上で操作可能にする。
4. `詳細`buttonを追加し`aria-expanded=false`を初期値にする。開閉でcurrent route/map transformをresetしない。
5. navigation mapの`max-height: 520px`とJSの`viewportMaxHeight: 520`依存を除く。
6. mobileでは`height: clamp(360px, 72dvh, 760px)`をCSSで与え、JSは実測`clientWidth/clientHeight`をTask 1 helperへ渡す。
7. current-location rowとroute priority controlのpadding/gapを縮める。ただしinput/button touch targetは44pxを維持する。
8. candidate selection中は必要なcandidate controlsだけ可視化し、地図を不必要に縮めない。
9. 390px、644x886、desktopでDOM geometry testを通す。
10. focused tests、check、buildを通してcommitする。

## テスト方針

「CSS classが存在する」ではなく、bounding boxでmapが従来より大きいこと、detail collapseでmap transformが保持されること、purchase/holdがcollapsed時も操作可能なことを証明する。

## 検証コマンド

```bash
npx vitest run --root . tests/route-map-first-layout.test.ts tests/navigation-view-model-split.test.ts
npx playwright test tests/e2e/webapp.spec.ts --project=mobile-chromium
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- mobile route mapが520px固定上限に縛られない。
- 通常時は地図が目的地detailより明確に大きい。
- 購入済/保留はdetailを開かなくても使える。
- detail open/closeでroute state、zoom、candidate stateを失わない。

## 予定コミットメッセージ

```text
feat(phase-07-5): make route guidance map first
```
