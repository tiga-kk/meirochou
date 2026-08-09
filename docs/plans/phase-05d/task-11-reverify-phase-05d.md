# Phase 5D Task 11: 修正後のPhase 5Dを再検証して完了する

## 目的

Task 7で最終検証を開始した後に見つかったbrowser binding責務違反とvisual snapshot差分をTask 8〜10で解消した状態から、Phase 5D全体を改めて検証する。

Task 7で既に成功したunit/type/build結果を、そのまま最終証拠として流用しない。Task 8〜10後の最新remote HEADを基準にfull verificationをやり直し、Phase完了条件を満たすことを確認する。

Task 11は検証と完了判定のTaskである。新しい大規模refactorやUI判断をここへ吸収しない。

## 前提

- Task 8完了: browser bindingからfeature ownership違反が除去されている。
- Task 9完了: browser event ownershipが一意になり、listener lifecycle testがある。
- Task 10完了: Task 7候補を含むfresh snapshot failureが根拠付きで解消されている。
- `docs/status/progress.md`がTask 11開始時点の実態と一致している。

ユーザーの既存作業ツリーがcleanであることは前提にしない。Task 11と無関係な未コミット差分がある場合は、それをstash、reset、restore、clean、破棄せず、最新remote `feature/phase-05d`から一時worktreeまたは一時cloneを作り、その隔離された作業領域で検証する。

## 対象外

- 新しいarchitecture改善
- 新機能
- 追加のUI redesign
- テストが通った後のついでのcleanup
- Phase 5Eの先行実装
- ユーザーの未関連WIPをclean化すること

## 新しい失敗を見つけた場合の扱い

Task 11中にfailureを見つけても、機械的に「Task 11内で全部直す」としない。

- Task 8の責務移管不足、production workflow、本番接続に由来する場合: Task 8の未完了または回帰として扱う。
- Task 9のlistener ownership、duplicate registration、cleanupに由来する場合: Task 9の未完了または回帰として扱う。
- visual snapshot、DOM/CSS表示、baseline判断に由来する場合: Task 10へ戻す。
- 検証コマンドの軽微なpath誤記、明らかな型注釈漏れ等、外部挙動や設計境界を変えない小修正だけはTask 11内で最小修正してよい。

Task 8〜10へ戻す必要がある場合はPhase完了と書かず、`docs/status/progress.md`に失敗command、原因、所有Task、再開条件を記録する。新しい実装Taskが本当に必要なら、既存Taskの責務で表現できないことを確認してから追加する。

どの修正を行った場合も、最終証拠として採用する前にTask 11の検証を最新HEADから最初から再実行する。

## 開始時の基準点

最初にremoteを取得し、検証対象HEADを固定する。

```bash
git fetch origin feature/phase-05d
git rev-parse origin/feature/phase-05d
```

以後の検証は、このremote HEADから作った隔離作業領域で行う。ユーザーの別WIPやローカル未push commitを検証基準へ混ぜない。

検証途中でremote branchが進んだ場合は、完了判定前に再取得する。変更がdocs-onlyで実装・test・snapshotへ影響しないことを一意に確認できる場合を除き、最新remote HEADで必要な検証を再実行する。

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

文字列検索だけで合否を決めず、architecture checkerとsource reviewも合わせる。正当なtype名やtest fixture文字列がhitした場合は内容を確認して分類する。

### 3. route guidance ownership

確認するstate/resource:

- navigation state
- current/selected destination
- current/selected route
- route selection status
- optimization generation
- snapshot
- distance matrix
- Worker job

これらがapp binderのmutable property/proxyではなくRoute Guidance featureから追えること。

さらにTask 8で固定したproduction semanticsを確認する。

- purchase時は現在位置を完了circleへ進めてから次案内へ進む。
- hold時は現在位置を進めず、直前の確定位置から次案内へ進む。
- status保存失敗時は案内を進めない。
- GAS送信失敗で成功済みlocal statusをrollbackしない。
- 次route再構築失敗時にcurrent targetとrouteが食い違う中間状態をSessionへ残さない。
- candidate route計算失敗で既存current routeを壊さない。
- resumeでsnapshot validationと必要なroute/optimization復元挙動を失っていない。

### 4. event/dayとsource ownership

- active event/dayは`ActiveEventDaySession`が正本。
- event registry/manifestのproduction取得経路が一つに定まっている。
- event/day listenerが二重登録されていない。
- source request sequence/cancellation/previewは`CircleDataSourceSession`/Controllerが正本。
- app binderがduplicate token、AbortController、busy lane、preview proxyを持たない。

### 5. lifecycle

- application startを複数回呼んでもlistener/background processが二重登録・二重startされない。
- stop時にbrowser event listener、feature Controller listener、timer、background process、Workerが解除される。
- stop後の非同期callbackでfeature stateが変わらない。
- start→stop→新しいapplication start相当でeventが一回だけ処理される。

### 6. visual baseline

Task 10でfreshに判定したsnapshotを含め、CI固定環境の全snapshot testがGREENであること。

