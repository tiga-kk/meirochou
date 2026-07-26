# Current Progress

**更新日:** 2026-07-26
**現在の段階:** Phase 5C Task 7完了（Navigation and Optimization Orchestration）

## コード実装

Phase 5C Task 5のpure kernel・Worker・controller・repositoryを実装・レビュー修正した。

- `buildDistanceMatrixCacheKey`: コンテントアドレス型キャッシュキー生成（メタデータ依存排除、grid/endpoint/version駆動）
- `dijkstraFromCell` / `computeAllPairsDistances`: all-pairsパス幾何学を保存せず平坦配列へ計算する純粋Dijkstraカーネル（crowded weight 1.5対応）
- `DistanceMatrixWorkerKernel` / Worker protocol: キャンセル・進捗（N endpoints）・ETA・stale jobId拒否
- `DistanceMatrixController`: cache hit/miss、UI progress model、stale response、cancel
- `LocalStorageDistanceMatrixRepository`: runtime検証、`Infinity`復元、クォータエラーの安全な捕捉

Task 6以降の最適化設計は2026-07-27に改訂した。

- 時間制限付きTOPTWを廃止し、購入完了時刻に応じた時間減衰価値を最大化するALNSを採用する。
- 地図内の総滞在時間とサークル個別締切を要求しない。
- Task 5の重み付きdistance matrixは維持し、Task 6でarea別係数により秒へ変換する。
- 半減時間は30/60/120分の等重み、通常service timeは30秒、壁service timeは200秒とする。
- search timeは5/10/15秒、defaultは10秒とする。
- production solverはALNSのみとし、GAは実装しない。
- 正本追補: `docs/specs/2026-07-27-phase-05c-time-decayed-alns-amendment.md`

Task 6の実装・レビュー修正:

- `OptimizationTimingProfile` & `convertDistanceToTravelTime`: 重み付きグリッド距離からエリア別移動秒数への純粋アダプター
- `calculateDecay` & `evaluateRouteScore`: 半減時間（30分, 60分, 120分等重み）の購入完了時間ベースTime-Decayed評価関数
- `TimeDecayedAlnsSolver`: 探索時間制限（5s, 10s, 15s）、決定性擬似乱数、複数初期候補、Destroy & Repair、`fixedFirstTarget`固定、warm-start解保持
- `TimeDecayedAlnsWorkerKernel` / protocol / entrypoint: `time-decayed-alns` stage、progress、complete、cancelled、error、途中キャンセル時の最新best返却
- settings component: 5/10/15秒の探索時間選択とdefault 10秒

Task 7の実装・レビュー修正:

- `NavigationOrchestrationService`: 始点直後の暫定target、到着前保留、到着後購入、手動target変更、Worker progress/cancelを統合
- Worker結果は現在targetを先頭に保持し、`bestOrder`だけを更新。`provisionalOrder`、current position、locked first legを上書きしない
- optimizer generationを追加し、cancelまたは状態遷移後の古いWorker progressを破棄
- `buildOptimizationProblem`: Task 5のN×N circle matrix、始点距離、area別timing profile、priority、service timeをTask 6 problemへ変換
- 未知area、不足行列、負値・非数の距離を明示的に拒否し、Task 5の距離行列を黙ってfallbackしない
- Circle state mutationとのarrival hold連携、profile-version再評価/recovery、進捗UI、完了ダイアログはTask 8/9へ移管

## 検証

Task 5 focused test 27件、Task 6 focused test 24件。Task 7 focused test 14件はGREEN。Task 7変更を含む`npm run test:webapp`は45ファイル442件、`check:webapp`、build、artifact検証、Biome、git diff検査はPASS。

`npm run test:e2e`は標準の`test-results`とVite cacheが`nobody`所有で書込み不可だったため、そのままでは起動できなかった。生成物出力先と一時Vite設定を使った同一Playwright実行では39件中31 failed・8 skippedとなった。失敗は全てmobile-chromiumで、初期画面のlocatorが存在しない／表示されない状態だったため、Task 7の変更が原因と断定せず、E2E環境・既存mobile suiteの別途調査事項として残す。

## 統合済み

- Phase 4はPR #2で`main`へ統合済み。
- Phase 5AはPR #3で`main`へ統合済み。
- Phase 5A merge後に確認された`main` commitは`b731e8e0a14cb80d27551630f79d4a8cadff046c`。
- Cloudflare Pages production公開はPhase 5Aで完了済み。

## 承認状態

- Phase 5B/5C共有設計: 承認済み。ALNS追補がoptimizer条項を上書きする。
- Phase 5B正式実装計画: 承認済み（全Tasks 1-6完了）。
- Phase 5C正式実装計画: 承認済み。
- Phase 5C Task 1: **実装・検証完了**。
- Phase 5C Task 2: **実装・検証完了**。
- Phase 5C Task 3: **実装・検証完了**（コミット未）。
- Phase 5C Task 4: **実装・検証完了**（コミット未）。
- Phase 5C Task 5: **実装・検証完了**（コミット未）。
- Phase 5C Task 6: **実装・レビュー修正・検証完了**（`33f3f58`）。
- Phase 5C Task 7: **実装・レビュー修正・検証完了・コミット済み**（本Task commit）。

## 次の操作

1. Task 7のコミット後、Phase 5C Task 8（Navigation Recovery Snapshot and Deletion Rules）へ進む。
2. Task 8以降で、Task 7から移管したCircle state mutation、profile-version recovery、進捗UI、完了ダイアログを実装する。

## 人手入力

Phase 5B Task 1開始前:

- Git管理外の`/maps/C108/`へ4地図の完成済みSVG、points、grid metadata、grid binaryを配置する。
- 元地図、OCR入力、Python地図生成コード、中間画像をWebリポジトリへ入れない。

Phase 5C Task 6開始前:

- Python版TOPTW参照実装の配置は不要。
- Task 5のdistance matrix契約を変更しない。
- 初期timing profile、半減時間、service time、search timeは設計追補の値を使用する。
- 壁分類が信頼できないcircleは通常service time 30秒として扱う。

## GitHub上の計画文書

正式計画文書は`feature/phase5c` branch上の`docs/plans/phase-05c/`と`docs/specs/`を正本とする。
