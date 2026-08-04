# Phase 5D Task 3.1: Correct Foundation Review Findings

**Status:** NEXT
**Depends on:** existing Task 1〜3 implementation at branch tip
**Blocks:** Task 4 and every later Task
**Commit candidate:** `fix(phase-5d): correct architecture and lifecycle foundation`

## Goal

Task 1〜3実装後レビューで見つかったfoundation defectsをすべて修正する。Event Day repositoryのlayer分離、architecture checkerの検出精度、browser lifecycle Promise、application failure contract、dispose後のstale work、characterization tests、通常verifyへのtest登録を直す。

本Taskは新featureを追加しない。既存のTask 1〜3実装を修正し、Task 4以降が安全に依存できるfoundationを作る。

## Review findings covered

1. `LocalStorageEventDayRepository`がUse Case fileに存在する。
2. event-day `public-api.ts`がconcrete LocalStorage classをexportする。
3. architecture checkerがlegacy concrete importsをpath名だけで見落とす。
4. DOM準備前にstopするとbrowser start Promiseが永久pendingになる。
5. application start失敗後のretry testとproduction `App.dispose()` contractが矛盾する。
6. `App.dispose()`がsource request、request token、transition token、selection tokenを完全に無効化しない。
7. characterization testsが検証対象handlerをmockへ置換し、偽陽性になる。
8. Task 1〜3で追加したtestが`npm run test:webapp`に含まれない。
9. architecture checkerが通常の`npm run check:webapp`に含まれず、後続Taskで回避できる。

## Files

### Create

- `apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository.ts`
- `tests/event-day-layer-boundaries.test.mjs`

### Modify

- `apps/webapp/js/features/event-day/use-cases/event-day-repository.ts`
- `apps/webapp/js/features/event-day/public-api.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/run-comipath-in-browser.ts`
- `apps/webapp/js/app/comipath-application.ts`
- `apps/webapp/js/app.js`
- `apps/webapp/js/ui/management-session.ts`
- `scripts/check-webapp-architecture.mjs`
- `scripts/webapp-architecture-legacy-allowlist.json`
- `tests/architecture-boundaries.test.mjs`
- `tests/apps-behavior-characterization.test.ts`
- `tests/browser-application-lifecycle.test.ts`
- `tests/comipath-application.test.ts`
- `tests/application-assembly.test.ts`
- `tests/event-day-repository.test.ts`
- `package.json`

### Forbidden

- new user-visible feature
- LocalStorage schema/key変更
- GAS/CSV/navigation contract変更
- architecture violationを隠すためのwildcard allowlist
- old path re-export shim
- retry可能に見せるtest-only behavior
- handler本体をmockへ置換したcharacterization test
- new package dependency

## Preflight

```bash
git status --short --branch
git rev-parse HEAD

test -e apps/webapp/js/features/event-day/use-cases/event-day-repository.ts
test ! -e apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository.ts
test -e apps/webapp/js/features/event-day/public-api.ts
test -e apps/webapp/js/app/run-comipath-in-browser.ts
test -e apps/webapp/js/app/comipath-application.ts
test -e tests/apps-behavior-characterization.test.ts
test -e tests/browser-application-lifecycle.test.ts

npm run test:webapp
npm run check:webapp
npm run build:webapp
```

Preflightで既存branchがさらに進んでいる場合は、source/target pathを実在treeへ合わせて本Task文書を先に修正する。Task 4のfileが既に追加されている場合は実装を停止し、Task 3.1以外の未review差分を分離する。

## Final interfaces

### EventDayRepository contract

`apps/webapp/js/features/event-day/use-cases/event-day-repository.ts`にはinterfaceとstorage-neutral error typeだけを置く。

```ts
export interface EventDayRepository {
  load(ref: EventDayRef): LocalEventDayState | null;
  save(ref: EventDayRef, state: LocalEventDayState): void;
  saveAndRememberLastOpened(
    ref: EventDayRef,
    state: LocalEventDayState,
  ): void;
  listEventDays(): readonly EventDayRef[];
  getLastOpenedEventDay(): EventDayRef | null;
  rememberLastOpenedEventDay(ref: EventDayRef): void;
  deleteEventDay(ref: EventDayRef): void;
  listEventDaysForDeletion(): readonly {
    readonly ref: EventDayRef;
    readonly state: LocalEventDayState;
  }[];
  deleteAllEventDays(
    expected: readonly {
      readonly ref: EventDayRef;
      readonly sourceGeneration: string;
    }[],
  ): void;
}
```

compatibility methodの`list`、`getLastOpened`、`setLastOpened`、`deleteState`、`listForDeletionStrict`、`deleteAllFailureSafe`をinterfaceへ残さない。production/test callerをcanonical method名へ更新する。

### LocalStorage implementation

`apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository.ts`だけが次を所有する。

- LocalStorage keys
- `StorageService`
- storage payload parser
- v1→v2 migration
- state/index/last-opened rollback
- strict deletion preflight
- `LocalStorageEventDayRepository` class

### Public API

`features/event-day/public-api.ts`は次をexportする。

