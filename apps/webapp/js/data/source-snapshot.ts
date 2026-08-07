import type { LocalEventDayState } from "../features/event-day/domain/application-contract-types";

function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Create a stable hash for source identity and source-owned circle data.
 * Local activity, outbox entries, and timestamps are intentionally excluded.
 */
export function fingerprintSourceSnapshot(state: LocalEventDayState): string {
  const canonicalCircles = [...state.circles]
    .map((c) => ({
      space: c.space,
      priority: c.priority,
      account: c.account,
      tweet: c.tweet,
      memo: c.memo,
      isSale: c.isSale,
      removedFromSource: c.removedFromSource,
    }))
    .sort((a, b) => a.space.localeCompare(b.space));

  const payload = JSON.stringify({
    source: state.source,
    sourceGeneration: state.sourceGeneration,
    circles: canonicalCircles,
  });

  return fnv1aHash(payload);
}