snapshot更新が含まれる場合:

- `BASELINE_UPDATE`の根拠と実際のPNG差分が一致している。
- `REGRESSION`扱いのsnapshotはbaselineを変更していない。
- Task 8・9で自然解消した`RESOLVED_BY_PRIOR_FIX`候補を不要に更新していない。
- threshold、retry、skip、無関係なlocator変更でfailureを隠していない。

## 実行順序

### Step 1: isolated clean install

最新remote HEADから作ったTask 11専用の一時worktree/cloneで:

```bash
npm ci
```

ここでいうcleanは隔離作業領域に説明不能な差分がないという意味であり、ユーザーの元の作業ツリーをclean化する意味ではない。

### Step 2: architecture focused tests

```bash
npx vitest run --root . \
  tests/architecture-boundaries.test.mjs \
  tests/browser-binding-ownership.test.ts \
  tests/browser-event-bindings.test.ts \
  tests/application-assembly.test.ts \
  tests/browser-application-lifecycle.test.ts
```

Task 8・9の実装時にtest名が合理的な理由で変更された場合は、`package.json`と現行test一覧を確認して同じ要求を証明する現存testを実行する。存在しないtest名を新規作成するためだけに停止しない。

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

現行branchには`node scripts/audit-public-tree.mjs`が存在するため実行する。

```bash
node scripts/audit-public-tree.mjs
git diff --check
git status --short --branch
```

Task 11開始後の意図した小修正がなければ、隔離作業領域の`git status --short`は空であること。意図した小修正がある場合は、内容をcommitした後に全検証を再実行し、最終的に空であることを確認する。

`git ls-files`全件を人手で確認すること自体は完了条件にしない。public treeの混入確認は既存audit scriptと今回の変更ファイル一覧を中心に行う。

### Step 6: source review

次を人間/LLM reviewで確認する。

- `assemble-comipath-application.ts`がdependency graphの正本として読める。
- `bind-browser-events.ts`を読むだけでapp所有event ownerとcleanupが分かる。
- 個別binderはevent転送以外のworkflowを持たない。
- Task 8のcross-feature circle completion functionは本当にcross-feature順序だけで、route geometryやstorageを実装していない。
- settings表示のapp helperを作った場合、それがread-onlyであり新しい巨大Facadeではない。
- feature public APIを経由し、別feature内部への不必要なdeep importがない。
- Task 8〜10で追加された新しいclass/interface/fileが、実際のcallerなしに将来用として増えていない。

### Step 7: remote HEADの再確認

完了docsを書く直前に:

```bash
git fetch origin feature/phase-05d
git rev-parse HEAD
git rev-parse origin/feature/phase-05d
```

remoteが進んでいた場合、最新commitが検証対象へ影響しないdocs-only変更だと確認できる場合を除き、最新remote HEADから再検証する。検証していないHEADをPhase完了HEADとして記録しない。

## Phase 5D最終受入条件

- 旧3 Facadeが削除済みで復活していない。
- `bind-browser-events.ts`が新しい巨大Facadeになっていない。
- browser binderからconcrete infrastructure生成・feature state/proxy ownership・route algorithmが消えている。
- event ownershipが一意で、listener cleanupをtestできる。
- composition rootからproduction dependency graphを追える。
- Route Guidance state/Worker/snapshot/matrixはRoute Guidance featureが所有する。
- purchase/hold/destination selection/resumeの既存production semanticsがTask 8移管後も維持されている。
- event/day、circle status、source、local deletionの各feature ownershipが明確である。
- architecture checkerが`bind-browser-events.ts`や新しいapp binderをconcrete infrastructure検査から特例除外していない。
- Task 10開始時のfresh snapshot failureがすべて根拠付きで解消されている。
- snapshot threshold/retry/skipでfailureを隠していない。
- `npm run verify:webapp`が成功する。
- `npm run test:e2e:ci`が成功する。
- `node scripts/audit-public-tree.mjs`が成功する。
- 最終remote HEADと検証済みHEADが一致する、またはremote側の追加が検証結果へ影響しないdocs-only変更だと確認済みである。
- Task 11用の隔離作業領域に未説明差分がない。

## 進捗更新

全条件を満たした場合のみ`docs/status/progress.md`を更新する。

- Task 8〜11を実態に合わせて完了へ変更する。
- Task 7は「最終検証中に追加blockerを発見し、Task 8〜11へ継続した」と記録する。
- Phase 5Dを完了とする。
- 検証済みremote HEADを記録する場合は、実際に最終検証したcommitだけを記載する。
- 次Phaseを自動的に開始しない。

いずれかが失敗した場合はPhase完了と書かず、失敗command・test名・原因・所有Task・再開条件を進捗へ記録する。

## 予定コミットメッセージ

検証のみでproduction差分がない場合:

```text
docs(phase-5d): complete refactor verification
```

検証中にTask 11内で許容される小修正が必要になった場合は、その修正を先に独立commitし、最新remote HEADから全検証を再実行してから完了docsをcommitする。
