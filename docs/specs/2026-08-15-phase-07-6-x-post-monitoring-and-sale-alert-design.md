# Phase 7.6 X投稿監視・完売関連警告 設計

## 目的

既存のサークル`account`からXプロフィールだけを識別し、Yahoo!リアルタイム検索のバックエンドをCloudflare Pages Functionから呼び出してテキスト投稿を取得する。現在の目的地の詳細では最近の投稿を簡素なスクロール欄で表示し、イベント当日の投稿はUI操作と独立して走査する。

当日投稿に`完売`、`売り切れ`、`売切れ`、`頒布終了`が含まれる場合は「完売・売り切れに関する投稿がある」という補助情報として扱う。これは在庫状態の確定ではなく、サークルの自動除外、目的地変更、ALNS入力変更には使わない。

## 製品挙動

### accountの解釈

既存`Circle.account` / `CircleRecord.account`だけを入力とする。CSV/GASへX専用列を追加しない。

X投稿取得対象として認識するのは次のprofile URLだけとする。

- `x.com/<handle>`
- `www.x.com/<handle>`
- `twitter.com/<handle>`
- `www.twitter.com/<handle>`
- `mobile.twitter.com/<handle>`

`handle`は`^[A-Za-z0-9_]{1,15}$`を満たすものだけを受理する。`home`、`search`、`explore`、`notifications`、`messages`、`compose`、`settings`、`i`、`intent`、`share`等の既知非profile route、別host、壊れたURLは対象外とする。

Pixiv等の非X URLは異常ではない。APIを呼ばず、投稿欄に`投稿情報なし`と表示する。元の`account`リンクはそのまま利用可能にし、画面上のラベルはX専用の見た目ではなく`アカウント`等の汎用表示にする。

### 投稿欄

X公式画面の再現はしない。必要情報は時刻と本文だけとする。

表示状態は次の5種類。

- 非X account / accountなし: `投稿情報なし`
- 取得中: `投稿を取得中…`
- 成功かつ0件: `投稿なし`
- 成功かつ投稿あり: 時刻 + 本文
- 取得失敗: cacheがあればcacheを残してエラー表示、なければ`投稿を取得できません`

画像、動画、avatar、display name、badge、いいね数、RP数、返信UI、Xロゴ、埋め込みtweet UIは作らない。

投稿欄は約2投稿分を基本高さとし、内部だけ縦scrollできる。初回APIは20件を取得し、末尾48px以内までscrollしたときだけ次ページを取得する。同じcursorの多重取得を禁止する。

### 完売関連警告

検出対象語は初期実装で次の4語に固定する。

```ts
export const SALE_MENTION_KEYWORDS = [
  "完売",
  "売り切れ",
  "売切れ",
  "頒布終了",
] as const;
```

投稿本文を`normalize("NFKC")`してsubstring一致を見る。`まだ完売していません`や`完売次第撤収`もmentionである。否定解析や商品単位解析は行わない。

状態は次の意味とする。

```ts
export type SaleMentionState =
  | { readonly status: "unknown" }
  | {
      readonly status: "no-mention";
      readonly checkedAt: string;
    }
  | {
      readonly status: "mention";
      readonly matchedPostIds: readonly string[];
      readonly matchedKeywords: readonly string[];
      readonly checkedAt: string;
    };
```

`no-mention`は「イベント当日の走査が完了した時点で対象語を含む投稿が見つからなかった」という意味だけで、在庫ありを保証しない。API error、途中打切り、event date不明は`unknown`であり`no-mention`へ倒さない。

警告表示は`完売・売り切れに関する投稿があります`とする。`完売しています`とは表示しない。

### 地図

route map / nearby mapの既存pin stateは変更しない。警告は直交する`.sale-mention` modifierとARIA文言だけを追加する。

```html
<button class="map-pin next sale-mention">
```

`next`、`selected`、`hold`、`done`、`start`等のbase state、itinerary番号、ALNS preview、正式route、pan/zoomを維持する。警告の更新だけで地図全体を再構築してALNS previewを消す実装は禁止する。

## API境界

### Browser -> Pages Function

公開するsame-origin APIは次だけ。

