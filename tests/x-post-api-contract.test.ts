import { describe, expect, it } from "vitest";
import {
  createXPostErrorBody,
  isXPostApiErrorBody,
  type XPostPage,
} from "../functions/_lib/x-post-contract";

describe("X post API contract", () => {
  it("keeps the browser success shape small and versioned", () => {
    const page: XPostPage = {
      schemaVersion: 1,
      handle: "circle_1",
      posts: [{ id: "1", text: "本文", createdAt: "2026-08-15T00:00:00.000Z" }],
      nextCursor: null,
      fetchedAt: "2026-08-14T00:00:00.000Z",
    };
    expect(Object.keys(page)).toEqual([
      "schemaVersion",
      "handle",
      "posts",
      "nextCursor",
      "fetchedAt",
    ]);
  });

  it("validates the stable error body", () => {
    const body = createXPostErrorBody("upstream_schema_changed", "schema changed");
    expect(isXPostApiErrorBody(body)).toBe(true);
    expect(isXPostApiErrorBody({ schemaVersion: 1, error: { code: "none" } })).toBe(false);
  });
});
