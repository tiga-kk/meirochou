# Phase 6.1 実機確認後の操作性修正 設計

## 目的

Phase 6を`main`へmergeし、実際の`meirochou.tiga.moe`で操作して判明した具体的な不具合・操作感の問題を修正する。

このPhaseは新しい管理画面やオフライン基盤を作るPhaseではない。Phase 6で確立したRoute Guidance、Circle Data Source、Local Data Deletion、Galleryの責務境界を維持し、会場で使ううえで直接支障になる挙動を必要最小限で直す。

## 確定要求

1. 明示的なローカルデータ削除は、未送信GAS outboxが存在することだけを理由に禁止しない。削除によって破棄される未送信件数を確認画面で明示し、ユーザーが確認した場合は対象scopeのoutboxも一緒に破棄する。
2. GASからのシート一覧取得、データpreview取得、preview反映など時間のかかる処理は、右下の常設async operation indicatorで進行中・成功・失敗を確認できるようにする。列挙したoperationは実際のcontroller pathから到達可能でなければならない。
3. 地図viewerは画像の実縦横比を基準にviewportとstageを構成する。横長地図では不必要な上下余白を作らない。
4. 地図viewportの操作領域は最低220pxを確保する。実縦横比どおりに表示すると220px未満になる横長地図は、縦方向をviewportへ合わせて横方向へはみ出すcover表示とし、初期位置を中央にする。
5. 地図外へのpanは完全hard clampではなく、最大32px程度だけrubber-band overscrollを許可し、外へ行くほど抵抗を強くし、release時に必ず境界へ戻す。
6. 地図gesture中のlayout readを減らし、Pointer Eventsのmoveごとに`getBoundingClientRect()`を呼ばない。geometryは画像load、ResizeObserver、pointerdown等の低頻度な境界で更新する。
7. Galleryの外向きスワイプは開始直後を重くし、購入成立距離へ近づくにつれて表示追従率を上げる非線形抵抗へ変更する。Phase 6で実際に必要だったfinger travelは変えず、表示translationだけを変える。
8. Route Guidanceの表示距離は内部のrouting costをそのまま表示せず、物理距離[m]を表示する。混雑重みは経路探索用costとして保持し、表示距離へ混ぜない。
9. 物理距離換算はmap bundleごとの明示的なscale値を正本にする。既存資料・地図生成時の実寸基準からscaleを確定し、コード中で推測値を埋め込まない。scale根拠不足があっても、S/G・flow・`physicalPixelLength`などscale非依存部分まで停止しない。
10. 現在経路はStart/Goalを文字でも識別できるようにし、経路方向を視覚的に示す。manual grid startでも必ずStart markerを表示する。
11. 現在経路には、StartからGoalへ流れるように見える軽量なSVG stroke animationを追加する。経路再計算やJavaScriptの毎フレーム処理は行わない。
12. `prefers-reduced-motion: reduce`では経路の流れanimationを停止し、Start/Goal表示だけで方向が分かる状態を維持する。

## ローカルデータ削除

現行`buildDeleteOptions()`はpending outboxがあるscopeを`blocked`にし、`DeleteLocalDataUseCase`も`assertNoPendingUpdates()`で二重に拒否している。これは「未送信データを誤って失わない」安全策だが、ユーザーが明示的に全データ削除を選んでも操作できないため、削除操作の意味と矛盾している。

削除scopeごとの契約を次のようにする。

- `activity`: circleStatesを削除し、その日程のGAS outboxも破棄する。未送信購入状態を後からremoteへ送らないためである。
- `circle-source`: circle source/circlesを空にし、その日程のGAS outboxも破棄する。旧sourceに属するmutationを残さない。
- `event-day`: event/day stateそのものを削除するため、その内部outboxも削除する。
- `all-event-days`: 全stateと全outboxを削除する。

UIではbuttonをdisabledにせず、`DeleteOptionViewModel.pendingDiscardCount`へ破棄件数を持たせる。

本番の表示経路は次を正本とする。

```text
buildDeleteOptions()
  → buildStorageDeleteDialogModel()
  → BrowserApplication.updateManagementModels()
  → storage-delete-dialog.ts
```

`buildStorageDeleteDialogModel()`は選択されたoptionをそのままdialog modelへ入れているため、未接続の別confirmation modelを新設しない。`storage-delete-dialog.ts`が`model.option.pendingDiscardCount`を表示し、ユーザーがconfirmしなければ何も削除しない。

## 非同期処理表示

右下に1つだけ表示する。複数のtoastを重ねない。

