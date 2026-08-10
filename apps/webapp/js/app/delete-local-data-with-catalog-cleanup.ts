import type { CatalogOfflineCachePort } from "../features/catalog-offline/public-api";
import type {
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../features/event-day/public-api";
import type { LocalDataDeletionScope } from "../features/local-data-deletion/public-api";
import type { DeleteLocalDataOperation } from "../features/local-data-deletion/public-api";

function catalogUrls(state: LocalEventDayState): readonly string[] {
  return [
    ...new Set(
      state.circles
        .filter((circle) => circle.removedFromSource !== true)
        .map((circle) => circle.tweet)
        .filter((url): url is string => {
          if (typeof url !== "string" || url.trim() === "") return false;
          try {
            const protocol = new URL(url).protocol;
            return protocol === "http:" || protocol === "https:";
          } catch {
            return false;
          }
        }),
    ),
  ];
}

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
    return [...new Set(states.flatMap(catalogUrls))];
  }

  private remainingUrls(): Set<string> {
    const urls = this.repository.listEventDays().flatMap((ref) => {
      const state = this.repository.load(ref);
      if (!state) throw new Error(`Missing state for ${ref.eventId}/${ref.dayId}`);
      return catalogUrls(state);
    });
    return new Set(urls);
  }

  private requireState(ref: EventDayRef): LocalEventDayState {
    const state = this.repository.load(ref);
    if (!state) throw new Error(`Missing state for ${ref.eventId}/${ref.dayId}`);
    return state;
  }
}
