# Phase 5D Task 6: Extract Circle Data Source Workflows

**Status:** PLANNED
**Depends on:** Task 5 reviewed
**Commit candidate:** `refactor(circle-data-source): extract import and export workflows`

## Goal

CSV/Googleスプレッドシートのsheet一覧取得、preview、apply、cancel、refresh、source diff、CSV exportをCircle Data Source featureへ移す。

pending GAS updatesの再送・破棄はCircle Status featureに残す。Use CaseとSessionへAbortController/AbortSignalを持ち込まず、browser cancellationはInfrastructureが隠蔽する。

## Non-goals

- pending GAS updatesの送信・破棄
- LocalStorage schema変更
- GAS API contract変更
- route guidance algorithm変更
- browser Abort APIをUse Case contractへ公開
- generic `SourceService`または`RequestManager`の作成

## Files

### Create

- `apps/webapp/js/features/circle-data-source/domain/circle-data-source-types.ts`
- `apps/webapp/js/features/circle-data-source/domain/csv-circle-codec.ts`
- `apps/webapp/js/features/circle-data-source/domain/circle-source-diff.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/cancelable-request.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/preview-csv-import.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/load-google-sheet-names.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/preview-google-sheet-import.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/apply-circle-data-preview.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/cancel-circle-data-preview.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/export-circles-to-csv.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/google-sheet-circle-client.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/circle-csv-downloader.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-view.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-panel-model.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-preview-dialog-model.ts`
- `apps/webapp/js/features/circle-data-source/infrastructure/gas-google-sheet-circle-client.ts`
- `apps/webapp/js/features/circle-data-source/infrastructure/browser-circle-csv-downloader.ts`
- `apps/webapp/js/features/circle-data-source/public-api.ts`
- `tests/circle-data-source-use-cases.test.ts`
- `tests/circle-data-source-cancellation.test.ts`
- `tests/circle-data-source-controller.test.ts`

### Move or refactor then delete

- `apps/webapp/js/data/csv-circle-codec.ts`
- `apps/webapp/js/data/source-diff.ts`
- `apps/webapp/js/data/gas-refresh-service.ts`
- `apps/webapp/js/api/gas-api-client.ts`
- `apps/webapp/js/ui/management-session.ts`
- `apps/webapp/js/ui/csv-download.ts`

Task 3.1で`ManagementSession`へ追加したglobal lifecycle部分は、Circle Data Source Session/Controllerへ必要なstateだけ移す。source以外のbusy stateを無理に同featureへ移さない。

### Modify

- `apps/webapp/js/app.js`
- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- source-related components
- source-related tests
- `scripts/check-webapp-architecture.mjs`
- `scripts/webapp-architecture-legacy-allowlist.json`
- `package.json`

## Preflight

```bash
git status --short --branch

test -e apps/webapp/js/data/csv-circle-codec.ts
test -e apps/webapp/js/data/source-diff.ts
test -e apps/webapp/js/data/gas-refresh-service.ts
test -e apps/webapp/js/api/gas-api-client.ts
test -e apps/webapp/js/ui/management-session.ts
test ! -e apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts

npm run test:webapp
npm run check:webapp
npm run build:webapp
```

## Final contracts

```ts
export interface CancelableRequest<T> {
  readonly result: Promise<T>;
  cancel(): void;
}
```

```ts
export interface GoogleSheetCircleClient {
  startLoadingSheetNames(webAppUrl: string): CancelableRequest<
    readonly string[]
  >;

  startLoadingCircles(
    source: GoogleSheetCircleSource,
  ): CancelableRequest<readonly CircleRecord[]>;
}
```

```ts
export interface CircleDataSourceSessionSnapshot {
  readonly requestGeneration: number;
  readonly draftWebAppUrl: string;
  readonly selectedSheetName: string;
  readonly sheetNames: readonly string[];
  readonly preview: CircleDataPreview | null;
  readonly busy: boolean;
  readonly errorCode: CircleDataSourceErrorCode | null;
}
```

```ts
export interface CircleDataSourceSession {
  getSnapshot(): CircleDataSourceSessionSnapshot;
  beginRequest(): number;
  isCurrentRequest(generation: number): boolean;
  updateDraft(input: CircleDataSourceDraftUpdate): void;
  setPreview(preview: CircleDataPreview | null): void;
  setBusy(busy: boolean): void;
  setError(errorCode: CircleDataSourceErrorCode | null): void;
  reset(): void;
  subscribe(
    listener: (snapshot: CircleDataSourceSessionSnapshot) => void,
  ): () => void;
}
```

Sessionはserializable/cloneable stateだけを持つ。AbortController、AbortSignal、File、Response、HTMLElementを保存しない。

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

Controllerはcurrent `CancelableRequest`を一つだけ所有する。new request、event/day switch、settings close、`stop()`で`cancel()`する。

## Data flow

### Google Sheet request

1. Controllerがunknown inputをparseする。
2. Sessionでnew request generationを発行する。
3. Clientの`startLoading...()`を呼ぶ。
4. Controllerがreturned cancelable requestをcurrent ownerとして保持する。
5. `result`完了時にgenerationとstopped stateを確認する。
6. current requestだけSession/Viewを更新する。
7. stale/cancelled resultは何も更新しない。

Infrastructure内部だけがAbortControllerを生成する。

### Preview apply

1. preview IDとactive event/day/source generationを検証する。
2. previewがexpiredでないことを確認する。
3. next `LocalEventDayState`を作る。
4. EventDayRepositoryへsaveする。
5. active event/dayならSessionをreplaceする。
6. save成功後にRoute Guidance invalidation capabilityを一回呼ぶ。
7. previewをclearし、Viewを更新する。

save失敗時にactive session、route guidance、View success stateを更新しない。

## TDD procedure

