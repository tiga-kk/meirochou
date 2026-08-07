import type { RouteGuidanceSession } from "../domain/route-guidance-types";

export class InvalidateRouteGuidanceUseCase {
  constructor(private session: RouteGuidanceSession) {}

  execute(): void {
    this.session.clear();
  }
}