状態は次の最小contractとする。

```ts
export type AsyncOperationStatus =
  | { kind: "idle" }
  | { kind: "loading"; label: string; progress?: { current: number; total: number } }
  | { kind: "success"; label: string }
  | { kind: "error"; label: string };
```

Circle Data Source Sessionは`busy`と現在operationを同じsnapshotで管理する。`busy=true`なのに`operation="idle"`、または逆の状態を通知しない。既存`requestGeneration`をstale request判定の正本として維持し、同じ目的の別generationを追加しない。

最低限の表示:

- シート一覧取得: `シート一覧を取得中…`
- GAS preview取得: `GASからデータを読み込み中…`
- CSV preview: `CSVを読み込み中…`（Task 2で列挙する場合は実pathへ必ず接続）
- preview反映: `読み込み結果を保存中…`
- 成功: `GASデータを読み込みました` / `データを保存しました`
- 失敗: 既存error詳細を設定画面に残しつつ、indicatorでは短い失敗表示を出す。

successは約1.5秒で消してよい。loadingは処理終了まで消さない。stale/cancelされたoperationからsuccessを表示しない。

## 地図viewportとstage

現在の`.navigation-map`は固定heightで、画像はその全面要素へ`object-fit: contain`されている。この構造をやめ、viewportの中に実画像比率を持つstageを配置する。base scale 1の初期表示では、画像stageがviewportを少なくとも一方向で満たし、letterboxを作らない。

geometry計算の正本は純粋関数にする。

```ts
export interface MapViewportLayoutInput {
  viewportWidth: number;
  viewportMaxHeight: number;
  minimumInteractiveHeight: number; // 220
  imageWidth: number;
  imageHeight: number;
}

export interface MapViewportLayout {
  viewportWidth: number;
  viewportHeight: number;
  stageWidth: number;
  stageHeight: number;
  initialX: number;
  initialY: number;
}
```

ルール:

- `naturalHeightAtViewportWidth = viewportWidth * imageHeight / imageWidth`
- 220px以上かつmaxHeight以下ならstageをviewport幅へfitし、viewportHeightを自然heightへ合わせる。
- 220px未満の横長画像では`viewportHeight=220`、`stageHeight=220`として画像比率から`stageWidth`を求め、`initialX=(viewportWidth-stageWidth)/2`とする。
- maxHeightを超える縦長画像では`viewportHeight=maxHeight`、`stageWidth=viewportWidth`、`stageHeight=naturalHeightAtViewportWidth`とし、`initialY=(viewportHeight-stageHeight)/2`とする。
- pin layerとroute overlayはstageと同一boxを使う。画像だけ別boxへ`object-fit`しない。
- `initialX`/`initialY`は初回描画値ではなくscale 1のbase transformとしてGesture controllerへ保持する。
- `reset()`/`resetZoom()`は`{scale:1,x:baseX,y:baseY}`へ戻る。wide/tall mapを`{1,0,0}`へ戻して中央位置を壊さない。
- area変更時は旧areaのpan/zoomを持ち越さず、新areaのbase layoutから開始する。

### Rubber-band

pointermove中の範囲外変位は無制限に加算しない。境界からのoverflowを`overscrollLimit=32`へ圧縮する純粋関数を使う。

```ts
export function applyRubberBand(
  value: number,
  min: number,
  max: number,
  overscrollLimit = 32,
): number;
```

境界内はそのまま返す。境界外はoverflowが増えるほど増分が小さくなり、表示上のoverscrollが32pxを超えない。pointerup/cancel/lostcapture後は既存RAFのsettleで境界へ戻す。

## Galleryの非線形抵抗

スワイプ方向と、Phase 6で実際に成立していた購入までのfinger travelを維持する。変えるのは表示追従量だけとする。

現行Phase 6は次の判定である。

```text
currentX = rawDelta * 0.6
visualThreshold = max(minimumThreshold ?? 100, min(cardWidth * 0.4, 180))
purchase if abs(currentX) > visualThreshold
```

したがって実効finger travelは次になる。

```text
purchaseTriggerDistance = visualThreshold / 0.6
```

Phase 6.1では購入判定をraw finger movementへ整理してよいが、threshold値はこの等価式を使う。単純に`abs(rawDelta) > visualThreshold`へ変えると購入成立距離が短くなるため行わない。

```ts
export function calculateSwipeTranslation(
  rawDelta: number,
  triggerDistance: number,
): number;
```

要求する性質:

