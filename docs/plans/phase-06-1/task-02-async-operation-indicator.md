# Phase 6.1 Task 2: 右下async operation indicatorを追加

## 目標

GAS等の長時間処理が「いつ始まり、いつ終わったか」を常に確認できる右下indicatorを追加する。Phase 7のお品書きoffline保存でも再利用できる汎用componentにする。

## やってはいけないこと

- GAS専用の巨大state managerを新設しない。
- loadingを通常toastの3秒timeoutへ載せない。
- operation完了前にloadingを消さない。
- success/errorだけを表示し、進行中状態を隠さない。
- componentからGAS fetchを直接行わない。
- `busy=true`なのに`operation="idle"`、または`busy=false`なのに非idle operationが残るsnapshotを通知しない。
- GASだけを接続して、enumに存在するCSV/apply operationを本番では到達不能のまま残さない。

## 対象ファイル

**作成:**
- `apps/webapp/js/components/async-operation-indicator.ts`
- `tests/async-operation-indicator.test.ts`

**変更:**
- `apps/webapp/index.html`
- `apps/webapp/css/base.css`
- `apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `tests/source-manager-app.test.ts`
- `tests/circle-data-source-cancellation.test.ts`
- `tests/management-session.test.ts`
- `tests/e2e/management.spec.ts`

## インターフェース

```ts
export type AsyncOperationStatus =
  | { kind: "idle" }
  | { kind: "loading"; label: string; progress?: { current: number; total: number } }
  | { kind: "success"; label: string }
  | { kind: "error"; label: string };
```

Circle Data Source側は`busy: boolean`だけではなく、現在operationを識別できるようにする。

```ts
export type CircleDataSourceOperation =
  | "idle"
  | "gas-sheet-list"
  | "gas-preview"
  | "csv-preview"
  | "apply-preview";
```

Session snapshotに`operation`を追加し、`busy`とoperationが常に同じmutationで更新されるようにする。

```ts
interface CircleDataSourceSessionSnapshot {
  // existing fields
  readonly busy: boolean;
  readonly operation: CircleDataSourceOperation;
}
```

既存`requestGeneration`をそのままoperationの世代管理にも使い、新しい独立generationを追加しない。`beginRequest(operation)`は`busy=true`と非idle operationを同時に設定する。terminal transitionは必ず`busy=false`, `operation="idle"`を同時に設定する。

`BrowserApplication`は既存Circle Data Source Session subscriptionからsnapshotを受け取り、indicatorのrender-only statusへ写像する。`assemble-comipath-application.ts`はindicator DOM/componentとsession/controllerを既存compositionへ接続するだけにし、network stateを新しく所有しない。

## 手順

- [ ] **Step 1: componentのRED testを書く**

fake timersを使い、loadingは自動消去されず、successだけが約1500ms後にidleへ戻ることを固定する。

```ts
it("keeps loading visible until status changes", async () => {
  indicator.status = { kind: "loading", label: "GASからデータを読み込み中…" };
  await indicator.updateComplete;
  vi.advanceTimersByTime(10_000);
  await indicator.updateComplete;
  expect(indicator.textContent).toContain("GASからデータを読み込み中");
});

it("returns success to idle after the success display window", async () => {
  indicator.status = { kind: "success", label: "GASデータを読み込みました" };
  await indicator.updateComplete;
  expect(indicator.textContent).toContain("GASデータを読み込みました");
  vi.advanceTimersByTime(1_500);
  await indicator.updateComplete;
  expect(indicator.textContent?.trim()).toBe("");
});
```

- [ ] **Step 2: Session lifecycleのRED testを書く**

`tests/management-session.test.ts`で最低限次を固定する。

```ts
const generation = session.beginRequest("gas-preview");
expect(session.getSnapshot()).toMatchObject({
  busy: true,
  operation: "gas-preview",
});
expect(session.isCurrentRequest(generation)).toBe(true);
```

`setPreview`, `setSheetNames`, `setError`, cancel/reset等のterminal pathでは`busy=false`, `operation="idle"`が一つのsnapshotとして通知されることを確認する。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . \
  tests/async-operation-indicator.test.ts \
  tests/management-session.test.ts
```

- [ ] **Step 4: light-DOM componentを実装する**

right-bottom fixed、safe-area対応、`role="status"`/`aria-live="polite"`を使う。loading spinnerはCSS animationだけで実装する。

`apps/webapp/index.html`にはmain scriptより前に次のhostを1つだけ置く。

```html
<async-operation-indicator id="async-operation-indicator"></async-operation-indicator>
```

- [ ] **Step 5: Circle Data Source Sessionへoperation種別を追加する**

`beginRequest(operation)`で`busy=true`とoperationを同時に設定する。

