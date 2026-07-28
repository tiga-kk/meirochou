# Phase 5D Task 9: Remove Legacy Facades

**Status:** PLANNED
**Depends on:** Task 8
**Commit candidate:** `refactor(app): remove legacy webapp facades`

## Goal

全production flowをfeature ControllerとUse Caseへ切り替え、旧`app.js`、`data-manager.ts`、`ui-manager.js`とarchitecture legacy allowlistを削除する。`App`をglobal lifecycleだけの小さなshellにする。

## Files

### Delete

- `apps/webapp/js/app.js`
- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/ui-manager.js`
- `scripts/webapp-architecture-legacy-allowlist.json`

### Create

- `apps/webapp/js/app/app-events.ts`
- `tests/legacy-facades-removed.test.mjs`

### Modify

- `apps/webapp/js/app/app.ts`
- `apps/webapp/js/app/app-lifecycle.ts`
- `apps/webapp/js/app/composition-root.ts`
- `apps/webapp/js/app/bootstrap.ts`
- `apps/webapp/index.html`
- `package.json`
- all remaining production/test imports of deleted files
- `scripts/check-webapp-architecture.mjs`
- `tests/architecture-boundaries.test.mjs`
- `tests/webapp-contracts.test.mjs`

## Interfaces

```ts
export interface AppControllers {
  readonly eventDay: EventDayController;
  readonly circleState: CircleStateController;
  readonly navigation: NavigationController;
  readonly sourceManagement: SourceManagementController;
  readonly storageManagement: StorageManagementController;
}

export interface AppRuntimeServices {
  start(): void;
  dispose(): void;
}

export function createApp(input: {
  readonly controllers: AppControllers;
  readonly runtimeServices: readonly AppRuntimeServices[];
}): AppController;
```

`app.ts`に許可する処理は次だけである。

- controller init順序
- global event bridge
- initial event/day open
- controller dispose順序
- fatal bootstrap error boundary

feature-specific validation、message、state mutation、repository call、routing、CSV/GAS処理は禁止する。

## TDD Procedure

- [ ] **Step 1: legacy removalのRED testを書く**

```js
it("does not contain or import legacy facades", async () => {
  expect(existsSync("apps/webapp/js/app.js")).toBe(false);
  expect(existsSync("apps/webapp/js/data-manager.ts")).toBe(false);
  expect(existsSync("apps/webapp/js/ui-manager.js")).toBe(false);

  const scan = scanWebappArchitecture({ allowlist: null });
  expect(scan.violations).toEqual([]);
});
```

- [ ] **Step 2: App size/responsibilityのRED testを書く**

```js
it("keeps the app shell below 200 physical lines", () => {
  const lines = readFileSync("apps/webapp/js/app/app.ts", "utf8").split("\n");
  expect(lines.length).toBeLessThanOrEqual(200);
});
```

追加で`app.ts`がrouting、CSV parser、GAS client、repository implementation、DOM queryをimportしないことをarchitecture ruleで検証する。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/legacy-facades-removed.test.mjs \
  tests/architecture-boundaries.test.mjs
```

- [ ] **Step 4: production callerを確認する**

```bash
rg 'app\.js|data-manager|ui-manager' apps/webapp tests scripts
```

削除対象のproduction importが0になるまで削除しない。archive文書とTask文書の文字列は検索対象外にしてよい。

- [ ] **Step 5: compatibility methodをfeature APIへ置換する**

legacy testがDataManager/UIManagerを直接newしている場合、behaviorの正本に応じてActiveEventDaySession、Use Case、Controller、Viewのtestへ書き換える。削除済みfacadeをtest-onlyで再作成しない。

- [ ] **Step 6:旧facadeを削除する**

3ファイル削除後にcompile errorを一つずつ解消する。新しい`LegacyDataManager`、`AppFacade`、`UIFacade`を作成しない。

- [ ] **Step 7: Appを最小化する**

`app.ts`を200 physical lines以下にし、composition detailは`composition-root.ts`、event bindingは`app-events.ts`、global lifecycleは`app-lifecycle.ts`へ置く。

- [ ] **Step 8: allowlistを削除しarchitecture checkを必須化する**

`package.json`を次の形にする。

```json
{
  "scripts": {
    "check:webapp": "node scripts/check-webapp-architecture.mjs && npm run typecheck:webapp"
  }
}
```

既存`node --check apps/webapp/js/app.js`は削除する。TypeScript entrypointの構文と型は`tsc`、bundle解決は`npm run build:webapp`で検証する。

- [ ] **Step 9: focused testをGREENにする**

```bash
npx vitest run --root . tests/legacy-facades-removed.test.mjs \
  tests/architecture-boundaries.test.mjs tests/app-composition-root.test.ts \
  tests/app-lifecycle.test.ts
node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 10: full regressionを実行する**

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

- [ ] **Step 11: commit**

```bash
git add -A apps/webapp/js apps/webapp/index.html package.json scripts tests
git commit -m "refactor(app): remove legacy webapp facades"
```

## Acceptance Criteria

- 3つのlegacy facadeが削除されている。
- production/testに削除facadeの互換classが存在しない。
- architecture allowlistなしでviolationが0である。
- `app/app.ts`が200 physical lines以下である。
- Appがfeature business logicを持たない。
- all existing contracts、build、E2E、public auditが成功する。
