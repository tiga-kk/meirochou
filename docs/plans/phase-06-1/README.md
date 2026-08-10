# Phase 6.1: 実機確認後の操作性修正

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 6を本番実機で使って判明した削除、通信状態表示、地図viewer、Gallery gesture、距離・方向表示の問題を修正する。

**Architecture:** Phase 5D/6で確立したfeature境界を維持し、既存Use Case / Session / Controller / Viewを拡張する。地図は実画像比率を持つstageをviewport内でtransformし、animationはCSS/SVGへ限定する。

**Tech Stack:** TypeScript/JavaScript, Lit, CSS, SVG, Pointer Events, Vitest, Playwright Chromium.

## Global Constraints

- 基準は実装開始時の最新remote `main`。このdocs branchへproduction codeを実装しない。
- 新しいUI framework、gesture library、animation libraryを追加しない。
- Route Guidanceの正本は既存`RouteGuidanceSession`/`NavigationState`。
- routing costの意味とcrowded multiplierを変更しない。
- map animationのためのJavaScript RAF/timer loopを追加しない。
- map pointermove中に`getBoundingClientRect()`等のlayout readを繰り返さない。
- map overscrollは最大約32pxのrubber-bandとし、release/cancel後に必ず境界へ戻す。
- 横長地図でも操作viewportは最低220px。
- physical scaleが確認できないareaへ推測の`metersPerPixel`を入れない。
- `prefers-reduced-motion: reduce`でroute flow animationを停止する。
- 主要touch targetは44px以上、200% text zoom、safe-area、keyboard accessibilityを維持する。
- visual snapshotは意図を確認して必要なものだけ更新する。

---

## タスク順序

| Task | 内容 | 依存 |
|---|---|---|
| 1 | 削除scopeとpending GAS outboxの意味を修正 | なし |
| 2 | 右下async operation indicatorを追加 | Task 1とは独立 |
| 3 | map viewport/stageとgesture境界・性能を修正 | なし |
| 4 | Gallery swipeを非線形抵抗へ変更 | Task 3のshared gesture utility状態を確認後 |
| 5 | m距離、Start/Goal、軽量route flowを追加 | Task 3の最終map DOM契約 |
| 6 | Phase 6.1全体をE2E/visual/performance観点で再検証 | Task 1〜5 |

Task 1/2は管理系、Task 3〜5は会場操作系である。実装担当は一度に1 Taskだけ扱い、各Taskを独立commitとしてレビュー可能にする。

## 受入条件

詳細は`docs/specs/2026-08-10-phase-06-1-field-ux-followups-design.md`を正本とする。

- pending outboxがあっても明示削除は可能で、破棄件数を確認してから対象queueとデータを一緒に削除する。
- GASの長時間処理に右下のloading/success/error表示がある。
- 地図viewportが実画像比率へ追従し、横長地図で不要な大余白を作らない。
- viewport最低220px、overscroll最大約32px、release後settleを満たす。
- pan/pinchがPhase 6より悪化せず、pointermove hot pathでlayout readをしない。
- Galleryは開始時重く、購入閾値へ近づくほど軽くなる。
- 距離は物理m表示になり、routing costとは分離される。
- Start/Goalを文字で判別でき、current routeにStart→Goal方向の軽量flow animationがある。
- reduced-motionではflowが止まる。
- `npm run verify`、`npm run test:e2e:ci`、`node scripts/audit-public-tree.mjs`、`git diff --check`が成功する。
