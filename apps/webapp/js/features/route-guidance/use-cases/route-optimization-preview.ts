import type { NavigationState } from "../domain/route-guidance-types";

export interface RouteOptimizationPreview {
  readonly jobId: string;
  readonly generation: number;
  readonly elapsedMs: number;
  readonly searchTimeLimitMs: 5000 | 10000 | 15000;
  readonly bestOrder: readonly string[];
  readonly score: number;
}

export interface RouteOptimizationCallbacks {
  onPreview(preview: RouteOptimizationPreview): void;
  onCommit(navState: NavigationState): void;
  onCancel?(): void;
  onError?(code: string): void;
}
