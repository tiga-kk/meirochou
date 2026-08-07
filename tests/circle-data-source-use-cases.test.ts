import { describe, expect, it } from "vitest";
import { diffCircleSources } from "../apps/webapp/js/features/circle-data-source/domain/circle-source-diff";
import { parseCircleCsv } from "../apps/webapp/js/features/circle-data-source/domain/csv-circle-codec";
import { createCircleDataSourceSession } from "../apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session";
import type { CircleRecord } from "../apps/webapp/js/features/event-day/public-api";

describe("Circle Data Source Domain Codecs", () => {
  it("parses CSV circle records correctly", () => {
    const csv = "space,priority\nA01,1";
    const res = parseCircleCsv(csv);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.circles.length).toBe(1);
      expect(res.circles[0].space).toBe("A01");
    }
  });

  it("diffs source circles accurately", () => {
    const before: CircleRecord[] = [{ space: "A01", priority: 1 }];
    const after: CircleRecord[] = [{ space: "A01", priority: 2 }];
    const diff = diffCircleSources(before, after);
    expect(diff.updated.length).toBe(1);
  });

  it("returns an immutable session snapshot", () => {
    const session = createCircleDataSourceSession();
    session.updateDraft({ draftWebAppUrl: "https://example.test" });

    const snapshot = session.getSnapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.sheetNames)).toBe(true);
    expect(() => {
      (snapshot.sheetNames as string[]).push("unexpected");
    }).toThrow(TypeError);
  });
});
