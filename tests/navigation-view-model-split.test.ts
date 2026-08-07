import { describe, expect, it } from "vitest";
import { parseSafeExternalUrl } from "../apps/webapp/js/shared/browser/parse-safe-external-url";
import { calculateContainedImageLayout } from "../apps/webapp/js/shared/ui/contained-image-layout";

describe("navigation view model split", () => {
  it("parses external URL safely", () => {
    expect(parseSafeExternalUrl("https://example.com")).toBe(
      "https://example.com/",
    );
    expect(parseSafeExternalUrl("javascript:alert(1)")).toBe("");
  });

  it("calculates contained image layout", () => {
    const layout = calculateContainedImageLayout(100, 200, 50, 50);
    expect(layout.scale).toBe(2);
    expect(layout.width).toBe(100);
    expect(layout.height).toBe(100);
  });
});
