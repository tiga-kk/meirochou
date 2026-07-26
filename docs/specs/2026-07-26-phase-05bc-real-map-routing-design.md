# Phase 5B/5C Real Map Routing and Navigation Design

**Date:** 2026-07-26  
**Status:** Approved  
**Applies to:** Phase 5B and Phase 5C  
**Implementation start:** Begin only after the user instructs Phase 5B Task 1.

## 1. Goal

C108の4地図を公開可能なmap bundleとしてWebappへ統合し、各地図で任意始点、実通路距離、到着確認、購入・保留・対象外、残り順路の最適化、再読込復帰を提供する。

Phase 5Bは実地図bundle統合と性能計測に限定する。Phase 5Cは状態、ナビゲーション、距離行列、TOPTW、復帰UIを実装する。

## 2. Event and Map Contract

- event IDは`C108`。
- day IDは`day1`と`day2`。
- 4地図は両日で共通利用する。
- 正式な`areaId`、表示名、公開ファイル名はPhase 5B Task 1で`/maps/C108/`の完成成果物を確認して確定する。
- production event registryにはC108だけを登録する。
- `demo-v1`はproduction registryから外し、開発・自動テストfixtureとして維持する。
- 4地図は独立した巡回問題として扱う。
- 地図間移動コスト、地図順序、全地図一括最適化は実装しない。
- ユーザーが地図を手動で切り替える。

## 3. Private and Public File Boundary

- `/maps/`はGit管理外の受け渡し・作業領域とする。
- 元地図、OCR入力、Python地図生成コード、中間画像、ローカル設定を追跡しない。
- Webリポジトリへ入れるのは完成済みの`map.svg`、`points.json`、`grid-meta.json`、`grid.bin`だけとする。
- Python版TOPTWはGit管理外の参照実装とする。
- WebリポジトリにはTypeScript版TOPTWと小規模なfictional comparison fixtureだけを置く。
- 実地図を一般的なunit/E2E fixtureへ複製しない。

公開bundle:

```text
apps/webapp/map-bundles/C108/
├── manifest.json
├── <areaId-1>/
│   ├── map.svg
│   ├── points.json
│   ├── grid-meta.json
│   └── grid.bin
├── <areaId-2>/...
├── <areaId-3>/...
└── <areaId-4>/...
```

`day1`と`day2`は同じ`apps/webapp/map-bundles/C108/manifest.json`を参照する。

## 4. Map Validation

- manifest、area、asset pathはruntime parserで検証する。
- path traversal、absolute path、URL scheme、query、fragment、別area directory参照を拒否する。
- SVGのscript、event attribute、`foreignObject`、external URL、external entity、iframe/object/embedを拒否する。
- SVG viewBox、points座標、grid metadataの座標系が一致することを検証する。
- pointsの各circleに有効なgrid endpointがあることを検証する。
- grid binaryのbyte数がmetadata契約と一致することを検証する。
- blocked cellは`0`、crowded cellは`2`、crowded multiplierは既存実装の`1.5`を維持する。
- 到達不能circleをEuclidean distanceへ黙ってfallbackしない。
- build outputへ元地図、Python、private pathを含めない。

## 5. Circle State

ユーザーが見るcircle stateは次の4つで、1 circleは常に1状態だけを持つ。

```text
pending    巡回対象
held       保留中
purchased  購入済み
excluded   今回は対象外
```

`pending`はdefaultとし、保存時は非default stateだけをoverrideとして保持できる。

許可する遷移:

```text
pending   → held | purchased | excluded
held      → pending | purchased | excluded
purchased → pending
excluded  → pending
```

- heldを目的地へ設定した場合はpendingへ戻す。
- purchasedとexcludedは、pendingへ戻すまで目的地にしない。
- heldからpurchasedへ変更した場合、heldは残さない。
- purchasedへの変更だけGAS desired purchase `true`をoutboxへ追加する。
- purchasedからpendingへの変更だけdesired purchase `false`を追加する。
- held、excluded、到着、目的地変更はGASへ送らない。
- local stateとoutboxを保存してからPOSTする既存local-first原則を維持する。

