# Phase 8 Task 6: First-launch Onboarding Design

## Goal

既存の常設 `user-guide-dialog` を再利用し、通常のproduction browser runtimeで初回だけ自動表示する。

Task 6は新しいwizardを作るTaskではない。すでにPhase 6 Task 8で実装済みの「使い方」dialog、headerの常設「使い方」button、focus trap、Escape close、CSV/GAS/route/gallery/outbox説明を正本として使う。

## Current verified state

Task 6 planning branchは、Phase 8 Task 5 implementation branch `docs/phase-08-task-05-targeted-application-refactor-plan` のcurrent remote HEADから作成する。

Task 5 implementation branchで確認した現状:

- `apps/webapp/js/components/user-guide-dialog.ts` は既存のread-only guideで、`open` property、focus trap、Escape、backdrop、close button、`user-guide-close` eventを持つ。
- `apps/webapp/index.html` のheaderには `#btn-open-user-guide` が常設されている。
- `BrowserApplication` は初期化時に `#btn-open-user-guide` のclickで `#user-guide-dialog.open = true` にしている。
- 現行guideはCSV、GAS、地図/経路変更、一覧/スワイプ、未送信GASを説明する。
- 現行guideは自動表示しない。
- `apps/webapp/js/data/local-state-adapters.ts` にはapp-level UI preferenceであるroute motion設定のsafe read/write patternがあり、`StorageService`を利用している。
- `StorageService` は利用可能ならbrowser `localStorage`、利用できなければin-memory fallbackを使う。
- E2Eのfictional registryは `tests/e2e/fixture-registry.ts` の `routeDemoEventRegistry(page)` を複数specが共有している。
- `?demo_ui=1` はdev-only UI fixtureであり、production first-launch behaviorの対象ではない。

## Chosen behavior

### First launchの定義

Task 6でいう「初回」は、browser storageに次のmarkerがまだ保存されていない通常runtimeの起動を指す。

```text
key:   meirochou.first-use-guide-seen
value: 1
```

これはevent/day単位ではなくbrowser profile単位のUI preferenceである。

したがって次では再表示しない。

- event/day切替
- CSV/GAS source再読込
- local event/day削除
- 「全イベントデータ削除」
- route snapshot削除
- map bundle更新

browser storage自体を消した場合はmarkerも消えるため、次回起動時に再表示されてよい。

### Auto-open sequence

通常runtimeでguide elementが存在するとき:

1. manual header button wiringを維持する。
2. `?demo_ui=1` ならauto-open判定を行わない。markerも書かない。
3. 通常runtimeならseen markerを読む。
4. seenでなければ `userGuideDialog.open = true` にする。
5. dialogを開いた直後にseen markerを書き込む。

markerは「guideを最後まで読んだ」ことではなく「first-launch guideを一度提示した」ことを表す。

close時ではなくauto-open時にmarkする理由:

- wizard completion stateを新設しない。
- reload/close操作の追跡をしない。
- `user-guide-close` listenerをapplicationへ追加せず、lifecycleを増やさない。
- 一度提示した後に毎回強制表示される状態を避ける。
- manual「使い方」buttonが常に残るため、途中で閉じても再確認できる。

### Storage failure

first-launch UI preferenceはapp bootを止めてはいけない。

`readFirstUseGuideSeen()`:

- markerがexactly `"1"` なら `true`。
- missing / unknown valueは `false`。
- storage readがthrowした場合は `true` として扱う。

read failure時にseen扱いする理由は、persistent storageが壊れた環境で毎回modalを強制表示しないためである。常設manual guideは引き続き利用できる。

`markFirstUseGuideSeen()`:

- `"1"` を書く。
- write failureはcatchして無視する。
- app boot / guide表示は継続する。

## Guide copy

新しいdialog/component/wizardは作らない。

既存 `user-guide-dialog.ts` の冒頭introだけをfirst-launchにも自然な文面へ更新する。

要求する意味:

- 最初に「管理」からCSVまたはGASで巡回リストを用意する。
- 現在地を設定する。
- 「次の目的地を検索」で案内開始する。
- 閉じてもheaderの「使い方」からいつでも再表示できる。

CSV/GAS contract説明、route comparison、gallery swipe、outbox説明の意味は変更しない。

## Placement

### Persistent state

既存app-level preference adapterへ追加する。

```text
apps/webapp/js/data/local-state-adapters.ts
```

追加interface:

```ts
interface FirstUseGuideStorage {
  getString(key: string, fallback?: string): string;
  setString(key: string, value: string): void;
}
```

追加functions:

```ts
export function readFirstUseGuideSeen(
  storage: FirstUseGuideStorage = new StorageService(),
): boolean

export function markFirstUseGuideSeen(
  storage: FirstUseGuideStorage = new StorageService(),
): void
```

既存route-motion preference functionsのerror handling patternを再利用する。

### Browser shell

`BrowserApplication`の既存user guide wiringにだけauto-openを追加する。

新しいstateful onboarding controllerは作らない。

BrowserApplicationへ次のstateを追加しない。

```text
onboardingStep
onboardingCompleted
onboardingOpen
onboardingRequestVersion
```

`userGuideDialog.open` がdialog visibilityの唯一のownerであり、seen markerはpersistent preferenceの唯一のownerである。

### Component

`user-guide-dialog.ts` は既存のdialog behaviorを維持する。

変更はintro copyのみ。次を変更しない。

- `open` contract
- `user-guide-close` event
- focus trap
- Escape behavior
- backdrop close
- close button
- aria dialog semantics

