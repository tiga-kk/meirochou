# Phase 7.5: Map-first UI polish・周辺カードperimeter配置・ALNS探索可視化

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`（推奨）または`superpowers:executing-plans`を使い、TaskごとにRED → 最小実装 → focused verification → review → commitを行う。

**Goal:** 地図を画面の主役へ戻し、周辺お品書きを常時見せながら地図を大きく保ち、ALNSのbest orderが探索中に変化する様子を軽量に可視化する。

**Architecture:** Phase 7.4のroute/map/session境界を維持する。UIは既存DOM/CSSとpure geometry helperを拡張し、ALNSは既存distance-matrix workerとALNS workerをproductionへ接続する。探索中previewはephemeral UI state、`complete`だけを正式NavigationStateへcommitする。

**Tech Stack:** TypeScript / JavaScript / Lit / CSS / SVG / Web Worker / Vitest / Playwright。

## 正本

1. `docs/status/progress.md`
2. `docs/plans/phase-07-5/README.md`
3. 着手する`docs/plans/phase-07-5/task-XX-*.md`
4. `docs/specs/2026-08-14-phase-07-5-map-first-ui-and-alns-visualization-design.md`
5. `docs/reviews/phase-07-5-planning-basis.md`

## Global Constraints

- Phase 7.4は完了履歴として保持し、Task 23〜27を再実装しない。
- map viewportの`overflow: hidden`は維持し、viewport自体を拡大する。
- 地図とお品書きを主要情報として扱い、補助controlは必要時だけ展開する。
- 主要touch targetは44px以上。
- cardをmap viewport上へ重ねない。
- 5件・10件は全件同時表示、15件・20件は10件単位pagination。
- card画像は自然aspect ratioを維持する。
- ALNS評価関数・探索時間・operatorは変更しない。
- ALNS progressはpreview専用、`complete`だけ正式stateへcommitする。
- progressごとにDijkstra、SVG全再生成、card DOM全再生成を行わない。
- fresh startのALNSには既存DistanceMatrixController/workerを再利用する。
- candidate routeの静的青線、current routeの赤線と白moving cueを壊さない。
- 新規framework/libraryを追加しない。
- visual snapshotを人間確認前に一括更新しない。

## Task順序

| Task | 内容 | 依存 |
|---|---|---|
| 1 | 共通map-first stage geometryを確立 | Phase 7.4完了 |
| 2 | 経路画面をmap-firstへ再構成 | Task 1 |
| 3 | 独立地図の補助controlsをcompact drawer化 | Task 1 |
| 4 | 周辺cardをperimeter配置し10件単位paginationを追加 | Task 3 |
| 5 | map関連UIのinteraction polish | Task 2〜4 |
| 6 | fresh start ALNSとpreview-only progress contractをproduction接続 | Task 1、既存worker群 |
| 7 | ALNS best orderを地図上でlive preview | Task 6、Task 2 |
| 8 | 統合回帰・実機/人間受入でPhaseを閉じる | Task 1〜7 |

一度に一Taskだけ実装する。

## Phase受入条件

### Map-first

- route mapから520px固定上限がなくなり、390px級Androidでも従来より明確に大きい。
- nearby mapの通常headerはcompactで、詳細条件はtoggle時だけ展開する。
- map stageはaspect ratio維持、必要時bounded-cover、crop部分へpan可能。
- `overflow: hidden`を外してUIへはみ出す実装にしない。

### 周辺card

- 5件・10件は1ページですべて見える。
- 15件は1〜10 / 11〜15、20件は1〜10 / 11〜20。
- narrow/mediumではtop/bottom lane、wideでは四辺slotを利用する。
- card同士とmapは重ならない。
- detail/target actionは選択toolbarから実行できる。

### Interaction

- toggle、page、購入/保留、目的地変更、detail等にfocus/pressed/disabled/busyがある。
- async actionの二重送信がない。
- Escape/focus returnがnested UIで正しい。
- map drag/pinchがbutton clickとして誤発火しない。

### ALNS

- fresh startでも既存distance matrix workerを経てALNSが起動する。
- initial bestは即時、progressは250ms以上の間隔で最新改善だけ、completeは即時。
- progress中は正式`bestOrder`/snapshotを変更しない。
- 青〜紫の巡回順previewが探索中に変化する。
- drag/pinch中はpreview DOM更新を保留し、終了後に最新bestへ追いつく。
- complete後はpreviewを消し、既存赤current routeと正式best orderへ移行する。

### 最終検証

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

snapshot変更は実画面を人間が意味的に確認した後だけ行う。
