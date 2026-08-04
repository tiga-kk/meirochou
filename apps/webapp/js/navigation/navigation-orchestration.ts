import type {
  CircleRecord,
  ConfirmedPosition,
  LockedLeg,
  RouteEndpointId,
} from "../features/event-day/domain/application-contract-types";
import type { NavigationState } from "../features/route-guidance/domain/navigation-state";

export interface StartNavigationInput {
  readonly navState: NavigationState;
  readonly startPosition: ConfirmedPosition;
  readonly pendingCircles: readonly CircleRecord[];
  /** Map of space -> startDistance (weighted distance) */
  readonly startDistances: ReadonlyMap<string, number>;
}

export interface StartNavigationResult {
  readonly navState: NavigationState;
  readonly chosenTargetSpace: string | null;
}

export interface HoldResult {
  readonly navState: NavigationState;
  readonly heldSpace: string;
}

export interface ManualTargetResult {
  readonly navState: NavigationState;
  readonly requiresMatrixRegeneration: false;
}

export interface OptimizationStartResult {
  readonly navState: NavigationState;
  readonly generation: number;
}

export interface HeldBulkReturnPrompt {
  readonly requiresConfirmation: true;
  readonly heldCount: number;
}

export interface HeldBulkReturnResult {
  readonly restoredSpaces: readonly string[];
}

function nextGeneration(navState: NavigationState): number {
  return (navState.optimizationGeneration ?? 0) + 1;
}

function endpointFromPosition(position: ConfirmedPosition): RouteEndpointId {
  if (position.source === "arrived-circle" && position.circleSpace) {
    return { type: "circle", space: position.circleSpace };
  }
  return {
    type: "start",
    areaId: position.areaId,
    gridIndex: position.gridIndex,
  };
}

function uniqueOrder(order: readonly string[]): string[] {
  return [...new Set(order)];
}

function orderWithTargetFirst(
  order: readonly string[],
  targetSpace: string | null,
): string[] {
  const normalized = uniqueOrder(order).filter(
    (space) => space !== targetSpace,
  );
  return targetSpace ? [targetSpace, ...normalized] : normalized;
}

function removeFromOrder(order: readonly string[], space: string): string[] {
  return uniqueOrder(order).filter((candidate) => candidate !== space);
}

function requireCurrentPosition(navState: NavigationState): ConfirmedPosition {
  if (!navState.currentPosition) {
    throw new Error("Navigation requires a confirmed current position");
  }
  return navState.currentPosition;
}

export class NavigationOrchestrationService {
  /**
   * 始点設定直後に最寄り pending 候補を即時 target に採用し navigating 状態へ移行する。
   */
  startNavigation(input: StartNavigationInput): StartNavigationResult {
    const { navState, startPosition, pendingCircles, startDistances } = input;

    if (pendingCircles.length === 0) {
      return {
        navState: {
          ...navState,
          stage: "idle",
          areaId: startPosition.areaId,
          currentPosition: startPosition,
          targetSpace: null,
          lockedFirstLeg: null,
          provisionalOrder: Object.freeze([]),
          bestOrder: Object.freeze([]),
        },
        chosenTargetSpace: null,
      };
    }

    // Sort candidates by startDistance (nearest first)
    const sorted = [...pendingCircles].sort((a, b) => {
      const distA = startDistances.get(a.space) ?? Infinity;
      const distB = startDistances.get(b.space) ?? Infinity;
      return distA - distB;
    });

    const chosenTarget = sorted[0].space;
    const initialOrder = sorted.map((c) => c.space);

    const lockedFirstLeg: LockedLeg = {
      from: endpointFromPosition(startPosition),
      toSpace: chosenTarget,
    };

    const updatedState: NavigationState = {
      ...navState,
      stage: "navigating",
      areaId: startPosition.areaId,
      currentPosition: startPosition,
      targetSpace: chosenTarget,
      lockedFirstLeg,
      provisionalOrder: Object.freeze(initialOrder),
      bestOrder: Object.freeze(initialOrder),
    };

    return {
      navState: Object.freeze(updatedState),
      chosenTargetSpace: chosenTarget,
    };
  }

  /**
   * Worker progress / complete の受領。現在ターゲット（第一区間）を上書きせず、
   * それ以降の順序（bestOrder）のみを更新する。
   */
  handleWorkerProgress(
    navState: NavigationState,
    newBestOrder: readonly string[],
    generation?: number,
  ): NavigationState {
    if (
      generation !== undefined &&
      generation !== (navState.optimizationGeneration ?? 0)
    ) {
      return navState;
    }

    const bestOrder = orderWithTargetFirst(newBestOrder, navState.targetSpace);
    return Object.freeze({
      ...navState,
      bestOrder: Object.freeze(bestOrder),
    });
  }

  /** Start a new background optimization generation. */
  startOptimization(navState: NavigationState): OptimizationStartResult {
    const generation = nextGeneration(navState);
    return {
      navState: Object.freeze({
        ...navState,
        optimizationGeneration: generation,
      }),
      generation,
    };
  }

  /** Invalidate the current background job while keeping the displayed route. */
  cancelOptimization(navState: NavigationState): NavigationState {
    return Object.freeze({
      ...navState,
      optimizationGeneration: nextGeneration(navState),
    });
  }

