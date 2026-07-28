# ComiPath Roadmap

## 現在の順序

```text
Phase 5A: Cloudflare Pages公開                 完了
  ↓
Phase 5B: C108実地図bundle統合・検証           完了
  ↓
Phase 5C: 状態・ナビゲーション・ALNS最適化     完了
  ↓
Phase 5D: Webapp architecture refactor         次
  ↓
Phase 5E: 広範な視覚調整                       将来
```

Phase 5Dは外部挙動を変えない内部リファクタリングである。Phase 5Eのvisual変更をPhase 5Dへ混ぜない。

各PhaseはPhase branch、Task別commit、Phaseにつき原則1本のDraft PRで進める。docs-onlyの計画更新は、ユーザーが明示した場合に限り`main`へ直接commitしてよい。

## Phase 5B

### 目的

C108の4地図を、著作権上公開可能なSVG・points・grid成果物としてWebappへ統合し、`day1`と`day2`から共通利用できる状態にする。

### 状態

完了。正本は`docs/plans/phase-05b/`と`docs/reviews/phase-05b-handoff.md`。

## Phase 5C

### 目的

C108の各地図を独立して巡回できるようにし、任意始点、距離行列、時間減衰価値を最大化するALNS、到着前後の操作、復帰、保留、対象外を一貫した状態モデルで提供する。

### 含む

- schema migration
- 排他的サークル状態
- navigation state
- 到着確認
- 到着前と到着後の保留
- 対象外
- 共通サークル詳細
- 未購入・全サークル一覧
- 任意始点
- 地図ごとの独立session
- weighted distance matrix Worker
- LocalStorage cache
- time-decayed ALNS
- warm start
- progress、ETA、cancel
- navigation snapshotとreload resume
- mobile E2E、accessibility、public boundary検証

### 状態

完了。正本は`docs/plans/phase-05c/`、ALNS追補、`docs/reviews/phase-05c-handoff.md`。

## Phase 5D

### 目的

`App`、`DataManager`、`UIManager`へ集中した責務をfeature別Controller、Use Case、Domain、Port、Infrastructureへ段階移行し、巨大facadeを削除する。

### Architecture

- 機能別モジュラーモノリス
- feature内部でClean Architectureの依存方向を適用
- UI / Components → Feature Controller → Application Use Case → Domain
- LocalStorage / GAS / fetch / WorkerはPortを実装
- concrete dependency wiringは`app/composition-root.ts`へ限定
- import graph checkerで依存規則を継続検証

### 含む

- characterization test
- architecture import checker
- bootstrapとcomposition root分離
- active event/day session
- circle stateとsync抽出
- navigation feature抽出
- source management抽出
- event/day transitionとstorage management抽出
- UI View分割
- `app.js`、`data-manager.ts`、`ui-manager.js`削除
- Appを200 physical lines以下へ縮小
- clean verificationとhandoff

### 含まない

- 外部挙動変更
- LocalStorage/GAS/CSV contract変更
- optimizer、Dijkstra、map asset変更
- dependency追加
- 広範なvisual polish
- PWA、server state、multi-device sync
- 外部情報provider

### 正本

- `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md`
- `docs/architecture/webapp-module-boundaries.md`
- `docs/plans/phase-05d/README.md`

## Phase 5E

### 目的

Phase 5Dで確立したfeature ViewとController境界を利用し、広範なvisual polishとUI再設計を行う。

Phase 5Eの詳細計画はPhase 5D完了後に作成する。

## 共通Gate

- Task文書にない外部挙動を実装しない。
- TaskごとにTDDとfocused verificationを行う。
- commit、push、PR、mergeは各承認境界を守る。
- 実地図、元地図、個人データ、外部本文、credentialをtest artifactへ含めない。
- PhaseのExit Gateが完了するまで次Phaseを開始しない。
