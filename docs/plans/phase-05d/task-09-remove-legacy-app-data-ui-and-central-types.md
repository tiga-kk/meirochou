# Phase 5D Task 9: Remove Legacy App, Data, UI, and Central Types

**Status:** IMPLEMENTED
**Depends on:** Task 8
**Commit candidate:** `refactor(app): remove legacy application facades`

## Goal

全production flowをfeature-specific APIsへ切り替え、old `app.js`、`data-manager.ts`、`ui-manager.js`、central `types` files、architecture allowlistを削除する。`ComiPathApplication`をapplication start/stopだけのsmall shellにする。

## Files

### Delete

- `apps/webapp/js/app.js`
- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/ui-manager.js`
- `apps/webapp/js/types/domain.ts`
- `apps/webapp/js/types/boundary-parsers.ts`
- `scripts/webapp-architecture-legacy-allowlist.json`

`apps/webapp/js/config.ts`はTask 7で削除済みであることをpreflightで確認する。

### Create

- `apps/webapp/js/app/bind-browser-events.ts`
- `tests/legacy-app-files-removed.test.mjs`
- `tests/comipath-application-responsibility.test.mjs`

### Modify

- `apps/webapp/js/app/comipath-application.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/run-comipath-in-browser.ts`
- `apps/webapp/js/app/browser-entrypoint.ts`
- `apps/webapp/index.html`
- `package.json`
- all remaining production/test imports of deleted files
- `scripts/check-webapp-architecture.mjs`
- `tests/architecture-boundaries.test.mjs`
- `tests/webapp-contracts.test.mjs`

## Preflight

```bash
test -e apps/webapp/js/app.js
test -e apps/webapp/js/data-manager.ts
test -e apps/webapp/js/ui-manager.js
test -e apps/webapp/js/types/domain.ts
test -e apps/webapp/js/types/boundary-parsers.ts
test ! -e apps/webapp/js/config.ts
test -e apps/webapp/js/app/comipath-application.ts
test -e apps/webapp/js/app/assemble-comipath-application.ts
```

Task 7で`config.ts`が残っている場合はTask 9へ進まない。

## Interfaces

```ts
export interface ApplicationController {
  start(): Promise<void>;
  stop(): void;
}

export interface BackgroundProcess {
  start(): void;
  stop(): void;
}

export interface ComiPathApplicationDependencies {
  readonly eventDaySelector: ApplicationController;
  readonly circleStatus: ApplicationController;
  readonly pendingGasUpdates: ApplicationController;
  readonly routeGuidance: ApplicationController;
  readonly circleDataSource: ApplicationController;
  readonly localDataDeletion: ApplicationController;
  readonly backgroundProcesses: readonly BackgroundProcess[];
}

export function createComiPathApplication(
  dependencies: ComiPathApplicationDependencies,
): StartableApplication;
```

`comipath-application.ts`に許可する処理:

- controller start順序
- initial event/day open
- background process start順序
- fatal startup error propagation
- stop順序

禁止する処理:

- DOM query
- custom event detail validation
- repository call
- routing/optimization
- CSV/GAS logic
- circle status logic
- deletion branch
- user-facing message formatting

## TDD procedure

- [ ] **Step 1: legacy file absenceのRED testを書く**

```js
it("removes all legacy application files", () => {
  expect(existsSync("apps/webapp/js/app.js")).toBe(false);
  expect(existsSync("apps/webapp/js/data-manager.ts")).toBe(false);
  expect(existsSync("apps/webapp/js/ui-manager.js")).toBe(false);
  expect(existsSync("apps/webapp/js/config.ts")).toBe(false);
  expect(existsSync("apps/webapp/js/types/domain.ts")).toBe(false);
  expect(existsSync("apps/webapp/js/types/boundary-parsers.ts")).toBe(false);
});
```

- [ ] **Step 2: application responsibilityのRED testを書く**

```js
it("keeps the application shell below 200 physical lines", () => {
  const lines = readFileSync(
    "apps/webapp/js/app/comipath-application.ts",
    "utf8",
  ).split("\n");

  expect(lines.length).toBeLessThanOrEqual(200);
});
```

architecture checkerでforbidden importsとvague namesも検証する。

- [ ] **Step 3: no allowlistのRED testを書く**

```js
it("passes architecture rules without a legacy allowlist", () => {
  const result = scanWebappArchitecture({ allowlist: null });
  expect(result.violations).toEqual([]);
});
```

- [ ] **Step 4: REDを確認する**

```bash
npx vitest run --root . tests/legacy-app-files-removed.test.mjs \
  tests/comipath-application-responsibility.test.mjs \
  tests/architecture-boundaries.test.mjs
