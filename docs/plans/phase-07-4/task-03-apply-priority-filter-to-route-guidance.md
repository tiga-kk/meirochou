# Phase 7.4 タスク3: priority条件を通常の経路案内へ適用

## 目的

現在の未購入・非保留サークルから、ユーザーが選んだpriorityだけを巡回対象にしてRoute Guidanceを開始・再計算できるようにする。対象外priorityが初期目的地だけでなくALNS入力へも混入しないことを保証する。

## 対象外

- ALNS objectiveの変更。
- priority設定のLocalStorage永続化。
- 進行中routeの自動再計算。
- 保留サークルを巡回対象へ含めるオプション。

## 前提と依存関係

Task 2完了。

## 読むべき文書と既存実装

- `apps/webapp/index.html`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/app/bind-browser-events.ts`
- `apps/webapp/js/features/route-guidance/use-cases/start-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/build-route-optimization-problem.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/route-guidance-runtime-controller.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `tests/start-route-guidance.test.ts`
- `tests/optimization-input-adapter.test.ts`
- `tests/navigation-runtime-controller.test.ts`
- `tests/e2e/webapp.spec.ts`

## 対象ファイル

### 作成候補

- `apps/webapp/js/features/route-guidance/ui/route-priority-filter-model.ts`
- `tests/route-priority-filter-model.test.ts`

UI stateの数行だけで済む場合は専用classを作らず、純粋な表示modelだけに留める。

### 変更

- `apps/webapp/index.html`
- `apps/webapp/js/app/browser-application.ts`
- 必要なら`apps/webapp/js/app/bind-browser-events.ts`
- `apps/webapp/css/target.css`または既存の適切なform CSS
- Route Guidance focused test
- `tests/e2e/webapp.spec.ts`

### 削除

なし。

## 実装手順

1. 現在地入力付近に「巡回対象」のpriority chip群を表示するRED E2Eを作る。候補値は現在の未購入・非保留サークルから動的に取得する。
2. chipは完全一致の複数選択にし、未選択は「すべて」。
3. 通常の「次の目的地を検索」開始時、候補へTask 2のfilterを適用してから`StartRouteGuidanceUseCase`へ渡す。
4. filter後0件ならRoute Guidanceを壊さず「この条件に一致する巡回対象はありません」と表示する。
5. ALNS起動用`pendingCircles`にも同じfilter済み集合を渡す。Startだけfilterし、optimizerへ全件を戻す経路を残さない。
6. 進行中にchipを変えても`routeGuidanceSession`を即変更しない。案内中は「この条件で経路を再計算」操作を明示し、その操作だけがfilter済み候補で新しいrouteを開始する。
7. filtered routeの`bestOrder`がsnapshotへ保存される既存契約を維持する。priority UI選択値の永続化は追加しない。
8. 保留は既存pending契約に従い常に対象外とする。

## テスト方針

- 10 / 9を選ぶとpriority 8や未設定が`StartRouteGuidanceUseCase`入力へ入らない。
- 最初のtargetも選択priority内。
- `buildOptimizationProblem()`へ渡る`pendingCircles`にも対象外spaceがない。
- filter後0件でworkerを起動しない。
- 進行中にchipだけ変えてもcurrent targetは変わらない。
- 明示再計算後だけ新filterが適用される。
- resumeしたfiltered routeは保存済み`bestOrder`を維持する。

## 検証コマンド

```bash
npx vitest run --root . tests/start-route-guidance.test.ts tests/optimization-input-adapter.test.ts tests/navigation-runtime-controller.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "優先度|巡回|経路"
npm run check:webapp
git diff --check
```

## 受入条件

- priority条件に一致するサークルだけが巡回対象になる。
- ALNSのpriority value計算自体は変更していない。
- filter変更だけで進行中routeが勝手に変わらない。
- 保留が経路へ再混入しない。
- filtered routeのresume契約を壊さない。

## 予定コミットメッセージ

```text
feat(phase-07-4): filter route guidance by priority
```
