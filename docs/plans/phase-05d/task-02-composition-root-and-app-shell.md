# Phase 5D Task 2: Composition Root and App Shell

**Status:** PLANNED
**Depends on:** Task 1
**Commit candidate:** `refactor(app): separate bootstrap and composition root`

## Goal

HTML entrypoint、dependency生成、global lifecycleを`app/`へ分離する。既存`App`は一時的にlegacy adapterとして利用し、feature behaviorは変更しない。

## Files

### Create

- `apps/webapp/js/app/app.ts`
- `apps/webapp/js/app/app-lifecycle.ts`
- `apps/webapp/js/app/composition-root.ts`
- `apps/webapp/js/app/bootstrap.ts`
- `tests/app-composition-root.test.ts`
- `tests/app-lifecycle.test.ts`

### Modify

- `apps/webapp/index.html`
- `apps/webapp/js/app.js`
- `tests/webapp-contracts.test.mjs`
- `scripts/webapp-architecture-legacy-allowlist.json`

## Interfaces

```ts
export interface AppController {
  init(): Promise<void>;
  dispose(): void;
}

export interface AppDependencies {
  readonly legacyApp: AppController;
}

export function createApp(deps: AppDependencies): AppController;
```

```ts
export interface AppLifecycle {
  start(): Promise<void>;
  dispose(): void;
}

export function createAppLifecycle(app: AppController): AppLifecycle;
```

```ts
export interface CompositionRootOptions {
  readonly document: Document;
  readonly window: Window;
  readonly alnsWorkerFactory?: () => Worker;
}

export function createCompositionRoot(
  options: CompositionRootOptions,
): AppController;
```

## TDD Procedure

- [ ] **Step 1: composition ownershipの失敗testを書く**

```ts
it("creates one app instance and disposes it once", async () => {
  const legacyApp = createLegacyAppFake();
  const app = createApp({ legacyApp });

  await app.init();
  app.dispose();
  app.dispose();

  expect(legacyApp.initCalls).toBe(1);
  expect(legacyApp.disposeCalls).toBe(1);
});
```

- [ ] **Step 2: lifecycleの失敗testを書く**

```ts
it("starts from DOM readiness and unregisters global hooks", async () => {
  const harness = createLifecycleHarness();
  await harness.lifecycle.start();

  expect(harness.app.initCalls).toBe(1);
  expect(harness.windowListenerCount()).toBeGreaterThan(0);

  harness.lifecycle.dispose();
  expect(harness.windowListenerCount()).toBe(0);
});
```

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/app-composition-root.test.ts tests/app-lifecycle.test.ts
```

- [ ] **Step 4: legacy Appのmodule side effectを除去する**

`apps/webapp/js/app.js`末尾の自動bootstrapを削除し、class exportと既存helperだけを残す。importしただけでDOM listenerやnetwork requestを開始しない。

- [ ] **Step 5: `bootstrap.ts`をentrypointにする**

`index.html`のmodule scriptを次へ変更する。

```html
<script type="module" src="js/app/bootstrap.ts"></script>
```

`bootstrap.ts`は`createCompositionRoot()`と`createAppLifecycle()`だけを呼ぶ。feature logicを記述しない。

- [ ] **Step 6: composition rootでlegacy instanceを一度だけ生成する**

```ts
export function createCompositionRoot(options: CompositionRootOptions) {
  const legacyApp = new LegacyApp({
    alnsWorkerFactory: options.alnsWorkerFactory,
  });
  return createApp({ legacyApp });
}
```

Task 2ではrepositoryやfeature controllerを個別生成し直さない。legacy App内部のownershipを維持する。

- [ ] **Step 7: build contractを更新する**

Vite buildに`bootstrap.ts`が含まれ、旧`app.js`のside effectに依存しないことを`tests/webapp-contracts.test.mjs`で検証する。

- [ ] **Step 8: allowlistを縮小する**

entrypointとglobal lifecycleに関するlegacy違反を削除する。残存する`App`内部のfeature依存は維持する。

- [ ] **Step 9: focused testとregressionを実行する**

```bash
npx vitest run --root . tests/app-composition-root.test.ts tests/app-lifecycle.test.ts tests/webapp-contracts.test.mjs
node scripts/check-webapp-architecture.mjs
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
git diff --check
```

- [ ] **Step 10: commit**

```bash
git add apps/webapp/index.html apps/webapp/js/app.js apps/webapp/js/app \
  tests/app-composition-root.test.ts tests/app-lifecycle.test.ts \
  tests/webapp-contracts.test.mjs scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(app): separate bootstrap and composition root"
```

## Acceptance Criteria

- module importだけでAppが起動しない。
- `bootstrap.ts`以外にtop-level startup side effectがない。
- global lifecycleが`dispose()`可能である。
- dependency生成場所が`composition-root.ts`へ一意に定まる。
- user-visible behaviorとstorage effectが変わらない。
