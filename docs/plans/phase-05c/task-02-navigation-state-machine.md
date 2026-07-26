# Phase 5C Task 2: Navigation State Machine

**Status:** Not started  
**Depends on:** Phase 5C Task 1  
**Commit candidate:** `feat(navigation): add explicit arrival state`

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
- [x] held target選択時にcircle stateをpendingへ戻すservice連携testを書く。
- [x] resetStartがnavigationだけをclearする失敗testを書く。
- [x] REDを確認する。

```bash
npx vitest run tests/navigation-state.test.ts
```

- [x] pure reducerまたはstate machineを実装する。
- [x] 不正eventを安全なdomain errorとして拒否する。
- [x] appから直接複数fieldを書き換えず、transition API経由にする。
- [x] current targetとlocked first legを同じtransactionで更新する。
- [x] GREENを確認する。

```bash
npx vitest run tests/navigation-state.test.ts tests/event-day-transition-service.test.ts
npm run check:webapp
git diff --check
```

## Acceptance criteria

- circle stateとnavigation stateが別型である。
- `到着した`までcurrent positionが変わらない。
- optimizerが現在区間を変更できない。
- resetStartがcircle stateを変えない。
- map、Worker、UIの実装を含めない。
