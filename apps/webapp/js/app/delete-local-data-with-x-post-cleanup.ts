import type {
  DeleteLocalDataOperation,
  LocalDataDeletionScope,
} from "../features/local-data-deletion/public-api";
import type { XPostCache } from "../features/x-post-monitoring/public-api";

/** Deletes X-post cache entries only after the formal local-data deletion succeeds. */
export class DeleteLocalDataWithXPostCleanup implements DeleteLocalDataOperation {
  constructor(
    private readonly inner: DeleteLocalDataOperation,
    private readonly xPostCache: XPostCache,
  ) {}

  async execute(scope: LocalDataDeletionScope): Promise<void> {
    await this.inner.execute(scope);
    try {
      if (scope.kind === "all-event-days") {
        await this.xPostCache.clear();
      } else if (scope.kind === "circle-source" || scope.kind === "event-day") {
        await this.xPostCache.deleteEventDay(scope.eventDay);
      }
    } catch (error) {
      console.warn("X post cache cleanup failed.", error);
    }
  }
}
