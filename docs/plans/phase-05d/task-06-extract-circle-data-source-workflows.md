# Phase 5D Task 6: Extract Circle Data Source Workflows

**Status:** PLANNED
**Depends on:** Task 5
**Commit candidate:** `refactor(circle-data-source): extract import and export workflows`

## Goal

CSV/Googleスプレッドシートのsheet一覧取得、preview、apply、cancel、refresh、source diff、CSV exportをCircle Data Source featureへ移す。pending GAS updateの再送・破棄はCircle Status featureに残し、責務を混ぜない。

## Files

### Create

- `apps/webapp/js/features/circle-data-source/domain/circle-data-source-types.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/preview-csv-import.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/load-google-sheet-names.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/preview-google-sheet-import.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/apply-circle-data-preview.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/cancel-circle-data-preview.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/export-circles-to-csv.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/google-sheet-circle-client.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/circle-csv-downloader.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-view.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-panel-model.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-preview-dialog-model.ts`
- `apps/webapp/js/features/circle-data-source/public-api.ts`
- `tests/circle-data-source-use-cases.test.ts`
- `tests/circle-data-source-controller.test.ts`

### Move and rename

- `apps/webapp/js/data/csv-circle-codec.ts`
  → `apps/webapp/js/features/circle-data-source/domain/csv-circle-codec.ts`
- `apps/webapp/js/data/source-diff.ts`
  → `apps/webapp/js/features/circle-data-source/domain/circle-source-diff.ts`
- `apps/webapp/js/api/gas-api-client.ts`
  → `apps/webapp/js/features/circle-data-source/infrastructure/gas-google-sheet-circle-client.ts`
- `apps/webapp/js/ui/management-session.ts`
  → `apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session.ts`
- `apps/webapp/js/ui/csv-download.ts`
  → `apps/webapp/js/features/circle-data-source/infrastructure/browser-circle-csv-downloader.ts`

### Refactor and delete old implementation

- `apps/webapp/js/data/gas-refresh-service.ts`
  - preview initial/replacement/refresh logicをGoogle Sheet Use Casesへ分割
  - old generic service fileを削除
- `apps/webapp/js/ui/management-view-model.ts`
  - source summaryとsource diff model/functionsをnew UI model filesへ移す
  - event-day/delete responsibilitiesだけを一時残す
- `apps/webapp/js/ui/management-events.ts`
  - CSV/GAS/source preview/export event detailをfeature UIへ移す
  - event-day/delete eventsだけを一時残す

### Modify

- `apps/webapp/js/app.js`
- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/components/source-manager.ts`
- `apps/webapp/js/components/source-diff-dialog.ts`
- `apps/webapp/js/components/comipath-settings.ts`
- `tests/csv-circle-codec.test.ts`
- `tests/source-diff.test.ts`
- `tests/gas-api-client.test.ts`
- `tests/gas-refresh-service.test.ts`
- `tests/source-manager.test.ts`
- `tests/source-manager-app.test.ts`
- `tests/source-diff-dialog.test.ts`
- `tests/source-diff-app.test.ts`
- `tests/csv-download.test.ts`
- `tests/csv-download-app.test.ts`
- `scripts/webapp-architecture-legacy-allowlist.json`

## Preflight

```bash
test -e apps/webapp/js/data/csv-circle-codec.ts
test -e apps/webapp/js/data/source-diff.ts
test -e apps/webapp/js/data/gas-refresh-service.ts
test -e apps/webapp/js/api/gas-api-client.ts
test -e apps/webapp/js/ui/management-session.ts
test -e apps/webapp/js/ui/management-view-model.ts
test -e apps/webapp/js/ui/management-events.ts
test -e apps/webapp/js/ui/csv-download.ts
test ! -e apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts
```

## Interfaces

```ts
export interface CircleDataSourceSession {
  getSnapshot(): CircleDataSourceSessionSnapshot;
  startRequest(): number;
  isCurrentRequest(requestId: number): boolean;
  setAbortController(controller: AbortController | null): void;
  setPreview(preview: CircleDataPreview | null): void;
  resetDraft(): void;
  subscribe(
    listener: (snapshot: CircleDataSourceSessionSnapshot) => void,
  ): () => void;
}
```

```ts
export interface GoogleSheetCircleClient {
  loadSheetNames(
    webAppUrl: string,
    signal: AbortSignal,
  ): Promise<readonly string[]>;

