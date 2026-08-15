# Phase 7.6 一覧順・壁分類 設計

## 目的

一覧画面のpriority sortを廃止し、priorityは既存filterと表示値としてだけ残す。通常サークルは現行のspace順を維持し、壁サークルだけは「同じarea内で最も近い非壁map pointの位置にあるもの」としてsortする。

同時に、既存最適化が`CircleRecord.queueClass === "wall"`を見て壁待機時間を適用しているにもかかわらず、実際のCSV/GAS入力が`queueClass`を設定していない欠落を直す。壁分類はC108固有文字列をハードコードせず、既存`points.json`の`group_id`が`W_`で始まるpointを正本とする。

## 現行データで確認済みの対応

現行C108 map assetでは次の対応を確認している。

| area | wall group | identifier |
|---|---|---|
| `e456` | `W_all` | `ア` |
| `e7` | `W_all` | `A` |
| `s12` | `W_all` | `a` |
| `w12` | `W_left` | `め` |
| `w12` | `W_right` | `あ` |

この表はtest evidenceでありruntime定数ではない。実装は各areaの`points.json`からwall identifier集合を毎回deriveする。

## 共通壁分類

新しいpure helperを`apps/webapp/js/shared/domain/wall-circle-classification.ts`へ置く。

```ts
export interface WallClassifiablePoint {
  readonly group_id?: unknown;
  readonly identifier?: unknown;
}

export function collectWallIdentifiers(
  points: readonly WallClassifiablePoint[],
): ReadonlySet<string>;

export function resolveCircleQueueClass(
  space: string,
  wallIdentifiers: ReadonlySet<string>,
): "normal" | "wall";
```

`collectWallIdentifiers()`は`group_id`が文字列かつ`W_`で始まり、`identifier`が空でないpointだけを収集する。`resolveCircleQueueClass()`は既存space parserでidentifierを取り出し、集合に含まれれば`wall`、それ以外は`normal`とする。

CSV/GAS parser、LocalStorage schema、EventDay schemaへ`queueClass`を追加しない。分類はmap assetを読めるruntimeでderiveする。

## optimizationへの接続

`PrepareRouteOptimizationUseCase`はすでに対象areaの`RouteMapAssetsLoader.loadMapAssets()`を呼び、`points.json`とgridを同時に取得している。したがって追加network requestは不要。

処理は次の順序にする。

```text
loadMapAssets(area)
  -> collectWallIdentifiers(assets.points.points)
  -> pendingCirclesをcopy
       wall identifier -> queueClass: "wall"
       other           -> queueClass: "normal"
  -> 既存distance matrix準備
  -> PreparedRouteOptimization.pendingCirclesへderived copyを返す
  -> 既存buildOptimizationProblem()
  -> 既存resolveServiceTimeSec()
```

入力`CircleRecord`はmutationしない。ALNS objective、operator、distance matrix、route cost、priority valueは変更しない。

## galleryの順序

priorityはsort keyから完全に外す。priority filterとcard内のpriority表示は残す。

normal circleのbase keyは既存と同じ:

```text
area name -> identifier -> number -> original space
```

wall circleではsort時だけanchorを置き換える。

1. circleのareaを`MapAreaCatalog`で解決する。
2. 同じareaのpointsだけを見る。
3. `collectWallIdentifiers()`でwall identifier集合を得る。
4. wall circle自身の`identifier:number`に一致するmap pointを探す。
5. wall identifierに属さないpointだけをanchor候補とする。
6. `center_x / center_y`のユークリッド距離二乗が最小のpointを選ぶ。
7. sortのidentifier/numberだけをそのanchorへ置き換える。
8. 実際の`Circle.space`、map position、route endpointは変更しない。

同じanchorへ複数wall circleが集まる場合は、anchorに対応するnormal circleを先に置き、その後を`distanceSquared -> original identifier -> original number -> original space`で決定論的に並べる。

Dijkstra、grid距離、route matrixはgallery sortへ使わない。同一map画像の見た目上の近さを作るだけなので、生pixel座標の距離二乗で十分である。

## galleryへのpoints供給

`DomCircleGalleryView`からroute-guidance concrete moduleをimportしない。既存の依存方向を増やさないため、constructorへoptionalなpoint loader callbackを渡す。

概念契約:

```ts
type LoadGalleryPoints = (
  area: MapArea,
) => Promise<PointsPayload>;
```

`DomRouteGuidanceView`は既にroute-guidance側にいるため、受け取った`RouteMapAssetsLoader`から

```ts
(area) => routeMapAssetsLoader.loadMapAssets(area).then((assets) => assets.points)
```

を作り`DomCircleGalleryView`へ渡す。`BrowserApplication`は既に所有している`routeMapAssetsLoader`を`DomRouteGuidanceView`へ渡すだけとする。新しいglobal loader/cache/DI containerは作らない。

gallery open時はまず従来space順で即時表示し、必要areaのpointsが解決したら同じopen generationであることを確認して一度だけ再sortする。既存`RouteMapAssetsLoader`のcacheを使う。load失敗時はspace順のまま使える状態を維持する。

## sale mentionのgallery表示

Task 6のsale mention setを`DomRouteGuidanceView`から`DomCircleGalleryView`へも渡す。

gallery cardへfull X timelineは追加しない。mention対象だけ、card情報部へ小さい`完売関連`badgeを付ける。これは「完売確定」ではなく投稿内容に関するwarningである。

warning更新はsort keyを変えない。priority filter、card order、swipe購入、画像aspect ratioも変えない。

## 対象外

- C108のidentifier文字列をruntimeへ固定すること。
- CSV/GASへwall列を追加すること。
- `Circle.space`を書き換えること。
- gallery順をALNS順、route距離順、priority順へすること。
- wall判定にDijkstraを使うこと。
- galleryへX投稿本文を並べること。
- sale mentionで自動除外、hold、purchase、route変更すること。
- map bundle generatorを今回変更すること。

## 検証

pure/domain:
- `W_*`だけがwall identifierになる。
- C108現行5対応がassetからderiveできる。
- wall identifierとnon-wall identifierが同一areaで混在しない。
- invalid/metadataなしはnormalへ安全に倒れる。

optimization:
- `PrepareRouteOptimizationUseCase`がwall/normal queueClassをderived copyへ付ける。
- 元circleはmutationされない。
- 既存`resolveServiceTimeSec()`でwall/default service timeへ流れる。

gallery:
- priority値を変えても順序は変わらない。
- priority filterは従来通り。
- normalは従来space順。
- wallは同一area nearest non-wall anchorへ配置。
- anchor tieは決定論的。
- cross-area anchorなし。
- asset load failure / missing pointではspace順fallback。
- warning badgeでsort/layout semanticsを変えない。
- full timelineなし。

production:
- BrowserApplicationが既存routeMapAssetsLoaderをgalleryまで接続する。
- E2Eで一覧open後にproduction経路の補正順を確認する。
