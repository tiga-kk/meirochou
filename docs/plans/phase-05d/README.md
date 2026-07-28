# Phase 5D Apps Internal Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** user-visible behaviorを変えずに`apps/webapp/`をfeature別構造へ移し、`App`、`DataManager`、`UIManager`、`Config`、central type filesを削除する。

**Architecture:** featureごとにDomain、Use Case、Infrastructure、UIをまとめる。Use Caseは能力を表すinterfaceへ依存し、LocalStorage、GAS、HTTP、Web Workerのconcrete implementationは`app/assemble-comipath-application.ts`だけが接続する。

**Tech Stack:** TypeScript strict、Lit、Vite、LocalStorage、GAS Web App、Web Worker、Vitest、Playwright、Biome、Node.js architecture checker。

**Design:** `../../specs/2026-07-28-phase-05d-architecture-refactor-design.md`
**Architecture rules:** `../../architecture/webapp-module-boundaries.md`
**Naming rules:** `../../architecture/webapp-naming-guidelines.md`

## Global constraints

- Phase 5Cの外部挙動、LocalStorage schema、GAS contract、CSV contract、route guidance state、snapshot、distance matrix、ALNS objectiveを変更しない。
- package dependencyを追加しない。
- 新規production moduleはTypeScript strictで実装する。
- `any`を追加しない。
- 外部入力は`unknown`として受け、runtime parserで検証する。
- active event/dayとroute guidance runtimeのmutable正本を複数作らない。
- cross-feature importは`public-api.ts`だけを使う。
- DomainとUse CaseからDOM、LocalStorage、GAS、HTTP、Workerを直接利用しない。
- vague nameを追加しない。
- UIの広範な見た目変更を行わない。
- 各Task終了時にbuild可能かつ既存主要機能を利用可能にする。
- visual snapshot更新は、不可避なDOM変更でも見た目が同一とレビューで確認できた場合だけ許可する。
- Task 4-7は同じlegacy filesを段階変更するため並行実装しない。

## Entry gate

- Phase 5C Task 11とExit Gateが完了している。
- baselineとして455/455 tests、typecheck、buildが成功している。
- Git working treeがcleanである。
- design、module boundary、naming文書が承認済みである。
- Phase 5D implementation branch作成がユーザーに承認されている。
- implementation subagent起動前にTask 1のpreflightを実行する。

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

source pathsは`main` commit `be3d604d2da0d333dc2dab850f8bb1202ef47e49`で確認した。

| Task | Existing source paths |
|---|---|
| 3 | `data/event-day-key.ts`、`state/event-day-repository.ts`、`data-manager.ts` |
| 4 | `state/purchase-mutation-service.ts`、`state/circle-state-undo-service.ts`、`state/gas-outbox-service.ts`、`state/gas-sync-coordinator.ts`、`ui/management-view-model.ts`、`ui/management-events.ts` |
| 5 | `navigation/*`、`routing/*`、`route-planner.ts`、`tsp-solver.js`、`config.ts`、`ui/navigation-view-model.ts` |
| 6 | `data/csv-circle-codec.ts`、`data/source-diff.ts`、`data/gas-refresh-service.ts`、`api/gas-api-client.ts`、`ui/management-session.ts`、`ui/management-view-model.ts`、`ui/management-events.ts`、`ui/csv-download.ts` |
| 7 | `state/event-day-transition-service.ts`、`state/storage-deletion-service.ts`、`data/event-registry.ts`、`map-manifest-loader.ts`、`config.ts`、`ui/management-view-model.ts`、`ui/management-events.ts` |
| 8 | `ui-manager.js`、`map-renderer.js`、`stats-renderer.js`、`modal-manager.js`、`ui/navigation-view-model.ts` |

Task開始時にはTask文書のexact preflightを再実行し、source/target不整合があればsubagentを起動しない。

## Task table

| Task | Canonical document | Deliverable |
|---|---|---|
| 1 | `task-01-lock-current-behavior-and-architecture-rules.md` | behavior characterization、architecture/naming checker |
| 2 | `task-02-separate-browser-startup-and-dependency-assembly.md` | browser entrypoint、application assembly、legacy application wrapper |
| 3 | `task-03-centralize-active-event-day-state.md` | `ActiveEventDaySession`、reader、repository contract |
| 4 | `task-04-extract-circle-status-and-gas-update-queue.md` | circle status Use Cases、pending GAS update queue/sender |
| 5 | `task-05-extract-route-guidance.md` | route guidance Controller、Use Cases、map assets、optimizer、snapshot |
| 6 | `task-06-extract-circle-data-source-workflows.md` | CSV/Google Sheets preview・apply・export |
| 7 | `task-07-extract-event-day-switching-and-local-data-deletion.md` | event/day switching、local data deletion、`Config`削除 |
| 8 | `task-08-split-feature-specific-dom-views.md` | feature-specific DOM Views、大きなUI utility分割 |
| 9 | `task-09-remove-legacy-app-data-ui-and-central-types.md` | legacy application/data/UI/config/type files削除 |
| 10 | `task-10-verify-apps-refactor-and-write-handoff.md` | clean verification、C108 smoke、apps architecture handoff |

## Required order

Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10

Task 5はroute guidance screen modelを新規作成する。Task 8はold `ui/navigation-view-model.ts`を同pathへmoveせず、残存責務を複数の明確なfileへ分割し、screen formattingだけをTask 5のfileへ統合する。

## Migration rule

各Taskは次の順序を守る。

1. exact source/target preflight
2. public behaviorの失敗test
3. namingとpublic interfaceの確認
4. new Use Caseとfake dependency
5. legacy codeからnew Use Caseへのdelegation
6. production event binding切替
7. old callerを0にする
8. old implementation削除
9. architecture allowlist縮小
10. focused test、full test、typecheck、build
11. diff、import graph、naming self-review
12. Task単位commit候補提示

## Phase boundary

Phase 5Dは`apps/webapp/`内部のproduction architectureを完成させる。`tests/`のfeature別再配置、fixture命名、test script整理、および`docs/`の正本・archive構造整理はPhase 5Eで行う。広範なvisual polishはPhase 5Fで行う。

## Exit gate

- `apps/webapp/js/app.js`が存在しない。
- `apps/webapp/js/data-manager.ts`が存在しない。
- `apps/webapp/js/ui-manager.js`が存在しない。
- `apps/webapp/js/config.ts`が存在しない。
- `apps/webapp/js/types/domain.ts`が存在しない。
- `apps/webapp/js/types/boundary-parsers.ts`が存在しない。
- `apps/webapp/js/app/comipath-application.ts`が200 physical lines以下である。
- architecture legacy allowlistが存在しない。
- vague new namesがarchitecture checkerで拒否される。
- active event/dayのmutable正本が`ActiveEventDaySession`に一つだけ存在する。
- route guidance runtimeのmutable正本が`RouteGuidanceSession`に一つだけ存在する。
- production applicationがrouting algorithm、CSV parser、storage key、GAS protocolをimportしない。
- feature Use Caseがconcrete LocalStorage、GAS、HTTP、Workerをimportしない。
- componentがrepository、client、loader、optimizerをimportしない。
- feature間deep importがない。
- LocalStorage migration、GAS local-first、CSV preview、event/day switching、circle status、route guidance、resume、delete contractが維持される。
- desktop/mobile E2Eが成功する。
- `npm run verify`、`npm run test:e2e`、C108 smoke、public audit、architecture checkが成功する。
- `docs/reviews/phase-05d-handoff.md`が作成される。
