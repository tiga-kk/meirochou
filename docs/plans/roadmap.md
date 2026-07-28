# ComiPath Roadmap

## Current order

```text
Phase 5A: Cloudflare Pages publication                  COMPLETE
  ↓
Phase 5B: C108 map bundle integration                  COMPLETE
  ↓
Phase 5C: Circle status, route guidance, ALNS          COMPLETE
  ↓
Phase 5D: apps/webapp production architecture refactor NEXT
  ↓
Phase 5E: tests and docs structure refactor             FUTURE
  ↓
Phase 5F: broad visual polish                           FUTURE
```

各PhaseはPhase branch、Task別commit、Phaseにつき原則1本のDraft PRで進める。docs-only計画更新はユーザーが明示した場合に限り`main`へ直接commitしてよい。

## Phase 5B

### Goal

C108の4地図を公開可能なSVG、points、grid成果物としてWebappへ統合し、day1/day2から共通利用できる状態にする。

### Status

完了。正本は`docs/plans/phase-05b/`と`docs/reviews/phase-05b-handoff.md`。

## Phase 5C

### Goal

C108の各地図を独立して巡回できるようにし、任意始点、weighted distance matrix、time-decayed ALNS、circle status、route guidance resumeを一貫した状態モデルで提供する。

### Status

完了。正本は`docs/plans/phase-05c/`、ALNS追補、`docs/reviews/phase-05c-handoff.md`。

## Phase 5D: apps/webapp production architecture refactor

### Goal

`App`、`DataManager`、`UIManager`、`Config`、central type filesへ集中した責務をfeature別Domain、Use Case、Infrastructure、UIへ段階移行し、legacy filesを削除する。

### Canonical features

- Event Day
- Circle Status
- Route Guidance
- Circle Data Source
- Local Data Deletion

### Includes

- current behavior characterization
- architecture and naming checker
- browser startup and dependency assembly separation
- active event/day single source of truth
- circle status and pending GAS updates extraction
- route guidance extraction
- CSV/Google Sheets import/export extraction
- event/day switching and local data deletion extraction
- feature-specific DOM Views
- old large UI model split
- legacy app/data/UI/config/type files deletion
- clean verification and handoff

### Does not include

- `tests/` directory restructuring
- `docs/` structure restructuring
- broad visual changes
- dependency addition
- persistence/network/optimization contract changes

### Canonical documents

- `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md`
- `docs/architecture/webapp-module-boundaries.md`
- `docs/architecture/webapp-naming-guidelines.md`
- `docs/plans/phase-05d/README.md`

## Phase 5E: tests and docs structure refactor

### Goal

Phase 5Dで確定したfeature ownershipに合わせて`tests/`と`docs/`を整理し、test名、fixture、suite script、current/archive文書の探索性を改善する。

### Planned scope

- testsをfeature ownership別に配置
- unit/integration/E2Eの命名とfixture整理
- package test scriptsの可読性改善
- duplicate/obsolete testsの整理
- docs正本、plan、handoff、archiveのnavigation改善
- docs内のold terminologyとstale path audit
- code behaviorを変えない

詳細TaskはPhase 5D handoff後に作成する。

## Phase 5F: broad visual polish

### Goal

Phase 5Dで確立したfeature-specific ViewsとPhase 5Eで整理したtest/docsを利用し、広範なvisual polishとUI再設計を行う。

詳細TaskはPhase 5E完了後に作成する。

## Common gates

- Task文書にない外部挙動を実装しない。
- TaskごとにTDDとfocused verificationを行う。
- commit、push、PR、mergeの承認境界を守る。
- private map source、personal data、external content、credentialをtest artifactへ含めない。
- Phase Exit Gateが完了するまで次Phaseを開始しない。