- Event Day domain types
- `EventDayRepository` interface
- `ActiveEventDaySession` interface/factory
- `ActiveEventDayReader` interface/factory

`LocalStorageEventDayRepository`はexportしない。assemblyだけがinfrastructure pathからimportする。

### Application lifecycle

```ts
export interface StartableApplication {
  start(): Promise<void>;
  stop(): void;
}
```

contract:

- same instanceのstart失敗はterminal
- start失敗時に所有resourceを一回stop
- stop後の再startを許可しない
- DOM準備前stop時も保留中Promiseをsettle
- stopはidempotent

retryが必要な場合は`assembleComiPathApplication()`を再実行して新しいapplication instanceを作る。

### ManagementSession lifecycle

```ts
export interface StoppableSession {
  stop(): void;
}
```

`ManagementSession.stop()`は次を一回で行う。

- current GAS/source requestをcancel
- active previewをclear
- all busy lanesをclear
- request generationを進め、既存async continuationをstaleにする
- 以後のnotification/state updateをowner側で拒否できる状態にする

## TDD procedure

- [ ] **Step 1: repository layer failure testsを書く**

`tests/event-day-layer-boundaries.test.mjs`へ次を追加する。

```js
it("keeps the event-day repository contract free of concrete storage", () => {
  const contract = readFileSync(
    "apps/webapp/js/features/event-day/use-cases/event-day-repository.ts",
    "utf8",
  );
  expect(contract).not.toMatch(/StorageService|localStorage|INDEX_KEY|LAST_OPENED_KEY/);
});

it("does not export LocalStorage infrastructure from the feature public API", () => {
  const publicApi = readFileSync(
    "apps/webapp/js/features/event-day/public-api.ts",
    "utf8",
  );
  expect(publicApi).not.toMatch(/LocalStorageEventDayRepository/);
});
```

- [ ] **Step 2: architecture checker failure fixtureを書く**

次のfixtureが`use-case-imports-concrete-module`でFAILするtestを書く。

```js
{
  "features/example/use-cases/read.ts":
    'import { StorageService } from "../../../state/storage-service";'
}
```

次のfixtureが`public-api-exports-concrete-infrastructure`でFAILするtestを書く。

```js
{
  "features/example/public-api.ts":
    'export { LocalStorageExampleRepository } from "./infrastructure/local-storage-example-repository";'
}
```

- [ ] **Step 3: browser pending Promise failure testを書く**

fake documentを`loading`にし、`start()`直後に`stop()`する。

```ts
const run = runComiPathInBrowser(application, { document, window });
const pending = run.start();
run.stop();

await expect(
  Promise.race([
    pending.then(() => "settled"),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
  ]),
).resolves.toBe("settled");
```

既存の`Promise.race([pending, Promise.resolve()])`は削除する。

- [ ] **Step 4: terminal start failure testを書く**

最初の`start()`がrejectした後、同じinstanceの二回目`start()`が再度legacy startを呼ばないことを検証する。

```ts
await expect(application.start()).rejects.toThrow("fatal");
await expect(application.start()).rejects.toThrow();
expect(legacy.start).toHaveBeenCalledOnce();
expect(legacy.stop).toHaveBeenCalledOnce();
```

- [ ] **Step 5: dispose cancellation testを書く**

in-flight source requestを開始し、`App.dispose()`後にrequestをresolveする。repository save、session replacement、View callが増えないことをfake boundaryで確認する。

検証対象のApp handlerをmockへ置換しない。mock/fakeにしてよいのはrepository、HTTP client、View、clock、Workerだけである。

- [ ] **Step 6: REDを確認する**

```bash
npx vitest run --root . \
  tests/event-day-layer-boundaries.test.mjs \
  tests/architecture-boundaries.test.mjs \
  tests/browser-application-lifecycle.test.ts \
  tests/comipath-application.test.ts \
  tests/apps-behavior-characterization.test.ts
```

Expected: repository placement、pending Promise、retry contract、dispose cancellationのうち少なくとも一つがFAILする。

- [ ] **Step 7: repository interfaceとconcrete classを分離する**

1. `event-day-repository.ts`からLocalStorage class、keys、parser、rollback implementationを削除する。
2. それらを`infrastructure/local-storage-event-day-repository.ts`へ移す。
3. compatibility method callerをcanonical methodへ更新する。
4. old path shimを作らない。
5. migration、rollback、strict deletionのlogicを変更しない。

- [ ] **Step 8: public APIとassembly importsを修正する**

- public APIからconcrete class exportを削除
- assemblyは`../features/event-day/infrastructure/local-storage-event-day-repository`を直接import
- App、DataManager、他featureは`EventDayRepository` interfaceまたはevent-day public APIだけを使用
- production/testのdeep importを`rg`で確認

```bash
rg 'LocalStorageEventDayRepository' apps/webapp/js tests
```

Expected: concrete importはassembly、infrastructure-focused testsだけ。

- [ ] **Step 9: architecture checkerをallowlist方式からallow-rule方式へ強化する**

