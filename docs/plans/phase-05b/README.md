# Phase 5B C108 Map Bundle Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** C108の4地図を、day1とday2で共通利用する公開可能なmap bundleとしてWebappへ統合し、実データの整合性、production build、ブラウザ表示、経路計算性能を検証する。

**Architecture:** Git管理外の`/maps/C108/`を人手入力領域とし、そこに置かれた完成済みSVG・points・grid成果物だけを公開bundleへコピーする。manifest parser、asset validator、build audit、実ブラウザsmokeを追加し、production registryにはC108だけを登録する。Phase 5Bでは状態モデル、距離行列保存、Web Worker、TOPTW、案内UIを変更しない。

**Tech Stack:** TypeScript strict、Vite、Vitest、Playwright、既存map manifest loader、既存route planner、Node.js build/audit scripts。

## Global Constraints

- 公開イベントIDは`C108`。
- 日程IDは`day1`と`day2`。
- 4地図はday1とday2で共通利用する。
- 正式な`areaId`、表示名、公開ファイル名は`/maps/C108/`の実ファイルを確認して確定する。
- production registryにはC108だけを登録する。
- `demo-v1`は開発・自動テストfixtureとして残し、production registryから外す。
- `/maps/`、元地図、OCR入力、Pythonコード、中間画像、ローカル絶対パスをGit、build、test artifactへ含めない。
- 公開bundleへ入れるのは公開可能な完成済み`map.svg`、`points.json`、`grid-meta.json`、`grid.bin`だけとする。
- blocked cellは`0`、crowded cellは`2`、crowded multiplierは既存実装の`1.5`を維持する。
- Phase 5Bではschema migration、距離行列repository、Web Worker、TOPTW、巡回状態UIを実装しない。
- 各Taskを独立したcommit候補とし、commitはユーザーの明示承認後だけ行う。
- Phase branch、push、Draft PR、mergeはそれぞれユーザーの明示承認を得る。
- 通常の自動テストは実地図をfixtureへ複製せず、fictional dataを使う。
- Task実装前に`AGENTS.md`、`docs/README.md`、`docs/status/progress.md`、この文書、対象Task文書を読む。

---

## Entry Gate

- Phase 5Aが`main`へ統合済みである。
- 作業開始時に現在の`main`、remote、working treeを確認できる。
- ユーザーが`/maps/C108/`へ4地図の完成成果物を配置済みである。
- 各地図にSVG、points、grid metadata、grid binaryが存在する。
- Python地図生成コードと元地図はWebリポジトリ外にある。
- Phase 5B専用branch作成が承認されている。

## Task Table

| Task | 正本 | 成果物 |
|---|---|---|
| 1 | `task-01-documentation-and-input-inventory.md` | 文書構成の整理、C108入力棚卸し、正式なarea一覧 |
| 2 | `task-02-map-bundle-contract.md` | C108 manifest contractとruntime parser |
| 3 | `task-03-public-assets-and-validation.md` | 4地図の公開bundle、構造・安全性・座標検証 |
| 4 | `task-04-event-registry-and-runtime-loading.md` | C108 day1/day2登録、production/demo分離、runtime load |
| 5 | `task-05-browser-smoke-and-benchmark.md` | 実ブラウザsmoke、経路・座標確認、Dijkstra benchmark |
| 6 | `task-06-phase-verification-and-handoff.md` | 全体検証、公開境界audit、Phase 5C handoff |

## Required Order

Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6

後続Taskを先行実装しない。Task 3以降は、Task 1で確定したarea一覧を正本として使う。

## Exit Gate

- C108の4地図がproduction buildから読み込める。
- day1とday2が同じC108 map manifestを参照する。
- production event registryに`demo-v1`が存在しない。
- `demo-v1`を使う既存unit/E2E fixtureが維持される。
- SVG、points、grid-meta、grid.binの構造と座標が検証される。
- path traversal、absolute path、external URL、危険なSVG要素が拒否される。
- 実ブラウザでmarkerとroute overlayが地図座標に一致する。
- 4地図それぞれで到達可能性の検査結果が記録される。
- 実データのDijkstra計測値、推定全行列時間、memory/storage推定がhandoffへ記録される。
- `npm ci`、`npm run verify`、`npm run test:e2e`、public tree audit、`git diff --check`が成功する。
- `/maps/`、元地図、Python、中間画像、private pathがtracked tree、dist、artifactに存在しない。
