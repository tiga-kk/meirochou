# Phase 5D Apps Internal Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` and complete one canonical Task document at a time. Do not start a later Task while an earlier Task is unreviewed or blocked.

**Goal:** user-visible behaviorを変えずに`apps/webapp/`をfeature別構造へ移し、最終的に`App`、`DataManager`、`UIManager`、`Config`、central type/parser filesを削除する。

**Architecture:** featureごとにDomain、Use Case、Infrastructure、UIをまとめる。DomainとUse Caseはconcrete browser technologyへ依存しない。LocalStorage、GAS、HTTP、Web Worker、DOMのconcrete implementationはInfrastructureまたはUIに置き、`app/assemble-comipath-application.ts`だけがそれらを組み立てる。

**Tech Stack:** TypeScript strict、Lit、Vite、LocalStorage、GAS Web App、Web Worker、Vitest、Playwright、Biome、Node.js architecture checker。

**Design:** `../../specs/2026-07-28-phase-05d-architecture-refactor-design.md`
**Architecture rules:** `../../architecture/webapp-module-boundaries.md`
**Naming rules:** `../../architecture/webapp-naming-guidelines.md`

## Current execution state

2026-08-04時点で`feature/phase-05d`にはTask 1〜9相当の実装がある。ただしTask 3.1の専用commit/review証跡がなく、Task 9後も旧facade相当の大きな調整役が残るため、Phase 5Dは完了扱いにしない。

- Task 1: implementation exists; architecture checkerとtest gateに修正が必要
- Task 2: implementation exists; browser lifecycle Promise、start failure contract、disposeに修正が必要
- Task 3: implementation exists; EventDayRepositoryのinterface/concrete分離が必要
- Task 3.1: **REVIEW REQUIRED**
- Task 4〜9: implementation exists; final review blocked by Task 3.1
- Task 10: handoff recorded; **BLOCKED**

Task 1〜3を最初から再実装しない。`task-03-1-correct-foundation-review-findings.md`だけを次に実装し、既存実装を修正する。

## Global constraints

- Phase 5Cの外部挙動、LocalStorage schema、GAS contract、CSV contract、route guidance state、snapshot、distance matrix、ALNS objectiveを変更しない。
- package dependencyを追加しない。
- 新規production moduleはTypeScript strictで実装する。
- `any`を追加しない。
- 外部入力は`unknown`として受け、owner featureのruntime parserで検証する。
- active event/day、pending GAS updates、route guidance runtimeのmutable正本を複数作らない。
- cross-feature importは相手featureの`public-api.ts`だけを使う。
- `public-api.ts`から`LocalStorage*`、`Http*`、`Browser*`、`WebWorker*`、`Gas*Client`などのconcrete implementationをexportしない。
- DomainからDOM、LocalStorage、`fetch`、Web Worker、AbortControllerを利用しない。
- Use CaseからDOM、LocalStorage、GAS client、HTTP loader、Web Worker、AbortController、AbortSignalを利用しない。
- Use Caseが必要とする外部能力は責務名のinterfaceで表す。
- `Manager`、`Handler`、`Helper`、`Utils`、`Common`、対象不明の`Service`を新規名に使わない。
- 各Taskで追加したtestを同じTask内で通常の`npm run test:webapp`へ登録する。
- `npm run check:webapp`はTask 3.1以降、architecture checkerとtypecheckを必ず実行する。
- 各Task終了時にbuild可能かつ既存主要機能を利用可能にする。
- visual snapshot更新は、不可避なDOM変更でも見た目が同一とレビューで確認できた場合だけ許可する。
- Tasks 4〜8は同じlegacy filesを段階変更するため並行実装しない。

## Layer boundary

```text
components / feature UI
          ↓
feature Controller
          ↓
feature Use Case
          ↓
feature Domain

Use Case ── depends on capability interface
                         ↑ implemented by
Infrastructure ──────────┘
```

次の配置を固定する。

- Repository interface: `features/<feature>/use-cases/`
- LocalStorage repository class: `features/<feature>/infrastructure/`
- HTTP/GAS/Web Worker/browser class: `features/<feature>/infrastructure/`
- DOM View: `features/<feature>/ui/`または`shared/ui/`
- concrete class生成: `app/assemble-comipath-application.ts`
- cross-feature contract: `features/<feature>/public-api.ts`
- concrete classのcross-feature公開: 禁止

## Target structure

```text
apps/webapp/js/
├── app/
│   ├── browser-entrypoint.ts
│   ├── run-comipath-in-browser.ts
│   ├── assemble-comipath-application.ts
│   ├── comipath-application.ts
│   └── bind-browser-events.ts
├── features/
│   ├── event-day/
│   │   ├── domain/
│   │   ├── use-cases/
│   │   ├── infrastructure/
│   │   ├── ui/
│   │   └── public-api.ts
│   ├── circle-status/
│   ├── route-guidance/
│   ├── circle-data-source/
│   └── local-data-deletion/
├── shared/
│   ├── domain/
│   ├── browser/
│   └── ui/
└── components/
```

## Audited source paths

source pathsはTask開始時のbranch tipで再監査する。古いmain commitだけを根拠に進めない。