```text
GET /api/x-posts?handle=<handle>
GET /api/x-posts?handle=<handle>&cursor=<post-id>
GET /api/x-posts?handle=<handle>&day=YYYY-MM-DD
GET /api/x-posts?handle=<handle>&day=YYYY-MM-DD&cursor=<post-id>
```

任意の検索文字列、`since`、`until`、`results`、Yahoo URLはbrowserから指定させない。汎用検索proxyにしない。

response:

```ts
export interface XPost {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
}

export interface XPostPage {
  readonly schemaVersion: 1;
  readonly handle: string;
  readonly posts: readonly XPost[];
  readonly nextCursor: string | null;
  readonly fetchedAt: string;
}
```

browser側もresponseをruntime validationし、shape不正を空配列として扱わない。

error code:

```ts
export type XPostApiErrorCode =
  | "invalid_request"
  | "upstream_rate_limited"
  | "upstream_unavailable"
  | "upstream_schema_changed";
```

### Pages Function -> Yahoo

FunctionだけがYahoo側のraw schemaを知る。

- query: `p=ID:<handle>`
- 通常feed: `results=20`
- 当日scan: `results=40`
- pagination: `oldestTweetId=<cursor>`
- 当日scan: JSTの当日`00:00`以上、翌日`00:00`未満を`since` / `until`へ変換
- 人気順`md=h`は使わない
- media filterは使わない
- request headerは検証元記事の最小形に合わせ、`Accept: application/json, text/plain, */*`、`Referer: https://search.yahoo.co.jp/realtime/search`、固定User-AgentをFunction内だけで設定する

Yahooが返した投稿はFunction側でも`createdAt`を検証し、`day`指定時はJSTの日付範囲外をbrowserへ返さない。raw HTML、media、profile、engagement等は破棄する。

upstream responseの必須shapeが変わった場合は`upstream_schema_changed`。429は`upstream_rate_limited`。5xx/network errorは`upstream_unavailable`。challenge/CAPTCHA等を回避するコードは追加しない。

## Event dayの日付

現在のevent registryへ後方互換なoptional fieldを追加する。

```ts
export interface EventDay {
  readonly dayId: string;
  readonly displayName: string;
  readonly date?: string;
}
```

`date`は実在する`YYYY-MM-DD`だけをparserが受理する。dateなしのevent/dayは通常の最近投稿表示は可能だが、当日scanは行わずsale mentionは`unknown`とする。

C108 registryは次へ更新する。

```json
"days": [
  { "dayId": "day1", "displayName": "1日目", "date": "2026-08-15" },
  { "dayId": "day2", "displayName": "2日目", "date": "2026-08-16" }
]
```

日付境界は常にAsia/Tokyoで解釈し、端末timezoneには依存しない。

## browser cache

X投稿は正式なevent-day stateではなく、再取得可能な補助cacheとしてIndexedDBへ置く。`LocalEventDayState`、NavigationState、ALNS snapshotへ混ぜない。

DB:

```text
comipath-x-posts-v1
```

store:

```text
accountDays
```

key:

```text
<eventId>:<dayId>:<handle>
```

保存モデル:

```ts
export interface XPostCacheEntry {
  readonly key: string;
  readonly eventId: string;
  readonly dayId: string;
  readonly handle: string;
  readonly eventDate: string | null;

  /** reload直後の表示用。新しい順で最大200件。 */
  readonly recentPosts: readonly XPost[];

  /** 完売関連警告の根拠。recentPosts外でも保持し、新しい順で最大50件。 */
  readonly matchedPosts: readonly XPost[];

  readonly recentNextCursor: string | null;
  readonly lastRecentFetchAt: string | null;

  readonly dayScan: {
    readonly state:
      | "not-started"
      | "scanning"
      | "complete"
      | "partial"
      | "error";
    readonly scannedAt: string | null;
    readonly lastRefreshAt: string | null;
    readonly newestPostId: string | null;
    /** 分割scanを継続するupstream cursor。complete時はnull。 */
    readonly resumeCursor: string | null;
    readonly errorCode: XPostApiErrorCode | null;
  };
}
```

