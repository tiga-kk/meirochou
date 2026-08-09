import type { LocalDataDeletionScope } from "../domain/local-data-deletion-types";

export interface LocalDataDeletionOption {
  readonly scope: LocalDataDeletionScope;
  readonly label: string;
  readonly consequence: string;
  readonly blocked: boolean;
}

export function formatDeletionConfirmation(
  scope: LocalDataDeletionScope,
): string {
  switch (scope.kind) {
    case "circle-source":
      return "サークルソースを削除しますか？";
    case "activity":
      return "活動記録を削除しますか？";
    case "event-day":
      return "イベント日のデータを削除しますか？";
    case "all-event-days":
      return "すべてのイベント日のデータを削除しますか？";
  }
}
