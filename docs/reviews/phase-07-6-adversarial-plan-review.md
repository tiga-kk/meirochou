# Phase 7.6 実装計画 敵対的レビュー

## 結論

Phase 7.6計画を、要件誤読、未接続実装、偽陽性テスト、外部API楽観視、無制限cache、route/ALNS破壊、進捗正本矛盾の観点から再レビューした。

初稿のままでは不合格だった。下記の問題を計画本文へ修正し、修正後は**実装計画としてAPPROVED**とする。ただしPhase 7.6の実装開始は`docs/status/progress.md`が示すPhase 7.5 closure確認後とし、このレビュー自体を現在進捗の正本にはしない。

## レビュー基準

- ユーザー要件を最小の実装で満たすか。
- X/Yahooの補助機能がroute guidanceの必須依存になっていないか。
- 実装したコードがproductionへ本当に接続されるTask境界か。
- testがmock存在確認だけでなく失敗し得る意味論を証明するか。
- `unknown`と「問題なし」を混同しないか。
- pagination/cacheがデータ量に対して有界か。
- Phase 7.5のmap-first / ALNS previewを壊さないか。
- 現在のdocs正本と矛盾しないか。
- 低レベル実装担当が別の設計へ逸脱できる曖昧さが残っていないか。

## 指摘と修正

### 1. 200件で当日scan完了とする案は要件未達 — 修正済み

**問題:** 初期案では1handle 10ページ/200件でscanを止める案があった。投稿数が200件を超えるaccountでは、イベント当日の古い完売投稿を見落とす。それでも`clear`相当へ進むと偽陰性になる。

**修正:** `nextCursor=null`までpaginationを継続する。50ページまたは2000 normalized postsは1回のbackground slice境界に限定し、`partial` + resumeCursorを保存して後続sliceで継続する。総取得上限にはしない。

### 2. `clear`という名前が「在庫あり」を暗示する — 修正済み

**問題:** keywordが見つからなかっただけで安全を意味しない。

**修正:** 状態名を`no-mention`へ変更し、「complete scan時点で対象語がなかった」だけの意味に限定。error/partial/date不明は`unknown`。

### 3. 全投稿をIndexedDBへ保存するとcacheが無制限化する — 修正済み

**問題:** 「全投稿をscanする」と「全投稿をarchiveする」を混同すると、投稿の多いaccountでstorageが増え続ける。

**修正:** scanは全pageを見るが、persistent cacheは`recentPosts`最大200、`matchedPosts`最大50だけ。古いnonmatchはscan後破棄する。

### 4. `matchedPosts`自体も無制限だった — 修正済み

**問題:** keyword matchが大量にある場合、別配列が無制限になり得た。

**修正:** newest 50件へbounded。50件を超えても`mention`状態は維持する。

### 5. feed用のnewest IDとday scan用cursor状態が混同されていた — 修正済み

**問題:** dateなしrecent feedにはイベント日外の投稿も入る。recent feed側のgeneric newest IDを増分day scanにも使うと、過去日/現在日の境界を誤る。

**修正:** `dayScan.newestPostId` / `dayScan.lastRefreshAt`としてday scan metadataへ閉じ込める。recent feedは`lastRecentFetchAt` / `recentNextCursor`。

### 6. browser responseをTypeScript castだけで信用する余地 — 修正済み

**問題:** Pages Function contractが壊れたとき、browserが不正shapeを正常データとして扱う。

**修正:** Task 3で`parseXPostPage()` runtime parserを必須化。malformed success responseはerror。

### 7. Yahoo schema不一致が「投稿なし」に化ける危険 — 修正済み

**問題:** undocumented upstreamでは最も起きやすい故障。

**修正:** Task 1で`upstream_schema_changed`を独立error codeとし、fixture testとlive smoke双方をgateにする。

### 8. 「rate limitなし」という記事記述を信じる設計 — 修正済み

**問題:** undocumented APIに対して無制限並列scanをすると実運用で壊れる。

**修正:** concurrency 2に加え、通常時もglobal request開始間隔1秒。429/5xxでは1分 -> 5分 -> 15分backoff。記事の楽観条件をacceptanceにしない。