```ts
const generation = session.beginRequest("gas-preview");
```

success/error/cancel/resetでは`busy=false`, `operation="idle"`へ同時に戻す。request generationによるstale response防止は維持する。`setBusy(false)`だけでoperationが残る旧pathを作らない。

- [ ] **Step 6: controllerの全operationを本番pathへ接続する**

各operationの開始点を次へ固定する。

- sheet list: `runRequest()`開始時に`gas-sheet-list`
- GAS preview: `runRequest()`開始時に`gas-preview`
- CSV preview: `handleCsvFileFromFile()`でFile読込を始める前、または`handleCsvFile()`の同期preview直前に`csv-preview`
- apply: `applyPreview()`でUse Caseをawaitする前に`apply-preview`

GASだけが`runRequest()`を通る現行構造を前提に、CSV/applyをenumへ追加しただけで終わらせない。CSV/applyで`beginRequest()`を再利用する場合も、request generation以外の別世代管理は追加しない。

既存`showLoading()`/`showReady()`/`showError()`のsource-manager表示は削除せず、右下indicatorは補助的な全画面statusとして追加する。

- [ ] **Step 7: BrowserApplicationでstatus labelへ写像する**

Circle Data Source Session snapshotを次へ写像する。

```text
gas-sheet-list loading -> シート一覧を取得中…
gas-preview loading    -> GASからデータを読み込み中…
csv-preview loading    -> CSVを読み込み中…
apply-preview loading  -> 読み込み結果を保存中…
GAS preview success    -> GASデータを読み込みました
apply success          -> データを保存しました
request error          -> 読み込みに失敗しました
```

successを表示するため、単に`operation=idle`へ戻すだけで直前operationを失わないよう、controllerから成功通知をBrowserApplicationへ渡すか、Sessionへ一時的success stateを持たせる。二重の独立state machineは作らず、どちらか一方へ固定する。

推奨はcontroller callbackでrender-only success/errorを通知し、request truthはSessionの`busy/operation/errorCode`に残す方式とする。callbackはstale/cancelされたrequestでは発火させず、`runRequest()`のcurrent generation確認後またはCSV/applyの成功確定後だけ発火させる。

- [ ] **Step 8: cancellation/stale response回帰testを更新する**

`tests/circle-data-source-cancellation.test.ts`でcancel後に`busy=false`, `operation="idle"`となり、古いresponseがindicatorをsuccessへ戻さないことを確認する。

`tests/source-manager-app.test.ts`でBrowserApplication wiringがsession loadingをindicatorへ反映することを確認する。

CSV previewとapply previewも実際のcontroller pathから対応するloading operationへ到達するtestを追加し、enum存在だけの偽陽性を避ける。

- [ ] **Step 9: E2Eで通信遅延を入れてloadingの寿命を固定する**

`tests/e2e/management.spec.ts`でPlaywright routeを使ってGAS応答を遅延させる。

1. request開始。
2. indicatorがvisibleで`GASからデータを読み込み中…`。
3. responseをまだ返さない間、indicatorが残る。
4. responseを返す。
5. preview/apply完了に応じたsuccess表示へ変わる。
6. success表示時間後に消える。

- [ ] **Step 10: focused/full verification**

```bash
npx vitest run --root . \
  tests/async-operation-indicator.test.ts \
  tests/management-session.test.ts \
  tests/source-manager-app.test.ts \
  tests/circle-data-source-cancellation.test.ts
npm run test:webapp
npx playwright test tests/e2e/management.spec.ts --grep "GAS|読み込み"
npm run check:webapp
git diff --check
```

- [ ] **Step 11: commit**

```bash
git add apps/webapp/index.html apps/webapp/css/base.css \
  apps/webapp/js/components/async-operation-indicator.ts \
  apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session.ts \
  apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts \
  apps/webapp/js/app/browser-application.ts \
  apps/webapp/js/app/assemble-comipath-application.ts \
  tests/async-operation-indicator.test.ts \
  tests/management-session.test.ts \
  tests/source-manager-app.test.ts \
  tests/circle-data-source-cancellation.test.ts \
  tests/e2e/management.spec.ts
git commit -m "feat(ui): show async data operation status"
```

## 受入条件

- 通信または対象operationが続いている間はindicatorが消えない。
- success/errorがloadingと見分けられる。
- indicator表示が設定panelを開いているかどうかに依存しない。
- cancel/stale responseで偽successを表示しない。
- `busy`と`operation`が矛盾するSession snapshotが通知されない。
- GAS/CSV/applyの列挙したoperationが実際のcontroller pathから到達可能である。
- indicator自体がnetwork requestを所有しない。
- Phase 7からprogress付きloadingを再利用できるcontractになっている。
