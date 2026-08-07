# Phase 5D Task 8 Stage 8D-B: 購入・保留後のRoute Guidance再構築をfeatureへ移す

## この文書の位置づけ

この文書は`task-08-repair-browser-binding-ownership.md`のStage 8Dを、現在の実装状態から安全に一回ずつ進めるための補足計画である。

Stage 8D-Bについて本文と解釈が競合する場合は、この文書の具体的な範囲・契約を優先する。Stage 8D-B以外のTask 8要件は元のTask 8文書を維持する。

一回の実装担当はStage 8D-Bだけを実装する。destination selection、resume/snapshot ownership、Stage 8E以降を同じcommitへ混ぜない。

## 開始点

開始時は必ずremote `feature/phase-05d`をfetchし、現在のremote HEADから作業する。

この補足計画作成時の確認済みHEADは次である。

```text
d9978339613201b838a53ed4865fbb001b2f056c
```

このHEADでは次が成立している。

- Stage 8A〜8Cは実装済みである。
- Route GuidanceのSession、map catalog、assets loader、snapshot/matrix repository、runtime controller、Controller等はcomposition root側で生成される。
- `BrowserEventBinding`のRoute Guidance state proxyは削除され、`RouteGuidanceSession`がmutable stateの正本である。
- `app/complete-circle-visit.ts`は存在するが、現時点ではCircle Status mutationだけを行う。
- `BrowserEventBinding.handleAction()`には、status mutation成功後のpurchase/hold別NavigationState更新、route再構築、Session commitが残っている。

remote HEADが進んでいた場合は、上記状態がまだ成立することを確認してからこのStageを実行する。

## 目的

Circle Statusの保存が成功した後に行う、現在targetに対するpurchase/holdのRoute Guidance進行を`features/route-guidance/`へ移す。

Stage終了時、`BrowserEventBinding.handleAction()`は次を行ってよい。

- browser eventからaction targetを読む
- 注入済み`completeCircleVisit` operationをawaitする
- 成功/失敗resultに応じて既存UIを描画する
- GAS outboxの送信を既存どおり起動する
- Stage 8D-Dまでの暫定措置として、既存snapshot save/clear triggerを呼ぶ

次は行ってはいけない。

- `RouteGuidanceNavigationOperations.handleArrival()` / `handlePurchaseNext()` / `handleBeforeArrivalHold()`をbinderから直接呼ぶ
- map assetsを読み、purchase/hold用のroute geometryをbinderで計算する
- purchase/hold用のNavigationStateをbinderで組み立てる
- 次targetとcurrent routeをbinderで直接Sessionへcommitする

## 対象外

- destination selection / compare / confirm / cancelの移管
- resume workflowの移管
- snapshot format変更
- LocalStorage schema変更
- ALNS、distance matrix、Dijkstraのアルゴリズム変更
- UIデザイン・文言の意図的変更
- Task 9のevent binder物理分割
- architecture checkerの最終rule追加
- `// @ts-nocheck`の最終除去
- 新しいRuntime、Manager、Coordinator、EventBus、DI frameworkの追加

## 変更するファイル

### production

- `apps/webapp/js/features/route-guidance/use-cases/finish-current-circle.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/app/complete-circle-visit.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/bind-browser-events.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`（既存exportで不足する場合のみ）

### test

- `tests/finish-current-circle.test.ts`を新規作成する
- `tests/complete-circle-visit.test.ts`
- `tests/purchase-flow.test.ts`
- `tests/apps-behavior-characterization.test.ts`（production接続の証明が不足する場合のみ）
- `tests/route-guidance-controller.test.ts`
- `package.json`（新しいfocused testを既存test scriptへ含める場合のみ）

この一覧以外のproduction fileが必要になった場合は、既存の責務を再利用できない理由を先に確認する。新しい汎用層を作るために対象を広げない。

## `FinishCurrentCircleUseCase`の責務

既存`FinishCurrentCircleUseCase`を置き換える別Use Caseは作らない。このclassを、現在targetのpurchase/hold後に必要なRoute Guidance state transitionと次route再構築のownerへ拡張する。

### dependency

constructor dependencyは原則として次だけとする。

- `RouteGuidanceSession`
- `MapAreaCatalog`
- `RouteMapAssetsLoader`
- `RouteGuidanceNavigationOperations`

