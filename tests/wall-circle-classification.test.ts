import { describe, expect, it } from "vitest";
import {
  collectWallIdentifiers,
  resolveCircleQueueClass,
} from "../apps/webapp/js/shared/domain/wall-circle-classification";

describe("wall circle classification", () => {
  it("collects only W_* identifiers and resolves other circles as normal", () => {
    const wall = collectWallIdentifiers([
      { group_id: "W_all", identifier: "ア" },
      { group_id: "W_left", identifier: "め" },
      { group_id: "I_01", identifier: "イ" },
      { group_id: undefined, identifier: "ウ" },
    ]);

    expect([...wall].sort()).toEqual(["め", "ア"].sort());
    expect(resolveCircleQueueClass("東ア10", wall)).toBe("wall");
    expect(resolveCircleQueueClass("東イ10", wall)).toBe("normal");
  });
});