background scanは日付内の全ページを調べるが、対象語を含まない古い全投稿を恒久保存しない。表示用`recentPosts`を最大200件、警告根拠`matchedPosts`を最大50件だけ保持する。50件を超えるmatchがあっても`mention`自体は維持し、cacheを無制限に増やさない。

同一post idは重複させない。`recentPosts`は`createdAt`降順、同時刻ならid降順。

API失敗で既存cacheを削除しない。

## 当日scan

投稿panelのscroll paginationと完売検出scanは別用途とする。

background monitorはactive event-dayの`pending`と`held`を対象とし、同じhandleを複数spaceが共有する場合は1回だけ取得して、そのhandleに紐づく全spaceへ同じmention状態を反映する。`purchased`と`excluded`は新規scan対象から外すが、既存cacheは削除しない。

同時実行数は2。現在の目的地handleを最優先し、それ以外を後続queueとする。未知のrate limitへ不要なburstを出さないため、global request開始間隔は最低1秒とし、429/5xx時のbackoffとは別に常時適用する。

過去日で未走査なら日付境界までcursorを追う。現在日もまず既存当日投稿を日付境界まで走査してから増分更新へ移る。未来日は開始しない。

正常終了は、Functionが`nextCursor: null`を返し、それ以上当日postを追う必要がないことを示した場合とする。`posts.length === 0`だけでは終了しない。Function側filterによって空になっても`nextCursor`が残る場合があるためである。

upstream異常による同じcursorの再出現は進捗不能なので`error` + `upstream_schema_changed`相当とし、自動continuationを止める。通常の負荷安全弁として1回のscan sliceを1handle 50ページまたは2000 normalized postsまでに区切る。上限到達時だけ`partial` + `resumeCursor`を保存し、1分以上空けて次sliceをそのcursorから継続する。したがって安全弁は「当日取得を諦める上限」ではなく、長いscanをbackgroundで分割する境界である。`complete`時だけ`resumeCursor=null`にする。

現在日の増分refreshは原則10分間隔。current targetへ切り替わった時、`dayScan.lastRefreshAt`から60秒以上経過していれば優先refreshする。新着refreshは先頭から取得し、既知の`dayScan.newestPostId`へ到達したら終了する。

hidden中は新規background requestを開始しない。offline中も開始せず、visible/online復帰時に再開する。

429/5xxではglobal backoffを使用する。基本は1分 -> 5分 -> 15分。`Retry-After`がより長ければそちらを優先する。失敗はX featureだけを縮退させ、route guidance、購入、保留、GAS、catalogをrollbackしない。

## lifecycle

app start:
1. active event/dayを復元
2. X cacheを読んで警告を即derive
3. event dateが監視可能ならmonitor開始
4. current targetがあれば優先

event/day switch:
1. old monitorをstop
2. old AbortController/generationを無効化
3. new event/day cacheを読む
4. new monitorを開始

source refresh:
1. active circle/account集合を再取得
2. queueとspace-handle mappingを更新
3. obsolete handleの非同期結果を現在UIへ混ぜない

app stop:
- timer解除
- visibility/online listener解除
- in-flight request abort
- subscriptions解除

local data delete:
- activity delete: X cache維持
- circle-source delete: 対象event/dayのX cache削除
- event-day delete: 対象event/dayのX cache削除
- all-event-days: X cache全削除

## セキュリティ・可用性

- Yahoo raw responseをDOMへ直接入れない
- 投稿本文は`textContent`で描画
- browserから任意Yahoo queryを通さない
- X/Yahoo credentialをbrowserへ置かない
- upstream schema変更を0件扱いしない
- 取得失敗を在庫あり扱いしない
- cacheは正式business stateではない
- 外部API停止でnavigationを停止しない

## 対象外

- X/Twitter公式画面に似せたUI
- 画像/動画/avatar/display name/badge/engagement
- 投稿本文のlinkify
- LLM/NLPによる在庫判定
- 商品単位在庫
- 自動route除外・自動hold・自動購入状態変更
- ALNS評価関数/候補集合へのsale mention反映
- push notification
- server側DB/KV/D1/R2への投稿恒久保存
- 汎用Yahoo検索proxy
- bot challenge/CAPTCHA回避
- 新しいFacade/Manager/DI container/UI framework