- `0`なら`0`。
- 小さい移動では追従率を約0.25〜0.35にする。
- `purchaseTriggerDistance`へ近づくにつれて追従率を連続的に上げる。
- trigger付近では約0.85〜0.95まで追従する。
- 単調増加し、途中で速度感が逆転しない。
- 購入判定と購入直前feedbackの正本はraw finger progressとし、表示translationを閾値判定へ使わない。

具体式は実装時に1つへ固定し、magic branchを多数並べない。

## 距離表示

現在の`RouteResult.cost`はgridの画像座標距離へcrowded multiplierを掛けたrouting costである。これは物理距離ではないためUIへ直接表示しない。

`RouteResult`へunweighted path lengthである`physicalPixelLength`を追加する。`planRoute()`と`planRouteFromGridIndex()`の双方で同じcontractを返し、routing cost自体の意味は変えない。

map bundle manifestのarea metadataへ物理scaleを追加する。

```ts
interface MapAreaManifestV1 {
  // existing fields...
  metersPerPixel: number;
}
```

`metersPerPixel`はC108各areaについて地図生成時に使用した既知実寸基準を調べて確定する。同じeventでもareaごとに異なる可能性を許容する。根拠が見つからない場合は推測値をcommitしない。

ただしscale不足はTask 5のscale依存部分だけを保留する。S/G、route flow、`physicalPixelLength`はscaleを必要としないため先に実装・検証可能とする。Phase 6.1全体の完了には最終的に4 areaすべてのscale根拠とm表示が必要である。

UIは整数mを基本とし、短距離でもcm表示へ切り替えない。

## Start/Goalと経路animation

Start/Goalは色や既存circle pinだけに依存しない。manual startは任意grid indexから始まるため、既存`.map-pin.start`が存在しない場合がある。

current route SVGのsource-image viewBox内へ、route geometryから専用endpoint markerを描く。

- `route.points[0]`に`S`
- `route.points[route.points.length - 1]`に`G`
- markerは`pointer-events:none`
- markerは既存pin state/colorsを置き換えず、その上に方向理解用として描く

`route.startPosition`/`targetPosition`はmap pin用percent座標であり、SVG viewBoxへ直接使わない。S/Gの座標はsource-image座標である`route.points`を使う。

現在経路SVGはsolid base lineを維持し、その上にdirection flow用polylineを1本だけ重ねる。`route-flow-line`は同じordered `points`を使い、CSSの`stroke-dasharray`と`stroke-dashoffset`だけをanimationする。JSの`requestAnimationFrame`、timer、経路points再生成をanimationのために追加しない。

```css
.route-flow-line {
  animation: route-flow 1.1s linear infinite;
}

@keyframes route-flow {
  to { stroke-dashoffset: -64; }
}

@media (prefers-reduced-motion: reduce) {
  .route-flow-line { animation: none; }
}
```

実装時は実際のpath方向でStart→Goalへ流れて見える符号をvisual/E2Eで確認する。candidate routeには常時animationを追加しない。

## 非対象

- Service Worker / Cache Storageによるお品書き一括保存。Phase 7で扱う。
- イベント・日程の一覧型管理画面。Phase 7で扱う。
- app全体のvisual identity再設計。Phase 7で扱う。
- routing algorithmの変更。
- crowded multiplierの変更。
- multi-area未来経路の一括描画。

## 受入条件

- outboxが残っていても全日程削除を選択でき、本番confirmationに破棄件数が表示され、confirm後に全state/outboxが消える。
- 列挙した長時間operationは実controller pathからindicatorへ到達し、処理終了までloadingが表示され、stale/cancelで偽successを出さない。
- E456等の横長地図で大きな上下余白が残らず、操作領域は220px以上ある。
- maxHeightを超える縦長地図でも左右letterboxを作らず、縦panできる。
- wide/tall mapのreset/area変更でbase中央位置を失わない。
- 地図を強く端へdragしても外側表示は約32px以内に抑えられ、releaseで戻る。
- map pointermove中にlayout readを繰り返さない。
- Galleryは開始時に重く、trigger付近で軽くなるが、Phase 6と実質同じfinger travelで購入成立する。
- routing costの意味を変えずに、UI距離はm表示になる。
- scale根拠不足中でもscale非依存のroute direction workは進められる。
- circle start/manual grid startの双方でStart/GoalがS/Gで判別できる。
- current routeのflowがStart→Goal方向に見え、reduced-motionでは停止する。
- route animationのためのJS frame loopを追加しない。
- `npm run verify`とCI相当E2Eが成功する。
