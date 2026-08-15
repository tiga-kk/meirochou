# Phase 7.6 一覧順・壁分類 planning basis

## 結論

今回の一覧順修正では、新しいwall master dataやCSV/GAS列は不要である。現行map assetに壁情報が既にあり、最適化側にもwall service time契約が既にある。欠けているのは両者の接続だけである。

## 現行コード事実

### 1. optimizationは`queueClass`を既に認識する

`apps/webapp/js/features/event-day/domain/event-day-types.ts`の`CircleRecord`には:

```ts
readonly queueClass?: "normal" | "wall";
```

がある。

`apps/webapp/js/features/route-guidance/use-cases/build-route-optimization-problem.ts`の`resolveServiceTimeSec()`は:

```ts
if (circle.queueClass === "wall") {
  return profile.wallServiceTimeSec;
}
return profile.defaultServiceTimeSec;
```

で既に壁/通常を分ける。

### 2. しかしCSV/GASは`queueClass`を作っていない

`parseCircleCsv()`が読む列は`space, priority, isSale, account, tweet, memo`で、`queueClass`列はない。

`GasGoogleSheetCircleClient.parseCircles()`も`space/priority/account/tweet/memo/isSale`だけを`CircleRecord`へ写す。

repository-wide searchでも`queueClass`参照はdomain type、optimization input adapter、testに限られる。したがって現行production sourceからwall flagが入る経路は存在しない。

### 3. `points.json`にはwall groupが既にある

route用`OcrPoint`型は既にoptional `group_id?: string`を持つ。C108現行assetの観測値:

| area | wall group | identifier |
|---|---|---|
| `e456` | `W_all` | `ア` |
| `e7` | `W_all` | `A` |
| `s12` | `W_all` | `a` |
| `w12` | `W_left` | `め` |
| `w12` | `W_right` | `あ` |

runtimeはこの表を直接持たず、`group_id.startsWith("W_")`からidentifier集合をderiveする。

### 4. optimization準備時には同じpointsを既にロードしている

`PrepareRouteOptimizationUseCase.execute()`は`RouteMapAssetsLoader.loadMapAssets(area)`を呼んだ後にendpointを解決しdistance matrixを準備する。この位置でwall identifierをderiveすれば追加fetch不要であり、source schemaへwall fieldを追加する必要もない。

### 5. galleryは今もpriority sortがdefault

`DomCircleGalleryView`は`sortMode = "priority"`を初期値にし、`sortTargets()`でpriority降順の後にspace順を使う。

一方、現行`apps/webapp/index.html`のgallery headerにはpriority filterだけがあり、`btn-sort-space` / `btn-sort-priority`は既に存在しない。DOM viewに古いsort button参照と`changeSortMode()`だけが残っている。

したがって「sort UIを新たに作り直す」必要はなく、dead sort stateを削除して単一space sortへ戻すだけでよい。

### 6. galleryへmap pointsを渡す既存経路を再利用できる

`BrowserApplication`は既に`routeMapAssetsLoader`を所有し、`DomRouteGuidanceView`を生成する。`DomRouteGuidanceView`は`DomCircleGalleryView`を内部所有する。

circle-status featureからroute-guidance concreteをimportする必要はない。`DomRouteGuidanceView`が`RouteMapAssetsLoader`を受け、pointsだけを返すcallbackへ細くしてgalleryへ渡せば依存循環を作らない。

### 7. Phase 7.6はまだcurrent phaseではない

`docs/status/progress.md`は現在もPhase 7.5 Task 8 blockedを正本としている。今回の文書追加だけで`progress.md`をPhase 7.6へ進めない。

## 過剰実装防止

- wall判定用DB/設定fileを追加しない。
- CSV/GAS schema migrationを行わない。
- wall identifierをC108専用constantへしない。
- nearest判定へDijkstra/route matrixを持ち込まない。
- galleryのためにmap bundle generatorを変更しない。
- gallery orderを正式route stateへ保存しない。
- 新しいFacade/Manager/DI containerを作らない。
- X timelineをgalleryへ複製しない。

## 実装順の根拠

1. Task 7でmap asset -> wall classification -> optimization service timeを先に閉じる。
2. Task 8で同じpure classificationをgalleryへ再利用する。
3. Task 9で既存X lifecycleにTask 7〜8の回帰を加えてPhaseを閉じる。

この順なら、wall metadataの正当性とoptimization接続をUIから独立してreviewできる。
