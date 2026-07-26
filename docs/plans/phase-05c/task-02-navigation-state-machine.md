# Phase 5C Task 2: Navigation State Machine

**Status:** 完了（レビュー修正・検証済み）
**Depends on:** Phase 5C Task 1  
**Commit candidate:** `fix(navigation): validate task 2 state transitions`

## Goal

circle stateとは独立したnavigation stateを追加し、始点、現在位置、現在目的地、到着確認、現在区間固定を明確にする。

## Required state

```ts
export type NavigationStage = "idle" | "navigating" | "atTarget";

export interface ConfirmedPosition {
  readonly areaId: string;
  readonly gridIndex: number;
  readonly svgX: number;
  readonly svgY: number;
  readonly source: "manual-start" | "arrived-circle";
  readonly circleSpace?: string;
}

export interface NavigationState {
  readonly stage: NavigationStage;
  readonly areaId: string | null;
  readonly currentPosition: ConfirmedPosition | null;
  readonly targetSpace: string | null;
  readonly lockedFirstLeg: readonly [string, string] | null;
  readonly provisionalOrder: readonly string[];
  readonly bestOrder: readonly string[];
}
```

始点がcircleではないため、locked legの始点表現がspaceだけでは足りない場合は既存型に合わせて`RouteEndpointId` unionを定義する。

## Required transitions

- idle + setStart → navigatingまたは候補なしidle
- navigating + changeTarget → navigating
- navigating + arrive → atTarget
- atTarget + purchase/hold/exclude → navigatingまたは完了
- navigating + holdTarget → navigatingまたは完了
- any + resetStart → idle
- optimizer result → bestOrderだけを更新し、targetとlockedFirstLegを変更しない

## TDD procedure

- [x] 到着前はcurrent positionがtargetへ移らない失敗testを書く。
- [x] arriveでcurrent positionがtarget endpointへ移り、stageがatTargetになる失敗testを書く。
- [x] optimizer resultでtargetが変わらない失敗testを書く。
- [x] manual target changeでold pending targetが候補へ戻る失敗testを書く。
- [ ] held target選択時にcircle stateをpendingへ戻すservice連携testを書く（circle stateとnavigation stateの境界を保つためTask 3へ移管）。
- [x] resetStartがnavigationだけをclearする失敗testを書く。
- [x] REDを確認する。

```bash
npx vitest run --root . tests/navigation-state.test.ts
```

- [x] pure reducerまたはstate machineを実装する。
- [x] 不正eventを安全なdomain errorとして拒否する。
- [x] appから直接複数fieldを書き換えず、transition API経由にする。
- [x] current targetとlocked first legを同じtransactionで更新する。
- [x] GREENを確認する。

```bash
npx vitest run --root . tests/navigation-state.test.ts tests/event-day-transition-service.test.ts
npm run check:webapp
git diff --check
```

## 実績

- `arrive`で現在のtarget、area、到着circleを検証し、取り違えた到着位置や不正なstage遷移をdomain errorで拒否するようにした。
- `changeTarget`で新targetを`provisionalOrder`と`bestOrder`の先頭へ移し、旧targetを候補へ残すようにした。
- `processVisitStateChange`はidle中の呼び出しを拒否し、navigating中のhold操作とatTarget後の状態更新は既存の遷移契約どおり許可する。
- `setStart`でpositionとareaの不一致、およびcircle endpoint情報の欠落を拒否するようにした。
- focused testは修正前に3件の不具合をREDで確認し、修正後に`tests/navigation-state.test.ts`と`tests/event-day-transition-service.test.ts`の23件をGREENで確認した。
- held targetのcircle state変更とnavigation service連携は、circle stateをnavigation stateへ混ぜないためTask 3へ移管した。
- `npm run test:e2e`は25 passed、6件の既存visual snapshot差分、8 skipped。今回の変更はUIを含まないためsnapshotは更新していない。

## Acceptance criteria

- circle stateとnavigation stateが別型である。
- `到着した`までcurrent positionが変わらない。
- optimizerが現在区間を変更できない。
- resetStartがcircle stateを変えない。
- map、Worker、UIの実装を含めない。
