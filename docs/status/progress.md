# 実装進捗

更新日: 2026-08-14

この文書を、現在フェーズ、現在Task、次に着手するTask、未完了の外部確認の唯一の正本とする。

## 現在状態

- 現在フェーズ: **Phase 7.5（Task 2完了、Task 3着手可能）**
- 現在Task: **Task 3: 独立地図の補助controlsをcompact drawer化**
- 次に着手するTask: **Task 3**
- canonical plan: `docs/plans/phase-07-5/README.md`
- 設計: `docs/specs/2026-08-14-phase-07-5-map-first-ui-and-alns-visualization-design.md`
- planning basis: `docs/reviews/phase-07-5-planning-basis.md`

Task開始時の基準commitは、実装開始直前の対象branch最新remote HEADから取得する。文書中の計画開始SHAを実装開始点として固定しない。

## 直前Phase

Phase 7.4 Task 27はMotorola Android実機確認とGitHub Actions greenまで完了した。Phase 7.4のmotion設定、5個cue、nearby ranking/filter/origin、catalog detail layer、Undo等は完了履歴として保持し、Phase 7.5で作り直さない。

## Phase 7.5で解決すること

### Map-first UI

- route/nearby両方の地図を大きくする。
- `overflow: hidden`は維持し、viewport面積とstage初期scaleを改善する。
- route detailとnearby filter controlsを通常時にcompact化する。
- map関連buttonのpressed/selected/disabled/busy/focusを整理する。

### 周辺お品書き

- cardは地図へ重ねず周囲へ配置する。
- 5/10件は全件同時表示。
- 15件は1〜10 / 11〜15。
- 20件は1〜10 / 11〜20。
- card画像は自然aspect ratioを維持する。

### ALNS live preview

現行workerにはprogress messageがあるが、progressが正式bestOrderへ直接反映される。またfresh startではALNS/distance matrix workerのproduction wiringがない。

Phase 7.5では既存worker群を接続し、progressをephemeral preview、completeを正式commitへ分離する。探索中は青〜紫の巡回順previewを250ms以上の間隔で更新し、complete後は既存赤current exact routeへ戻る。

## Task一覧

| Task | 内容 | 状態 | 依存 |
|---|---|---|---|
| 1 | 共通map-first stage geometryを確立 | **完了（ee6bf27）** | Phase 7.4 |
| 2 | 経路画面をmap-first surfaceへ再構成 | **完了（c70cf32）** | Task 1 |
| 3 | 独立地図の補助controlsをcompact drawer化 | 未着手 | Task 1 |
| 4 | 周辺cardをperimeter配置し10件単位paginationを追加 | 未着手 | Task 3 |
| 5 | map関連UIのinteraction polish | 未着手 | Task 2〜4 |
| 6 | fresh start ALNSとpreview-only progress contractをproduction接続 | 未着手 | Task 1 |
| 7 | ALNS best orderを地図上でlive preview | 未着手 | Task 6、Task 2 |
| 8 | 統合回帰・実機/人間受入 | 未着手 | Task 1〜7 |

## 既存の外部確認残件

- 実GASで同一space再送が既存行更新になる明示証拠。
- GAS更新時に対象外の既存Sheet列が保持される明示証拠。

これらはPhase 7.5のmap/UI/ALNS要件と独立しており、資格情報がないことを理由にTask 1〜7を止めない。

## 進行規則

- 一度に一Taskだけ実装・review・commitする。
- 各Taskは意味のあるfocused REDから開始する。
- Task 1〜5でroute/ranking/business stateを変更しない。
- Task 4でcardをmap viewport内へ戻さない。
- Task 6でALNS評価関数/operatorを変更しない。
- Task 6〜7でprogressをLocalStorageへ永続化しない。
- Task 7でprogressごとにDijkstraやSVG全再生成を行わない。
- Task 8はheadless testだけで終了しない。
- visual snapshotは人間visual確認前に一括更新しない。

## Task 1完了記録

- route/nearby共通の`calculateMapStageLayout()`を追加し、aspect ratio維持、contain、短辺占有率0.8のbounded-cover、中心配置を統一。
- nearbyの既存adapterとrouteのstage計算を共通helperへ寄せ、routeのviewport高さ決定と`overflow: hidden`は変更していない。
- focused verification: map stage / nearby workspace / route contract tests 5 files / 15 tests passed、`npm run check:webapp` passed、`git diff --check` passed。

## Task 2完了記録

- route画面を`summary -> map -> action bar -> detail`のmap-first構成へ変更し、購入済/保留を詳細外へ移動。
- 詳細は`aria-expanded`付きのcollapsed panelとし、候補選択時だけ自動展開。開閉処理はmap transformを変更しない。
- navigation mapの高さ上限を除去し、CSSの実測`clientWidth/clientHeight`を共通`calculateMapStageLayout()`へ渡す構成へ変更。
- focused verification: route map first Vitest 2 tests、関連route Vitest 14 tests、390/644/1024px Playwright geometry test passed、`npm run check:webapp` passed、`npm run build:webapp` passed、`git diff --check` passed。
- 既存visual snapshotは人間確認前のため更新していない。旧baselineとの差分はTask 8の人間visual確認後に扱う。
