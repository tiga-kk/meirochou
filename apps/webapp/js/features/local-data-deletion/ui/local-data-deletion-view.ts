import type { LocalDataDeletionOption } from "./local-data-deletion-dialog-model";

export interface LocalDataDeletionView {
  render(options: readonly LocalDataDeletionOption[]): void;
  close(): void;
  focusTrigger(): void;
  showError(message: string): void;
}
