# 進捗

更新日: 2026-08-11

## 現在の状態

- リポジトリ: `tiga-kk/meirochou`
- production branch: `main`
- Phase 6 merge commit: `9718f976558e31596585f6e03416db8825c6e13f`（PR #9）
- Phase 7.1計画作成時main: `c812de4ae68bf720781c8a498a2664990d3546b0`（履歴参照用。実装基準には固定しない）
- 計画文書branch: `docs/phase-07-1-ux-polish-plan`
- Phase 5D: 完了
- Phase 6: 完了・`main`へmerge済み
- Phase 6.1: 完了・`main`へmerge済み
- Phase 7: 完了・`main`へmerge済み
- 現在のフェーズ: Phase 7.2 Task 1 完了
- 次のTask: Phase 7.2 Task 2「カタログページ用Chrome拡張とCI接続」
- scale values: 確定

### Phase 6.1の既知残件

- 同一地点pinのz-orderテストは、focused rerunでは単発・5回反復とも成功したが、過去のCI retry/再実行失敗履歴があるため、間欠残件として追跡中。Phase 6.1新規回帰とは断定しない。
- C108 private smoke 8件はfixture unavailableのためskip。以上により完全GREENではない。

### Phase 6.1で確定したscale values

- `e456`: `270 / 4096 m/px = 0.06591796875`。根拠: [東京ビッグサイト公式 東展示棟](https://www.bigsight.jp/organizer/facilities/east.html)の東1〜6各約90m×90m。
- `e7`: `120 / 1848 m/px = 0.06493506493506493`。根拠: [東京ビッグサイト公式 東展示棟](https://www.bigsight.jp/organizer/facilities/east.html)からリンクされる[東7ホール公式概要PDF（現行リンク）](https://www.bigsight.jp/organizer/facilities/pdf/E_E7_d.pdf)のA-A、30000mm×4。指定された`E_E7_c.pdf`は公式サーバーで404だったため、現行の実在公式URLを記録する。
- `s12`: `144 / 1872 m/px = 0.07692307692307693`。根拠: [東京ビッグサイト公式 南展示棟](https://www.bigsight.jp/organizer/facilities/south.html)の南1・2各約72m×72m。
- `w12`: `180 / 2904 m/px = 0.06198347107438017`。根拠: [東京ビッグサイト公式 西展示棟](https://www.bigsight.jp/organizer/facilities/west.html)の西1・2各L字（135×45）＋（45×45）の全体span。

## Phase 6.1

本番`meirochou.tiga.moe`を実機操作して判明した具体的な問題を修正した。

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
- wide/tall mapの`initialX`/`initialY`はbase transformとして保持し、reset/area変更で中央位置を失わない。
- map pointermove hot pathでlayout readを繰り返さない。
- Galleryの購入方向contractとPhase 6で実際に必要だったfinger travelを維持し、表示translationだけを非線形抵抗へする。
- routing costと物理距離を分離する。UIへweighted routing costをそのまま距離として表示しない。
- current routeはS/Gを文字表示し、solid base line上にCSS `stroke-dashoffset`のflow lineを重ねる。
- route animationのためにJavaScript RAF/timer、Dijkstra/ALNS再計算、毎frame DOM再生成を追加しない。
- `prefers-reduced-motion: reduce`ではflow animationを停止する。

## Phase 7

Phase 6.1完了後、会場の不安定な通信へ備えたoffline準備と管理画面再設計を実装した。

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

### Phase 7の進捗

- Task 1: Service Worker + Cache Storageのcatalog offline基盤 — 完了
  - `comipath-catalog-v1`へのURL単位cache、opaque response、partial failure、best-effort persistenceを実装。
  - production buildへ`catalog-service-worker.js`を単一ファイルとして含め、GET imageのcache hitだけをoffline fallbackするcontractを検証。
- Task 2: registry全event/dayのmanagement overview modelと一覧UI — 完了
  - registry順の全event/day、source/data/GAS queue/offline statusを一覧化し、未設定dayとstatus取得失敗を区別。
- Task 3: 開く/再読込/offline準備/編集/削除actionを一覧へ接続 — 完了
  - 日程一覧から既存のイベント切替、保存済みGAS再読込、CSV file picker、source editor、削除確認へ接続。
  - local deletion後は未参照catalog URLだけをbest-effort cleanupし、共有URL、削除失敗、残存参照取得失敗を安全側へ扱うwrapperとtestを追加。
- Task 4: mainとmanagementのvisual hierarchyを再構成 — 完了
  - main内のinline settings cardを廃止し、headerの「管理」から独立したdialog相当surfaceを開く構造へ変更。
- Task 5: offline/management/visualの最終検証 — 完了
  - catalog offline partial failure/retry、management offline status、管理/GAS/offline/cache cleanup/queue操作を検証。

### Phase 7の既知残件

- `tests/e2e/management.spec.ts`の一部visual snapshotは、機能assertionが通過する一方で基準差分の履歴がある。Phase 7.1の管理画面再設計時に意図した新baselineを個別に確立する。
- `tests/e2e/webapp.spec.ts`の地図・候補表示snapshotには過去にretryで成功するflaky履歴がある。Phase 7.1の地図変更と因果を切り分ける。
- `npx biome check .`はリポジトリ既存のlint/format/a11y指摘を含むため、広範な自動整形は行わない。

### Phase 7レビュー指摘対応

- Service Workerのactivateで`clients.claim()`を実行し、初回registration後の同一pageをreloadなしでcontrolできることを確認。
- 管理overviewの「開く」は日程切替後にmanagement surfaceを閉じ、main navigationへ戻るよう修正。
- managementの第一層をevent/day rowsへ限定し、旧selector/source/outbox/optimization/delete操作をsecondary detail surfaceへ移動。
- 使用中rowへ`[使用中]`と`aria-current="true"`を追加。
- offline statusとcache cleanupのcatalog URL抽出を`catalogUrlsFromCircles()`へ統一し、残存参照確認をstrict index listingへ変更。
- nested dialogのfocus containmentを共通化し、dialog中の外部操作をinert化するunit testを追加。

## Phase 7.1

Phase 7を本番操作して判明したナビゲーション、地図操作、管理画面、motionの問題を修正する。

設計:
`docs/specs/2026-08-11-phase-07-1-navigation-motion-and-management-ux-design.md`

Phase計画:
`docs/plans/phase-07-1/README.md`

実装順:

1. Task 1: current route flowの実動検証と最小修正
2. Task 2: navigation summaryの情報重複解消
3. Task 3: map pan bounds・release velocity・inertia改善
4. Task 4: management surfaceの遮蔽とbackground scroll isolation
5. Task 5: 必要なmotion feedbackの分離実装
6. Task 6: management list-detail redesign
7. Task 7: 総合検証・snapshot・進捗確定

### Phase 7.1で確認済みの問題

- current routeにはCSS `stroke-dashoffset` animation定義が存在するが、実機では静止して見える。`animation-name`だけではなくcomputed dash offsetの実時間変化をtestする。
- 通常案内中、地図上部summaryと下部sheetの双方にcurrent target/distanceが表示され、正本が分かりにくい。
- candidate previewでは現行bottom sheetが候補space/distanceの文字表示を担っているため、通常時の重複除去で候補identityまで消さない必要がある。
- `GestureZoomController`は慣性を持つが、release velocityが最後のpointer deltaへ強く依存し、frame固定減衰のため端末差が出やすい。
- C108地図は必要な四辺へ到達できることをunit/E2E contractで固定する必要がある。
- management surfaceはすでにfixed/opaqueだが、background document scroll lockとscroll chaining抑止が不足している可能性がある。
- Gallery初回swipe hintは実際のswipeを模倣せず文字表現中心なので、操作方向を示す短いtranslate motionへ変更する。
- management overview rowは5 actionが並び、mobileではlist→detail、desktopでは同じmodelの2-paneへ整理する。
- 現行managementの`再読込`、offline準備、編集、削除は対象dayへ切り替えてから既存Use Caseを実行する。このaction semanticsと「detailを見るだけではactive dayを変えない」を混同しない。

### Phase 7.1で固定する重要事項

- 計画作成時main SHAは履歴参照だけに使い、各Task開始SHAは実装開始直前の最新HEADから取得する。
- route flowはsolid base + moving dash + S/Gを維持し、JavaScript per-frame route更新を追加しない。
- 通常案内のcurrent target/distanceは地図上部summaryを正本とし、candidate previewのidentity/distanceは候補操作領域へ残す。
- pan physicsは既存`GestureZoomController`を再利用し、別pure moduleの作成を必須にしない。
- 現行約32pxのrubber-band上限を根拠なく24pxへ変更しない。
- bounds内panは1:1、release velocityは複数sample、inertiaはdtベース、bounds外releaseはsettleとする。
- managementは既存full-screen surfaceを維持し、再現した不足に対してscroll lock/scroll chainingを最小修正する。
- scroll lock専用public interface/moduleを一利用者のためだけに必須化しない。
- 非必須motionは`motion.css`へ集約するが、Phase 7.1の必須範囲はGallery hintとmanagement transitionに限定する。purchase/route endpoint/async completionの追加演出は対象外。
- management detail selectionとactive event/dayを別概念として扱う。
- management detailの新component作成を必須にせず、既存`ComipathSettings`のowner責務を優先して再利用する。
- 既存5 action eventのtest coverageをoverviewからdetailへ移し、削除だけで終わらせない。
- management E2Eではdetailを自動openするhelperをlist/detail本番経路の証明に使わない。
- Phase全体の最終検証とprogress確定をTask 7へ分離し、最終production commit SHAが確定した後にdocs-onlyで進捗へ記録する。

### Phase 7.1の進捗

- 設計書: 敵対的レビュー反映済み。
- Task 1〜7実装計画: 敵対的レビュー反映済み。
- production code/test変更: 完了。
- Task 1: route flowの実動検証とmotion assertion — 完了（`143e93e`）
- Task 2: navigation summaryの重複解消 — 完了（`58828ef`）
- Task 3: map pan bounds・release velocity・inertia改善 — 完了（`5e823e2`）
- Task 4: management surfaceのscroll isolation — 完了（`cdbfa57`）
- Task 5: Gallery swipe hintのmotion分離 — 完了（`baa4ec8`）
- Task 6: management list-detail redesign — 完了（`5a91251`、`5d321c3`、`2ac3ec9`）
- Task 7: 総合検証・snapshot・進捗確定 — 完了（`3cd4cde`、`edd30dd`、`2d97dfd`）
- 総合検証: Vitest 103 files / 700 tests、route guidance 38 tests、Phase 5D回帰4 tests、GAS 27 tests、CI相当E2E 55 passed / 8 skipped、architecture/typecheck/build/public audit/diff check成功。
- snapshot: Task 2のsummary変更、Task 4/6のmanagement list-detail・scroll isolation変更に対応する4件と、CIブラウザ差分のoutbox snapshot 1件だけを更新。
- 既存・環境要因: CI用一時コンテナの`npm ci`がmoderate 1 / high 1のaudit警告を出すが、テスト結果には影響しない。テスト中の既存warningは失敗扱いしない。
- 次の作業: Phase 7.1を完了として次フェーズの計画確認へ進む。

## Phase 7.2

Phase 7.1統合後の実機確認で判明した経路表示、地図操作、Gallery、目的地詳細の残件を修正し、カタログページ用Chrome拡張とGAS catalog upsertを追加する。計画・設計文書はGitHubの`docs/phase-07-2-field-followup-plan`から取得して参照する。

### Phase 7.2の進捗

- Task 1: GASコードコピーUIとcatalog upsert API — 完了
  - 管理画面から生成済み`Code.gs`を取得してClipboardへコピーできるUIを追加。Clipboard拒否時は手動コピーfallbackを表示する。
  - `upsertCatalog`を既存`sale`と明示`action`で分離し、既存行では`tweet`列だけを更新し、新規spaceは列位置を保って追加する。
  - Vite dev/buildの`Code.gs.txt`公開とsource/artifact byte一致検証を追加した。
  - GAS 30 tests、UI focused tests、webapp build、architecture/typecheck、public build auditを実行した。
- Task 2〜8: 未着手

### Phase 7.2の固定事項

- `integrations/gas-spreadsheet/Code.gs`を唯一のコピー用artifactとし、webappへGASコード文字列を複製しない。
- `doPost(e)`のJSON解析は一度だけとし、`upsertCatalog`と`sale`を`action`で振り分ける。
- `upsertCatalog`は`priority`、`isSale`、`account`、`memo`を変更せず、duplicate spaceを安全に拒否する。

## 実装開始時の確認

Phase 7.1 production実装は、実装開始時点の最新remote `main`から開始する。`docs/phase-07-1-ux-polish-plan`へproduction code/test/package/CI変更を追加しない。

各Task開始直前に最新remoteを取得し、Task文書で列挙したfile名・公開contract・test commandが現在コードと一致するか確認する。private implementationの安全な移動には追従してよいが、ユーザー向けcontractや既存Use Case semanticsが変わっている場合はTaskを勝手に読み替えず再評価する。

Phase 7.1ではTask 3のgesture変更を他のvisual変更と混ぜず、Task単独でreviewする。Task 7では新機能を追加せず、Task 1〜6の相互回帰、snapshot、既存failure分類、progress確定だけを行う。

## 完了済みPhaseの参照

- Phase 7: `docs/specs/2026-08-10-phase-07-offline-event-management-and-visual-system-design.md`, `docs/plans/phase-07/`
- Phase 6.1: `docs/specs/2026-08-10-phase-06-1-field-ux-followups-design.md`, `docs/plans/phase-06-1/`
- Phase 6: `docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`, `docs/plans/phase-06/`
- Phase 5D: `docs/plans/phase-05d/`

過去の詳細なWIP/診断記録は各Phase文書とGit履歴を正本とし、このprogress文書には現在の実装判断に必要な状態だけを保持する。
