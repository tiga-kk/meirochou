import { describe, expect, it, vi } from "vitest";
import type { CircleDataPreview } from "../apps/webapp/js/features/circle-data-source/domain/circle-data-source-types";
import { CircleDataSourceController } from "../apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller";
import type { CancelableRequest } from "../apps/webapp/js/features/circle-data-source/use-cases/cancelable-request";
import { createCircleDataSourceSession } from "../apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session";
import type { GoogleSheetCircleClient } from "../apps/webapp/js/features/circle-data-source/use-cases/google-sheet-circle-client";

describe("CircleDataSourceController", () => {
  it("cancels an in-flight request on stop and ignores its result", async () => {
    let resolveRequest: ((value: readonly string[]) => void) | undefined;
    let cancelCount = 0;
    const request: CancelableRequest<readonly string[]> = {
      result: new Promise((resolve) => {
        resolveRequest = resolve;
      }),
      cancel: () => {
        cancelCount += 1;
      },
    };
    const client: GoogleSheetCircleClient = {
      startLoadingSheetNames: vi.fn(() => request),
      startLoadingCircles: vi.fn(() => request),
    };
    const session = createCircleDataSourceSession();
    const controller = new CircleDataSourceController({ client, session });

    const loading = controller.loadGoogleSheetNames(
      "https://script.google.com/macros/s/test/exec",
    );
    controller.stop();
    resolveRequest?.(["day1"]);
    await loading;

    expect(cancelCount).toBe(1);
    expect(session.getSnapshot().sheetNames).toEqual([]);
  });

  it("reaches csv-preview and apply-preview through controller paths", async () => {
    const preview = {
      previewId: "preview-1",
      ref: { eventId: "c104", dayId: "day1" },
      mode: "initial",
      expectedSourceGeneration: "gen-1",
      diff: { added: [], updated: [], removed: [], unchanged: [] },
      newCircles: [],
      fetchedAt: "2026-08-10T00:00:00.000Z",
      expiresAt: "2026-08-10T01:00:00.000Z",
    } as CircleDataPreview;
    const session = createCircleDataSourceSession();
    const operations: string[] = [];
    const controller = new CircleDataSourceController({
      client: {
        startLoadingSheetNames: vi.fn(),
        startLoadingCircles: vi.fn(),
      },
      session,
      previewCsvImport: { execute: vi.fn(() => preview) },
      applyCircleDataPreview: { execute: vi.fn(async () => ({}) as never) },
      onOperationComplete: (operation) => operations.push(operation),
    });

    await controller.handleCsvFile(
      { eventId: "c104", dayId: "day1" },
      "circles.csv",
      "space,priority\n東A-01a,1",
    );
    await controller.applyPreview("preview-1");

    expect(operations).toEqual(["csv-preview", "apply-preview"]);
  });

  it("does not report apply success after cancellation", async () => {
    let resolveApply: (() => void) | undefined;
    const session = createCircleDataSourceSession();
    const operations: string[] = [];
    const preview = {
      previewId: "preview-1",
      ref: { eventId: "c104", dayId: "day1" },
      mode: "initial",
      expectedSourceGeneration: "gen-1",
      diff: { added: [], updated: [], removed: [], unchanged: [] },
      newCircles: [],
      fetchedAt: "2026-08-10T00:00:00.000Z",
      expiresAt: "2026-08-10T01:00:00.000Z",
    } as CircleDataPreview;
    session.setPreview(preview);
    const controller = new CircleDataSourceController({
      client: { startLoadingSheetNames: vi.fn(), startLoadingCircles: vi.fn() },
      session,
      applyCircleDataPreview: {
        execute: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveApply = () => resolve({} as never);
            }),
        ),
      },
      onOperationComplete: (operation) => operations.push(operation),
    });

    const applying = controller.applyPreview("preview-1");
    controller.cancelCurrentRequest();
    resolveApply?.();
    await applying;

    expect(operations).toEqual([]);
    expect(session.getSnapshot()).toMatchObject({
      busy: false,
      operation: "idle",
    });
  });

  it("does not report csv success after setPreview starts a newer request", async () => {
    const preview = { previewId: "preview-1" } as CircleDataPreview;
    const session = createCircleDataSourceSession();
    const operations: string[] = [];
    let controller!: CircleDataSourceController;
    let reentered = false;
    session.subscribe(({ operation, preview: currentPreview }) => {
      if (
        !reentered &&
        operation === "idle" &&
        currentPreview?.previewId === preview.previewId
      ) {
        reentered = true;
        void controller.handleCsvFile(
          { eventId: "c104", dayId: "day1" },
          "new.csv",
          "space,priority\n東A-01b,2",
        );
      }
    });
    controller = new CircleDataSourceController({
      client: { startLoadingSheetNames: vi.fn(), startLoadingCircles: vi.fn() },
      session,
      previewCsvImport: { execute: vi.fn(() => preview) },
      onOperationComplete: (operation) => operations.push(operation),
    });

    await controller.handleCsvFile(
      { eventId: "c104", dayId: "day1" },
      "old.csv",
      "space,priority\n東A-01a,1",
    );

    expect(operations).toEqual(["csv-preview"]);
  });

  it("does not report gas success after setPreview starts a newer request", async () => {
    let resolveRequest!: (value: CircleDataPreview) => void;
    const preview = { previewId: "preview-1" } as CircleDataPreview;
    const session = createCircleDataSourceSession();
    const operations: string[] = [];
    let controller!: CircleDataSourceController;
    let reentered = false;
    session.subscribe(({ operation, preview: currentPreview }) => {
      if (
        !reentered &&
        operation === "idle" &&
        currentPreview?.previewId === preview.previewId
      ) {
        reentered = true;
        void controller.handleCsvFile(
          { eventId: "c104", dayId: "day1" },
          "new.csv",
          "space,priority\n東A-01b,2",
        );
      }
    });
    controller = new CircleDataSourceController({
      client: {
        startLoadingSheetNames: vi.fn(),
        startLoadingCircles: vi.fn(),
      },
      session,
      previewGoogleSheetImport: {
        start: vi.fn(() => ({
          result: new Promise<CircleDataPreview>((resolve) => {
            resolveRequest = resolve;
          }),
          cancel: vi.fn(),
        })),
      },
      previewCsvImport: { execute: vi.fn(() => preview) },
      onOperationComplete: (operation) => operations.push(operation),
    });

    const loading = controller.handleGasPreviewRequest(
      { eventId: "c104", dayId: "day1" },
      {
        type: "gas",
        gasUrl: "https://script.google.com/macros/s/test/exec",
        sheetName: "day1",
      },
    );
    resolveRequest(preview);
    await loading;

    expect(operations).toEqual(["csv-preview"]);
  });

  it("does not report apply success after setPreview starts a newer request", async () => {
    const preview = { previewId: "preview-1" } as CircleDataPreview;
    const session = createCircleDataSourceSession();
    const operations: string[] = [];
    let controller!: CircleDataSourceController;
    let reentered = false;
    session.setPreview(preview);
    session.subscribe(({ operation, preview: currentPreview }) => {
      if (!reentered && operation === "idle" && currentPreview === null) {
        reentered = true;
        void controller.handleCsvFile(
          { eventId: "c104", dayId: "day1" },
          "new.csv",
          "space,priority\n東A-01b,2",
        );
      }
    });
    controller = new CircleDataSourceController({
      client: { startLoadingSheetNames: vi.fn(), startLoadingCircles: vi.fn() },
      session,
      previewCsvImport: { execute: vi.fn(() => preview) },
      applyCircleDataPreview: { execute: vi.fn(async () => ({}) as never) },
      onOperationComplete: (operation) => operations.push(operation),
    });

    await controller.applyPreview("preview-1");

    expect(operations).toEqual(["csv-preview"]);
  });
});
