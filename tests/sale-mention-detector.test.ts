import { describe, expect, it } from "vitest";
import { detectSaleMentions, SALE_MENTION_KEYWORDS } from "../apps/webapp/js/features/x-post-monitoring/public-api";

describe("sale mention detector", () => {
  it("uses NFKC substring matching for all fixed keywords, including negation text", () => {
    expect(SALE_MENTION_KEYWORDS).toEqual(["完売", "売り切れ", "売切れ", "頒布終了"]);
    const result = detectSaleMentions([
      { id: "1", text: "まだ完売していません", createdAt: "2026-08-15T01:00:00.000Z" },
      { id: "2", text: "売切れです", createdAt: "2026-08-15T02:00:00.000Z" },
      { id: "3", text: "在庫あります", createdAt: "2026-08-15T03:00:00.000Z" },
    ]);

    expect(result.matchedPosts.map((post) => post.id)).toEqual(["1", "2"]);
    expect(result.matchedKeywords).toEqual(["完売", "売切れ"]);
  });
});
