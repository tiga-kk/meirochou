# Phase 7.5 Task 3: 独立地図の補助controlsをcompact drawer化

## 目的

独立「地図」画面の上部UIを通常時に薄くし、地図workspaceへ高さを返す。

## 対象外

- card perimeter配置とpagination。
- nearby ranking/priority意味論。
- catalog detail viewer変更。

## 前提と依存関係

Task 1完了。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/css/maps.css`
- `tests/nearby-map-view.test.ts`
- `tests/e2e/webapp.spec.ts`

## 対象ファイル

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/css/maps.css`
- `tests/nearby-map-view.test.ts`
- `tests/e2e/webapp.spec.ts`

### 新規作成

なし。

### 削除

なし。

## Interfaces

UI local stateとして`controlsExpanded: boolean`を持つ。storageへ保存しない。

```html
<button id="btn-nearby-toggle-controls"
        aria-expanded="false"
        aria-controls="nearby-map-controls">条件</button>
<span id="nearby-map-filter-summary">東7・すべて・5件</span>
<div id="nearby-map-controls" hidden>...</div>
```

## 実装手順

1. RED: open直後は`nearby-map-controls`がcollapsedで、条件buttonとsummaryだけが見えるtestを書く。
2. headerを`title / summary / 条件 / close`のcompact rowへ整理する。
3. area、現在地、基準地点、priority、件数、保留を既存`#nearby-map-controls`内へまとめる。
4. toggleで`hidden`と`aria-expanded`を同期する。
5. filter変更後にsummaryを更新し、drawerを閉じても値を維持する。
6. open/close、area切替、origin選択でfilter stateを意図せずresetしない。
7. drawer展開/収納後に`applyViewportLayout()`を呼び、map workspaceが残り高さを再取得する。
8. Escapeはdetailがなければnearby mapを閉じる既存挙動を維持する。
9. focused testとmobile E2Eを通してcommitする。

## テスト方針

drawerが閉じたとき実際にworkspace heightが増えることをbounding boxで確認する。単なる`hidden`属性testだけで完了しない。

## 検証コマンド

```bash
npx vitest run --root . tests/nearby-map-view.test.ts
npx playwright test tests/e2e/webapp.spec.ts --project=mobile-chromium
npm run check:webapp
git diff --check
```

## 受入条件

- open直後は補助controlsが展開されない。
- `条件`は44px以上で`aria-expanded`と見た目が一致する。
- collapsed時にPhase 7.4よりmap workspaceが高い。
- filter/originの意味論は変わらない。

## 予定コミットメッセージ

```text
feat(phase-07-5): compact nearby map controls
```
