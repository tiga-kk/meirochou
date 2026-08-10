# Phase 7 オフライン準備・イベント管理・ビジュアル再設計 設計

## 目的

コミケ会場の不安定な通信環境を前提に、家のWi-Fi等で必要なお品書きを事前保存できるようにする。同時に、現在のselect/toggle中心の「設定」をイベント・日程単位の管理画面へ置き換え、データsource、読込状態、GAS outbox、offline保存状態を一覧で理解・操作できるようにする。

Phase 7はPhase 6で残った「AI生成UIのように設定部品が縦積みされ、全体状態を把握しづらい」問題を解消するUI redesignも扱う。ただしRoute Guidanceのdomain/routing algorithmを再構築しない。

## 確定要求

1. event/dayに属するお品書き画像をユーザー操作で一括offline保存できる。
2. offline保存は通常のHTTP browser cache任せではなく、Service Worker + Cache Storageで明示的に保持する。
3. 保存操作は自動常時downloadではなく、ユーザーが家などで`オフライン準備`を押したときに行う。
4. 保存中はPhase 6.1で追加するasync operation indicatorへ`31 / 52`のようなprogressを表示する。
5. management画面でevent/dayごとに、イベント、日程、source種別、GAS/CSV source情報、データ読込状態、GAS queue件数、catalog offline保存件数を一覧できる。
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

## Offline catalog cache architecture

### Service Workerの役割

Phase 7ではService Workerを「お品書き画像fetchのoffline fallback」に限定して導入する。app shell全体のPWA化、install prompt、background sync、push notificationは追加しない。

Service Workerはcontrolled pageからのcatalog image requestを見て、Cache Storageに一致するresponseがあればcacheを優先し、なければnetworkへfallbackする。

外部画像URLはcross-origin opaque responseになる可能性を許容する。事前保存は`Request`を適切なmodeで作り、成功したresponseをCache Storageへputする。opaque responseのbody内容をJSで検査しない。

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

UI/controllerはCache APIを直接触らない。browser infrastructure implementationがService Worker registration/Cache Storageへ接続する。

### Cache keyとstale data

cache nameはschema version付きの固定名、例`comipath-catalog-v1`とする。event/dayごとにcacheを分割せず、URLをkeyにする。同じ画像URLを複数event/dayが参照しても1copyで済ませる。

source refresh後のoffline statusは、現在のcircle listに含まれるcatalog URL集合を正本として`cache.match()`で再計算する。古いURLの即時GCはPhase 7の主要要件ではないが、全ローカルデータ削除時と明示的なoffline cache cleanupでは不要cacheを削除できるようにする。

### Storage persistence

`navigator.storage.persist()`はbest-effortで要求してよい。拒否されてもoffline保存処理を失敗扱いにしない。`navigator.storage.estimate()`が利用できる場合は管理画面で容量参考値を表示してよいが、Phase 7受入条件にはしない。

## Event/day management model

現行`event-day-selector` + `source-manager` + `outbox-panel` + delete optionsの縦積みを、event/day一覧を起点とする管理UIへ変える。

一覧row/cardの正本model:

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
    readonly cached: number;
    readonly total: number;
    readonly checking: boolean;
  };
}
```

表示イメージ:

```text
C108 / 1日目             GAS
シート: circle_day1      データ 532件
URL: script.google.com/…/exec
GAS同期 3件待ち          お品書き 521 / 532 保存済み

[開く] [再読込] [オフライン準備] [編集] [削除]
```

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

`編集`だけがsource editorを開く。pending GAS queueがある場合、source変更によってqueueの意味が変わるため、既存安全contractに沿って先にqueue処理を要求するか、明示破棄confirmationを設ける。無言で旧queueを新sourceへ送らない。

## Visual system

Phase 7では単に色を変えるのではなく、情報階層を統一する。

- main navigation: 地図、お品書き、現在の主要actionを最優先。
- management: flat list/table + status chip + compact action。
- border/shadowをすべての要素へ重ねない。
- sectionごとに大きなcardを積み重ねる構成を避ける。
- mono fontはspace/distance/status等の機械的値に限定する。
- body/説明はUI sansへ寄せる。
- danger actionは赤、offline readyは成功状態、pending GASはwarningとして一貫したstatus tokenを使う。
- iconだけで意味を伝えずtext labelを残す。

## 非対象

- arbitrary event/map bundle作成UI。
- GAS multi-sheet aggregation。
- full PWA installability/manifest install prompt。
- background periodic sync。
- server-side image proxy/R2へのcatalog転送。
- route optimization algorithm変更。
- user account/cloud sync。

## 受入条件

- event/day単位でoffline catalog保存を明示実行できる。
- 進捗と最終結果を件数で確認できる。
- network offline時も保存済みcatalog imageを表示できる。
- 一部download failureが他の成功cacheを消さない。
- management一覧で全registry event/dayのsource/data/outbox/offline状態を把握できる。
- 未設定dayを一覧から設定開始できる。
- `開く`/`再読込`/`オフライン準備`/`編集`/`削除`へ一覧から到達できる。
- main navigationに旧設定panelの縦積みが残らない。
- visual hierarchyがmap/catalog中心となり、managementは高密度な一覧中心になる。
- existing purchase/local-first/route guidance contractsを壊さない。
- `npm run verify`とCI相当E2Eが成功する。
