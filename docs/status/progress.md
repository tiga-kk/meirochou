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
2. Task 2: GAS読込等の長時間処理を右下async operation indicatorで表示する
3. Task 3: map viewport/stageを実画像比率へ合わせ、rubber-bandとgesture性能を修正する
4. Task 4: Gallery swipeを「開始時は重く、閾値付近で軽い」非線形抵抗へ変更する
5. Task 5: 距離をm表示し、Start/Goalと軽量なStart→Goal route flow animationを追加する
6. Task 6: Phase 6.1全体をE2E/visual/performance観点で最終検証する

### Phase 6.1で固定した重要事項

- pending GAS queueは明示削除を禁止するlockではなく、削除confirmationで破棄件数を警告する対象とする。
- `activity`/`circle-source`削除では、そのscopeに属するpending GAS queueも一緒に破棄し、旧mutationを後からremoteへ送らない。
- map viewportは実画像比率へ追従する。横長地図でも操作領域は最低220pxを確保する。
- 横長地図は必要ならcover表示して横panさせる。地図外は最大約32pxだけrubber-bandし、releaseで戻す。
- map pointermove hot pathでlayout readを繰り返さない。
- Galleryの購入方向契約は維持し、表示translationだけ非線形抵抗へする。
- routing costと物理距離を分離する。UIへweighted routing costをそのまま距離として表示しない。
- `metersPerPixel`はC108各areaの既知実寸根拠を確認してから設定し、推測値をcommitしない。
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
- Service Workerはcatalog image fallbackに限定し、full PWA、install prompt、background sync、pushを追加しない。
- partial download failureでも成功済みcacheを保持する。
- management一覧にはregistry定義済みevent/dayをすべて表示し、未設定dayも消さない。
- registry外eventをブラウザだけで任意作成しない。
- GAS sourceは現行どおりevent/dayあたり1 sheetとし、Phase 7でmulti-sheetへ広げない。
- main navigationから旧inline設定panelの縦積みを外し、管理は独立surfaceへ移す。
- visual redesignは装飾追加ではなく、map/catalog/actionを主役にした情報階層の整理として行う。

## 実装開始時の確認

Phase 6.1のproduction実装は、この計画文書がレビューされ`main`へ反映された後の最新remote `main`から開始する。`docs/phase-06-1-phase-07-followup-plan`へproduction code/test/package/CI変更を追加しない。

各Task開始直前に最新remote `main`を取得し、Task文書で列挙したファイル名・公開contract・test commandが現在コードと一致するか確認する。private implementationの安全な移動には追従してよいが、ユーザー向け契約が変わっている場合はTaskを勝手に読み替えず計画を再評価する。

Phase 6.1 Task 6がGREENになり、`docs/status/progress.md`へ完了が記録されるまでPhase 7実装を開始しない。

## 完了済みPhaseの参照

- Phase 6: `docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`, `docs/plans/phase-06/`
- Phase 5D: `docs/plans/phase-05d/`

過去の詳細なWIP/診断記録は各Phase文書とGit履歴を正本とし、このprogress文書には現在の実装判断に必要な状態だけを保持する。
