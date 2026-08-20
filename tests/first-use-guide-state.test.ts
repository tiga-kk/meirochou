import { describe, expect, test, vi } from "vitest";
import {
  markFirstUseGuideSeen,
  readFirstUseGuideSeen,
} from "../apps/webapp/js/data/local-state-adapters";

const KEY = "meirochou.first-use-guide-seen";

describe("first-use guide state", () => {
  test("treats only the exact marker as seen", () => {
    let stored = "";
    const storage = {
      getString: (_key: string, fallback = "") => stored || fallback,
      setString: (_key: string, value: string) => {
        stored = value;
      },
    };

    expect(readFirstUseGuideSeen(storage)).toBe(false);
    stored = "0";
    expect(readFirstUseGuideSeen(storage)).toBe(false);
    stored = "legacy";
    expect(readFirstUseGuideSeen(storage)).toBe(false);
    stored = "1";
    expect(readFirstUseGuideSeen(storage)).toBe(true);
  });

  test("writes the exact first-use marker", () => {
    const setString = vi.fn();
    markFirstUseGuideSeen({
      getString: () => "",
      setString,
    });
    expect(setString).toHaveBeenCalledWith(KEY, "1");
  });

  test("fails closed on read errors and ignores write errors", () => {
    expect(
      readFirstUseGuideSeen({
        getString: () => {
          throw new Error("storage blocked");
        },
        setString: () => {},
      }),
    ).toBe(true);

    expect(() =>
      markFirstUseGuideSeen({
        getString: () => "",
        setString: () => {
          throw new Error("storage blocked");
        },
      }),
    ).not.toThrow();
  });
});
