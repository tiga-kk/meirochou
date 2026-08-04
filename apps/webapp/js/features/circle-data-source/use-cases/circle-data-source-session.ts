import type {
  CircleDataPreview,
  CircleDataSourceDraftUpdate,
  CircleDataSourceErrorCode,
} from "../domain/circle-data-source-types";

export interface CircleDataSourceSessionSnapshot {
  readonly requestGeneration: number;
  readonly draftWebAppUrl: string;
  readonly selectedSheetName: string;
  readonly sheetNames: readonly string[];
  readonly preview: CircleDataPreview | null;
  readonly busy: boolean;
  readonly errorCode: CircleDataSourceErrorCode | null;
}

export interface CircleDataSourceSession {
  getSnapshot(): CircleDataSourceSessionSnapshot;
  beginRequest(): number;
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
    errorCode: null,
  };
}

export function createCircleDataSourceSession(): CircleDataSourceSession {
  let current = createInitialSnapshot();
  const listeners = new Set<
    (snapshot: CircleDataSourceSessionSnapshot) => void
  >();

  const snapshot = (): CircleDataSourceSessionSnapshot =>
    Object.freeze({
      ...current,
      sheetNames: Object.freeze([...current.sheetNames]),
      preview: current.preview
        ? Object.freeze({
            ...current.preview,
            ref: Object.freeze({ ...current.preview.ref }),
            newCircles: Object.freeze([...current.preview.newCircles]),
          })
        : null,
    });

  const notify = (): void => {
    const snap = snapshot();
    for (const listener of listeners) listener(snap);
  };

  return {
    getSnapshot: snapshot,
    beginRequest() {
      current = {
        ...current,
        requestGeneration: current.requestGeneration + 1,
        busy: true,
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
      };
      notify();
    },
    setPreview(preview) {
      current = { ...current, preview, busy: false };
      notify();
    },
    setBusy(busy) {
      current = { ...current, busy };
      notify();
    },
    setError(errorCode) {
      current = { ...current, errorCode, busy: false };
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
