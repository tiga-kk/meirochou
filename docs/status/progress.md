# Current Progress

**更新日:** 2026-07-26
**現在の段階:** Phase 5C Task 9レビュー修正・検証完了（Mobile E2E and Accessibility Verification。runtime接続はTask 10で確認）

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

Task 8の実装:

- `LocalStorageNavigationSnapshotRepository` & `validateSnapshotForResume`:
  - schema、event/day identity、案内状態（`navState`）、確定位置（`currentPosition`）、locked leg、最適化時間設定をruntime parser経由で永続化
  - Workerプロセスや未処理Promiseなどのランタイム状態を保存対象から完全除外
  - バンドルバージョン、pending候補、circle state、target endpointの不一致を安全に再開拒否
- `StorageDeletionService`:
  - 巡回状態の初期化（`activity`削除）時に距離行列（`distance matrix`）を保持し、ナビゲーションスナップショットのみ削除
  - circle source変更、日程データの完全削除（`event-day` / `all-events`削除）時に距離行列およびスナップショットを削除
- 管理画面の削除説明を、距離行列と再開snapshotの保持・削除境界に合わせて更新
- 再読込dialog、route geometry再構築、warm-start実行はTask 9のnavigation UI/E2E接続へ移管

Task 9の実装:

- `tests/e2e/navigation-mobile.spec.ts`:
  - モバイルnavigation UIの基礎状態、ターゲット表示、タッチターゲット（>=44px）、ポートレート幅横スクロールオーバーフロー非発生、外部ネットワークリクエスト非発生、コンソール/ページエラー検出なしを検証
- `tests/e2e/navigation-keyboard.spec.ts`:
  - デスクトップキーボードフォーカス、Tab移動、Escapeダイアログクローズ等のキーボード操作性を検証
- UI/UXの統合: 44px hit area、focus ring、Escape focus return、200% zoom、portrait overflow、外部通信監視を接続。
- Font Awesome/Twitter widgetの外部CDN依存を除去し、ローカルicon CSSへ移行。same-origin外の自動通信を発生させない。
- `NavigationSnapshotRepository`のreload/resume dialog接続、route geometry再構築、warm-startのApp runtime接続は未確認。Task 10のexit gateでBLOCKER判定する。

## 検証

Task 5 focused test 27件、Task 6 focused test 24件、Task 7 focused test 14件。Task 8 core focused test 18件、関連UI/管理テスト41件はGREEN。Task 8変更を含む`npm run test:webapp`は46ファイル454件PASS。Task 9 focused E2E 3件、全Playwright 34件PASS・8件SKIP。型チェック、build、artifact検証、Biome、git diff検査もPASS。

## 統合済み

- Phase 4はPR #2で`main`へ統合済み。
- Phase 5AはPR #3で`main`へ統合済み。
- Phase 5A merge後に確認された`main` commitは`b731e8e0a14cb80d27551630f79d4a8cadff046c`。
- Cloudflare Pages production公開はPhase 5Aで完了済み。

作業開始時は現在の`main`、remote、working treeを再確認する。

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
- Phase 5C Task 7: **実装・レビュー修正・検証完了・コミット済み**（`3bc7b7e`）。
- Phase 5C Task 8: **実装・レビュー修正・検証完了・コミット済み**（`12dced1`）。
- Phase 5C Task 9: **レビュー修正・検証完了・コミット済み**（本コミット。E2E/accessibility、reload/resume runtime未確認）。

## 次の操作

1. Phase 5C Task 10 (Phase Verification and Handoff) のexit gateでreload/resume runtime接続を確認する。
2. 未接続の場合はTask 10の完了条件を満たすまでPhase 5Cを完了扱いにしない。

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
