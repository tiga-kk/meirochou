# Phase 7 オフライン準備・イベント管理・ビジュアル再設計 設計

## 目的

コミケ会場の不安定な通信環境を前提に、家のWi-Fi等で必要なお品書きを事前保存できるようにする。同時に、現在のselect/toggle中心の「設定」をイベント・日程単位の管理画面へ置き換え、データsource、読込状態、GAS outbox、offline保存状態を一覧で理解・操作できるようにする。

Phase 7はPhase 6で残った、設定部品が縦積みされ全体状態を把握しづらい問題を解消するUI再設計も扱う。ただしRoute Guidanceのdomainやrouting algorithmを再構築しない。

## 確定要求

1. event/dayに属するお品書き画像をユーザー操作で一括offline保存できる。
2. offline保存は通常のHTTP browser cache任せではなく、Service Worker + Cache Storageで明示的に保持する。
3. 保存操作は自動常時downloadではなく、ユーザーが家などで`オフライン準備`を押したときに行う。
4. 保存中はPhase 6.1で追加するasync operation indicatorへ`31 / 52`のようなprogressを表示する。
5. management画面でevent/dayごとに、イベント、日程、source種別、GAS/CSV source情報、データ読込状態、GAS queue件数、catalog offline保存件数を一覧できる。保存状況を確認できなかった状態と0件保存済みを区別する。
6. management画面からevent/dayを開く、sourceを再読み込みする、source設定を編集する、offline準備する、local dataを削除する操作へ進める。
7. registryに存在しないeventをブラウザ内だけで任意作成しない。地図bundleのないeventを作ってもroute guidanceできないためである。
8. registryに存在する未設定event/dayは管理一覧に表示し、そこからsource設定を開始できる。
9. GAS sourceは現行contractどおりevent/dayあたり1つのsheetを正本とする。Phase 7でmulti-sheet sourceへ拡張しない。
10. 管理一覧ではGAS WebApp URLを画面幅いっぱいに生表示せず、識別可能な短縮表示にする。編集detailでは完全URLを確認・変更できる。
11. main navigation画面から設定部品の縦積みを取り除き、管理操作は独立した`管理`画面へ移す。
12. visual redesignは装飾を増やすのではなく、地図・お品書き・現在の行動を優先し、管理画面はtable/listとして情報密度を高く保つ。
13. offline保存できなかった画像が存在しても、成功した画像cacheを巻き戻さない。結果を`47 / 52 保存済み、5件失敗`のように表示する。
14. offline時は保存済み画像を表示し、未保存画像だけ`No Image / オフライン未保存`相当のfallbackにする。
15. Cache Storageの失敗・quota不足をcircle dataや購入履歴の失敗へ昇格させない。
16. 同じcatalog URLを複数event/dayが参照できる。片方のlocal dataを削除しても、残るevent/dayが参照する共有cacheを削除しない。
17. Phase 7ではcatalog URL文字列をcache identityとして扱う。同じURLのresponse body差し替えを自動検出するための追加DBやmetadata管理は導入しない。

## お品書きオフラインキャッシュ

### Service Workerの役割

Phase 7ではService Workerを「事前保存済みお品書き画像のoffline fallback」に限定して導入する。app shell全体のPWA化、install prompt、background sync、push notificationは追加しない。

Service Workerが扱うのはcontrolled pageからの`GET` image requestだけとする。`request.destination === "image"`を満たすrequestについてcatalog cacheを確認し、cache hitがある場合だけそのresponseを返す。cache missなら即networkへ委譲する。

これによりHTML、JavaScript、CSS、map asset等を一般的なcache-firstへ変更しない。別のpersistent allowlist DBは作らず、catalog cache entry自体を「ユーザーが事前保存した画像」の判定に使う。

外部画像URLはcross-origin opaque responseになる可能性を許容する。事前保存は`Request`を適切なmodeで作り、成功したresponseをCache Storageへputする。opaque responseのbody内容をJavaScriptで検査しない。

### Application側のport

```ts
export interface CatalogOfflineCachePort {
  getStatus(urls: readonly string[]): Promise<{
    cached: number;
    total: number;
  }>;

  cacheAll(
    urls: readonly string[],
    onProgress: (progress: { current: number; total: number }) => void,
  ): Promise<{
    cached: readonly string[];
    failed: readonly { url: string; reason: string }[];
  }>;

  remove(urls: readonly string[]): Promise<void>;
}
```

UI/controllerはCache APIを直接触らない。browser infrastructure implementationがService Worker registrationとCache Storageへ接続する。

### Cache keyと内容更新

cache nameはschema version付きの固定名、例`comipath-catalog-v1`とする。event/dayごとにcacheを分割せず、URL文字列をkeyにする。同じ画像URLを複数event/dayが参照しても1 copyで済ませる。

Phase 7ではURL文字列をcontent identity兼cache identityとして扱う。

- 同一URLはdedupeし、既にcache済みなら`cacheAll()`で再downloadしない。
- source refresh後のoffline statusは、現在のcircle listに含まれるcatalog URL集合を正本として`cache.match()`で再計算する。
- 外部側で同じURLのresponse bodyだけが差し替わっても、Phase 7では自動検出・自動refreshしない。
- 新しい画像内容を確実に取得したいsourceは新しいURLを返す前提とする。

opaque responseの内容比較、ETag管理、独立したcache metadata DBは追加しない。

### Local data削除時のcache cleanup

catalog cacheはevent/dayを跨いでURL単位で共有されるため、削除scopeに含まれたURLをそのまま`remove()`してはいけない。

`circle-source`、`event-day`、`all-event-days`のcleanupは次の順序とする。