## 6. Storage Migration and Undo

legacy schemaの`purchased`、`hold`、`history`、`redo`を新schemaへ移行する。

- legacy purchasedに含まれるspaceはpurchased。
- purchasedとholdの両方に含まれる場合はpurchasedを優先する。
- holdだけに含まれる場合はheld。
- その他はpending。
- gasOutbox、source、sourceGeneration、circles、timestampsを保持する。
- migration失敗時は旧値を破壊しない。
- 永続的なglobal Undo/Redoを廃止する。
- 操作直後の取消はmemory上の1回限りのtokenで行う。
- circle stateの取消で現在位置や以前の目的地を巻き戻さない。

## 7. Navigation State

circle stateとは別にnavigation stateを持つ。

```text
idle
navigating
atTarget
```

navigation stateは次を持つ。

- active event/day/area
- 最後に確定した現在位置
- 任意始点のgrid cellとSVG座標
- current target
- current leg
- fixed first leg
- provisional remaining order
- best optimized remaining order
- calculation job state
- recovery snapshot version
- bundle/matrix identity

規則:

- `到着した`を押すまで現在位置をtargetへ移さない。
- optimizer resultだけではcurrent targetとcurrent legを変更しない。
- circle stateの変更とnavigation stateの変更を別の操作として扱う。

## 8. Start Selection

1. ユーザーが始点設定modeを開く。
2. map tapをSVG座標へ変換する。
3. 最寄りwalkable grid cellへsnapする。
4. 許容距離を超える場合は確定しない。
5. 始点から1回Dijkstraを実行し、pending候補への距離を得る。
6. 暫定の最初の目的地と経路を即時表示する。
7. 距離行列とTOPTWをbackgroundで開始する。

重い計算はpage loadだけでは開始しない。ユーザーの始点確定または巡回開始を明示トリガーとする。

## 9. Navigating and Arrival

案内中:

```text
[到着した]
[この目的地を後回し]
[その他]
```

`その他`:

- 始点を設定し直す
- 今回は対象外にする

`到着した`を押すと現在位置をtargetへ更新し、stageを`atTarget`へする。この時点ではcircle stateを変更しない。

到着後:

```text
[購入して次へ]
[後でまた来る]
[その他]
```

## 10. Hold Before Arrival

`この目的地を後回し`:

- targetをheldへ変更する。
- current positionは最後の確定位置のままにする。
- targetをcurrent legと残り順路から外す。
- 最後の確定位置から暫定の次目的地を即時表示する。
- 修復済み順路を使って残りを再最適化する。
- UIへ「最後に確定した現在地から案内中」であることを表示する。
- 実際の位置が大きくずれた場合、ユーザーが始点を設定し直す。

## 11. Purchase or Hold After Arrival

`購入して次へ`:

- targetをpurchasedへ変更する。
- GAS sourceではlocal stateとoutboxをatomic saveする。
- current positionはtargetのままにする。
- 移動中に得られたbest remaining orderの次を即時採用する。
- 次々区間以降をbackgroundで改善する。

`後でまた来る`:

- targetをheldへ変更する。
- current positionはtargetのままにする。
- best remaining orderの次を即時採用する。
- 次目的地を決めるために再最適化完了を待たない。

## 12. Manual Destination Change

- map markerまたはcircle detailから`ここを目的地にする`を選べる。
- 新targetへの経路は最適化完了を待たず即時表示する。
- old targetがpendingなら候補へ戻す。
- held targetを選んだ場合はpendingへ戻す。
- 新targetを現在のfirst targetとして固定する。
- previous bestを修復してwarm startに使う。
- distance matrixを再生成しない。

## 13. Excluded and Lists