### 9. current targetを優先しても大量account scanのburstが残る — 修正済み

**問題:** concurrencyだけではresponseが速い時にrequest開始頻度が高くなる。

**修正:** request start throttleをmonitor contractに明記しfake timer testを追加。

### 10. crash後にpersisted `scanning`が永遠に残る — 修正済み

**問題:** browser close/reloadでprocessが消えてもcache stateだけ`scanning`だと再開不能。

**修正:** monitor start時にpersisted `scanning`を未完了scanとして再開するtestを追加。

### 11. Pixiv accountをエラー扱いする余地 — 修正済み

**問題:** `account`はX専用fieldではない。Pixivが入ることは正常。

**修正:** `extractXHandle()`は非Xを`null`。panelは`投稿情報なし`、network request 0。元account linkは汎用`アカウント`表示へする。

### 12. X reserved routeをprofileと誤認する余地 — 修正要求をTask 2へ反映

**問題:** `x.com/home`等はregex上handleに見える。

**修正:** hostだけでなくexact 1-segment profile + known non-profile route拒否をtestする。少なくとも`home` / `search` / `explore` / `notifications` / `messages` / `compose` / `settings` / `i` / `intent` / `share`をprofileとして扱わない。

### 13. Task 4がUIを作るだけでproduction未接続になる危険 — 修正済み

**問題:** `DomXPostPanel`を作ってもBrowserApplication/composition rootから呼ばなければ、unit testだけgreenの偽実装になる。

**修正:** Task 4の対象に`assemble-comipath-application.ts`、`browser-application.ts`、`application-assembly.test.ts`を追加。このTask内でcurrent target panelをproduction接続する。

### 14. candidate selectionで投稿panelまで候補へ切り替わる曖昧さ — 修正済み

**問題:** `DomRouteGuidanceView`のdetailTargetはcandidateへ切り替わる。これに盲従すると地図を触るたび不要なX fetchが走る。

**修正:** X投稿panelはcurrent targetだけ。candidate previewは投稿fetch対象を変更しない。nearbyもfull timelineを表示しない。

### 15. Task 5 monitorが作られてもproduction未接続になる危険 — 修正済み

**問題:** monitor unit testだけ通してTask 6でwarningをmockすると未接続が残る。

**修正:** Task 6でcomposition rootから`DefaultEventDayXPostMonitor`を構築しBrowserApplicationへ注入することを受入条件に追加。

### 16. warning更新でALNS previewを消す危険 — 修正済み

**問題:** 現行route mapは`pinLayer.innerHTML=""`でfull renderし、同layerにALNS preview SVGもある。warningだけでfull renderすると探索表示が消える。

**修正:** `setSaleMentionSpaces()`は既存buttonのclass/ARIA差分更新だけにする。optimization preview node、zoom transform、itinerary text、base state、route overlay保持を明示test。

### 17. warningを新しいpin stateへ追加する案 — 却下

**問題:** `next` / `hold` / `done`等と相互排他的になり、route semanticsを壊す。

**修正:** `.sale-mention`を直交modifierとして追加。

### 18. warningをroute/ALNSへ自動反映する過剰実装 — 却下

**問題:** keyword substringは「まだ完売していない」等も拾うため自動除外の根拠にならない。

**修正:** warning-onlyをGlobal Constraintへ固定。monitorにはroute/business mutation dependencyを渡さない。

### 19. Pages Functionを既存Vite E2Eが実行すると仮定していた — 修正済み

**問題:** repoの通常dev/E2EはViteで、Wrangler依存はない。

**修正:** Function handler/parserはVitest、browser E2Eは`/api/x-posts` interception、外部到達性はCloudflare preview smokeに分離。

### 20. Cloudflare typeのためだけに依存追加する余地 — 修正済み

**問題:** `PagesFunction`型だけのために`@cloudflare/workers-types`を増やすのは不要。

**修正:** `onRequestGet`は最小structural contextで型付けし、`tsconfig.functions.json` + `typecheck:functions`を明示追加する。Cloudflare型packageは増やさない。

### 21. Wranglerを最初から追加する案 — 却下

