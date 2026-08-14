import { describe, expect, it } from "vitest";
import { calculateMapStageLayout } from "../apps/webapp/js/features/route-guidance/ui/map-stage-layout";

describe("calculateMapStageLayout", () => {
  it("uses bounded cover for a wide map in a 390px phone viewport", () => {
    const layout = calculateMapStageLayout({
      viewportWidth: 390,
      viewportHeight: 608,
      imageWidth: 2000,
      imageHeight: 1000,
    });

    expect(layout?.viewportWidth).toBe(390);
    expect(layout?.viewportHeight).toBe(608);
    expect(layout?.stageWidth).toBeCloseTo(972.8);
    expect(layout?.stageHeight).toBeCloseTo(486.4);
    expect(layout?.initialX).toBeCloseTo(-291.4);
    expect(layout?.initialY).toBeCloseTo(60.8);
    expect(layout?.mode).toBe("bounded-cover");
  });

  it("keeps a medium viewport centered while preserving a wide image ratio", () => {
    const layout = calculateMapStageLayout({
      viewportWidth: 644,
      viewportHeight: 638,
      imageWidth: 1600,
      imageHeight: 1000,
    });

    expect(layout?.stageWidth).toBeCloseTo(816.64);
    expect(layout?.stageHeight).toBeCloseTo(510.4);
    expect(layout?.initialX).toBeCloseTo(-86.32);
    expect(layout?.initialY).toBeCloseTo(63.8);
    expect(layout?.mode).toBe("bounded-cover");
    expect((layout?.stageWidth ?? 0) / (layout?.stageHeight ?? 1)).toBeCloseTo(1.6);
  });

  it("uses contain when a wide viewport already fills the short side", () => {
    const layout = calculateMapStageLayout({
      viewportWidth: 1024,
      viewportHeight: 700,
      imageWidth: 1600,
      imageHeight: 1000,
    });

    expect(layout?.mode).toBe("contain");
    expect(layout?.stageWidth).toBeCloseTo(1024);
    expect(layout?.stageHeight).toBeCloseTo(640);
    expect(layout?.initialX).toBeCloseTo(0);
    expect(layout?.initialY).toBeCloseTo(30);
  });

  it("preserves a tall image ratio while leaving crop available for pan", () => {
    const layout = calculateMapStageLayout({
      viewportWidth: 390,
      viewportHeight: 608,
      imageWidth: 1000,
      imageHeight: 2000,
    });

    expect(layout?.mode).toBe("bounded-cover");
    expect(layout?.stageWidth).toBeCloseTo(312);
    expect(layout?.stageHeight).toBeCloseTo(624);
    expect(layout?.initialX).toBeCloseTo(39);
    expect(layout?.initialY).toBeCloseTo(-8);
    expect((layout?.stageWidth ?? 0) / (layout?.stageHeight ?? 1)).toBeCloseTo(0.5);
  });
});
