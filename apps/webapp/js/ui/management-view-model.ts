import type {
  CircleRecord,
  EventDayRef,
  EventRegistryV1,
  GasOutboxEntry,
  LocalEventDayState,
  SourceDiff,
} from "../types/domain";
import type { DeleteScope } from "./management-events";

/** A registry-defined event/day entry suitable for selector rendering. */
export interface EventDayOption {
  readonly eventId: string;
  readonly eventLabel: string;
  readonly dayId: string;
  readonly dayLabel: string;
  readonly configured: boolean;
  readonly selected: boolean;
  readonly pendingCount: number;
}

/** A redacted summary of the active CSV or GAS source. */
export interface SourceSummaryViewModel {
  readonly typeLabel: "CSV" | "Googleスプレッドシート";
  readonly detail: string;
  readonly endpointSummary: string | null;
  readonly pendingCount: number;
}

/** A single source-diff row containing no circle body fields. */
export interface DiffRowViewModel {
  readonly space: string;
  readonly changedFields: readonly string[];
}

/** Safe source-diff data for the confirmation dialog. */
export interface SourceDiffViewModel {
  readonly added: readonly DiffRowViewModel[];
  readonly updated: readonly DiffRowViewModel[];
  readonly removed: readonly DiffRowViewModel[];
  readonly countsLabel: string;
}

/** A redacted pending GAS mutation for the outbox panel. */
export interface OutboxEntryViewModel {
  readonly id: string;
  readonly refLabel: string;
  readonly sourceLabel: string;
  readonly space: string;
  readonly desiredLabel: "購入済みにする" | "購入を取り消す";
  readonly attemptsLabel: string;
  readonly errorLabel: string | null;
}

/** Counts used to describe and guard each destructive storage option. */
export interface DeleteOptionInput {
  readonly selected: EventDayRef;
  readonly eventDayCount: number;
  readonly activeCircleCount: number;
  readonly activityCount: number;
  readonly pendingCount: number;
}

/** A destructive option with its current pending-outbox lock state. */
export interface DeleteOptionViewModel {
  readonly scope: DeleteScope;
  readonly label: string;
  readonly consequence: string;
  readonly blocked: boolean;
  readonly blockedReason: string | null;
}

/** Fails closed if persisted data contains a variant outside the domain contract. */
function unsupportedVariant(context: string): never {
  throw new Error(`Unsupported ${context}`);
}

/** Copies and freezes an event/day reference before exposing it to a component. */
function freezeRef(ref: EventDayRef): EventDayRef {
  return Object.freeze({ eventId: ref.eventId, dayId: ref.dayId });
}

/** Copies and freezes a delete scope, including its nested reference. */
function freezeDeleteScope(scope: DeleteScope): DeleteScope {
  switch (scope.type) {
    case "circles":
    case "activity":
    case "event-day":
      return Object.freeze({
        type: scope.type,
        ref: freezeRef(scope.ref),
      });
    case "all-events":
      return Object.freeze({ type: scope.type });
    default:
      return unsupportedVariant("delete scope");
  }
}

/** Converts the persisted boolean into the only two allowed Japanese labels. */
function formatDesiredLabel(
  purchased: boolean,
): OutboxEntryViewModel["desiredLabel"] {
  switch (purchased) {
    case true:
      return "購入済みにする";
    case false:
      return "購入を取り消す";
    default:
      return unsupportedVariant("purchase state");
  }
}

/** Builds selector options in the registry's stable event/day order. */
export function buildEventDayOptions(
  registry: EventRegistryV1,
  states: readonly { ref: EventDayRef; state: LocalEventDayState }[],
  selected: EventDayRef | null,
): readonly EventDayOption[] {
  const stateMap = new Map<string, LocalEventDayState>();
  for (const item of states) {
    stateMap.set(`${item.ref.eventId}:${item.ref.dayId}`, item.state);
  }

  const options: EventDayOption[] = [];
  for (const event of registry.events) {
    for (const day of event.days) {
      const key = `${event.eventId}:${day.dayId}`;
      const state = stateMap.get(key);
      const isSelected =
        selected !== null &&
        selected.eventId === event.eventId &&
        selected.dayId === day.dayId;

      const isConfigured =
        state !== undefined &&
        !(
          state.source.type === "csv" &&
          state.source.fileName === "empty.csv" &&
          state.circles.length === 0
        );

      options.push(
        Object.freeze({
          eventId: event.eventId,
          eventLabel: event.displayName,
          dayId: day.dayId,
          dayLabel: day.displayName,
          configured: isConfigured,
          selected: isSelected,
          pendingCount: state ? state.gasOutbox.length : 0,
        }),
      );
    }
  }

  return Object.freeze(options);
}

/** Formats the active source while keeping GAS endpoint details host-only. */
export function formatSourceSummary(
  state: LocalEventDayState,
): SourceSummaryViewModel {
  const pendingCount = state.gasOutbox.length;

  switch (state.source.type) {
    case "csv":
      return Object.freeze({
        typeLabel: "CSV",
        detail: state.source.fileName,
        endpointSummary: null,
        pendingCount,
      });
    case "gas": {
      let endpointSummary = "script.google.com";
      try {
        const url = new URL(state.source.gasUrl);
        endpointSummary = url.hostname || "script.google.com";
      } catch {
        endpointSummary = "script.google.com";
      }

      return Object.freeze({
        typeLabel: "Googleスプレッドシート",
        detail: state.source.sheetName,
        endpointSummary,
        pendingCount,
      });
    }
    default:
      return unsupportedVariant("data source");
  }
}

