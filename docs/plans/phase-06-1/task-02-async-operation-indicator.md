# Phase 6.1 Task 2: 右下async operation indicatorを追加

## 目標

GAS等の長時間処理が「いつ始まり、いつ終わったか」を常に確認できる右下indicatorを追加する。Phase 7のお品書きoffline保存でも再利用できる汎用componentにする。

## やってはいけないこと

- GAS専用の巨大state managerを新設しない。
- loadingを通常toastの3秒timeoutへ載せない。
- operation完了前にloadingを消さない。
- success/errorだけを表示し、進行中状態を隠さない。
- componentからGAS fetchを直接行わない。

## Files

**Create:**
- `apps/webapp/js/components/async-operation-indicator.ts`

**Modify:**
- `apps/webapp/index.html`
- `apps/webapp/css/base.css`または責務に合う既存CSS
- `apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts`
- `apps/webapp/js/app/browser-application.ts`または既存composition wiringの最小箇所

**Test:**
- `tests/async-operation-indicator.test.ts`
- Circle Data Source既存test
- `tests/e2e/management.spec.ts`

## Interfaces

```ts
export type AsyncOperationStatus =
  | { kind: "idle" }
  | { kind: "loading"; label: string; progress?: { current: number; total: number } }
  | { kind: "success"; label: string }
  | { kind: "error"; label: string };
```

Circle Data Source側は`busy: boolean`だけではなく、少なくとも現在operationを識別できるようにする。

```ts
export type CircleDataSourceOperation =
  | "idle"
  | "gas-sheet-list"
  | "gas-preview"
  | "csv-preview"
  | "apply-preview";
```

## Steps

- [ ] **Step 1: componentのRED testを書く**

```ts
it("keeps loading visible until status changes", async () => {
  indicator.status = { kind: "loading", label: "GASからデータを読み込み中…" };
  await indicator.updateComplete;
  expect(indicator.textContent).toContain("GASからデータを読み込み中");
});

it("announces success and returns to idle after the success display window", async () => {
  // fake timers, success roughly 1500ms then hidden
});
```

- [ ] **Step 2: REDを確認する**

```bash
npx vitest run --root . tests/async-operation-indicator.test.ts
```

- [ ] **Step 3: light-DOM componentを実装する**

right-bottom fixed、safe-area対応、`role="status"`/`aria-live="polite"`を使う。loading spinnerはCSS animationのみ。

- [ ] **Step 4: Circle Data Source Sessionへoperation種別を追加する**

`beginRequest()`へoperationを渡すか、同等の単一契約で`busy`とoperationが矛盾しないようにする。

```ts
const generation = session.beginRequest("gas-preview");
```

success/error/cancel/resetでoperationを`idle`へ戻す。

- [ ] **Step 5: controllerの各処理を正しいlabelへ写像する**

- sheet list: `シート一覧を取得中…`
- GAS preview: `GASからデータを読み込み中…`
- CSV preview: `CSVを読み込み中…`
- apply: `読み込み結果を保存中…`

GAS preview成功時は`GASデータを読み込みました`を表示する。preview取得成功とapply成功を混同しないよう、apply成功後の表示文言は`データを保存しました`としてよい。

- [ ] **Step 6: E2Eで通信遅延を入れてloadingの寿命を固定する**

Playwright routeでGAS応答を意図的に遅延させ、応答前はindicatorがvisible、応答後にsuccessへ変化することを確認する。

- [ ] **Step 7: focused/full verification**

```bash
npx vitest run --root . tests/async-operation-indicator.test.ts
npm run test:webapp
npm run test:e2e:ci -- --grep "GAS|読み込み"
npm run check:webapp
git diff --check
```

- [ ] **Step 8: commit**

```bash
git add apps/webapp/index.html apps/webapp/css \
  apps/webapp/js/components/async-operation-indicator.ts \
  apps/webapp/js/features/circle-data-source tests
git commit -m "feat(ui): show async data operation status"
```

## 受入条件

- 通信が続いている間はindicatorが消えない。
- success/errorがloadingと見分けられる。
- indicator表示が設定panelを開いているかどうかに依存しない。
- indicator自体がnetwork requestを所有しない。
- Phase 7からprogress付きloadingを再利用できるcontractになっている。
