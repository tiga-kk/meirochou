# Phase 5D Webapp Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 外部挙動を変えずに`App`、`DataManager`、`UIManager`へ集中した責務をfeature別Controller、Use Case、Domain、Port、Infrastructureへ段階移行し、3つの巨大facadeを削除または最小化する。

**Architecture:** 機能別モジュラーモノリスを採用し、各feature内部でUI → Controller → Application → Domainの依存方向を守る。LocalStorage、GAS、fetch、Web Workerは内側で定義したPortを実装し、`app/composition-root.ts`だけがconcrete implementationを接続する。各Taskで旧facadeを一時adapterとして利用し、二重正本を作らずに責務を一つずつ移す。

**Tech Stack:** TypeScript strict、Lit、Vite、LocalStorage、GAS Web App、Web Worker、Vitest、Playwright、Biome、Node.js architecture checker。

**Design:** `../../specs/2026-07-28-phase-05d-architecture-refactor-design.md`

**Architecture rules:** `../../architecture/webapp-module-boundaries.md`

## Global Constraints

- Phase 5Cの外部挙動、LocalStorage schema、GAS contract、CSV contract、navigation state、snapshot、distance matrix、ALNS objectiveを変更しない。
- UIの広範な見た目変更を行わない。広範なvisual polishはPhase 5Eへ送る。
- package dependencyを追加しない。
- 新規production moduleはTypeScript strictで実装する。
- `any`を追加しない。
- 外部入力は`unknown`として受け、runtime parserで検証する。
- active event/day stateのmutable正本を複数作らない。
- feature間は各feature rootの`index.ts`だけをcross-feature importに使用する。
- DomainとApplicationからDOM、LocalStorage、GAS、fetch、Workerを直接利用しない。
- Litは既存component用途を維持し、地図描画全体を作り直さない。
- raw CSV、GAS URL、sheet内容、外部投稿本文、元地図、credentialをlog、snapshot、artifactへ出さない。
- 各Taskは独立したcommit候補とし、Task文書の変更可能ファイル外を変更しない。
- 各Task終了時にproduction build可能かつ既存機能を利用可能にする。
- visual snapshot更新は、見た目変更がないことをレビューで確認できる場合だけ許可する。
- Phase完了時に`app.js`、`data-manager.ts`、`ui-manager.js`を削除する。
- Phase完了時に`app/app.ts`を200 physical lines以下にする。

---

## Entry Gate

- Phase 5C Task 11とPhase 5C Exit Gateが完了している。
- `main`で`npm run verify`、`npm run test:e2e`、C108 smokeの成功記録が存在する。
- designとmodule boundary文書が承認済みである。
- Phase 5D implementation branch作成がユーザーに承認されている。
- implementation開始前に最新`main`、remote、working treeを再確認する。

## Target file map

```text
apps/webapp/js/
├── app/
│   ├── app.ts
│   ├── bootstrap.ts
│   ├── composition-root.ts
│   └── app-lifecycle.ts
├── features/
│   ├── event-day/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── ports/
│   │   ├── infrastructure/
│   │   ├── presentation/
│   │   └── index.ts
│   ├── circle-state/
│   ├── navigation/
│   ├── source-management/
│   └── storage-management/
├── shared/
│   ├── domain/
│   ├── infrastructure/
│   └── presentation/
└── components/
```

既存pure algorithm、repository、parserは、対応feature Taskで責務を確認してからmoveする。Task 1で一括moveしない。

## Task Table

| Task | 正本 | 成果物 |
|---|---|---|
| 1 | `task-01-characterization-and-architecture-guardrails.md` | 外部挙動characterization、import graph checker、legacy allowlist |
| 2 | `task-02-composition-root-and-app-shell.md` | bootstrap分離、composition root、lifecycle、legacy App adapter |
| 3 | `task-03-active-event-day-session.md` | active event/dayの単一正本、query、repository port |
| 4 | `task-04-circle-state-and-sync-extraction.md` | purchase/hold/excluded/undo、GAS mutation、sync Controller |
| 5 | `task-05-navigation-feature-extraction.md` | navigation Controller、Use Case、route asset/optimizer/snapshot Port |
| 6 | `task-06-source-management-extraction.md` | CSV/GAS preview/apply/export、outbox管理Controller |
| 7 | `task-07-event-day-and-storage-controllers.md` | event/day transition、storage deletion、settings lifecycle |
| 8 | `task-08-ui-view-split.md` | Navigation/Location/Management/Statistics/Toast/Map View分割 |
| 9 | `task-09-remove-legacy-facades.md` | `App`最小化、`DataManager`/`UIManager`/旧`app.js`削除、allowlist廃止 |
| 10 | `task-10-phase-verification-and-handoff.md` | clean install、全E2E、C108 smoke、architecture audit、handoff |

## Required Order

Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10

Task 4、5、6、7は同じlegacy facadeを段階的に変更するため、並行実装しない。Task 8はController contract確定後に実施する。Task 9は全featureが旧facade経由でなく動作するまで開始しない。

## Migration rule

各Taskは次の順序を守る。

1. 現行の外部挙動を表す失敗testを追加する。
2. 新しいfeature contractとfakeを定義する。
3. 旧facadeの対象責務を新Use Caseへ委譲する。
4. production event bindingを新Controllerへ切り替える。
5. 旧method/propertyのproduction callerを0にする。
6. 対象legacy codeを削除する。
7. architecture allowlistから解消項目を削除する。
8. focused test、full webapp test、buildを実行する。
9. diffとimport graphを自己レビューする。
10. Task単位でcommit候補を提示する。

## Exit Gate

- `apps/webapp/js/app.js`が存在しない。
- `apps/webapp/js/data-manager.ts`が存在しない。
- `apps/webapp/js/ui-manager.js`が存在しない。
- `apps/webapp/js/app/app.ts`が200 physical lines以下である。
- `scripts/webapp-architecture-legacy-allowlist.json`が存在しない。
- active event/dayのmutable正本が`ActiveEventDaySession`に一つだけ存在する。
- Appはfeature controllerのinit/disposeとglobal lifecycleだけを扱う。
- feature application codeがconcrete LocalStorage、GAS、fetch、Workerをimportしない。
- componentがrepository、GAS client、Worker controllerをimportしない。
- feature間deep importがない。
- LocalStorage migration、GAS local-first、outbox、CSV preview、event/day切替、purchase/hold/excluded、navigation、resume、deleteの既存契約が維持される。
- desktop/mobile E2Eで既存主要操作が成功する。
- `npm run verify`、`npm run test:e2e`、C108 smoke、public audit、architecture checkが成功する。
- `docs/reviews/phase-05d-handoff.md`が作成される。