/** Returns safe Japanese labels for fields that changed between two circles. */
function detectChangedFields(
  before: CircleRecord,
  after: CircleRecord,
): readonly string[] {
  const fields: string[] = [];
  if (before.priority !== after.priority) fields.push("優先度");
  if (before.account !== after.account) fields.push("X(Twitter)");
  if (before.tweet !== after.tweet) fields.push("告知ツイート");
  if (before.memo !== after.memo) fields.push("メモ");
  if (before.isSale !== after.isSale) fields.push("頒布状態");
  return Object.freeze(fields);
}

/** Converts a source diff to display rows without copying private circle fields. */
export function formatSourceDiff(diff: SourceDiff): SourceDiffViewModel {
  const added = diff.added.map((circle) =>
    Object.freeze({
      space: circle.space,
      changedFields: Object.freeze([]),
    }),
  );

  const updated = diff.updated.map((item) =>
    Object.freeze({
      space: item.after.space,
      changedFields: detectChangedFields(item.before, item.after),
    }),
  );

  const removed = diff.removed.map((circle) =>
    Object.freeze({
      space: circle.space,
      changedFields: Object.freeze([]),
    }),
  );

  const countsLabel = `追加: ${added.length}件 / 更新: ${updated.length}件 / 削除: ${removed.length}件`;

  return Object.freeze({
    added: Object.freeze(added),
    updated: Object.freeze(updated),
    removed: Object.freeze(removed),
    countsLabel,
  });
}

/** Maps persisted safe error categories to Japanese display text. */
function formatOutboxError(lastError: string | null): string | null {
  if (!lastError) return null;

  switch (lastError) {
    case "network":
      return "通信エラー";
    case "timeout":
      return "タイムアウト";
    case "server-contract":
      return "サーバーデータ形式エラー";
    case "http-404":
      return "HTTP 404 エラー";
    case "http-500":
      return "サーバーエラー (500)";
    default:
      break;
  }

  if (/^http-[1-5][0-9]{2}$/.test(lastError)) {
    const status = lastError.substring(5);
    return `HTTP エラー (${status})`;
  }

  return "送信エラー";
}

/** Converts pending GAS entries to safe, render-only rows. */
export function formatOutbox(
  entries: readonly GasOutboxEntry[],
  registry: EventRegistryV1,
): readonly OutboxEntryViewModel[] {
  const refLabelMap = new Map<string, string>();
  for (const event of registry.events) {
    for (const day of event.days) {
      refLabelMap.set(
        `${event.eventId}:${day.dayId}`,
        `${event.displayName} ${day.displayName}`,
      );
    }
  }

  const result = entries.map((entry) => {
    const key = `${entry.eventId}:${entry.dayId}`;
    const refLabel = refLabelMap.get(key) ?? `${entry.eventId} ${entry.dayId}`;
    const desiredLabel = formatDesiredLabel(entry.purchased);

    return Object.freeze({
      id: entry.id,
      refLabel,
      sourceLabel: entry.sheetName,
      space: entry.space,
      desiredLabel,
      attemptsLabel: `${entry.attempts}回試行`,
      errorLabel: formatOutboxError(entry.lastError),
    });
  });

  return Object.freeze(result);
}

/** Creates one frozen delete option from a copied scope and safe text. */
function makeDeleteOption(
  scope: DeleteScope,
  label: string,
  consequence: string,
  blocked: boolean,
  blockedReason: string | null,
): DeleteOptionViewModel {
  return Object.freeze({
    scope: freezeDeleteScope(scope),
    label,
    consequence,
    blocked,
    blockedReason,
  });
}

/** Builds the four destructive options and applies the current outbox lock. */
export function buildDeleteOptions(
  input: DeleteOptionInput,
): readonly DeleteOptionViewModel[] {
  const blocked = input.pendingCount > 0;
  const blockedReason = blocked
    ? "送信待ちのGAS同期があるため削除できません。同期を完了するか廃棄してください。"
    : null;

  const options: DeleteOptionViewModel[] = [
    makeDeleteOption(
      { type: "circles", ref: input.selected },
      `サークルリストの削除（${input.activeCircleCount}件）`,
      "サークル配置情報を削除し、空のリストにします。購入・チェックの活動履歴は保持されます。",
      blocked,
      blockedReason,
    ),
    makeDeleteOption(
      { type: "activity", ref: input.selected },
      `購入・チェック履歴の削除（${input.activityCount}件）`,
      "この日の購入済み・チェック状態・操作履歴をすべて消去します。サークル情報は保持されます。",
      blocked,
      blockedReason,
    ),
    makeDeleteOption(
      { type: "event-day", ref: input.selected },
      "この日（データ）の削除",
      "この日程のサークル情報および履歴をすべて削除します。",
      blocked,
      blockedReason,
    ),
    makeDeleteOption(
      { type: "all-events" },
      `全日程データの削除（${input.eventDayCount}日程）`,
      "登録されている全日程のサークル情報・履歴・設定を消去し、初期状態に戻します。",
      blocked,
      blockedReason,
    ),
  ];

  return Object.freeze(options);
}