  loadCircles(
    source: GoogleSheetCircleSource,
    signal: AbortSignal,
  ): Promise<readonly CircleRecord[]>;
}
```

```ts
export interface CircleCsvDownloader {
  downloadCsv(input: {
    readonly csvText: string;
    readonly fileName: string;
  }): void;
}
```

```ts
export interface CircleDataSourceController {
  previewCsvFile(file: unknown): Promise<void>;
  loadGoogleSheetNames(webAppUrl: unknown): Promise<void>;
  previewGoogleSheet(source: unknown): Promise<void>;
  applyPreview(previewId: unknown): Promise<void>;
  cancelPreview(): void;
  exportActiveEventDayAsCsv(eventDay: unknown): Promise<void>;
  closeSettingsPanel(): void;
  stop(): void;
}
```

source apply後はRoute Guidance featureのpublic contractを呼ぶ。

```ts
export interface RouteGuidanceSourceInvalidation {
  invalidateAfterCircleSourceChange(eventDay: EventDayRef): void;
}
```

## TDD procedure

- [ ] **Step 1: CSV importのRED testを書く**

extension、5MB limit、runtime validation issue、preview expiry、source generation stale check、apply前非永続化を検証する。

- [ ] **Step 2: Google Sheet importのRED testを書く**

URL parse、sheet list、AbortController、request ID stale rejection、initial/replacement/refresh mode判定を検証する。

- [ ] **Step 3: apply/cancel/exportのRED testを書く**

apply後にactive session更新とroute guidance invalidationが一回行われ、cancelではpersistしないことを検証する。CSV export file名とdownload callも固定する。

- [ ] **Step 4: ControllerのRED testを書く**

unknown custom event detail、busy state、safe error model、dialog open/close、focus return、stop時abortをfake Viewで検証する。

- [ ] **Step 5: REDを確認する**

```bash
npx vitest run --root . tests/circle-data-source-use-cases.test.ts \
  tests/circle-data-source-controller.test.ts
```

- [ ] **Step 6: pure CSV/diff codeをmoveする**

CSV parserとsource diff algorithmの意味を変更しない。`source-diff.ts`を対象が分かる`circle-source-diff.ts`へrenameする。

- [ ] **Step 7: sessionを明確なruntime state ownerへする**

draft URL、selected sheet、sheet names、preview、request ID、AbortController、busy/error/resultを`CircleDataSourceSession`だけが保持する。

- [ ] **Step 8: GAS clientとbrowser downloaderをconcrete implementationへする**

Use Caseは`fetch`、`document`、Blob、URL objectを直接使わない。

- [ ] **Step 9: generic refresh serviceをUse Caseへ分解する**

initial/replacement/refreshをone broad service methodに隠さず、preview Use Case内の明示的branchとtyped resultにする。

- [ ] **Step 10: Controllerをproduction eventsへ接続する**

CSV preview、sheet names、Google Sheet preview、apply、cancel、CSV exportをnew Controllerへbindする。

- [ ] **Step 11: pending GAS update eventsを受け取らないことを確認する**

retry/discardはTask 4の`PendingGasUpdatesController`が継続して所有する。Circle Data Source Controllerへ戻さない。

- [ ] **Step 12: source apply後のcross-feature notificationを接続する**

`RouteGuidanceSourceInvalidation`だけをimportし、snapshot/distance matrix concrete repositoryを直接importしない。

- [ ] **Step 13: DataManager compatibility methodsをdelegationへ変更する**

preview/import/export methodのproduction callerを0にする。test compatibility methodが必要な間はnew Use Caseへ委譲し、session stateをDataManagerに複製しない。

- [ ] **Step 14: generic management filesを縮小する**

source-related types/functions/eventsを削除し、event-day/deleteだけを残す。

- [ ] **Step 15: allowlistを縮小する**

App/DataManagerのCSV、GAS import、download、source session依存を削除する。

- [ ] **Step 16: focused verificationを実行する**

```bash
npx vitest run --root . tests/circle-data-source-use-cases.test.ts \
  tests/circle-data-source-controller.test.ts \
  tests/csv-circle-codec.test.ts tests/source-diff.test.ts \
  tests/gas-api-client.test.ts tests/gas-refresh-service.test.ts \
  tests/source-manager.test.ts tests/source-manager-app.test.ts \
  tests/source-diff-dialog.test.ts tests/source-diff-app.test.ts \
  tests/csv-download.test.ts tests/csv-download-app.test.ts
node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 17: regressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npx playwright test tests/e2e/navigation-keyboard.spec.ts
git diff --check
```

- [ ] **Step 18: commit**

```bash
git add -A apps/webapp/js/features/circle-data-source \
  apps/webapp/js/data/csv-circle-codec.ts \
  apps/webapp/js/data/source-diff.ts \
  apps/webapp/js/data/gas-refresh-service.ts \
  apps/webapp/js/api/gas-api-client.ts \
  apps/webapp/js/ui/management-session.ts \
  apps/webapp/js/ui/management-view-model.ts \
  apps/webapp/js/ui/management-events.ts \
  apps/webapp/js/ui/csv-download.ts \
  apps/webapp/js/app.js apps/webapp/js/data-manager.ts \
  apps/webapp/js/app apps/webapp/js/components tests \
  scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(circle-data-source): extract import and export workflows"
```

## Acceptance criteria

- AppがCSV/Google Sheet preview/apply/exportの処理順序を持たない。
- DataManagerがsource request runtime stateを保持しない。
- Use CaseがHTTP、DOM、download APIを直接使わない。
- pending GAS update retry/discardがCircle Status featureに残る。
- stale request、abort、redaction、preview expiry、source generation behaviorが維持される。
- source変更後のroute guidance invalidationがpublic contract経由である。
