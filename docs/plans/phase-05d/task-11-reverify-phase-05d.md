# Phase 5D Task 11: 修正後のPhase 5Dを再検証して完了する

## 目的

Task 7で最終検証を開始した後に見つかったbrowser binding責務違反とvisual snapshot差分をTask 8〜10で解消した状態から、Phase 5D全体を改めて検証する。

Task 7で既に成功したunit/type/build結果を、そのまま最終証拠として流用しない。Task 8〜10後のHEADでfull verificationをやり直し、Phase完了条件を満たすことを確認する。

## 前提

- Task 8完了: browser bindingからfeature ownership違反が除去されている。
- Task 9完了: browser event bindingがowner別に分割され、lifecycle testがある。
- Task 10完了: 5件のvisual snapshot差分が根拠付きで解消されている。
- working treeにTask外の未説明差分がない。

## 対象外

- 新しいarchitecture改善
- 新機能
- 追加のUI redesign
- テストが通った後のついでのcleanup
- Phase 5Eの先行実装

最終検証で新しいblockerが見つかった場合は、その原因を修正して同じ検証を最初から再実行する。Task 11の中で別の大規模refactorを始めない。

## 必須確認

### 1. 削除済みFacade

```bash
test ! -e apps/webapp/js/comipath-browser-runtime.js
test ! -e apps/webapp/js/event-day-data-store.ts
test ! -e apps/webapp/js/comipath-dom-coordinator.js
rg 'ComiPathBrowserRuntime|EventDayDataStore|ComiPathDomCoordinator' apps/webapp/js tests
```

`rg`は旧Facadeを対象にした明示的なremoved/architecture test以外で0件であること。

### 2. browser binding ownership

```bash
rg 'new (StorageService|LocalStorage|GasApiClient|Worker)|localStorage' apps/webapp/js/app/bind-*.ts
rg '/infrastructure/' apps/webapp/js/app/bind-*.ts
```

意図:

- binderがconcrete infrastructureを生成しない。
- binderがLocalStorage/Workerを直接所有しない。
- feature internal infrastructureへのdeep importがない。

単純な文字列検索だけで合否を決めず、architecture checkerとsource reviewも合わせる。

### 3. route guidance ownership

確認するstate:

- navigation state
- current/selected destination
- current/selected route
- route selection status
- optimization generation
- snapshot
- distance matrix
- Worker job

これらがapp binderのmutable propertyではなくRoute Guidance featureから追えること。

### 4. event/dayとsource ownership

- active event/dayは`ActiveEventDaySession`が正本。
- source request token/AbortController/previewは`CircleDataSourceSession`/Controllerが正本。
- app binderがduplicate state proxyを持たない。

### 5. lifecycle

- application startを複数回呼んでもlistenerが二重登録されない。
- stop時にbrowser event listener、feature Controller listener、timer、background process、Workerが解除される。
- stop後の非同期callbackでstateが変わらない。

### 6. visual baseline

Task 10で判断した5枚を含め、CI固定環境の全snapshot testがGREENであること。

snapshot更新が含まれる場合、Task 10の分類理由と実際のdiffが一致していること。

## 実行順序

### Step 1: clean install

```bash
npm ci
```

### Step 2: architecture focused tests

```bash
npx vitest run --root . \
  tests/architecture-boundaries.test.mjs \
  tests/browser-binding-ownership.test.ts \
  tests/browser-event-bindings.test.ts \
  tests/application-assembly.test.ts \
  tests/browser-application-lifecycle.test.ts
```

### Step 3: full Webapp verification

```bash
npm run verify:webapp
```

### Step 4: CI-equivalent E2E

```bash
npm run test:e2e:ci
```

通常のローカルPlaywrightだけを最終証拠にしない。

### Step 5: public tree / repository hygiene

既存scriptがある場合は実行する。

```bash
node scripts/audit-public-tree.mjs
```

scriptが現行repositoryに存在しない場合は、存在しないscriptを新設するのではなく、その事実を記録して次へ進む。

続けて:

```bash
git diff --check
git status --short --branch
git ls-files
```

### Step 6: source review

次を人間/LLM reviewで確認する。

- `assemble-comipath-application.ts`がdependency graphの正本として読める。
- `bind-browser-events.ts`を読むだけで個別binder一覧とcleanupが分かる。
- 個別binderはevent転送以外のworkflowを持たない。
- app-level `complete-circle-visit.ts`は本当にcross-feature処理だけである。
- settings projectionはread-onlyである。
- feature public APIを経由し、別feature内部へのdeep importがない。

## Phase 5D最終受入条件

- 旧3 Facadeが削除済みで復活していない。
- `bind-browser-events.ts`が新しい巨大Facadeになっていない。
- browser binderからconcrete infrastructure生成・feature state ownership・route algorithmが消えている。
- event bindingがowner別で、listener cleanupをtestできる。
- composition rootからproduction dependency graphを追える。
- Route Guidance state/Worker/snapshotはRoute Guidance featureが所有する。
- event/day、circle status、source、local deletionの各feature ownershipが明確である。
- architecture checkerが`bind-browser-events.ts`を特例除外していない。
- 5件のvisual snapshot差分が根拠付きで解消されている。
- snapshot threshold/retry/skipでfailureを隠していない。
- `npm run verify:webapp`が成功する。
- `npm run test:e2e:ci`が成功する。
- working treeがcleanである。

## 進捗更新

全条件を満たした場合のみ`docs/status/progress.md`を更新する。

- Task 8〜11を完了へ変更する。
- Task 7は「最終検証中に追加blockerを発見し、Task 8〜11へ継続した」と記録する。
- Phase 5Dを完了とする。
- 次Phaseを自動的に開始しない。

いずれかが失敗した場合はPhase完了と書かず、失敗command・test名・原因・所有Taskを進捗へ記録する。

## 予定コミットメッセージ

検証のみでproduction差分がない場合:

```text
docs(phase-5d): complete refactor verification
```

検証中に小さなbugfixが必要になった場合は、そのbugfixを先に独立commitし、全検証を再実行してから完了docsをcommitする。