route計算には既存domain functionの`planRoute` / `planRouteFromGridIndex`を直接利用してよい。`StartRouteGuidanceUseCase`と同様、Use Caseからconcrete infrastructureをimportしない。

次をdependencyに追加しない。

- DOM / View
- LocalStorage concrete repository
- `RouteGuidanceRuntimeController`全体
- Worker
- Circle Status Controller
- app-level callback object

### input contract

型名の微調整は既存命名規則へ合わせてよいが、意味は次から変えない。

```ts
export type FinishCurrentCircleAction = "purchase" | "hold";

export interface FinishCurrentCircleInput {
  readonly action: FinishCurrentCircleAction;
  readonly completedSpace: string;
  readonly remainingCircles: readonly Circle[];
}
```

`remainingCircles`はCircle Status mutation後のpending circlesである。mutation前の一覧を渡さない。

### result contract

route再構築失敗は、status保存失敗と区別できなければならない。status保存成功後の想定内route failureを、app側で「端末への保存失敗」と誤表示させるthrowにしない。

原則として次のようなdiscriminated resultを返す。

```ts
export type FinishCurrentCircleResult =
  | { readonly kind: "ignored" }
  | { readonly kind: "advanced" }
  | { readonly kind: "finished" }
  | {
      readonly kind: "failed";
      readonly reason:
        | "arrival-position-unavailable"
        | "next-target-missing"
        | "route-unavailable"
        | "invalid-transition";
    };
```

名前は既存規約へ合わせてよいが、最低限`ignored`、成功して次targetへ進んだ状態、案内終了、status成功後のroute failureを呼出側が区別できること。

## 共通の処理順序

`execute()`は最初に`RouteGuidanceSession.getSnapshot()`を一度取得し、以後の計算をそのsnapshotから行う。

1. `navigationState`が無い場合は`ignored`。
2. `navigationState.targetSpace !== completedSpace`の場合も`ignored`。非current targetのstatus変更で案内を進めない。
3. Sessionへ途中状態を書かない。
4. NavigationState遷移、assets取得、次route計算、次destination解決をlocal value上で完了する。
5. 次routeを含む整合した最終状態が完成した後にだけ`session.replaceSnapshot()`を一回呼ぶ。
6. assets取得、target解決、route計算、Navigation operationのいずれかが失敗した場合、元のSession snapshotを変更せず`failed`を返す。

rollback用に一度Sessionへ書いて後から戻す実装は禁止する。

## purchaseの処理

current targetをpurchaseした場合は、次の順序を守る。

1. 現在targetへの到着位置を確定する。
2. `RouteGuidanceNavigationOperations.handleArrival()`をlocal NavigationStateへ適用する。
3. その結果へ`handlePurchaseNext()`を適用する。
4. 次targetが無ければ案内をidle化し、current/selected destinationとrouteをclearする最終snapshotを一回commitして`finished`を返す。
5. 次targetがある場合、`remainingCircles`から同じspaceのCircleを取得する。無ければSessionを変更せず`next-target-missing`。
6. `lockedFirstLeg.from`を起点に次routeを構築する。
7. routeが得られた場合だけ、NavigationState、current/selected destination、current/selected routeを同時に一回commitし`advanced`を返す。

### purchase時の到着位置

別のportalを再選択して既存current routeと到着点がずれないよう、原則として現在の`currentRoute`が既に採用しているendpointを正本にする。

- `currentRoute.targetPosition`を`svgX` / `svgY`へ使う。
- `currentRoute.cells`の最後のcellと、対象area assetsの`gridMetadata.cols`から`gridIndex`を求める。
- `source`は`"arrived-circle"`。
- `circleSpace`は`completedSpace`。
- `areaId`は現在の`navigationState.areaId`。

current routeから安全に到着位置を復元できない場合は、Sessionを変更せず`arrival-position-unavailable`とする。

既存characterizationが別portal選択を明示的に固定していることが判明した場合だけ、その既存挙動をfeature内の小さなpure helperとして再現してよい。binderへportal探索を残さない。

## holdの処理

current targetをholdした場合は、次の順序を守る。

1. `handleBeforeArrivalHold()`をlocal NavigationStateへ適用する。
2. `currentPosition`を変更しない。
3. 次targetが無ければ、idle化したNavigationStateとdestination/route clearを一回commitして`finished`を返す。
4. 次targetがある場合、`remainingCircles`からCircleを解決する。無ければSessionを変更せず`next-target-missing`。
5. `lockedFirstLeg.from`から次targetまでrouteを構築する。
6. routeが得られた場合だけ最終snapshotを一回commitして`advanced`を返す。