- excludedを通常候補、held一括復帰、TOPTW対象から外す。
- `未購入`は`巡回対象`と`保留中`の2 sectionを持つ。
- purchasedとexcludedを`未購入`へ表示しない。
- `全サークル`には4状態をbadge付きで表示する。
- excludedはcircle detailの`巡回対象に戻す`でpendingへ戻す。
- `今回は対象外にする`は主buttonではなく`その他`へ置く。
- map markerとlist rowは同じcircle detail componentを開く。
- circle detailは将来の情報sectionを追加できる構造にするが、外部情報取得をPhase 5Cへ含めない。

## 14. Held Completion Flow

pendingが0でheldが1件以上の場合:

```text
通常の巡回が完了しました。保留中がN件あります。
[保留を巡回]
```

押下時:

```text
保留中のN件をすべて巡回対象に戻しますか？
[キャンセル] [巡回を開始]
```

確認後、全heldをpendingへ戻し、通常の巡回・最適化を開始する。別の保留巡回modeは作らない。

## 15. Distance Matrix

- crowded cellに重みがあるため、weighted 4-neighbor Dijkstraを使う。
- N circle endpointに対してN回Dijkstraを実行し、N×N distance matrixを作る。
- distanceだけをflat arrayで保存し、all-pairs path geometryは保存しない。
- 表示中の1区間だけ経路復元する。
- purchase、held、excluded、manual target変更でmatrixを再生成しない。
- 任意始点変更ではcircle matrixを再生成せず、始点から1回Dijkstraを実行する。

cache identityには最低限次を含める。

- eventId
- dayId
- areaId
- map bundle version
- grid/crowd weight version
- sorted circle spaceとresolved endpointのhash
- matrix schema version

priority、memo、accountなど距離に影響しないmetadata変更だけでは再生成しない。

## 16. LocalStorage

距離行列は`DistanceMatrixRepository`を通してLocalStorageへ保存する。

```ts
interface StoredDistanceMatrix {
  readonly schemaVersion: 1;
  readonly cacheKey: string;
  readonly areaId: string;
  readonly spaces: readonly string[];
  readonly size: number;
  readonly distances: readonly number[];
  readonly createdAt: string;
}
```

- `distances[row * size + column]`で参照する。
- 保存失敗時もmemory上のmatrixで現在sessionの案内を続ける。
- 保存失敗時は次回再計算になることを表示する。
- quota確保のためにcircle stateや他の日程を自動削除しない。

## 17. Worker and Progress

Worker job stage:

```text
distance-matrix
top-tw
complete
cancelled
error
```

- matrixは処理済み始点数/全始点数を返す。
- 数rowの実測後に推定残り時間を返す。
- TOPTWは経過時間/設定時間を返す。
- UIは非modalの共通status componentで進捗を表示する。
- current legは計算更新で変更しない。
- stale Worker messageはjob generation IDで拒否する。

cancel:

- matrix cancelではcurrent legを維持し、全体最適化を未準備にする。
- TOPTW cancelでは最新bestを採用する。
- 再最適化cancelでは表示中routeと最後のbestを保持する。
- cancelは案内停止ではなくbackground improvement停止である。

## 18. TOPTW

Python参照実装の入出力に対応するTypeScript adapterを実装する。

必要な入力:

- node IDs
- distance matrix
- objective input
- fixed first target
- time limit
- deterministic random seed
- initial solutions
- previous reusable state
- progress callback
- cancellation

規則:

- default time limitは15秒。
- settingsで5、15、30、60秒から選ぶ。
- 実行ごとの確認dialogは出さない。
- 初回は複数のdeterministic heuristic seedを使う。
- 再実行はprevious bestと修復済みrouteをwarm startに使う。
- time limit終了前でもusableなbest routeを返す。
- fixed first targetを変更しない。
- PythonとTypeScriptの小規模fixtureで入力解釈、制約、score、seedを比較する。
- Python runtimeとPython dependencyをWeb buildへ入れない。

## 19. Per-map Lifecycle

地図ごとに次を保持する。

- distance matrixとcache identity
- best remaining order
- small warm-start seeds
- remaining candidate identity
- last optimization summary

地図切替時:

