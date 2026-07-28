# Phase 5D Task 1: Characterization and Architecture Guardrails

**Status:** PLANNED
**Depends on:** Phase 5C completion
**Commit candidate:** `test(architecture): lock webapp module boundaries`

## Goal

リファクタリング前の外部挙動と現在のimport違反を機械的に記録し、以後のTaskで新しい依存違反を増やせない状態にする。production behaviorは変更しない。

## Files

### Create

- `scripts/check-webapp-architecture.mjs`
- `scripts/webapp-architecture-legacy-allowlist.json`
- `tests/architecture-boundaries.test.mjs`
- `tests/app-characterization.test.ts`

### Modify

- `package.json`

### Forbidden

- `apps/webapp/js/`のproduction実装
- LocalStorage schema
- E2E snapshot
- package dependency

## Interfaces

`scripts/check-webapp-architecture.mjs`は次をexportする。

```js
export function scanWebappArchitecture(options = {}) {
  return {
    files: [],
    imports: [],
    violations: [],
  };
}

export function assertWebappArchitecture(options = {}) {
  const result = scanWebappArchitecture(options);
  if (result.violations.length > 0) {
    throw new Error(formatArchitectureViolations(result.violations));
  }
  return result;
}
```

violationは次の形を使う。

```ts
interface ArchitectureViolation {
  ruleId: string;
  importer: string;
  imported: string | null;
  message: string;
}
```

allowlist entryは`ruleId`、`importer`、`imported`の完全一致だけを許可する。wildcardを使用しない。

## Rules introduced in this Task

- 新規`features/*/domain`と`features/*/application`からbrowser API moduleへの依存禁止
- feature間deep import禁止
- `components/`からrepository、GAS client、Worker controllerへの依存禁止
- `app/`外で複数featureのconcrete dependencyを組み立てることを禁止
- legacy `app.js`、`data-manager.ts`、`ui-manager.js`の既存違反は完全一致allowlistへ記録
- allowlistに存在しない新規違反は即FAIL

## TDD Procedure

- [ ] **Step 1: architecture checkerの失敗testを書く**

```js
it("rejects a domain import from infrastructure", async () => {
  const result = scanFixture({
    "features/navigation/domain/bad.ts":
      'import "../../infrastructure/local-storage";',
  });
  expect(result.violations.map((item) => item.ruleId)).toContain(
    "domain-imports-infrastructure",
  );
});
```

- [ ] **Step 2: testを実行して未実装FAILを確認する**

```bash
npx vitest run --root . tests/architecture-boundaries.test.mjs
```

Expected: `scanWebappArchitecture is not defined`または同等の未実装FAIL。

- [ ] **Step 3: Node built-inだけでimport scanを実装する**

対象拡張子は`.ts`、`.js`、`.mjs`とする。static `import`、`export ... from`、literal dynamic `import()`を検査する。非literal dynamic importは本Taskでは許可せずviolationとする。

- [ ] **Step 4: current production treeをscanし、既存違反だけをallowlistへ列挙する**

allowlist生成を自動化してcommitしない。実装者が各entryを確認し、責務集中に由来するものだけを手動で記録する。

- [ ] **Step 5: characterization testを書く**

`App`の公開eventとfake dependencyを使い、次を固定する。

```ts
it("keeps startup, source, navigation and delete events bound once", async () => {
  const app = createCharacterizationHarness();
  await app.init();

  expect(app.events.listenerCount("event-day-select")).toBe(1);
  expect(app.events.listenerCount("csv-preview-request")).toBe(1);
  expect(app.events.listenerCount("resume-confirm")).toBe(1);
  expect(app.events.listenerCount("storage-delete-request")).toBe(1);

  app.dispose();
  expect(app.events.totalListenerCount()).toBe(0);
});
```

DOM詳細やprivate methodではなく、公開custom event、repository effect、view callをassertする。

- [ ] **Step 6: package scriptを追加する**

```json
{
  "scripts": {
    "check:webapp:architecture": "node scripts/check-webapp-architecture.mjs"
  }
}
```

`check:webapp`へはまだ組み込まない。Task 9でallowlist廃止後に必須化する。

- [ ] **Step 7: focused testをGREENにする**

```bash
npx vitest run --root . tests/architecture-boundaries.test.mjs tests/app-characterization.test.ts
node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 8: regressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

- [ ] **Step 9: commit**

```bash
git add package.json scripts/check-webapp-architecture.mjs \
  scripts/webapp-architecture-legacy-allowlist.json \
  tests/architecture-boundaries.test.mjs tests/app-characterization.test.ts
git commit -m "test(architecture): lock webapp module boundaries"
```

## Acceptance Criteria

- production code変更なしで既存主要flowがcharacterization testへ固定される。
- current violationsは完全一致allowlistへ記録される。
- allowlist外の新しい逆依存がFAILする。
- checker自身のfixture testがある。
- focused test、full webapp test、typecheck、buildが成功する。
