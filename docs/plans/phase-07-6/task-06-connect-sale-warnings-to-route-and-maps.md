# Phase 7.6 Task 6: sale warningをcurrent target・route map・nearbyへ接続

## 目的

sale mentionを利用者が巡回判断に使える補助warningとして表示する。現在の目的地ではpersistent messageを出し、route/nearby mapでは既存pin stateと直交するwarning markerを付ける。

## 対象外

- 自動route変更。
- ALNS入力/score変更。
- nearby ranking変更。
- circle status変更。
- full X timelineをnearby cardへ表示。
- warning専用modal。

## 対象ファイル

### 変更

- `apps/webapp/index.html`
- `apps/webapp/css/target.css`
- `apps/webapp/css/maps.css`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `tests/application-assembly.test.ts`
- `tests/route-map-candidate-preview.test.ts`
- `tests/nearby-map-view.test.ts`
- `tests/e2e/webapp.spec.ts`

### 新規作成

なし。warning表示は既存viewへの小さいmodifierで完結させ、専用view-model/component層を増やさない。

## Interfaces

BrowserApplication / UIへ渡す補助情報はformal NavigationStateを変更せず、

```ts
export interface SaleMentionReader {
  getSaleMention(space: string): SaleMentionState;
  getMentionSpaces(): ReadonlySet<string>;
  subscribe(listener: () => void): () => void;
}
```

とする。

route mapは最低限:

```ts
setSaleMentionSpaces(spaces: ReadonlySet<string>): void;
```

nearby mapも同じ意味のsetterを持つ。

setterは**既存pin DOMへclass/ARIAを差分反映**する。warning更新だけを理由に`renderNavigation()`/map全再構築を呼ばない。

## current target warning

current target stateが`mention`ならdetail内に:

```text
完売・売り切れに関する投稿があります
```

をpersistent表示。

`unknown`/`no-mention`ではwarningを隠す。

候補をmap上で選んだだけではcurrent target bannerを出さない。ただし候補pin/card自身のwarning markerは出してよい。

warningからmatched post全文を別modalへ開く機能は作らない。投稿panel内に該当postがrecent範囲にあれば通常一覧で見えるだけでよい。

## toast

次の場合にだけ既存notification UIで一度知らせる。

A. mention済みcircleがcurrent targetになった。
B. current target中に状態が`unknown`/`no-mention`から`mention`へ変わった。

重複signature:

```text
<space>:<sorted matchedPostIds>
```

同signatureの再renderでtoastを繰り返さない。新しいmatchedPostIdが増えた場合は再通知可能。

## map marker

base:

```html
<button class="map-pin next">
```

warning:

```html
<button class="map-pin next sale-mention">
```

CSSは既存pin色を置き換えず、外周/小さな`!`等の補助記号を使う。色だけで意味を伝えない。

ARIA:
- `現在の目的地 東A01、完売・売り切れ関連投稿あり`
- `保留中 東A02、完売・売り切れ関連投稿あり`

既存itinerary番号textを`!`で上書きしない。`::after`等の装飾を使う。

## ALNS / gesture保護

`DomRouteMapView`はALNS preview SVGをpin layer内へ持つ。`setSaleMentionSpaces()`はbutton群だけをqueryしてclass/ARIAを更新し、`pinLayer.innerHTML`を触らない。

以下をtestで証明:
- warning更新前後で`.optimization-preview-overlay`同一nodeが残る。
- zoom transformが変わらない。
- itinerary button textが変わらない。
- base `data-state` / state classが変わらない。
- selected/current route overlayが消えない。

full navigation rerenderが別理由で走る場合は既存render contractに従いwarning setを新しいpinへ再適用する。

## nearby

`DomNearbyMapView`のpin/card rendering時、mention spaceへ`.sale-mention`または`.sale-mention-badge`を追加する。

ranking、pagination、perimeter slot、leader line geometryを変えない。

warning updateだけなら、可能な範囲で既存render済みpin/cardへ差分classを当てる。warningによってcard sizeが大きく変わりperimeter layoutを壊すbadgeは禁止する。

## 実装手順

1. RED: route pinのbase state + itinerary labelを保ったままwarning class/ARIAだけ変わるtestを書く。
2. RED: optimization preview DOMとzoom transformをwarning updateが保持するtestを書く。
3. RED: nearby ranking/order/pageをwarningが変えないtestを書く。
4. RED: current targetだけpersistent banner、candidate previewだけではbannerなしのtestを書く。
5. RED: toast signatureで重複しない、新matched postで再通知するtestを書く。
6. route/nearby mapへ差分setterを追加する。
7. composition rootでTask 5の`DefaultEventDayXPostMonitor`を構築し、`BrowserApplication`へ`SaleMentionReader`/monitor portとして注入する。このTaskの時点でproduction warningを未接続のまま残さない。
8. BrowserApplicationでmonitor subscribeし、mention spacesをviewへ配る。X feature stateをNavigationStateへコピーしない。
9. current target変更時に`prioritizeCircle()`とwarning renderingを更新する。
10. CSSへ最小warning modifierを追加する。既存route/ALNS色を変更しない。
11. nearbyへ小さいwarning markerを追加し、perimeter/card geometryを維持する。
12. focused Vitest + mobile E2Eでroute/nearby双方を確認する。
13. visual snapshot変更が必要なら、人間が意図したwarning/UIを確認した後だけ更新する。

## 検証コマンド

```bash
npx vitest run --root . \
  tests/application-assembly.test.ts \
  tests/route-map-candidate-preview.test.ts \
  tests/nearby-map-view.test.ts \
  tests/x-post-panel.test.ts
npx playwright test tests/e2e/webapp.spec.ts --project=mobile-chromium
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- production composition rootからmonitor/warningが実際に接続される。
- current target mentionをpersistent表示。
- warning文言が在庫確定を主張しない。
- automatic route/status/ALNS mutationなし。
- route/nearby map両方にwarning。
- base pin stateとitinerary番号を保持。
- ALNS preview/route overlay/zoom/panをwarning更新で壊さない。
- nearby ranking/pagination/perimeter geometryを変えない。
- toastが再renderごとに出ない。

## 予定コミットメッセージ

```text
feat(phase-07-6): connect sale mention warnings
```