## E2E isolation

Task 6導入後、markerがないnormal `/` navigationはguideをauto-openする。既存E2Eの多くはfictional demo registryをnormal `/`へrouteしており、first-launch guideをテスト目的としていない。

既存specを一件ずつ変更しない。

共有fixture `routeDemoEventRegistry(page)` にoptionを追加する。

```ts
export interface DemoEventRegistryRouteOptions {
  readonly firstUseGuideSeen?: boolean;
}

export async function routeDemoEventRegistry(
  page: Page,
  options: DemoEventRegistryRouteOptions = {},
): Promise<void>
```

default:

```ts
firstUseGuideSeen = true
```

trueならnavigation前のinit scriptでmarker `"1"` をseedする。

これにより既存E2EはTask 6以前と同じ画面状態から開始する。

Task 6専用E2Eだけ:

```ts
await routeDemoEventRegistry(page, { firstUseGuideSeen: false });
```

としてmarkerなしのnormal `/` を検証する。

ただし `webapp.spec.ts` は現在file-level `beforeEach`でdefault helperを呼ぶため、同じtestで二重route/setupをしない。専用testは次のどちらか小さい方で実装する。

1. `tests/e2e/first-launch-onboarding.spec.ts` を新設し、自分のbeforeEachで `{ firstUseGuideSeen: false }` を使う。
2. 既存`webapp.spec.ts`のbeforeEachをtest title分岐させる。

推奨は1。既存webapp specのfixture semanticsを変えず、onboarding専用specを独立できるためである。

## Dedicated E2E expectations

normal `/`、markerなし:

- `#user-guide-dialog [role="dialog"]` がvisibleになる。
- introに「管理」「次の目的地を検索」「使い方」が含まれる。
- `localStorage.getItem("meirochou.first-use-guide-seen") === "1"`。
- Escapeで閉じられる。
- headerの「使い方」buttonから再度開ける。
- page reload後は自動では開かない。
- reload後もmanual buttonから開ける。

`?demo_ui=1`:

- markerなしでもauto-openしない。
- Task 6のauto-open処理だけを理由にmarkerを書かない。
- manual buttonからguideを開ける既存behaviorは維持する。

## Unit tests

### Preference adapter

新規:

```text
tests/first-use-guide-state.test.ts
```

検証:

- missing -> unseen (`false`)
- `"1"` -> seen (`true`)
- unknown value -> unseen
- mark writes exact key/value
- read throw -> seen (`true`)
- write throw -> does not throw

### Guide copy / component regression

既存:

```text
tests/user-guide-dialog.test.ts
```

既存accessibility/open-close assertionsを維持し、introがfirst-launch sequenceを説明することを追加する。

既存CSV/GAS/route/gallery/outbox assertionsを削除しない。

## No new abstraction

Task 6では次を作らない。

```text
OnboardingController
OnboardingManager
OnboardingService
OnboardingStore
OnboardingStep
TutorialRouter
TourEngine
```

新しいfeature directoryも作らない。

理由: persistenceはboolean marker一つ、render surfaceは既存dialog一つ、trigger pointは既存BrowserApplication wiring一箇所で完結する。

## Protected behavior

Task 6は次を変更しない。

- event registry / map bundle contract
- Event Day transition
- CSV/GAS parser contract
- local event/day schema
- route snapshot / matrix schema
- Route Guidance / ALNS / Dijkstra
- gallery swipe semantics
- X post monitoring
- offline catalog caching
- data deletion semantics
- Task 5 management projection / binder responsibility
- Task 5 Route Guidance assembly

## Allowed implementation files

Expected production changes:

```text
M apps/webapp/js/data/local-state-adapters.ts
M apps/webapp/js/app/browser-application.ts
M apps/webapp/js/components/user-guide-dialog.ts
```

Expected tests:

```text
A tests/first-use-guide-state.test.ts
M tests/user-guide-dialog.test.ts
M tests/e2e/fixture-registry.ts
A tests/e2e/first-launch-onboarding.spec.ts
```

Final progress update:

```text
M docs/status/progress.md
```

No CSS/index changes are expected because the existing dialog/button already exist.

## Verification

Focused unit:

```bash
npx vitest run --root . \
  tests/first-use-guide-state.test.ts \
  tests/user-guide-dialog.test.ts \
  tests/apps-behavior-characterization.test.ts
```

Focused E2E:

```bash
npx playwright test tests/e2e/first-launch-onboarding.spec.ts --project=chromium
```

Adjacent existing guide E2E:

```bash
npx playwright test tests/e2e/webapp.spec.ts --project=chromium --grep "使い方"
```

Full:

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

## Acceptance

Task 6は次をすべて満たす場合のみimplementation completeとする。

1. normal runtimeのmarkerなし初回起動で既存guideが自動表示される。
2. auto-open時にexact marker `meirochou.first-use-guide-seen = "1"` を保存する。
3. reloadで自動再表示しない。
4. manual「使い方」は常に再表示できる。
5. `?demo_ui=1`ではauto-openしない、Task 6 markerを書かない。
6. storage read/write failureがapp bootを止めない。
7. event/day削除や切替にonboarding markerを結び付けない。
8. existing guide accessibility behaviorを維持する。
9. existing guideの実データ契約説明を弱めない。
10. wizard / tour engine / onboarding state machineを追加しない。
11. Task 5で整理したbrowser/app boundariesを逆戻りさせない。
12. full `npm run verify` と `npm run test:e2e:ci` がgreen。
13. Task 7 operator documentationを先取りしない。