- [ ] **Step 1: CSV RED testsを書く**

- extension
- 5MB limit
- required headers
- sanitized validation issue
- preview expiry
- source generation stale
- apply前はrepository save 0
- cancelはrepository save 0

- [ ] **Step 2: Google Sheet RED testsを書く**

- URL runtime parse
- sheet list
- initial/replacement/refresh mode
- request generation stale rejection
- cancel calls underlying request once
- cancelled request result does not update Session/View
- raw GAS URL/body is not exposed in error

- [ ] **Step 3: cancellation boundary testを書く**

```ts
it("keeps browser abort APIs out of use cases", () => {
  const files = readUseCaseSources("features/circle-data-source/use-cases");
  expect(files).not.toMatch(/AbortController|AbortSignal/);
});
```

client fakeは`CancelableRequest`を返す。testでAbortControllerをfake Use Caseへ渡さない。

- [ ] **Step 4: apply/export RED testsを書く**

- durable save後にactive session update
- route guidance invalidationはsave後一回
- save failureではinvalidation 0
- export file name
- download capability call
- no direct DOM/Blob/URL use in Use Case

- [ ] **Step 5: Controller RED testsを書く**

unknown input、busy/error、dialog、focus、event/day switch、settings close、stop、stale callbackをfake Viewで検証する。

- [ ] **Step 6: REDを確認する**

```bash
npx vitest run --root . \
  tests/circle-data-source-use-cases.test.ts \
  tests/circle-data-source-cancellation.test.ts \
  tests/circle-data-source-controller.test.ts
```

- [ ] **Step 7: pure CSV/diff modulesをmoveする**

algorithm/serialized outputを変更しない。mechanical moveとlogic refactorを別diff blockで行う。

- [ ] **Step 8: Sessionを実装する**

clone/freezeしたsnapshotを返す。request generation、draft、preview、busy、安全なerror codeだけを保持する。

- [ ] **Step 9: Google client infrastructureを実装する**

`GasGoogleSheetCircleClient`内部でAbortControllerを生成し、`CancelableRequest`として返す。URL parse、fetch、response parsing、safe error classificationを所有する。

- [ ] **Step 10: browser downloaderを実装する**

`BrowserCircleCsvDownloader`だけがBlob、URL、anchor clickを使用する。Use Caseは`CircleCsvDownloader` interfaceだけを呼ぶ。

- [ ] **Step 11: broad refresh serviceをUse Casesへ分解する**

initial/replacement/refreshの判定条件をtyped pure functionまたは明示的Use Case branchにする。generic mode stringをUI入力から信用しない。

- [ ] **Step 12: Controllerをproduction eventsへ接続する**

CSV preview、sheet names、Google Sheet preview、apply、cancel、exportをbindする。retry/discard eventsを受け取らない。

- [ ] **Step 13: source apply後cross-feature callを接続する**

route guidanceのpublic capabilityだけをimportする。snapshot/distance matrix concrete repositoryを直接importしない。

- [ ] **Step 14: DataManager/management filesを縮小する**

source production callerをnew Use Cases/Controllerへ移す。test compatibility delegationはTask 9までに削除する。AbortControllerをDataManagerへ移さない。

- [ ] **Step 15: old filesを削除する**

全import更新後、old codec/diff/refresh/client/session/download filesを削除する。old path shimを作らない。

- [ ] **Step 16: test scriptとarchitecture checkerを更新する**

新しいtestsを`test:webapp`へ登録する。Use CaseのAbort API、fetch、DOM、concrete client importをarchitecture checkerで拒否する。

- [ ] **Step 17: focused verificationを実行する**

```bash
npx vitest run --root . \
  tests/circle-data-source-use-cases.test.ts \
  tests/circle-data-source-cancellation.test.ts \
  tests/circle-data-source-controller.test.ts \
  tests/csv-circle-codec.test.ts \
  tests/source-diff.test.ts \
  tests/gas-api-client.test.ts \
  tests/gas-refresh-service.test.ts \
  tests/source-manager.test.ts \
  tests/source-manager-app.test.ts \
  tests/source-diff-dialog.test.ts \
  tests/source-diff-app.test.ts \
  tests/csv-download.test.ts \
  tests/csv-download-app.test.ts

node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 18: regressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npx playwright test --grep "CSV|Google Sheet|source"
git diff --check
```

- [ ] **Step 19: self-reviewする**

```bash
rg 'AbortController|AbortSignal|fetch|document|window|Blob' \
  apps/webapp/js/features/circle-data-source/use-cases
rg 'GasGoogleSheetCircleClient|BrowserCircleCsvDownloader' \
  apps/webapp/js/features/circle-data-source/public-api.ts
```

Expected: both searches have no result.

- [ ] **Step 20: commit**

```bash
git add -A \
  apps/webapp/js/features/circle-data-source \
  apps/webapp/js/data \
  apps/webapp/js/api \
  apps/webapp/js/ui \
  apps/webapp/js/app.js \
  apps/webapp/js/data-manager.ts \
  apps/webapp/js/app \
  apps/webapp/js/components \
  tests scripts package.json

git commit -m "refactor(circle-data-source): extract import and export workflows"
```

## Acceptance criteria

- source draft/preview/request generationのmutable正本が一つである。
- Use Case/SessionにAbortController、AbortSignal、fetch、DOMがない。
- concrete Google clientとCSV downloaderがInfrastructureにある。
- public APIがconcrete infrastructureをexportしない。
- stop/new request/event-day switchでcurrent requestがcancelされる。
- cancelled/stale resultがSession、repository、Viewを更新しない。
- apply後のactive session更新とroute invalidationがdurable save後だけ行われる。
- pending GAS updates責務がCircle Statusへ残る。
- new testsが通常`test:webapp`で実行される。