1. local deletion前に、削除によって参照が消える可能性があるURL集合を`candidateUrls`として取得する。
2. 既存Local Data Deletionを実行する。失敗したらcache cleanupは行わない。
3. local deletion成功後、repositoryに残る全event/dayのcurrent catalog URL unionを`remainingReferencedUrls`として取得する。
4. `candidateUrls - remainingReferencedUrls`だけをCache Storageから削除する。
5. cache cleanup失敗はdiagnosticとして扱い、成功済みlocal deletionをrollbackしない。

`activity`削除はcircle sourceを保持するためcatalog cacheを削除しない。

local deletion後の残存参照確認自体に失敗した場合は、その回のcache cleanupをskipする。共有cacheを誤削除するより、不要cacheが一時的に残る方を選ぶ。

### Storage persistence

`navigator.storage.persist()`はbest-effortで要求してよい。拒否されてもoffline保存処理を失敗扱いにしない。`navigator.storage.estimate()`が利用できる場合は管理画面で容量参考値を表示してよいが、Phase 7受入条件にはしない。

## Event/day管理モデル

現行`event-day-selector` + `source-manager` + `outbox-panel` + delete optionsの縦積みを、event/day一覧を起点とする管理UIへ変える。

一覧row/cardの表示model:

```ts
export interface EventDayManagementRow {
  readonly ref: EventDayRef;
  readonly eventLabel: string;
  readonly dayLabel: string;
  readonly configured: boolean;
  readonly selected: boolean;
  readonly sourceType: "csv" | "gas" | "none";
  readonly sourceLabel: string;
  readonly sourceEndpointSummary: string | null;
  readonly circleCount: number;
  readonly pendingGasCount: number;
  readonly offlineCatalog: {
    readonly cached: number | null;
    readonly total: number;
  };
}
```

`cached === null`はCache Storage statusの取得失敗・確認不能を表す。`cached === 0`は正常に確認でき、保存済みURLが0件であることを表す。この2つを同一表示にしない。

row builderはregistry順を維持し、current catalog URL集合から`CatalogOfflineCachePort.getStatus()`を呼ぶ。複数rowのstatus取得は独立しているため並行化してよい。1 rowのstatus取得失敗はそのrowだけ`cached:null`へ落とし、他rowと管理画面全体の描画を継続する。

表示イメージ:

```text
C108 / 1日目             GAS
シート: circle_day1      データ 532件
URL: script.google.com/…/exec
GAS同期 3件待ち          お品書き 521 / 532 保存済み

[開く] [再読込] [オフライン準備] [編集] [削除]
```

status取得失敗時は`お品書き 保存状況を確認できません`等とし、`0 / N`へ丸めない。

未設定row:

```text
C108 / 2日目             未設定
データなし                GAS同期 0
お品書き 0 / 0

[設定する]
```

## 管理画面のnavigation

main headerの`設定`gearによるinline展開は廃止し、`管理`buttonからfull-screenまたはlarge dialogのmanagement surfaceを開く。新しいrouterを導入する必要はない。

管理画面の第一層はevent/day一覧。source URL入力や削除confirmation等の詳細操作はrow選択後のdetail/dialogへ出す。最初の画面で全入力欄を並べない。

管理画面を閉じると元のnavigation画面へfocusを戻す。mobileではsafe-areaを考慮し、200% text zoomでも操作を失わない。

## Source refresh

`再読込`は現在保存済みsourceを使ってpreviewを取得し、既存diff確認→apply契約を再利用する。GAS URL/sheetを毎回入力し直させない。

CSV sourceは過去の`File` objectを永続化していないため、`再読込`ではfile pickerへ誘導する。存在しない過去Fileを復元したふりをしない。

`編集`だけがsource editorを開く。pending GAS queueがある場合、source変更によってqueueの意味が変わるため、既存安全contractに沿って先にqueue処理を要求するか、明示破棄confirmationを設ける。無言で旧queueを新sourceへ送らない。

## ビジュアル方針

Phase 7では単に色を変えるのではなく、情報階層を統一する。

- main navigation: 地図、お品書き、現在の主要actionを最優先。
- management: flat list/table + status chip + compact action。
- border/shadowをすべての要素へ重ねない。
- sectionごとに大きなcardを積み重ねる構成を避ける。
- mono fontはspace/distance/status等の機械的値に限定する。
- body/説明はUI sansへ寄せる。
- danger action、offline ready、pending GAS等の状態表現は既存tokenを優先して一貫させる。同義の色tokenを先回りして増やさない。
- iconだけで意味を伝えずtext labelを残す。

## 非対象

- arbitrary event/map bundle作成UI。
- GAS multi-sheet aggregation。
- full PWA installability/manifest install prompt。
- background periodic sync。
- server-side image proxy/R2へのcatalog転送。
- route optimization algorithm変更。
- user account/cloud sync。
- 同一URLのcatalog body差し替えを自動検出するcache revalidation基盤。

## 受入条件

- event/day単位でoffline catalog保存を明示実行できる。
- 進捗と最終結果を件数で確認できる。
- network offline時も保存済みcatalog imageを表示できる。
- 一部download failureが他の成功cacheを消さない。
- management一覧で全registry event/dayのsource/data/outbox/offline状態を把握できる。
- offline status取得失敗と0件保存済みを区別できる。
- 未設定dayを一覧から設定開始できる。
- `開く`/`再読込`/`オフライン準備`/`編集`/`削除`へ一覧から到達できる。
- local data削除時、他event/dayが参照する共有catalog URLをcacheから削除しない。
- main navigationに旧設定panelの縦積みが残らない。
- visual hierarchyがmap/catalog中心となり、managementは高密度な一覧中心になる。
- existing purchase/local-first/route guidance contractsを壊さない。
- `npm run verify`とCI相当E2Eが成功する。