**問題:** Git連携PagesでFunction deployできるなら不要。

**修正:** Phase 7.6ではWranglerを追加せずGit integration previewを使う。preview deploy経路自体が使えない場合は環境BLOCKEDとして扱い、計画外dependencyを勝手に増やさない。

### 22. event dayを端末の「今日」で決める案 — 却下

**問題:** timezone、事前/事後利用、複数event dayで誤る。

**修正:** event registryのoptional `date`を正本にする。dateなしはscanしない。JST固定。

### 23. `date`追加でlegacy registryを壊す危険 — 修正済み

**問題:** schema migrationを不要に発生させる可能性。

**修正:** schemaVersion 1のoptional fieldとして追加し、dateなしfixtureを必須regressionにする。

### 24. local data deleteとX cacheの寿命が不明 — 修正済み

**問題:** event/day削除後も警告cacheだけ残る。

**修正:** activityは維持、circle-source/event-dayは対象day削除、all-event-daysはclear。formal deletion成功後にcache cleanupし、cache cleanup failureで正式削除をrollbackしない。

### 25. external API障害がapp startを失敗させる危険 — 修正済み

**問題:** composition/lifecycleへ素直にawaitするとXだけの障害で案内全体を起動不能にできる。

**修正:** Task 7でX startup/cache/monitor errorをnonfatalにし、app start/navigationを継続するtestを要求。

### 26. live YahooをCI必須にするとflaky gateになる — 修正済み

**問題:** undocumented外部endpointの可用性で通常CIが壊れる。

**修正:** CIはfixture/normalized API mock。Cloudflare -> Yahooは別live acceptanceで記録する。

### 27. `progress.md`を先にPhase 7.6へ進める誘惑 — 却下

**問題:** 現行正本はPhase 7.5 Task 8 blocked。計画追加だけで現在Phaseを変更すると正本が事実と矛盾する。

**修正:** `progress.md`は今回変更しない。`docs/README.md`には「計画済みの次Phase」とだけ追加。

### 28. safety guardが「全投稿取得」を永久に諦める上限になっていた — 修正済み

**問題:** `partial`と正しく表示しても、50ページ/2000件で永久停止するならユーザー要件のbackground全日scan自体は達成できない。

**修正:** `dayScan.resumeCursor`を永続化し、安全境界は1回のscan sliceだけに適用。1分以上空けて次sliceを継続し、正常cursorが進む限り`nextCursor=null`まで走査する。browser crash後も保存cursorから再開する。

### 29. filtered empty pageをscan終了と誤認する危険 — 修正済み

**問題:** Functionがday範囲外postを除外すると`posts=[]`でもraw cursorが続く場合がある。emptyだけでcompleteにすると古い当日postを見落とす。

**修正:** browser monitorは`posts.length`ではなく`nextCursor===null`だけを正常完了条件にする。Functionはさらに追跡可能ならempty pageでもcursorを返す。

### 30. X featureのconcrete infrastructureをpublic APIへ露出する危険 — 修正済み

**問題:** `HttpXPostClient` / `BrowserIndexedDbXPostCache`を`public-api.ts`からexportすると、現行architecture guardの`public-api-exports-concrete-infrastructure`に抵触し、app側からconcreteへ依存しやすくなる。

**修正:** public APIはcontracts/pure helpersと必要なUI/use-case portだけを公開する。concrete `Http*` / `Browser*` infrastructureは`assemble-comipath-application.ts`だけがdeep importする。Task 3とTask 7のarchitecture gateへ反映。

### 31. lifecycle focused verificationから新規lifecycle testが抜ける偽陽性 — 修正済み

**問題:** Task 7で`tests/x-post-runtime-lifecycle.test.ts`を作成しても、focused commandがそのfileを直接実行しなければRED/GREEN証拠が弱い。

**修正:** Task 7 focused commandへ`tests/x-post-runtime-lifecycle.test.ts`を明示追加。

### 32. cursor loopを`partial`として自動継続すると低頻度の無限retryになる — 修正済み

**問題:** 同じ`nextCursor`が繰り返される異常を`partial + resumeCursor`にすると、tight loopは避けても1分ごと等に同じpageを永久取得し続ける。