`lockedFirstLeg.from.type === "start"`の場合は、確定済み`currentPosition.gridIndex`を優先して`planRouteFromGridIndex()`を使う。`type === "circle"`の場合は`planRoute()`を使う。

hold時にDOM上の現在地入力をどう表示するかはStage 8D-Bの責務ではない。少なくとも`RouteGuidanceSession.navigationState.currentPosition`は進めない。DOM fieldをNavigationStateの正本として読み戻さない。

## 次routeの構築

- areaは`navigationState.areaId`から`MapAreaCatalog`で解決する。
- assetsは注入済み`RouteMapAssetsLoader`から取得する。
- `lockedFirstLeg.toSpace`と解決したnext target spaceが一致しない状態をcommitしない。
- `planRoute()` / `planRouteFromGridIndex()`が`null`を返した場合は`route-unavailable`。
- route targetをCircleへ反映する際は、現行binderの`targetWithRoute()`と同じ意味を維持する。
  - `gridDistance = Math.round(route.cost)`
  - `mapPosition = route.targetPosition`

この変換だけのために新しいViewModel frameworkを作らない。必要ならfeature内の小さなpure functionにする。

## `RouteGuidanceController`

既存`finishCurrentCircle()`を使う。別の`PurchaseRouteController`や`HoldRouteController`は作らない。

Controllerは`FinishCurrentCircleUseCase.execute()`へ入力を渡してresultを返すだけにする。route geometryやNavigationState組立てをControllerへ書かない。

概ね次の意味になる。

```ts
async finishCurrentCircle(
  input: FinishCurrentCircleInput,
): Promise<FinishCurrentCircleResult> {
  return this.deps.finishCircle.execute(input);
}
```

現在の二引数methodを維持するためだけの互換overloadは、production callerが切り替わった後に不要なら残さない。

## `complete-circle-visit.ts`

Stage 8D-Aで作ったplain functionをそのまま拡張し、新しいapp-level classやFacadeを作らない。

このfunctionが所有する順序は次だけである。

1. Circle Status `changeStatus()`を実行する。
2. status mutationがthrowした場合、そのままthrowしてRoute Guidanceを呼ばない。
3. status成功後に`ActiveEventDayReader.getPendingCircles()`相当のread-only queryからpending circlesを取得する。
4. `nextStatus === "purchased"`ならRoute Guidanceへ`action: "purchase"`、`"held"`なら`action: "hold"`として渡す。
5. Route Guidance resultとCircle Status resultを呼出側へ返す。

Route Guidance側のroute failureで成功済みCircle Statusをrollbackしない。

function parameterは実際に使うoperationだけを受ける。generic dependency bag、class、DI containerを追加しない。

## composition root

`assemble-comipath-application.ts`で既存instanceを接続する。

- `FinishCurrentCircleUseCase`へSession、MapAreaCatalog、assets loader、NavigationOperationsを渡す。
- `RouteGuidanceController`はそのUse Caseを受ける。
- app-level `completeCircleVisit`へ、既存`circleStatusController`、`activeEventDayReader.getPendingCircles`、`routeGuidanceController.finishCurrentCircle`を接続する。
- `BrowserEventBinding`へ注入する`completeCircleVisit` operationは、このproduction接続を通る。

同じSession、assets loader、NavigationOperationsをStage 8D-B専用に再生成しない。

## `BrowserEventBinding.handleAction()`

Stage 8D-B終了時には、現行のpurchase/hold route再構築blockを削除する。

具体的には次をbinderから除去する。

- purchase時のarea/assets取得
- purchase時のarrived grid/svg position解決
- `handleArrival()` / `handlePurchaseNext()`
- hold時の`handleBeforeArrivalHold()`
- purchase/hold用`lockedFirstLeg`分岐
- purchase/hold用`planRoute()` / `planRouteFromGridIndex()`
- purchase/hold後のNavigationState/currentDestination/currentRouteの直接commit

binderに残してよいのは、`completeCircleVisit` resultに対するUI処理である。

既存のuser-visible behaviorを維持する。

