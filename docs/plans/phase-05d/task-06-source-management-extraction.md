# Phase 5D Task 6: Source Management Extraction

**Status:** PLANNED
**Depends on:** Task 5
**Commit candidate:** `refactor(source): extract csv and gas workflows`

## Goal

CSV/GAS preview、apply、cancel、sheet list取得、refresh、CSV export、outbox retry/discard、管理画面view modelをSource Management featureへ移す。

## Files

### Create

- `apps/webapp/js/features/source-management/domain/source.ts`
- `apps/webapp/js/features/source-management/application/preview-csv-source.ts`
- `apps/webapp/js/features/source-management/application/preview-gas-source.ts`
- `apps/webapp/js/features/source-management/application/apply-source-preview.ts`
- `apps/webapp/js/features/source-management/application/cancel-source-preview.ts`
- `apps/webapp/js/features/source-management/application/export-circle-csv.ts`
- `apps/webapp/js/features/source-management/application/retry-gas-outbox.ts`
- `apps/webapp/js/features/source-management/application/discard-gas-outbox.ts`
- `apps/webapp/js/features/source-management/ports/source-gateway-port.ts`
- `apps/webapp/js/features/source-management/ports/csv-download-port.ts`
- `apps/webapp/js/features/source-management/infrastructure/gas-source-adapter.ts`
- `apps/webapp/js/features/source-management/presentation/source-management-controller.ts`
- `apps/webapp/js/features/source-management/index.ts`
- `tests/source-management-use-cases.test.ts`
- `tests/source-management-controller.test.ts`

### Move

- `apps/webapp/js/data/csv-circle-codec.ts` → `apps/webapp/js/features/source-management/domain/csv-circle-codec.ts`
- `apps/webapp/js/data/source-diff.ts` → `apps/webapp/js/features/source-management/domain/source-diff.ts`
- `apps/webapp/js/data/gas-refresh-service.ts` → `apps/webapp/js/features/source-management/application/gas-refresh-service.ts`
- `apps/webapp/js/api/gas-api-client.ts` → `apps/webapp/js/features/source-management/infrastructure/gas-api-client.ts`
- `apps/webapp/js/ui/management-session.ts` → `apps/webapp/js/features/source-management/application/source-management-session.ts`
- `apps/webapp/js/ui/management-view-model.ts` → `apps/webapp/js/features/source-management/presentation/source-management-view-model.ts`
- `apps/webapp/js/ui/csv-download.ts` → `apps/webapp/js/features/source-management/infrastructure/browser-csv-download-adapter.ts`

### Modify

- `apps/webapp/js/app.js`
- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/app/composition-root.ts`
- source/outbox/component tests
- `scripts/webapp-architecture-legacy-allowlist.json`

## Interfaces

```ts
export interface SourceManagementController {
  requestCsvPreview(file: File): Promise<void>;
  requestGasSheets(gasUrl: unknown): Promise<void>;
  requestGasPreview(source: unknown): Promise<void>;
  applyPreview(previewId: unknown): Promise<void>;
  cancelPreview(): void;
  exportCsv(ref: unknown): Promise<void>;
  retryOutbox(ref: unknown): Promise<void>;
  discardOutbox(detail: unknown): Promise<void>;
  closeSettings(): void;
  dispose(): void;
}
```

```ts
export interface SourceGatewayPort {
  fetchSheetNames(url: string, signal: AbortSignal): Promise<readonly string[]>;
  fetchCircles(
    source: GasDataSource,
    signal: AbortSignal,
  ): Promise<readonly CircleRecord[]>;
}
```

`GasDataSource`、`CircleRecord`、`EventDayRef`はTask開始時点の`apps/webapp/js/types/domain.ts`を再利用する。outbox retry/discardはCircle State featureが公開する`GasOutboxCommands`を注入し、Source ManagementからGAS mutation adapterを直接importしない。

Controller boundaryは`unknown`をruntime parserへ通す。Use Caseへ未検証custom event detailを渡さない。

## TDD Procedure

- [ ] **Step 1: Use CaseのRED testを書く**

CSV size/extension、stale request token、source generation、preview expiry、apply後のnavigation invalidation requestを検証する。

- [ ] **Step 2: ControllerのRED testを書く**

custom event detailのvalidation、busy state、abort、redacted error、dialog model、focus returnをfake Viewで検証する。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/source-management-use-cases.test.ts \
  tests/source-management-controller.test.ts
```

- [ ] **Step 4: existing source modulesをmoveする**

CSV parser、source diff、GAS refreshの意味を変更しない。raw cellをuser messageへ出さない既存redactionを維持する。

- [ ] **Step 5: Source Management Sessionを実装する**

draft URL、selected sheet、sheet list、active preview、request token、AbortController、busy/error/resultをfeature sessionへ移す。

- [ ] **Step 6: Use CaseとControllerを実装する**

ActiveEventDaySession、Source Gateway Port、EventDay State Port、CSV Download Portを注入する。`document.getElementById`をUse Caseへ入れない。

- [ ] **Step 7: source apply後の他feature通知を公開contract化する**

source identity変更後はNavigation featureの`invalidateForSourceChange(ref)`をpublic application contract経由で呼ぶ。matrix/snapshot concrete repositoryをSource featureから直接importしない。

- [ ] **Step 8: production event bindingを切り替える**

settingsとsource diff dialogのcustom eventをSource Management Controllerへ接続する。

- [ ] **Step 9: DataManager compatibility methodを委譲する**

preview/import/export/refresh/outbox methodのproduction callerを0にし、test callerだけが残る場合はTask 9までのcompatibility methodとしてUse Caseへ委譲する。

- [ ] **Step 10: allowlistを縮小する**

App/DataManagerのCSV/GAS/download/session/view-model依存を削除する。

- [ ] **Step 11: focused testを実行する**

```bash
npx vitest run --root . tests/source-management-use-cases.test.ts \
  tests/source-management-controller.test.ts tests/csv-circle-codec.test.ts \
  tests/source-diff.test.ts tests/gas-api-client.test.ts \
  tests/gas-refresh-service.test.ts tests/source-manager-app.test.ts \
  tests/source-diff-app.test.ts tests/outbox-panel-app.test.ts \
  tests/csv-download-app.test.ts
```

- [ ] **Step 12: regressionを実行する**

```bash
node scripts/check-webapp-architecture.mjs
npm run test:webapp
npm run check:webapp
npm run build:webapp
npx playwright test tests/e2e/navigation-keyboard.spec.ts
git diff --check
```

- [ ] **Step 13: commit**

```bash
git add apps/webapp/js/features/source-management apps/webapp/js/app.js \
  apps/webapp/js/data-manager.ts apps/webapp/js/app/composition-root.ts \
  apps/webapp/js/data apps/webapp/js/api apps/webapp/js/ui \
  tests scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(source): extract csv and gas workflows"
```

## Acceptance Criteria

- AppがCSV/GAS preview、outbox、downloadの処理順序を持たない。
- DataManagerがsource request sessionを保持しない。
- Application codeが`fetch`、DOM、download APIを直接利用しない。
- stale request、abort、redaction、local-first、preview semanticsが維持される。
- source変更時のnavigation invalidationがfeature public contract経由で行われる。
