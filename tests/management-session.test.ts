import { describe, expect, it } from "vitest";
import {
  createCircleDataSourceSession,
  type CircleDataPreview,
} from "../apps/webapp/js/features/circle-data-source/public-api";

describe("CircleDataSourceSession & Management Session State", () => {
  it("manages busy status in immutable session snapshots", () => {
    const session = createCircleDataSourceSession();
    expect(session.getSnapshot().busy).toBe(false);

    session.setBusy(true);
    expect(session.getSnapshot().busy).toBe(true);

    session.setBusy(false);
    expect(session.getSnapshot().busy).toBe(false);
  });

  it("stores draft web app url and sheet name immutably", () => {
    const session = createCircleDataSourceSession();
    session.updateDraft({ draftWebAppUrl: "https://script.google.com/macros/s/test/exec" });
    expect(session.getSnapshot().draftWebAppUrl).toBe(
      "https://script.google.com/macros/s/test/exec",
    );

    session.setSheetNames(["Day1", "Day2"]);
    expect(session.getSnapshot().sheetNames).toEqual(["Day1", "Day2"]);

    session.updateDraft({ selectedSheetName: "Day1" });
    expect(session.getSnapshot().selectedSheetName).toBe("Day1");
  });

  it("manages and clears active preview using frozen snapshot copies", () => {
    const session = createCircleDataSourceSession();
    const preview: CircleDataPreview = Object.freeze({
      previewId: "prev_1",
      ref: Object.freeze({ eventId: "c104", dayId: "day1" }),
      mode: "initial",
      expectedSourceGeneration: "gen_1",
      diff: Object.freeze({ added: [], updated: [], removed: [], countsLabel: "" }),
      newCircles: Object.freeze([]),
      fetchedAt: "2026-08-05T00:00:00.000Z",
      expiresAt: "2026-08-05T01:00:00.000Z",
    });

    session.setPreview(preview);
    const retrieved = session.getSnapshot().preview;
    expect(retrieved).toEqual(preview);
    expect(Object.isFrozen(retrieved)).toBe(true);

    session.setPreview(null);
    expect(session.getSnapshot().preview).toBeNull();
  });

  it("resets session state on reset() call", () => {
    const session = createCircleDataSourceSession();
    session.setBusy(true);
    session.updateDraft({ draftWebAppUrl: "https://example.com", selectedSheetName: "Sheet1" });
    session.setSheetNames(["Sheet1"]);

    session.reset();

    const snapshot = session.getSnapshot();
    expect(snapshot.busy).toBe(false);
    expect(snapshot.draftWebAppUrl).toBe("");
    expect(snapshot.selectedSheetName).toBe("");
    expect(snapshot.sheetNames).toEqual([]);
    expect(snapshot.preview).toBeNull();
  });
});
