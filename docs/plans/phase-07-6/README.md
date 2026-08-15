# Phase 7.6: X投稿監視・完売関連警告・一覧順整理

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`（推奨）または`superpowers:executing-plans`を使い、TaskごとにRED → 最小実装 → focused verification → review → commitを行う。

**Goal:** 既存`account`がX profileの場合だけ最近のテキスト投稿を簡素に表示し、イベント当日の完売関連mentionをbackgroundで検出して補助警告を出す。加えて、既存`points.json`の`W_*` metadataを壁サークル分類の正本として再利用し、最適化の壁待機時間を実データへ接続し、一覧はpriority sortを廃止して位置/space順へ統一する。

**Architecture:** Browserはsame-origin `/api/x-posts`だけを呼び、Cloudflare Pages FunctionがYahoo!リアルタイム検索backendのraw contractを隔離する。投稿は正式LocalStorage stateへ混ぜずbounded IndexedDB cacheへ保存し、sale mentionはcached postからderiveする。壁分類はmap assetの`group_id`が`W_`で始まるpointからarea単位でwall identifier集合を導出し、CSV/GASへ列を追加せずoptimization準備時とgallery sort時に再利用する。warningとgallery sort metadataはroute/business stateへ書き戻さない。

**Tech Stack:** TypeScript / JavaScript / CSS / IndexedDB / Cloudflare Pages Functions / Vitest / Playwright。

## 着手条件

Phase 7.6の文書は先行して存在してよいが、実装開始前に次を行う。

1. `docs/status/progress.md`を読み、Phase 7.5 closure状態を確認する。
2. 最新remote HEADを取得し、本README・着手Task・design・planning basisを再照合する。
3. Phase 7.5 Task 8の残件がPhase 7.6変更ファイルと競合する場合は、Phase 7.5 closureを先に行う。
4. Task文書内の計画作成時SHAを開始SHAとして使わない。

現在の進捗正本をこのREADMEで上書きしない。

## 正本

Phase 7.6着手後の読み順:

1. `docs/status/progress.md`
2. `docs/plans/phase-07-6/README.md`
3. 着手する`docs/plans/phase-07-6/task-XX-*.md`
4. `docs/specs/2026-08-15-phase-07-6-x-post-monitoring-and-sale-alert-design.md`
5. `docs/specs/2026-08-15-phase-07-6-gallery-order-and-wall-classification-design.md`
6. `docs/reviews/phase-07-6-planning-basis.md`
7. `docs/reviews/phase-07-6-gallery-order-planning-basis.md`
8. `docs/reviews/phase-07-6-adversarial-plan-review.md`
9. `docs/reviews/phase-07-6-gallery-order-plan-review.md`

Phase 7.6がcurrent phaseになるまでは、`progress.md`が示すPhaseを優先する。

## Global Constraints

### X投稿・warning

- `Circle.account`を再利用し、X専用CSV/GAS列を追加しない。
- Pixiv等の非X accountは正常系。APIを呼ばず`投稿情報なし`。
- X投稿UIは時刻+本文だけ。X公式画面を模倣しない。
- media/avatar/engagement/linkifyを実装しない。
- 投稿本文は`textContent`で描画する。
- Yahoo raw responseはPages Function内で正規化しbrowserへ漏らさない。
- browserから任意Yahoo queryを指定できるproxyを作らない。
- `LocalEventDayState` / NavigationState / ALNS snapshotへX投稿やsale mentionを永続化しない。
- IndexedDBは表示用`recentPosts`最大200件と警告根拠`matchedPosts`最大50件だけを持つ。background scanの全非match投稿をarchiveしない。
- `no-mention`は在庫ありを意味しない。error/partial/date不明を`no-mention`にしない。
- warningでサークルを自動除外、hold、purchase、目的地変更しない。
- warningをALNS候補、評価関数、bestOrderへ反映しない。
- map warningは既存pin state、itinerary番号、route overlay、ALNS preview、pan/zoomを壊さない。
- gallery/nearbyへfull X timelineを追加しない。warningは小さい補助badge/markerだけにする。
- 外部API失敗でroute guidance、catalog、GAS、purchase/holdをrollbackしない。
- hidden/offline時にbackground requestを増やさず、通常時もglobal request開始間隔を1秒以上空ける。
- upstream challenge/CAPTCHA回避を追加しない。

### 壁分類・一覧順

- 壁分類の正本はmap asset `points.json`の`group_id`が`W_`で始まるpointとする。
- `ア` / `A` / `a` / `め` / `あ`等のC108固有identifier一覧をruntimeへハードコードしない。
- CSV/GASへ`queueClass`列を追加しない。`CircleRecord.queueClass`はmap assetを読めるoptimization準備時にderiveし、source/local stateへ書き戻さない。
- galleryのpriorityはfilterと表示だけに使い、sort keyへ使わない。
- normal circleは従来のarea/identifier/numberによるspace順を維持する。
- wall circleはsort時だけ、同じareaの最寄りnon-wall map pointのidentifier/numberをanchorとして扱う。
- nearest判定は同一map画像内の`center_x` / `center_y`のユークリッド距離二乗でよい。Dijkstra、route cost、grid探索をgallery sortへ使わない。
- gallery sortのために`Circle.space`、map point、route endpoint、NavigationState、ALNS input orderを破壊的変更しない。
- wall anchorが取得できない場合は元のspace順へ安全にfallbackし、gallery自体を開けなくしない。
- map asset取得失敗はgallery sort補正だけを縮退させる。route/purchase/holdを停止しない。

### 共通

- 新しいFacade、Manager、DI container、UI frameworkを追加しない。
- 新規libraryは実要件を満たせない証拠がある場合だけ追加する。
- visual snapshotは実画面を人間が意味的に確認してから更新する。

## Task順序

| Task | 内容 | 依存 |
|---|---|---|
| 1 | X投稿proxy契約とYahoo raw parserを確立 | Phase 7.5 closure確認 |
| 2 | event dateとX account contractを追加 | Task 1 |
| 3 | XPost clientとbounded IndexedDB cacheを追加 | Task 1〜2 |
| 4 | 簡素なscrollable投稿panelをroute detailへ接続 | Task 2〜3 |
| 5 | event-day全投稿scanとsale mention monitorを追加 | Task 2〜3 |
| 6 | sale warningをcurrent target / route map / nearbyへ接続 | Task 4〜5 |
| 7 | `W_*`壁分類を共通化し既存optimizationの壁待機時間へ実データ接続 | Phase 7.5 Task 6、map assets |
| 8 | galleryをspace順へ単純化しwall anchor補正と最小sale badgeを追加 | Task 6〜7 |
| 9 | lifecycle・削除・offline・E2E・実環境を閉じる | Task 1〜8 |

一度に一Taskだけ実装する。Task 1でlive contractが成立しない場合、Task 2以降の独立domain作業を無理にproduction接続せず、BLOCKED理由を文書化する。Task 7〜8のmap/gallery改善はYahoo live contractと独立して検証できるため、X外部到達性だけを理由に静的・local実装まで止めない。

## Phase受入条件

### 投稿取得

- X profile URLだけがAPI対象。
- Pixiv/その他/空欄は`投稿情報なし`でnetwork requestなし。
- `/api/x-posts`はhandle/cursor/day以外の任意検索入力を受けない。
- Yahoo schema不一致を投稿0件に見せない。
- browserもnormalized responseをruntime validateする。
- recent feedは20件単位で、scroll末尾付近だけ次ページを取得する。

### cache / scan

- cacheはevent/day/handleで分離。
- reload時はcacheを先に表示できる。
- recent cacheは最大200件。
- background scanは日付境界まで全ページを検査し、単なる200件上限をcomplete扱いしない。
- repeated cursorは`error` + `upstream_schema_changed`相当で自動continuationを止める。50ページ/2000件のslice境界だけは`partial` + cursor保存後に継続し、総取得上限にはしない。
- `posts=[]`だけで完了せず、`nextCursor=null`でのみday scanを`complete`にする。
- nonmatchの古い全投稿を恒久保存しない。
- 同一handleを複数spaceが共有してもrequestは1系統。
- event dateなしはscanせず`unknown`。

### sale mention

- `完売` / `売り切れ` / `売切れ` / `頒布終了`をNFKC正規化後に検出。
- complete scan + matchなしだけ`no-mention`。
- mentionは「完売関連投稿あり」と表示し、在庫確定と表現しない。
- 自動route変更をしない。

### UI / map / gallery

- 投稿panelは時刻+本文だけで約2件分、内部scroll。
- current target mention時にpersistent warning。
- warning対象pinは`.sale-mention`を追加してbase stateを保持。
- warning更新でALNS previewやzoom/panを消さない。
- nearby/galleryはfull timelineをcardへ埋め込まずwarningだけ。
- galleryはpriority sortを持たず、priority filterは維持する。
- normal circleは従来space順、wall circleだけsame-area nearest non-wall anchor位置へ補正する。
- gallery warning badgeは順序、swipe購入、card操作を変更しない。
- 200% text zoomでも本文、warning、gallery badgeが切れない。

### wall / optimization

- `W_*` metadataだけをwall分類の正本にする。
- C108固有identifierをruntimeハードコードしない。
- 現行C108では`e456=W_all/ア`、`e7=W_all/A`、`s12=W_all/a`、`w12=W_left/め + W_right/あ`をasset testで確認する。
- 同じareaでwall identifierとnon-wall identifierが交差しないことをasset testで証明する。
- optimization準備時にderived `queueClass`を付け、元CircleRecordをmutationしない。
- 既存wall/default service time contractへ流すだけで、ALNS objective/operatorは変えない。

### resilience

- 429/5xx/network errorはX featureだけを縮退。
- cache済み投稿/警告はofflineでも表示。
- event/day switchやapp stop後のstale responseが現在UIを更新しない。
- local delete scopeに応じてX cacheを削除する。
- gallery points load failure時はsymbolic space順へfallbackする。

### 最終検証

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

さらにCloudflare previewで`/api/x-posts` live smokeを行い、Yahoo失敗時にもroute guidance/galleryが利用可能なことを確認する。
