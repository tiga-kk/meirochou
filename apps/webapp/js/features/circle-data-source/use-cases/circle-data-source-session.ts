import type {
  CircleDataPreview,
  CircleDataSourceDraftUpdate,
  CircleDataSourceErrorCode,
} from "../domain/circle-data-source-types";

export type CircleDataSourceOperation =
  | "idle"
  | "gas-sheet-list"
  | "gas-preview"
  | "csv-preview"
  | "apply-preview";

export interface CircleDataSourceSessionSnapshot {
  readonly requestGeneration: number;
  readonly draftWebAppUrl: string;
  readonly selectedSheetName: string;
  readonly sheetNames: readonly string[];
  readonly preview: CircleDataPreview | null;
  readonly busy: boolean;
  readonly operation: CircleDataSourceOperation;
  readonly errorCode: CircleDataSourceErrorCode | null;
}

export interface CircleDataSourceSession {
  getSnapshot(): CircleDataSourceSessionSnapshot;
  beginRequest(operation: Exclude<CircleDataSourceOperation, "idle">): number;
  isCurrentRequest(generation: number): boolean;
  updateDraft(input: CircleDataSourceDraftUpdate): void;
  setSheetNames(sheetNames: readonly string[]): void;
  setPreview(preview: CircleDataPreview | null): void;
  setBusy(busy: boolean): void;
  setError(errorCode: CircleDataSourceErrorCode | null): void;
  reset(): void;
  subscribe(
    listener: (snapshot: CircleDataSourceSessionSnapshot) => void,
  ): () => void;
}

function createInitialSnapshot(): CircleDataSourceSessionSnapshot {
  return {
    requestGeneration: 0,
    draftWebAppUrl: "",
    selectedSheetName: "",
    sheetNames: [],
    preview: null,
    busy: false,
    operation: "idle",
    errorCode: null,
  };
}

export function createCircleDataSourceSession(): CircleDataSourceSession {
  let current = createInitialSnapshot();
  const listeners = new Set<
    (snapshot: CircleDataSourceSessionSnapshot) => void
  >();

  const snapshot = (): CircleDataSourceSessionSnapshot & {
    errorMessage: string | null;
  } =>
    Object.freeze({
      ...current,
      errorMessage: current.errorCode ? String(current.errorCode) : null,
      sheetNames: Object.freeze([...current.sheetNames]),
      preview: current.preview
        ? Object.freeze({
            ...current.preview,
            ref: Object.freeze({ ...current.preview.ref }),
            ...(current.preview.source
              ? { source: Object.freeze({ ...current.preview.source }) }
              : {}),
            newCircles: Object.freeze([...(current.preview.newCircles ?? [])]),
          })
        : null,
    });

  const notify = (): void => {
    const snap = snapshot();
    for (const listener of listeners) listener(snap);
  };

  return {
    getSnapshot: snapshot,
    beginRequest(operation) {
      current = {
        ...current,
        requestGeneration: current.requestGeneration + 1,
        busy: true,
        operation,
        errorCode: null,
      };
      notify();
      return current.requestGeneration;
    },
    isCurrentRequest(generation) {
      return current.requestGeneration === generation;
    },
    updateDraft(input) {
      current = {
        ...current,
        draftWebAppUrl: input.draftWebAppUrl ?? current.draftWebAppUrl,
        selectedSheetName: input.selectedSheetName ?? current.selectedSheetName,
      };
      notify();
    },
    setSheetNames(sheetNames) {
      current = {
        ...current,
        sheetNames: Object.freeze([...sheetNames]),
        busy: false,
        operation: "idle",
      };
      notify();
    },
    setPreview(preview) {
      current = { ...current, preview, busy: false, operation: "idle" };
      notify();
    },
    setBusy(busy) {
      current = { ...current, busy, operation: busy ? "gas-preview" : "idle" };
      notify();
    },
    setError(errorCode) {
      current = { ...current, errorCode, busy: false, operation: "idle" };
      notify();
    },
    reset() {
      current = createInitialSnapshot();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
