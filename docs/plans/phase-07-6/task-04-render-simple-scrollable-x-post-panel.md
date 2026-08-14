# Phase 7.6 Task 4: 簡素なscrollable投稿panelをroute detailへ接続

## 目的

現在表示しているサークルの最近のX投稿を、Phase 7.5後のcollapsed route detail内へ時刻+本文だけで表示する。Pixiv等の非X accountではnetwork requestを行わず`投稿情報なし`と表示する。

## 対象外

- X公式UIの模倣。
- media/avatar/display name/badge/engagement。
- 投稿本文のlinkify。
- nearby cardへのfull timeline。
- sale mention warning。
- background day scan。

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/x-post-monitoring/ui/dom-x-post-panel.ts`
- `tests/x-post-panel.test.ts`

### 変更

- `apps/webapp/index.html`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/x-post-monitoring/public-api.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/browser-application.ts`
- `tests/application-assembly.test.ts`
- `tests/navigation-view-model-split.test.ts`

### 削除

なし。

## UI contract

HTMLは既存`target-detail-meta`内に最小限追加する。

```html
<section id="target-x-posts" class="x-post-panel" aria-label="最近の投稿">
  <strong class="x-post-panel-title">最近の投稿</strong>
  <p id="target-x-post-message" class="x-post-message"></p>
  <div id="target-x-post-list" class="x-post-list"></div>
</section>
```

時刻は端末timezoneではなく`Asia/Tokyo`で`M/D HH:mm`表示する。`datetime`属性には元のISO timestampを保持する。

各post:

```html
<div class="x-post-item">
  <time datetime="...">12:31</time>
  <p>投稿本文</p>
</div>
```

本文は`textContent`。HTMLを組み立てて代入しない。

基本CSS:

```css
.x-post-list {
  max-height: 8rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.x-post-item p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
```

実際のspacing/borderは既存tokenへ合わせるが、X/Twitter固有色・ロゴ・カード装飾を追加しない。

既存account linkは非X URLにも使うため、Twitter iconを除去して汎用`アカウント`表示へ変え、外部tabには`rel="noopener noreferrer"`を付ける。内部DOM id renameはこのTaskの目的ではない。

## Panel interface

```ts
export interface XPostPanelTarget {
  readonly ref: EventDayRef;
  readonly circle: Circle;
}

export interface XPostPanel {
  show(target: XPostPanelTarget): Promise<void>;
  hide(): void;
  dispose(): void;
}

export class DomXPostPanel implements XPostPanel {
  constructor(options: {
    readonly document: Document;
    readonly client: XPostClient;
    readonly cache: XPostCache;
  });

  show(target: XPostPanelTarget): Promise<void>;
  hide(): void;
  dispose(): void;
}
```

`show()`内で`extractXHandle(circle.account)`を使う。

表示state:

```ts
type XPostPanelState =
  | "unsupported"
  | "loading"
  | "ready"
  | "empty"
  | "error";
```

- unsupported: `投稿情報なし`
- loading: `投稿を取得中…`
- ready: post rows
- empty: `投稿なし`
- error: cacheありならrowsを残し`投稿を取得できません`、cacheなしならmessageのみ

## pagination contract

初回:
1. target generationを更新
2. non-Xなら即unsupported、client/cacheを呼ばない
3. cacheがあれば即render
4. network first pageを取得
5. same target generationならmerge/render

scroll:
- `scrollTop + clientHeight >= scrollHeight - 48`
- `nextCursor !== null`
- `loadingMore === false`
のときだけ1回取得。

session中に取得した200件超の古いpostはDOM/session memoryへ追加してよいが、Task 3のpersistent recent cache上限200を超えてarchiveしない。

target switch時は旧AbortControllerをabortし、generation不一致responseを描画しない。旧targetのscroll requestが新target panelへ混ざらないこと。

## 実装手順

1. RED: Pixiv accountで`投稿情報なし`、client/cache network pathなしのtestを書く。
2. RED: X accountでcacheを先に描画し、その後network first pageで更新するtestを書く。
3. RED: empty/loading/error表示契約と、createdAtが端末timezoneに依存せずAsia/Tokyoの`M/D HH:mm`になるtestを書く。
4. RED: post本文`<img onerror=...>`等がDOM要素として実行/解釈されずtextになるtestを書く。
5. RED: scroll末尾で1回だけ次page、同cursor中の二重requestなしのtestを書く。
6. RED: target切替後に旧responseが描画されないtestを書く。
7. `index.html`へ最小sectionを追加し、account link表示を汎用化する。
8. `DomXPostPanel`を実装する。`innerHTML`でpost本文を描画しない。
9. composition rootでTask 3のclient/cacheから`DomXPostPanel`を構築し、`BrowserApplication`へ`XPostPanel` portとして注入する。このTaskの時点でproduction runtimeへ接続し、未接続のUIだけを残さない。
10. `BrowserApplication`のnavigation render経路で、active ref + **current target**をpanelへ渡す。candidate selectionでdetailTargetが変わっても投稿panelはcurrent targetのままとし、候補previewだけで別accountをfetchしない。
11. `DomRouteGuidanceView`にはX fetch/cache orchestrationを書き込まない。必要なDOM placeholderと汎用account link表示だけを担当させる。
12. current targetのdetailがcollapsedでも初回recent fetchは開始してよいが、panel DOMが地図の高さを常時奪わないことをgeometry/E2Eで確認する。
13. focused tests、check/build、mobile E2Eを通す。

## テスト方針

表示確認だけでなく、不要requestが出ないこととstale response isolationを証明する。

snapshot更新だけでUI合格にしない。390px級viewportでmap-first構成が維持され、detailを開いたとき投稿欄だけが内部scrollすることを実測する。

## 検証コマンド

```bash
npx vitest run --root . \
  tests/x-post-panel.test.ts \
  tests/application-assembly.test.ts \
  tests/navigation-view-model-split.test.ts
npx playwright test tests/e2e/webapp.spec.ts --project=mobile-chromium
npm run check:webapp
npm run build:webapp
git diff --check
```

E2Eでは`/api/x-posts`をPlaywright route interceptionし、CIからYahooを直接呼ばない。

## 受入条件

- Pixiv/非X/空accountは`投稿情報なし`でAPI requestなし。
- X accountはAsia/Tokyoの`M/D HH:mm` + 本文だけを表示。
- 投稿欄は約2件分で内部scroll。
- scroll末尾近く以外でpaginationしない。
- 同cursorの多重requestがない。
- target switch後のstale responseを描画しない。
- candidate previewだけではcurrent targetの投稿panel対象を変えない。
- production composition rootからpanelが実際に接続される。
- 本文からHTML/scriptを生成しない。
- route map-first layoutを崩さない。
- X/Twitter風の装飾を追加しない。

## 予定コミットメッセージ

```text
feat(phase-07-6): show simple x post feed
```
