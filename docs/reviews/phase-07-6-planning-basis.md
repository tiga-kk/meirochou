# Phase 7.6 planning basis

## 基準

計画作成時の読み取り基準は`main`の`4e17de450b19d0ca6afa049dd37f59cc83691a14`。このSHAは実装開始SHAとして固定しない。Phase 7.6着手時は、その時点の最新remote HEADと正本を再取得する。

`main`の最新Webapp CIはこのSHAでgreenだが、`docs/status/progress.md`はPhase 7.5 Task 8をblockedとしており、人間/実機受入未完了を記録している。よってPhase 7.6計画を追加しても、現在フェーズをPhase 7.6へ変更しない。

## 現行コード事実

### accountとevent/day

- `CircleRecord` / `Circle`には既に`account?: string`がある。X専用列を追加する必要はない。
- `account`はX専用契約ではないため、Pixiv等を正常な非X accountとして扱う。
- `EventDay`は現在`dayId` / `displayName`だけでcalendar dateを持たない。
- `parseEventRegistry()`も同じ2フィールドだけを構築している。
- したがって当日scanにはevent registryのoptional `date`追加が必要。

### route detail

Phase 7.5後の経路画面は`summary -> map -> action bar -> collapsed detail`。detail内にはcatalog画像、meta、account linkがある。

X投稿欄は地図の外側かつcollapsed detail内のmeta側へ追加する。投稿欄を地図上へoverlayしない。購入/保留はdetail外の既存action barを維持する。

現行account linkは`target-tweet-link`という内部idとTwitter icon/`Link`表示を持つが、accountはPixivの場合もある。Phase 7.6では大規模renameを目的にせず、表示を汎用`アカウント`へ直す。既存DOM idのrenameは必要性がなければ行わない。

### route / nearby map

`DomRouteMapView`は`map-pin ${pin.state}`で既存stateを描画し、itinerary番号やARIAを後付けする。ALNS previewは同じpin layerの独立SVG overlayである。

sale mention更新で`pinLayer.innerHTML=""`を伴う全面renderを無条件に呼ぶと、ALNS previewやgesture中の状態を消す危険がある。Phase 7.6は警告class/ARIAだけを既存pinへ差分反映できる経路を優先し、必要なfull navigation renderが発生した場合もpreview再描画契約を壊さないテストを置く。

`DomNearbyMapView`はPhase 7.5でmapとperimeter catalog panelを分離済み。「お品書きを見る」は既存catalog modalへ委譲される。X timelineをnearby cardへ埋め込まず、nearbyではpin/cardの警告表示だけを追加する。

### composition / persistence

`assemble-comipath-application.ts`がbrowser infrastructureのcomposition root。X client/cache/monitorもここで構築する。新DI containerを追加しない。

正式なevent/day stateはLocalStorage上の`LocalEventDayState` schema v2。X投稿は再取得可能な補助cacheなのでここへ追加せずIndexedDBを使う。

local data deletionは既にcatalog cache cleanup wrapperをcomposition rootで重ねている。X cache cleanupも同じ小さなdecorator方式で足し、`DeleteLocalDataUseCase`本体に外部cache責務を混ぜない。

## deploy / test事実

repoの通常webapp dev/E2EはViteを使う。`package.json`にWranglerは現在ない。Cloudflare Pages Functionを追加しても既存Vite dev serverが自動で実行するわけではない。

したがってTask 1は、
- Yahoo raw parser / request builderをpure codeとしてVitestで検証
- Pages Function handlerをfetch stubで検証
- browser E2Eでは`/api/x-posts`をPlaywright route interception
- Cloudflare previewではlive smoke

に分ける。Function用typecheckは既存TypeScriptで専用tsconfigを追加し、WranglerはPhase 7.6へ追加しない。Git integration preview自体が使えなければ環境BLOCKEDとして記録する。

## 外部API事実と不確実性

利用候補のYahoo!リアルタイム検索backendは公式公開API契約ではない。記事で`pagination` endpoint、`ID:<username>`、`oldestTweetId`、`since` / `until`等が確認できる一方、2026年7月には同じ利用者からrate limit/outage報告もある。

よって「レート制限なし」「常時利用可能」を受入条件にしない。Task 1で実レスポンスとCloudflareからの到達性を先に証明し、失敗時はX featureだけをBLOCKED/縮退させる。

## 過剰実装防止

Phase 7.6で必要なのは、X profile判定、text post取得、bounded cache、単純keyword mention、補助warningだけ。

次は追加しない。

- X公式UI clone
- social graph/profile model
- 汎用search service
- server-side database
- cache synchronization
- automatic inventory state
- route scoring integration
- generic polling framework
- generic notification framework
- generic repository abstraction beyondこのfeatureで実在するport
