import type {
  ConfirmedPosition,
  LockedLeg,
  NavigationStage,
  NavigationState,
  RouteEndpointId,
} from "./route-guidance-types";

export type {
  ConfirmedPosition,
  LockedLeg,
  NavigationStage,
  NavigationState,
  RouteEndpointId,
};

export class NavigationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NavigationStateError";
  }
}

export function createInitialNavigationState(): NavigationState {
  return Object.freeze({
    stage: "idle" as const,
    areaId: null,
    currentPosition: null,
    targetSpace: null,
    lockedFirstLeg: null,
    provisionalOrder: Object.freeze([]),
    bestOrder: Object.freeze([]),
    optimizationGeneration: 0,
  });
}

function deriveEndpointFromPosition(pos: ConfirmedPosition): RouteEndpointId {
  if (pos.source === "arrived-circle" && pos.circleSpace) {
    return Object.freeze({
      type: "circle" as const,
      space: pos.circleSpace,
    });
  }
  return Object.freeze({
    type: "start" as const,
    areaId: pos.areaId,
    gridIndex: pos.gridIndex,
  });
}

function prioritizeTarget(
  order: readonly string[],
  targetSpace: string,
): readonly string[] {
  return [targetSpace, ...order.filter((space) => space !== targetSpace)];
}

function validatePosition(position: ConfirmedPosition, areaId: string): void {
  if (position.areaId !== areaId) {
    throw new NavigationStateError(
      "Position area does not match the navigation area",
    );
  }
  if (position.source === "arrived-circle" && !position.circleSpace) {
    throw new NavigationStateError(
      "Arrived-circle position must include a circle space",
    );
  }
}

export class NavigationStateMachine {
  private state: NavigationState;

  constructor(initialState: NavigationState = createInitialNavigationState()) {
    this.state = initialState;
  }

  getState(): NavigationState {
    return this.state;
  }

  setStart(params: {
    areaId: string;
    position: ConfirmedPosition;
    targetSpace?: string | null;
    order?: readonly string[];
  }): NavigationState {
    const { areaId, position, targetSpace = null, order = [] } = params;
    validatePosition(position, areaId);
    const stage: NavigationStage = targetSpace ? "navigating" : "idle";

    let lockedFirstLeg: LockedLeg | null = null;
    if (targetSpace) {
      const fromEndpoint = deriveEndpointFromPosition(position);
      lockedFirstLeg = Object.freeze({
        from: fromEndpoint,
        toSpace: targetSpace,
      });
    }

    const nextState: NavigationState = Object.freeze({
      stage,
      areaId,
      currentPosition: Object.freeze({ ...position }),
      targetSpace,
      lockedFirstLeg,
      provisionalOrder: Object.freeze([...order]),
      bestOrder: Object.freeze([...order]),
    });

    this.state = nextState;
    return nextState;
  }

  changeTarget(newTargetSpace: string): NavigationState {
    if (this.state.stage === "idle" || !this.state.currentPosition) {
      throw new NavigationStateError("Cannot change target in idle stage");
    }

    const fromEndpoint = deriveEndpointFromPosition(this.state.currentPosition);
    const lockedFirstLeg: LockedLeg = Object.freeze({
      from: fromEndpoint,
      toSpace: newTargetSpace,
    });
    const provisionalOrder = prioritizeTarget(
      this.state.provisionalOrder,
      newTargetSpace,
    );
    const bestOrder = prioritizeTarget(this.state.bestOrder, newTargetSpace);

    const nextState: NavigationState = Object.freeze({
      ...this.state,
      stage: "navigating" as const,
      targetSpace: newTargetSpace,
      lockedFirstLeg,
      provisionalOrder: Object.freeze(provisionalOrder),
      bestOrder: Object.freeze(bestOrder),
    });

    this.state = nextState;
    return nextState;
  }

  arrive(targetPosition: ConfirmedPosition): NavigationState {
    if (this.state.stage !== "navigating") {
      throw new NavigationStateError(
        "Cannot arrive unless navigation is in progress",
      );
    }
    if (
      targetPosition.source !== "arrived-circle" ||
      targetPosition.circleSpace !== this.state.targetSpace ||
      targetPosition.areaId !== this.state.areaId
    ) {
      throw new NavigationStateError(
        "Arrived position does not match the current target",
      );
    }

    const nextState: NavigationState = Object.freeze({
      ...this.state,
      stage: "atTarget" as const,
      currentPosition: Object.freeze({ ...targetPosition }),
    });

    this.state = nextState;
    return nextState;
  }

  processVisitStateChange(params: {
    nextTargetSpace: string | null;
    remainingOrder: readonly string[];
  }): NavigationState {
    const { nextTargetSpace, remainingOrder } = params;

    if (this.state.stage === "idle") {
      throw new NavigationStateError(
        "Cannot process visit state change while navigation is idle",
      );
    }

    if (
      !nextTargetSpace ||
      remainingOrder.length === 0 ||
      !this.state.currentPosition
    ) {
      const nextState: NavigationState = Object.freeze({
        ...this.state,
        stage: "idle" as const,
        targetSpace: null,
        lockedFirstLeg: null,
        provisionalOrder: Object.freeze([]),
        bestOrder: Object.freeze([]),
      });
      this.state = nextState;
      return nextState;
    }

    const fromEndpoint = deriveEndpointFromPosition(this.state.currentPosition);
    const lockedFirstLeg: LockedLeg = Object.freeze({
      from: fromEndpoint,
      toSpace: nextTargetSpace,
    });

    const nextState: NavigationState = Object.freeze({
      ...this.state,
      stage: "navigating" as const,
      targetSpace: nextTargetSpace,
      lockedFirstLeg,
      provisionalOrder: Object.freeze([...remainingOrder]),
      bestOrder: Object.freeze([...remainingOrder]),
    });

    this.state = nextState;
    return nextState;
  }

  resetStart(): NavigationState {
    const nextState = createInitialNavigationState();
    this.state = nextState;
    return nextState;
  }

  applyOptimizerResult(bestOrder: readonly string[]): NavigationState {
    // Optimizer MUST NOT change targetSpace or lockedFirstLeg or currentPosition
    const nextState: NavigationState = Object.freeze({
      ...this.state,
      bestOrder: Object.freeze([...bestOrder]),
    });

    this.state = nextState;
    return nextState;
  }
}