- status保存成功のpurchase/hold toast
- local save failure時は成功toastを出さない
- GAS失敗でもlocal statusを維持する
- route再構築失敗時は成功済みstatusを維持し、案内を旧整合状態のまま保持する
- route failureを「端末への保存失敗」と表示しない

Stage 8D-Dまでは、feature operation成功後に既存`saveNavigationSnapshot()` / `clearNavigationSnapshot()`をbinder側で呼ぶことを暫定的に許容する。ただしsnapshot persistence以外のRoute Guidance business logicをそこへ残さない。

## test

### `tests/finish-current-circle.test.ts`

実network/LocalStorage/DOMを使わないfocused testとする。最低限次を固定する。

1. current target purchase
   - current positionが購入circleへ進む。
   - 次targetへ切り替わる。
   - next routeを含む最終snapshotが一回だけcommitされる。
2. current target hold
   - current positionが変わらない。
   - held targetがorderから外れ、次targetへ進む。
3. non-current target
   - `ignored`。
   - assets loaderを呼ばない。
   - Sessionを変更しない。
4. no remaining target
   - `finished`。
   - destination/routeがclearされる。
5. route reconstruction failure
   - `failed`。
   - Session snapshotが実行前とdeep equalである。
6. purchase arrival positionを確定できない
   - `arrival-position-unavailable`。
   - Sessionを変更しない。
7. next targetがNavigationStateにはあるが`remainingCircles`に無い
   - `next-target-missing`。
   - Sessionを変更しない。

### `tests/complete-circle-visit.test.ts`

最低限次を追加する。

- status成功後にpending circlesを取得してRoute Guidanceを一回呼ぶ。
- purchaseとholdで異なるactionを渡す。
- status mutation throw時はpending queryもRoute Guidanceも呼ばない。
- Route Guidanceが`failed`を返してもCircle Status resultを失わない。

### production integration

`tests/purchase-flow.test.ts`または`tests/apps-behavior-characterization.test.ts`で、composition root相当のproduction wiringから次を一つ以上証明する。

```text
browser action
 -> completeCircleVisit
 -> CircleStatus changeStatus
 -> pending reader
 -> RouteGuidanceController.finishCurrentCircle
 -> FinishCurrentCircleUseCase
 -> RouteGuidanceSession
```

fake `completeCircleVisit`だけを呼んだことをTask 8D-B完了証拠にしない。

## 検証

Stage 8D-Bの実装途中ではfocused testから始める。

```bash
npx vitest run --root . \
  tests/finish-current-circle.test.ts \
  tests/complete-circle-visit.test.ts \
  tests/route-guidance-controller.test.ts \
  tests/purchase-flow.test.ts \
  tests/apps-behavior-characterization.test.ts
```

focused testがGREENになった後に次を実行する。

```bash
npm run test:route-guidance
npm run test:webapp
npm run check:webapp
git diff --check
```

Stage 8D-Bではsnapshot画像を更新しない。E2E visual failureをこのStageへ吸収しない。

## 受入条件

- Circle Status保存成功後のcurrent-target purchase/hold route進行が`FinishCurrentCircleUseCase`から追える。
- non-current targetのstatus変更はRoute Guidance Sessionを変更しない。
- purchaseはconfirmed current positionを購入circleへ進める。
- holdはconfirmed current positionを進めない。
- 次route構築失敗時、Sessionは実行前の整合したsnapshotのままである。
- route failureでも成功済みCircle Statusをrollbackしない。
- `BrowserEventBinding.handleAction()`にpurchase/hold固有のroute geometry、NavigationOperations、NavigationState commitが残っていない。
- `complete-circle-visit.ts`はCircle StatusとRoute Guidanceの順序調整だけであり、grid、assets、snapshot schema、Workerを知らない。
- production wiring testがfake operationだけではなく実`FinishCurrentCircleUseCase`/Sessionへ到達する。
- focused tests、`test:route-guidance`、`test:webapp`、`check:webapp`、`git diff --check`が成功する。

## Stage 8D-B後

Stage 8D-B完了後はそこでcommit・検証・独立レビューを行い、同じ実装担当に続けてStage 8D-Cを実装させない。

次のStage 8D-Cではdestination selection / preview / compare / confirm / cancelを既存`ChangeDestinationUseCase`/`RouteGuidanceController`へ移す。resumeとsnapshot ownershipはその後のStage 8D-Dで扱う。
