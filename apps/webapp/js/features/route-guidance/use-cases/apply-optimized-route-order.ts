import type { RouteGuidanceSession } from "../domain/route-guidance-types";

export class ApplyOptimizedRouteOrderUseCase {
  constructor(private session: RouteGuidanceSession) {}

  async execute(
    optimizedOrder: readonly string[],
    generation: number,
  ): Promise<void> {
    const snap = this.session.getSnapshot();
    if (
      !snap.navigationState ||
      (snap.navigationState.optimizationGeneration &&
        snap.navigationState.optimizationGeneration > generation)
    ) {
      return;
    }

    this.session.replaceSnapshot({
      ...snap,
      navigationState: {
        ...snap.navigationState,
        bestOrder: Object.freeze([...optimizedOrder]),
      },
    });
  }
}