```

- [ ] **Step 5: remaining importsをinventoryする**

```bash
rg 'app\.js|data-manager|ui-manager|types/domain|boundary-parsers|config\.(js|ts)' \
  apps/webapp/js tests scripts
rg '\b(DataManager|UIManager|Config|TspSolver)\b' \
  apps/webapp/js tests
```

docs/archiveの文字列は対象外にしてよい。production/test import、new compatibility class、type aliasが0になるまで削除しない。

- [ ] **Step 6: central domain typesをfeature filesへ分配する**

- event/day types → `features/event-day/domain`
- circle status/pending GAS update types → `features/circle-status/domain`
- route/map types → `features/route-guidance/domain`
- circle data source types → `features/circle-data-source/domain`
- genuinely shared immutable primitives → `shared/domain`

`shared/domain/domain-types.ts`のようなsecond god fileを作らない。

- [ ] **Step 7: boundary parsersをinput ownerへ分配する**

custom event parser、storage parser、GAS parser、map parserを対応featureへ移す。`parseUnknownData`のようなgeneric parserを作らない。

- [ ] **Step 8: browser event bindingを一か所へ整理する**

`bind-browser-events.ts`はController public methodsとDOM/custom eventsを接続する。business branchとmessage formattingを含めない。feature-specific event bindingが既にController内で明確なら、global eventsだけをここへ置く。

- [ ] **Step 9: old compatibility methodsをpublic feature APIsへ置換する**

legacy testsがDataManager/UIManagerを直接newしている場合は、behavior ownerに応じてSession、Use Case、Controller、DOM View testへ書き換える。test-only facadeを再作成しない。

- [ ] **Step 10: legacy filesを削除する**

compile errorを一つずつfeature APIへ置換する。`LegacyDataManager`、`ApplicationManager`、`UiFacade`を作成しない。

- [ ] **Step 11: `ComiPathApplication`をsmall shellへ完成させる**

200 physical lines以下にし、dependency creationはassembly、browser lifecycleはrun file、event bindingはbind fileへ置く。

- [ ] **Step 12: architecture allowlistを削除する**

`package.json`を次へ変更する。

```json
{
  "scripts": {
    "check:webapp": "node scripts/check-webapp-architecture.mjs && npm run typecheck:webapp"
  }
}
```

old `node --check apps/webapp/js/app.js`を削除する。TypeScript syntax/typeは`tsc`、module resolutionはVite buildで検証する。

- [ ] **Step 13: naming checkerをstrict modeにする**

legacy name allowlistを削除し、new production filesに`Manager`、`Handler`、`Helper`、`Utils`、`Common`、cross-feature `index.ts`がないことを確認する。

- [ ] **Step 14: focused verificationを実行する**

```bash
npx vitest run --root . tests/legacy-app-files-removed.test.mjs \
  tests/comipath-application-responsibility.test.mjs \
  tests/architecture-boundaries.test.mjs \
  tests/comipath-application.test.ts \
  tests/browser-application-lifecycle.test.ts \
  tests/application-assembly.test.ts
node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 15: full regressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npm run test:e2e
node scripts/audit-public-tree.mjs
git diff --check
git status --short --branch
```

- [ ] **Step 16: commit**

```bash
git add -A apps/webapp/js apps/webapp/index.html package.json scripts tests
git commit -m "refactor(app): remove legacy application facades"
```

## Acceptance criteria

- six legacy filesが削除されている。
- `config.ts`がTask 7で削除済みである。
- production/testにequivalent compatibility facadeがない。
- central god type/parser fileが再作成されていない。
- architecture allowlistなしでviolationsが0である。
- `comipath-application.ts`が200 physical lines以下である。
- application shellがfeature business logicを持たない。
- full tests、typecheck、build、E2E、public auditが成功する。

## Implementation record

- The legacy filenames and architecture allowlist were removed.
- Runtime, event-day data, DOM coordination, event-day contract types, and
  boundary parsers now live under responsibility-specific names/owners.
- All production and test imports were migrated, while the public DOM element
  names and visual snapshots were preserved.
- Task tests are registered in `test:webapp`.
- Verification: `npm run test:webapp` 487 tests passed, architecture/typecheck,
  build, public audit, and focused management E2E passed.
