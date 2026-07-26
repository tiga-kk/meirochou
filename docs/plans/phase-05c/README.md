# Phase 5C Navigation and Route Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** C108の各地図で、排他的なサークル状態、任意始点、到着確認、距離行列、時間減衰価値を最大化するALNS、進捗・取消、地図切替、再読込復帰を一貫したモバイルUIとして提供する。

**Architecture:** 永続サークル状態と一時的なナビゲーション状態を分離する。距離行列と最適化はmain thread外で実行し、現在案内中の1区間を固定したまま残り順路だけを改善する。Task 5は重み付きグリッド距離を保存し、Task 6がarea別timing profileで秒へ変換する。各地図は独立した問題として扱い、地図へ戻ったときは距離行列と以前の解を再利用するが、始点を設定し直す。

**Tech Stack:** TypeScript strict、Lit、LocalStorage repository、Web Worker、weighted 4-neighbor Dijkstra、time-decayed objective、ALNS、Vitest、Playwright。

**Optimization amendment:** `../../specs/2026-07-27-phase-05c-time-decayed-alns-amendment.md`は、旧設計書のTOPTW、時間予算、Python参照実装に関する条項を上書きする。

## Global Constraints

- Phase 5B handoffが完了していること。
- C108の4地図は独立して最適化する。
- 地図間移動コストと全地図一括最適化を実装しない。
- サークル状態は`pending`、`held`、`purchased`、`excluded`のいずれか1つとする。
- `pending`はdefaultとし、必要なら非default overrideだけを保存する。
- 到着確認前に現在位置を目的地へ移動しない。
- 案内中の現在の目的地は、最適化結果の更新だけでは変更しない。
- 購入済みへの変更と購入取消だけを既存GAS outboxへ反映する。
- held、excluded、到着、目的地変更をGASへ送らない。
- local stateとoutboxを保存してからPOSTする既存local-first原則を維持する。
- 永続的なglobal Undo/Redoを廃止する。
- 操作直後の取消は1回限りの短時間UI操作とし、現在位置を巻き戻さない。
- 距離行列は重み付きグリッド距離のままLocalStorageへrepository経由で保存する。
- 距離から時間への変換、service time、減衰scoreはoptimizer profileで扱い、distance matrix cache identityへ混ぜない。
- 距離行列保存失敗時はmemoryで案内を継続し、次回再計算になることを表示する。
- 重い計算はpage loadで自動開始せず、ユーザーの始点確定または巡回開始で開始する。
- Workerは進捗、推定残り時間、取消、世代IDによるstale message拒否を実装する。
- ALNSのsearch timeは5、10、15秒、defaultは10秒とする。
- 地図内の総滞在時間とサークル個別締切は要求しない。
- ALNSは原則として全pendingサークルを順路へ含め、現在の1区間を固定し、途中結果を利用できる。
- Python runtime、元地図、外部情報providerをWebリポジトリへ追加しない。
- 各Taskを独立したcommit候補とし、commitはユーザーの明示承認後だけ行う。

---

## Entry Gate

- Phase 5B Task 6が完了している。
- `docs/reviews/phase-05b-handoff.md`が存在する。
- C108 4 areaのasset、endpoint、到達可能性、benchmarkが確認済みである。
- `2026-07-27-phase-05c-time-decayed-alns-amendment.md`のobjective、timing profile、search timeが承認済みである。
- Phase 5C branch作成がユーザーに承認されている。

## Task Table

| Task | 正本 | 成果物 |
|---|---|---|
| 1 | `task-01-storage-schema-and-circle-state.md` | schema migration、排他的circle state、短時間取消 |
| 2 | `task-02-navigation-state-machine.md` | navigation state、到着、目的地固定、状態遷移 |
| 3 | `task-03-circle-list-and-detail-ui.md` | 未購入/全サークル、共通詳細、状態操作 |
| 4 | `task-04-arbitrary-start-and-map-session.md` | 任意始点、snap、地図別session、地図再訪 |
| 5 | `task-05-distance-matrix-worker.md` | 重み付き距離行列、Worker、progress、cancel、LocalStorage cache |
| 6 | `task-06-toptw-adapter-and-worker.md` | 距離→時間変換、時間減衰score、TypeScript ALNS、warm start |
| 7 | `task-07-navigation-orchestration.md` | 即時次目的地、購入/保留/手動変更、現在区間固定 |
| 8 | `task-08-recovery-and-deletion.md` | 再読込復帰、始点再設定、巡回初期化、日程削除 |
| 9 | `task-09-mobile-e2e-and-accessibility.md` | mobile E2E、dialog、進捗、accessibility |
| 10 | `task-10-phase-verification-and-handoff.md` | clean verification、文書、Phase 5C完了判定 |

## Required Order

Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10

Task 5と6のpure kernel開発を並行してよいのは、Task 1-4が統合済みで、両Taskが同じfileを変更しないことをreviewerが確認した場合だけとする。通常は表の順序で進める。

## Exit Gate

- legacy storageが新schemaへ安全に移行する。
- circleが複数状態を同時に持たない。
- 到着前後の保留が正しい現在位置を使う。
- excludedが通常候補から外れ、全サークルから戻せる。
- 任意始点がwalkable cellへsnapされる。
- 地図切替後は始点を再設定し、matrixと以前の解を再利用する。
- distance matrixをWorkerで生成し、LocalStorageへcacheする。
- ALNSがarea別distance-to-time変換、30/60/120分の時間減衰、service time、5/10/15秒設定、cancel、warm start、現在区間固定に対応する。
- optimization profile versionがmatrixとbest-order cacheの責務を分離する。
- 購入・到着後保留では、移動中に準備された次目的地を完了待ちなしで使う。
- pendingが0でheldがある場合、確認後に全heldをpendingへ戻す。
- reloadで案内再開または始点再設定を選べる。
- 巡回状態初期化はmatrixを保持し、日程削除はmatrixを削除する。
- mobile E2E、accessibility、clean install verification、public auditが成功する。