| Work item | Existing or expected paths |
|---|---|
| Task 3.1 | `features/event-day/use-cases/event-day-repository.ts`、`app/run-comipath-in-browser.ts`、`app/comipath-application.ts`、`ui/management-session.ts`、architecture tests/scripts |
| Task 4 | `state/purchase-mutation-service.ts`、`state/circle-state-undo-service.ts`、`state/gas-outbox-service.ts`、`state/gas-sync-coordinator.ts` |
| Task 5 | `navigation/*`、`routing/*`、`route-planner.ts`、`tsp-solver.js`、`config.ts`、`ui/navigation-view-model.ts` |
| Task 6 | `data/csv-circle-codec.ts`、`data/source-diff.ts`、`data/gas-refresh-service.ts`、`api/gas-api-client.ts`、`ui/management-session.ts` |
| Task 7 | `state/event-day-transition-service.ts`、`state/storage-deletion-service.ts`、`data/event-registry.ts`、`map-manifest-loader.ts`、`config.ts` |
| Task 8 | `ui-manager.js`、`map-renderer.js`、`stats-renderer.js`、`modal-manager.js`、`ui/navigation-view-model.ts` |

Task開始時にcanonical Task文書のpreflightを実行する。source/target不整合、uncommitted changes、failed baselineがあればproduction codeを変更しない。

## Task table

| Task | Canonical document | Deliverable | State |
|---|---|---|---|
| 1 | `task-01-lock-current-behavior-and-architecture-rules.md` | behavior characterization、architecture/naming checker | implemented; correction pending |
| 2 | `task-02-separate-browser-startup-and-dependency-assembly.md` | browser entrypoint、application assembly、legacy wrapper | implemented; correction pending |
| 3 | `task-03-centralize-active-event-day-state.md` | active event/day session、reader、repository contract | implemented; correction pending |
| 3.1 | `task-03-1-correct-foundation-review-findings.md` | review blockers修正、通常verifyへの組込み | **NEXT** |
| 4 | `task-04-extract-circle-status-and-gas-update-queue.md` | circle status、existing `gasOutbox`を使うpending GAS updates | blocked by Task 3.1 |
| 5 | `task-05-extract-route-guidance.md` | route guidance session、Use Cases、map assets、optimizer、snapshot | planned |
| 6 | `task-06-extract-circle-data-source-workflows.md` | CSV/Google Sheets preview・apply・export、abstract cancellation | planned |
| 7 | `task-07-extract-event-day-switching-and-local-data-deletion.md` | event/day switching、local data deletion、`Config`削除 | planned |
| 8 | `task-08-split-feature-specific-dom-views.md` | feature-specific DOM Views、大きなUI utility分割 | planned |
| 9 | `task-09-remove-legacy-app-data-ui-and-central-types.md` | legacy application/data/UI/config/type files削除 | planned |
| 10 | `task-10-verify-apps-refactor-and-write-handoff.md` | clean verification、C108 smoke、apps architecture handoff | planned |

## Required order

```text
Task 1 → Task 2 → Task 3 → Task 3.1 → Task 4 → Task 5
       → Task 6 → Task 7 → Task 8 → Task 9 → Task 10
```

現在はTask 3.1の修正・reviewから再開する。Task 3.1のcommitとreviewが完了する前にPhase 5Dの完了判定やPhase 5Eを開始しない。

## Per-task execution rule

各Taskは次の順序を守る。

1. `git status --short --branch`と`git rev-parse HEAD`
2. source/target pathのexact preflight
3. focused baseline test
4. failing test作成
5. RED確認
6. minimum implementation
7. focused testのGREEN確認
8. architecture test/checker更新
9. `test:webapp`への新規test登録
10. `npm run test:webapp`
11. `npm run check:webapp`
12. `npm run build:webapp`
13. Taskが要求するE2E
14. `git diff --check`
15. source/target、deep import、concrete export、曖昧名のself-review
16. Task単位commit
17. 別モデルによるreview

testが失敗した状態、architecture allowlistを広げただけの状態、未解決Promiseがある状態でcommitしない。

## Phase boundary

Phase 5Dは`apps/webapp/`内部のproduction architectureを完成させる。`tests/`のfeature別再配置、fixture命名、test scriptの全面整理、および`docs/`の正本・archive構造整理はPhase 5Eで行う。ただしPhase 5D中に追加したtestを通常verifyから外してはならない。

広範なvisual polishはPhase 5Fで行う。

## Exit gate

- Task 3.1を含む全Taskがreview済みである。
- `apps/webapp/js/app.js`が存在しない。
- `apps/webapp/js/data-manager.ts`が存在しない。
- `apps/webapp/js/ui-manager.js`が存在しない。
- `apps/webapp/js/config.ts`が存在しない。
- `apps/webapp/js/types/domain.ts`が存在しない。
- `apps/webapp/js/types/boundary-parsers.ts`が存在しない。
- architecture legacy allowlistが存在しない。
- `apps/webapp/js/app/comipath-application.ts`が200 physical lines以下である。
- active event/dayのmutable正本が`ActiveEventDaySession`に一つだけ存在する。
- pending GAS updatesは`LocalEventDayState.gasOutbox`だけに永続化される。
- route guidance runtimeのmutable正本が`RouteGuidanceSession`に一つだけ存在する。
- feature Use Caseがconcrete LocalStorage、GAS、HTTP、Worker、Abort APIをimportしない。
- feature `public-api.ts`がconcrete infrastructureをexportしない。
- componentがrepository、client、loader、optimizerをimportしない。
- feature間deep importがない。
- browser start/stopの全Promiseが停止時にもsettleする。
- stop後のrequest、timer、listener、Worker callbackがstate/UIを更新しない。
- LocalStorage migration、GAS local-first、CSV preview、event/day switching、circle status、route guidance、resume、delete contractが維持される。
- `npm run verify`、`npm run test:e2e`、C108 smoke、public audit、architecture checkが成功する。
- `docs/reviews/phase-05d-handoff.md`が作成される。
