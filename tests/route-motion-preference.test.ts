import { describe, expect, test } from "vitest";
import {
  readRouteMotionPreference,
  writeRouteMotionPreference,
} from "../apps/webapp/js/data/local-state-adapters";
import {
  normalizeRouteMotionPreference,
  resolveRouteMotionEnabled,
} from "../apps/webapp/js/features/route-guidance/ui/route-motion-preference";

describe("route motion preference", () => {
  test("normalizes only system, always, and off", () => {
    expect(normalizeRouteMotionPreference("system")).toBe("system");
    expect(normalizeRouteMotionPreference("always")).toBe("always");
    expect(normalizeRouteMotionPreference("off")).toBe("off");
    expect(normalizeRouteMotionPreference("legacy")).toBe("system");
    expect(normalizeRouteMotionPreference(null)).toBe("system");
  });

  test("system follows reduced motion while always and off are explicit", () => {
    expect(
      resolveRouteMotionEnabled({
        preference: "system",
        prefersReducedMotion: true,
      }),
    ).toBe(false);
    expect(
      resolveRouteMotionEnabled({
        preference: "system",
        prefersReducedMotion: false,
      }),
    ).toBe(true);
    expect(
      resolveRouteMotionEnabled({
        preference: "always",
        prefersReducedMotion: true,
      }),
    ).toBe(true);
    expect(
      resolveRouteMotionEnabled({
        preference: "off",
        prefersReducedMotion: false,
      }),
    ).toBe(false);
  });

  test("persists the selected value and falls back on malformed storage", () => {
    let stored = "";
    const storage = {
      getString: (_key: string, fallback = "") => stored || fallback,
      setString: (_key: string, value: string) => {
        stored = value;
      },
    };

    writeRouteMotionPreference("always", storage);
    expect(readRouteMotionPreference(storage)).toBe("always");

    stored = "unexpected";
    expect(readRouteMotionPreference(storage)).toBe("system");
  });
});
