# Phase 5D Task 2: Separate Browser Startup and Dependency Assembly

**Status:** PLANNED
**Depends on:** Task 1
**Commit candidate:** `refactor(app): separate startup from dependency assembly`

## Goal

HTML entrypoint、DOM readiness、application lifecycle、dependency生成を責務別fileへ分離する。既存`App`は一時的にlegacy applicationとして利用し、feature behaviorを変更しない。

## Files

### Create

- `apps/webapp/js/app/comipath-application.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/run-comipath-in-browser.ts`
- `apps/webapp/js/app/browser-entrypoint.ts`
- `tests/comipath-application.test.ts`
- `tests/browser-application-lifecycle.test.ts`
- `tests/application-assembly.test.ts`

### Modify

- `apps/webapp/index.html`
- `apps/webapp/js/app.js`
- `tests/webapp-contracts.test.mjs`
- `scripts/webapp-architecture-legacy-allowlist.json`

## Preflight

```bash
test -e apps/webapp/js/app.js
test ! -e apps/webapp/js/app/comipath-application.ts
test ! -e apps/webapp/js/app/assemble-comipath-application.ts
test ! -e apps/webapp/js/app/run-comipath-in-browser.ts
test ! -e apps/webapp/js/app/browser-entrypoint.ts
```

## Interfaces

```ts
export interface StartableApplication {
  start(): Promise<void>;
  stop(): void;
}

export interface ComiPathApplicationDependencies {
  readonly legacyApplication: StartableApplication;
}

export function createComiPathApplication(
  dependencies: ComiPathApplicationDependencies,
): StartableApplication;
```

```ts
export interface AssembleComiPathApplicationOptions {
  readonly document: Document;
  readonly window: Window;
  readonly createAlnsWorker?: () => Worker;
}

export function assembleComiPathApplication(
  options: AssembleComiPathApplicationOptions,
): StartableApplication;
```

```ts
export interface BrowserApplicationRun {
  start(): Promise<void>;
  stop(): void;
}

export function runComiPathInBrowser(
  application: StartableApplication,
  browser: {
    readonly document: Document;
    readonly window: Window;
  },
): BrowserApplicationRun;
```

## TDD procedure

- [ ] **Step 1: application shellのRED testを書く**

```ts
it("starts and stops the legacy application exactly once", async () => {
  const legacyApplication = createStartableApplicationFake();
  const application = createComiPathApplication({ legacyApplication });

  await application.start();
  await application.start();
  application.stop();
  application.stop();

  expect(legacyApplication.startCalls).toBe(1);
  expect(legacyApplication.stopCalls).toBe(1);
});
```

- [ ] **Step 2: browser lifecycleのRED testを書く**

DOMContentLoaded前後、pagehide、manual stop、start失敗時cleanupをfake Document/Windowで検証する。

- [ ] **Step 3: application assemblyのRED testを書く**

legacy application、repository、Worker factoryが一回だけ生成されることをfactory spyで固定する。Task 2ではfeature dependencyを再構成しない。

- [ ] **Step 4: REDを確認する**

```bash
npx vitest run --root . tests/comipath-application.test.ts \
  tests/browser-application-lifecycle.test.ts \
  tests/application-assembly.test.ts
```

- [ ] **Step 5: `app.js`のtop-level side effectを除去する**

`app.js`をimportしただけでlistener、network request、timerを開始しないようにする。existing classをnamed exportし、`start()`/`stop()` contractへ合わせる薄いwrapperを用意する。

- [ ] **Step 6: application shellを実装する**

`comipath-application.ts`はlegacy applicationのstart/stop delegationだけを持つ。feature-specific state、message、DOM queryを追加しない。

- [ ] **Step 7: dependency assemblyを実装する**

Task 2では`assemble-comipath-application.ts`がlegacy applicationを一回生成するだけにする。後続Taskが同fileへfeature dependenciesを段階追加する。

- [ ] **Step 8: browser lifecycleを実装する**

`run-comipath-in-browser.ts`だけがDOMContentLoaded、pagehide、fatal bootstrap errorを扱う。

- [ ] **Step 9: entrypointを切り替える**

`index.html`を次へ変更する。

```html
<script type="module" src="js/app/browser-entrypoint.ts"></script>
```

`browser-entrypoint.ts`はassemblyとbrowser runを呼ぶだけとし、feature logicを書かない。

- [ ] **Step 10: build contractを更新する**

Vite outputがnew entrypointから生成され、old `app.js` side effectに依存しないことを`tests/webapp-contracts.test.mjs`で検証する。

- [ ] **Step 11: allowlistを縮小する**

entrypoint、global lifecycle、dependency assemblyに関するlegacy violationsを削除する。legacy application内部のfeature violationsは残す。

- [ ] **Step 12: verificationを実行する**

```bash
npx vitest run --root . tests/comipath-application.test.ts \
  tests/browser-application-lifecycle.test.ts \
  tests/application-assembly.test.ts tests/webapp-contracts.test.mjs
node scripts/check-webapp-architecture.mjs
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
git diff --check
```

- [ ] **Step 13: commit**

```bash
git add apps/webapp/index.html apps/webapp/js/app.js apps/webapp/js/app \
  tests/comipath-application.test.ts \
  tests/browser-application-lifecycle.test.ts \
  tests/application-assembly.test.ts tests/webapp-contracts.test.mjs \
  scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(app): separate startup from dependency assembly"
```

## Acceptance criteria

- module importだけでapplicationが起動しない。
- browser lifecycleのownerが一つである。
- dependency assembly locationが一つである。
- start/stopがidempotentである。
- user-visible behavior、storage effect、network effectが変わらない。
