# 進捗

更新日: 2026-08-10

## 現在の状態

- リポジトリ: `tiga-kk/meirochou`
- production branch: `main`
- Phase 6 merge commit: `9718f976558e31596585f6e03416db8825c6e13f`（PR #9）
- 計画文書branch: `docs/phase-06-1-phase-07-followup-plan`
- Phase 5D: 完了
- Phase 6: 完了・`main`へmerge済み
- 現在のフェーズ: Phase 6.1 計画完了、実装未開始
- 次に着手するTask: Phase 6.1 Task 1
- Phase 7: 計画済み。Phase 6.1完了前には実装開始しない

## Phase 6.1

本番`meirochou.tiga.moe`を実機操作して判明した具体的な問題を修正する。

設計:
`docs/specs/2026-08-10-phase-06-1-field-ux-followups-design.md`

Phase計画:
`docs/plans/phase-06-1/README.md`

実装順:

1. Task 1: pending GASがあっても明示削除できるよう、削除scopeとoutboxの意味を修正する
2. Task 2: GAS/CSV読込やpreview反映等の長時間処理を右下async operation indicatorで表示する
3. Task 3: map viewport/stageを実画像比率へ合わせ、rubber-bandとgesture性能を修正する
4. Task 4: Gallery swipeを「開始時は重く、閾値付近で軽い」非線形抵抗へ変更する
5. Task 5: 距離をm表示し、Start/Goalと軽量なStart→Goal route flow animationを追加する
6. Task 6: Phase 6.1全体をE2E/visual/performance観点で最終検証する

### Phase 6.1で固定した重要事項

- pending GAS queueは明示削除を禁止するlockではなく、削除confirmationで破棄件数を警告する対象とする。
- `activity`/`circle-source`削除では、そのscopeに属するpending GAS queueも一緒に破棄し、旧mutationを後からremoteへ送らない。
- 削除warningの本番表示経路は`buildDeleteOptions()` → `buildStorageDeleteDialogModel()` → `BrowserApplication` → `storage-delete-dialog.ts`とし、未接続の別modelへ追加して完了扱いしない。
- async operationは`busy`とoperation種別を同じSession snapshotで更新し、GASだけでなくTask 2に列挙したCSV preview/applyも実controller pathから到達可能にする。
- map viewportは実画像比率へ追従する。横長地図でも操作領域は最低220pxを確保する。
- 横長地図は必要ならcover表示して横panさせる。地図外は最大約32pxだけrubber-bandし、releaseで戻す。
- wide/tall mapの`initialX`/`initialY`はbase transformとして保持し、reset/area変更で`{1,0,0}`へ戻して中央位置を失わない。
- map pointermove hot pathでlayout readを繰り返さない。
- Galleryの購入方向契約とPhase 6で実際に必要だったfinger travelを維持し、表示translationだけを非線形抵抗へする。現行の実効購入距離は`visualThreshold / 0.6`である。
- routing costと物理距離を分離する。UIへweighted routing costをそのまま距離として表示しない。
- `metersPerPixel`はC108各areaの既知実寸根拠を確認してから設定し、推測値をcommitしない。
- scale根拠が不足してもTask 5全体を停止せず、S/G、route flow、`physicalPixelLength`等のscale非依存部分は先に完了できる。ただしm距離部分が未完了ならPhase 6.1全体は完了扱いにしない。
- current routeはS/Gを文字表示し、solid base line上にCSS `stroke-dashoffset`のflow lineを重ねる。
- route animationのためにJavaScript RAF/timer、Dijkstra/ALNS再計算、毎frame DOM再生成を追加しない。
- `prefers-reduced-motion: reduce`ではflow animationを停止する。

## Phase 7

Phase 6.1完了後、会場の不安定な通信へ備えたoffline準備と管理画面再設計を行う。

設計:
`docs/specs/2026-08-10-phase-07-offline-event-management-and-visual-system-design.md`

Phase計画:
`docs/plans/phase-07/README.md`

実装順:

1. Task 1: Service Worker + Cache Storageでcatalog offline cache基盤を追加
2. Task 2: registry全event/dayのmanagement overviewを追加
3. Task 3: 開く/再読込/offline準備/編集/削除actionを一覧へ接続
4. Task 4: mainとmanagementのvisual hierarchyを再構成
5. Task 5: offline/management/visualを最終検証

### Phase 7で固定した重要事項

- offline保存はユーザーが事前に明示実行する。page loadごとの自動全downloadは行わない。
- Service Workerは`GET` image requestのcatalog cache hitだけをoffline fallbackし、app shell等を一般的なcache-firstへしない。full PWA、install prompt、background sync、pushを追加しない。
- Phase 7ではcatalog URL文字列をcache identityとして扱い、既に同じURLがcache済みなら再downloadしない。同じURLのresponse body差し替えを自動検出する追加DBやmetadata管理は導入しない。
- partial download failureでも成功済みcacheを保持する。
- management一覧にはregistry定義済みevent/dayをすべて表示し、未設定dayも消さない。
- offline status取得失敗は`cached=null`相当として扱い、正常に確認できた`0件保存済み`と区別する。
- registry外eventをブラウザだけで任意作成しない。
- GAS sourceは現行どおりevent/dayあたり1 sheetとし、Phase 7でmulti-sheetへ広げない。
- 同じcatalog URLは複数event/dayで共有できる。local deletion後のcache cleanupでは残存event/dayの参照を確認し、他dayが参照する共有URLを削除しない。残存参照確認に失敗した場合はcache cleanupをskipし、成功済みlocal deletionは維持する。
- main navigationから旧inline設定panelの縦積みを外し、管理は独立surfaceへ移す。
- visual redesignは装飾追加ではなく、map/catalog/actionを主役にした情報階層の整理として行う。既存tokenを優先し、同義tokenを不要に増やさない。

## 実装開始時の確認

Phase 6.1のproduction実装は、この計画文書がレビューされ`main`へ反映された後の最新remote `main`から開始する。`docs/phase-06-1-phase-07-followup-plan`へproduction code/test/package/CI変更を追加しない。

各Task開始直前に最新remote `main`を取得し、Task文書で列挙したファイル名・公開contract・test commandが現在コードと一致するか確認する。private implementationの安全な移動には追従してよいが、ユーザー向け契約が変わっている場合はTaskを勝手に読み替えず計画を再評価する。

Phase 6.1 Task 6がGREENになり、`docs/status/progress.md`へ完了が記録されるまでPhase 7実装を開始しない。

## 完了済みPhaseの参照

- Phase 6: `docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`, `docs/plans/phase-06/`
- Phase 5D: `docs/plans/phase-05d/`

過去の詳細なWIP/診断記録は各Phase文書とGit履歴を正本とし、このprogress文書には現在の実装判断に必要な状態だけを保持する。