- 離れる地図のcurrent position、target、current legを再利用しない。
- matrix、circle state、best order、warm-start seedを保持する。
- 戻った地図では始点を設定し直す。
- 新始点から1回Dijkstraを実行し、保存済みbestを修復してwarm startに使う。

## 20. Reload Recovery

navigation snapshotに期限を設けない。同じevent/dayのdataが残る限り保持する。

再読込時:

```text
前回の案内が残っています
[案内を再開]
[始点を設定し直す]
```

snapshot:

- event/day
- active area
- bundle/matrix identity
- last confirmed current position
- current target
- navigation stage
- current leg
- best remaining order
- optimization time setting
- saved timestamp

保存しない:

- Worker process
- pending Promise
- current remaining seconds
- global Undo token

再開条件:

- snapshotとcurrent bundle、circle state、target endpointが整合する。
- targetがpurchased/excluded、bundle mismatch、endpoint mismatchの場合は再開を拒否し、始点再設定へ誘導する。
- route geometryは必要に応じて再構築する。
- saved bestをinitial solutionとして新しいoptimizationを開始する。

始点再設定ではnavigation stateだけを破棄し、circle state、matrix、best orderを保持する。

## 21. Local Data Deletion

`この日の巡回状態を初期化`で削除するもの:

- held、purchased、excluded
- navigation snapshot
- current target、arrival state、current leg
- best order、warm-start seed
- undo token

保持するもの:

- source設定
- circles
- sourceGeneration
- map bundle
- distance matrix
- grid asset/cache

GAS outboxは既存lock、preflight、rollback契約に従い、pending entryを無条件に捨てない。

`この日程のデータを削除`で削除するもの:

- sourceとcircles
- circle states
- GAS outbox
- navigation snapshot
- best order/warm-start
- distance matrices
- event/day index entry

## 22. Error Handling

- 4地図のどれかが不正ならC108 production登録を完了扱いにしない。
- raw SVG、binary、manifest全体、memo、credentialをUI errorやconsoleへ出さない。
- Worker errorではcurrent legとbest known routeを維持し、再試行可能にする。
- circle state save失敗時は成功表示しない。
- matrix cache save失敗だけはmemoryで継続する。
- navigation snapshot save失敗時は今回の案内を継続し、再読込復帰できないことを表示する。
- unreachable circleを通常best routeへ混ぜない。

## 23. Mobile and Accessibility

- 主要操作は44×44 CSS px以上。
- stateをcolorだけで示さない。
- dialogはfocus trap、Escape close、focus returnを持つ。
- progressは段階変更と完了を適切な`aria-live`で通知し、頻繁に読み上げない。
- 200% text zoomで主操作を隠さない。
- portrait幅でhorizontal overflowを起こさない。
- keyboardだけでlist/detailと始点代替選択を操作できる。
- safe-area insetを維持する。

## 24. Phase Boundaries

Phase 5B:

- C108 public bundle 4 area
- day1/day2共通manifest
- production registryはC108のみ
- demo-v1はtest/dev fixture
- runtime/build/public-boundary validation
- SVG/points/grid座標整合
- browser route smoke
- desktop/mobile相当Dijkstra benchmark
- Phase 5C handoff

Phase 5Bではschema、Worker、matrix repository、TOPTW、navigation UIを実装しない。

Phase 5C:

- schema migration
- exclusive circle state
- navigation state machine
- arbitrary start
- arrival-before-actions
- hold before/after arrival
- excluded
- list/detail UI
- per-map lifecycle
- matrix Workerとrepository
- TOPTW adapter、time limit、warm start
- progress、cancel
- permanent recovery snapshot
- held bulk-return dialog
- storage deletion integration
- unit/integration/E2E/accessibility verification

Phase 5Cでは地図間最適化、自動現在地推定、server persistence、multi-device sync、external information provider、broad visual redesignを実装しない。

## 25. Implementation Gate

この設計書とPhase 5B/5C正式実装計画は承認済みである。コード実装は、ユーザーがPhase 5B Task 1の開始を指示した後に行う。各TaskはPhase indexの順序、変更範囲、検証、承認境界に従って実施する。
