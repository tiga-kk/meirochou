import {
  catalogUrlsFromCircles,
  type CatalogOfflineCachePort,
} from "../features/catalog-offline/public-api";
import type {
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../features/event-day/public-api";
import type { LocalDataDeletionScope } from "../features/local-data-deletion/public-api";
import type { DeleteLocalDataOperation } from "../features/local-data-deletion/public-api";

export class DeleteLocalDataWithCatalogCleanup implements DeleteLocalDataOperation {
  constructor(
    private readonly inner: DeleteLocalDataOperation,
    private readonly repository: EventDayRepository,
    private readonly offlineCache: CatalogOfflineCachePort,
  ) {}

  async execute(scope: LocalDataDeletionScope): Promise<void> {
    const candidates = this.candidateUrls(scope);
    await this.inner.execute(scope);

    let remaining: Set<string>;
    try {
      remaining = this.remainingUrls();
    } catch (error) {
      console.warn("Catalog cache cleanup skipped; remaining references unavailable.", error);
      return;
    }

    const removable = candidates.filter((url) => !remaining.has(url));
    if (removable.length === 0) return;
    try {
      await this.offlineCache.remove(removable);
    } catch (error) {
      console.warn("Catalog cache cleanup failed.", error);
    }
  }

  private candidateUrls(scope: LocalDataDeletionScope): readonly string[] {
    if (scope.kind === "activity") return [];
    const states =
      scope.kind === "all-event-days"
        ? this.repository.listEventDaysForDeletion().map((item) => item.state)
        : [this.requireState(scope.eventDay)];
    return [...new Set(states.flatMap((item) => catalogUrlsFromCircles(item.circles)))];
  }

  private remainingUrls(): Set<string> {
    const urls = this.repository
      .listEventDaysForDeletion()
      .flatMap(({ state }) => catalogUrlsFromCircles(state.circles));
    return new Set(urls);
  }

  private requireState(ref: EventDayRef): LocalEventDayState {
    const state = this.repository.load(ref);
    if (!state) throw new Error(`Missing state for ${ref.eventId}/${ref.dayId}`);
    return state;
  }
}