**修正:** `partial`は50 pages / 2000 postsの安全slice境界だけに限定。cursor再出現はpagination contract不正として`error` + `upstream_schema_changed`相当へ落とし、自動continuationを停止する。

### 33. recent feedの再開cursorをoldest post IDから推測するprovider漏れ — 修正済み

**問題:** `recentPosts`の最古IDを次page cursorとして流用すると、「next cursor == oldest post id」というYahoo固有前提がbrowser cacheへ漏れる。

**修正:** cacheはFunction contractが返した`recentNextCursor`をそのまま保持する。browserはprovider cursorを推測しない。

### 34. Function/browserでerror response型が片側だけ定義される型ずれ — 修正済み

**問題:** error codeだけ揃えてもbody shape/statusが曖昧ならTask 3のruntime parserが独自解釈を始める。

**修正:** Task 1/2双方に`XPostApiErrorBody`を同名同fieldで定義し、HTTP statusを400/429/502へ固定。Task 3はerror bodyをruntime validateする。

### 35. 投稿日時を端末timezoneで表示する曖昧さ — 修正済み

**問題:** コミケ当日の時系列判断で端末timezone依存表示は不必要な混乱を生む。

**修正:** 投稿panelの時刻は常に`Asia/Tokyo`の`M/D HH:mm`。元ISOは`time[datetime]`へ保持する。

### 36. Task 4 production wiring testをfocused commandで実行していない — 修正済み

**問題:** Task 4が`application-assembly.test.ts`を変更するのにfocused commandから外れていると、panelのproduction wiringをそのTask単位で証明できない。

**修正:** Task 4 focused commandへ`tests/application-assembly.test.ts`を追加。

## type consistency check

レビュー後、隣接Task間で次を統一した。

- `XPost`: `id`, `text`, `createdAt`
- `XPostPage`: `schemaVersion`, `handle`, `posts`, `nextCursor`, `fetchedAt`
- `XPostApiErrorBody`: `schemaVersion`, `error.code`, `error.message`
- `SaleMentionState`: `unknown` / `no-mention` / `mention`
- persistent recent limit: 200
- persistent matched evidence limit: 50
- scan slice boundary: 50 pages / 2000 normalized posts -> `partial` + resumeCursor continuation
- request concurrency: 2
- global request start interval: >= 1秒
- current-day normal refresh: 10分
- current-target priority refresh threshold: 60秒
- cache identity: eventId/dayId/handle
- recent pagination continuation: persisted `recentNextCursor`
- day scan continuation: persisted `resumeCursor`
- event date timezone: Asia/Tokyo
- concrete infrastructure visibility: composition root only

## placeholder / ambiguity scan

次の曖昧表現を残さない方針でTaskへ落とした。

- 曖昧なerror処理指示ではなくerror codeと縮退挙動を列挙。
- 「必要ならcache」ではなくIndexedDB store/key/boundsを固定。
- 「古い投稿も取る」ではなくcursor終了条件とpartial条件を固定。
- 「警告表示」ではなく文言、class、ARIA、非自動変更を固定。
- 「テストする」ではなくfocused file/偽陽性防止観点を明示。
- 「Functionを動かす」ではなくunit contractとCloudflare live smokeを分離。

## 残る外部不確実性

唯一、計画だけでは確定できない主要事項はYahoo backendが実装時にもCloudflare Pages Functionから利用可能かである。

これは設計漏れではなく外部依存であり、Task 1を最初に置く理由である。通常HTTP requestで成立しなければ証拠を残してBLOCKEDにし、回避策を勝手に追加しない。

## 最終判定

修正後計画は次を満たす。

- ユーザー要件をwarning-onlyで満たす。
- Pixiv等の既存accountを壊さない。
- UIを必要最小限に留める。
- external providerをbrowser/routeから隔離する。
- cacheとpaginationを有界にする。
- 全日scan completenessを件数上限と混同しない。
- production wiringをTask単位で証明する。
- ALNS/map-first behaviorを守る。
- current progress canonを改ざんしない。

**判定: APPROVED（Phase 7.5 closure確認後にTask 1から実装可能）**