Use Caseのimport先をresolveし、許可directory以外を違反にする。少なくとも次を検出する。

- `state/storage-service`
- `state/storage-schema`
- `api/gas-api-client`
- same/other feature infrastructure
- components/UI
- non-literal dynamic import
- public API concrete export

legacy allowlistは既存違反のexact tripleだけを許可する。新ruleのTask 3実装違反をallowlistへ追加して通さない。

- [ ] **Step 10: browser lifecycle Promiseをsettleさせる**

`run-comipath-in-browser.ts`でpending readiness Promiseのresolve/reject ownerを保持する。DOM準備前stop時はlistenerを外し、Promiseをresolveする。pagehide、manual stop、start failureでcleanupを一回だけ行う。

- [ ] **Step 11: application failure contractをterminalへ揃える**

`comipath-application.ts`からfailed start後のretry resetを削除する。failure objectを保存し、同じinstanceの後続startは同じfailureまたはstopped errorでrejectする。legacy stopを二回呼ばない。

- [ ] **Step 12: disposeでin-flight workを無効化する**

- `ManagementSession.stop()`を追加
- `App.dispose()`から呼ぶ
- transition tokenとselection tokenを進める
- async handlerの`await`後に`this.stopped`またはgenerationを確認する
- cancel後にView、repository、active sessionを更新しない

- [ ] **Step 13: characterization testsを実際のpublic boundaryへ直す**

次を守る。

- dispatchするcustom eventはproduction event名
- handler本体をspy/mockで置換しない
- repository effect、active session snapshot、View callをassert
- wrong confirmationではdelete dependencyが呼ばれない
- dispose後はlistener count、request、timer、Workerが残らない
- test fixtureはraw GAS URL、CSV cellをfailure messageへ出さない

- [ ] **Step 14:通常test scriptへ登録する**

`package.json`でTask 1〜3と本Taskのtestを`test:webapp`へ追加する。

最低限:

- `tests/architecture-boundaries.test.mjs`
- `tests/apps-behavior-characterization.test.ts`
- `tests/comipath-application.test.ts`
- `tests/browser-application-lifecycle.test.ts`
- `tests/application-assembly.test.ts`
- `tests/active-event-day-session.test.ts`
- `tests/active-event-day-reader.test.ts`
- `tests/event-day-layer-boundaries.test.mjs`

`check:webapp`を次の順序にする。

```json
{
  "check:webapp": "node scripts/check-webapp-architecture.mjs && node --check apps/webapp/js/app.js && npm run typecheck:webapp"
}
```

Task 9で`app.js`削除後に`node --check`部分だけ削除する。

- [ ] **Step 15: focused verificationを実行する**

```bash
npx vitest run --root . \
  tests/event-day-layer-boundaries.test.mjs \
  tests/architecture-boundaries.test.mjs \
  tests/apps-behavior-characterization.test.ts \
  tests/browser-application-lifecycle.test.ts \
  tests/comipath-application.test.ts \
  tests/application-assembly.test.ts \
  tests/active-event-day-session.test.ts \
  tests/active-event-day-reader.test.ts \
  tests/event-day-repository.test.ts

node scripts/check-webapp-architecture.mjs
```

Expected: all focused tests PASS、architecture violations 0 after exact legacy allowlist.

- [ ] **Step 16: full regressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
git diff --check
git status --short --branch
```

- [ ] **Step 17: self-reviewする**

```bash
rg 'LocalStorageEventDayRepository' apps/webapp/js tests
rg 'AbortController|AbortSignal|StorageService|localStorage|fetch|Worker' \
  apps/webapp/js/features/*/use-cases
rg 'LocalStorage|Http|Browser|WebWorker' \
  apps/webapp/js/features/*/public-api.ts
```

Expected:

- concrete event-day repository importはassembly/infrastructure testsだけ
- Use Case direct browser/concrete importは0
- public API concrete exportは0

- [ ] **Step 18: commit**

```bash
git add \
  apps/webapp/js/features/event-day \
  apps/webapp/js/app \
  apps/webapp/js/app.js \
  apps/webapp/js/ui/management-session.ts \
  scripts/check-webapp-architecture.mjs \
  scripts/webapp-architecture-legacy-allowlist.json \
  tests package.json

git commit -m "fix(phase-5d): correct architecture and lifecycle foundation"
```

## Acceptance criteria

- EventDayRepository contract fileがstorage-neutralである。
- LocalStorage implementationがevent-day infrastructureにある。
- event-day public APIがconcrete infrastructureをexportしない。
- architecture checkerがresolved import allowlistを使い、legacy concrete importを見逃さない。
- DOM準備前stop時にbrowser start Promiseがsettleする。
- failed application instanceをretryしない。
- dispose後のrequest、timer、listener、Worker callbackがstate/UIを更新しない。
- characterization testsがhandler本体をmockしない。
- Task 1〜3とTask 3.1のtestが`npm run test:webapp`で実行される。
- `npm run check:webapp`がarchitecture checkerを実行する。
- full test、typecheck、build、build verificationが成功する。
- Task 4を開始してよいというreview判定が得られる。