  /**
   * 到着前保留（Before-arrival hold）。
   * currentPositionは変更せず（確定位置に留める）、targetSpaceのみ次へ進める。
   */
  handleBeforeArrivalHold(navState: NavigationState): HoldResult {
    const heldSpace = navState.targetSpace;
    if (!heldSpace) {
      throw new Error("No active target to hold");
    }

    const remainingBestOrder = removeFromOrder(navState.bestOrder, heldSpace);
    const remainingProvisionalOrder = removeFromOrder(
      navState.provisionalOrder,
      heldSpace,
    );
    const nextTarget =
      remainingBestOrder[0] ?? remainingProvisionalOrder[0] ?? null;
    const provisionalOrder = orderWithTargetFirst(
      remainingProvisionalOrder,
      nextTarget,
    );
    const repairedBestOrder = orderWithTargetFirst(
      remainingBestOrder,
      nextTarget,
    );

    let lockedFirstLeg: LockedLeg | null = null;
    if (nextTarget && navState.currentPosition) {
      lockedFirstLeg = {
        from: endpointFromPosition(navState.currentPosition),
        toSpace: nextTarget,
      };
    }

    const nextState: NavigationState = {
      ...navState,
      stage: nextTarget ? "navigating" : "idle",
      targetSpace: nextTarget,
      lockedFirstLeg,
      provisionalOrder: Object.freeze(provisionalOrder),
      bestOrder: Object.freeze(repairedBestOrder),
      optimizationGeneration: nextGeneration(navState),
    };

    return {
      navState: Object.freeze(nextState),
      heldSpace,
    };
  }

  /**
   * 「到着した」操作で currentPosition を target 位置へ遷移させる。
   */
  handleArrival(
    navState: NavigationState,
    targetPosition: ConfirmedPosition,
  ): NavigationState {
    if (
      navState.stage !== "navigating" ||
      !navState.targetSpace ||
      targetPosition.source !== "arrived-circle" ||
      targetPosition.circleSpace !== navState.targetSpace ||
      targetPosition.areaId !== navState.areaId
    ) {
      throw new Error("Arrived position does not match the current target");
    }
    return Object.freeze({
      ...navState,
      stage: "atTarget",
      currentPosition: targetPosition,
    });
  }

  /**
   * 到着後の「購入して次へ」操作。
   * 現在の target を除去し、即時 prepared next target へ進行する。
   */
  handlePurchaseNext(navState: NavigationState): NavigationState {
    const purchasedSpace = navState.targetSpace;
    if (!purchasedSpace || navState.stage !== "atTarget") {
      throw new Error("Purchase-next requires an arrived target");
    }
    const remainingBestOrder = removeFromOrder(
      navState.bestOrder,
      purchasedSpace,
    );
    const remainingProvisionalOrder = removeFromOrder(
      navState.provisionalOrder,
      purchasedSpace,
    );
    const nextTarget =
      remainingBestOrder[0] ?? remainingProvisionalOrder[0] ?? null;
    const provisionalOrder = orderWithTargetFirst(
      remainingProvisionalOrder,
      nextTarget,
    );
    const repairedBestOrder = orderWithTargetFirst(
      remainingBestOrder,
      nextTarget,
    );

    let lockedFirstLeg: LockedLeg | null = null;
    if (nextTarget && navState.currentPosition) {
      lockedFirstLeg = {
        from: endpointFromPosition(navState.currentPosition),
        toSpace: nextTarget,
      };
    }

    return Object.freeze({
      ...navState,
      stage: nextTarget ? "navigating" : "idle",
      targetSpace: nextTarget,
      lockedFirstLeg,
      provisionalOrder: Object.freeze(provisionalOrder),
      bestOrder: Object.freeze(repairedBestOrder),
      optimizationGeneration: nextGeneration(navState),
    });
  }

  /**
   * 手動目的地変更。マトリクス再生成は発生させず、新 target を fixedFirstTarget として更新する。
   */
  handleManualTarget(
    navState: NavigationState,
    newTargetSpace: string,
  ): ManualTargetResult {
    if (
      !newTargetSpace ||
      !navState.currentPosition ||
      navState.stage === "idle"
    ) {
      throw new Error("Manual target requires an active navigation position");
    }
    const remainingBest = removeFromOrder(navState.bestOrder, newTargetSpace);
    const remainingProvisional = removeFromOrder(
      navState.provisionalOrder,
      newTargetSpace,
    );
    const newOrder = [newTargetSpace, ...remainingBest];
    const newProvisionalOrder = [newTargetSpace, ...remainingProvisional];

    const lockedFirstLeg: LockedLeg = {
      from: endpointFromPosition(requireCurrentPosition(navState)),
      toSpace: newTargetSpace,
    };

    const nextState: NavigationState = {
      ...navState,
      stage: "navigating",
      targetSpace: newTargetSpace,
      lockedFirstLeg,
      provisionalOrder: Object.freeze(newProvisionalOrder),
      bestOrder: Object.freeze(newOrder),
      optimizationGeneration: nextGeneration(navState),
    };

    return {
      navState: Object.freeze(nextState),
      requiresMatrixRegeneration: false,
    };
  }

  /**
   * 保留中一括復帰の事前確認プロンプト。
   */
  prepareHeldBulkReturn(heldSpaces: readonly string[]): HeldBulkReturnPrompt {
    return Object.freeze({
      requiresConfirmation: true as const,
      heldCount: heldSpaces.length,
    });
  }

  /**
   * 保留中一括復帰の明示的確認後実行。
   */
  confirmHeldBulkReturn(heldSpaces: readonly string[]): HeldBulkReturnResult {
    return Object.freeze({
      restoredSpaces: Object.freeze([...heldSpaces]),
    });
  }
}
