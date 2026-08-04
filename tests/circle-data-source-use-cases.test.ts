import { describe, expect, it, vi } from "vitest";
import { parseCircleCsv } from "../apps/webapp/js/features/circle-data-source/domain/csv-circle-codec";
import { diffCircleSources } from "../apps/webapp/js/features/circle-data-source/domain/circle-source-diff";

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
    const before = [{ space: "A01", priority: "1", circleName: "Old" } as any];
    const after = [{ space: "A01", priority: "2", circleName: "New" } as any];
    const diff = diffCircleSources(before, after);
    expect(diff.updated.length).toBe(1);
  });
});
