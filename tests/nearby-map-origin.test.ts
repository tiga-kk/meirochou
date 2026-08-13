// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  clientPointToGridSelection,
} from "../apps/webapp/js/features/route-guidance/public-api";
import { snapStartToWalkableCell } from "../apps/webapp/js/features/route-guidance/domain/start-selection";

describe("nearby map origin", () => {
  it("converts a transformed stage point back to image and grid coordinates", () => {
    expect(clientPointToGridSelection({
      clientX: 250,
      clientY: 150,
      stageRect: { left: 50, top: 50, width: 400, height: 200 },
      imageWidth: 1000,
      imageHeight: 500,
      grid: { cell_size: 100, cols: 10, rows: 5 },
    })).toEqual({ svgX: 500, svgY: 250, col: 5, row: 2 });
  });

  it("rejects points outside the image or invalid stage", () => {
    expect(clientPointToGridSelection({
      clientX: 10,
      clientY: 50,
      stageRect: { left: 50, top: 50, width: 400, height: 200 },
      imageWidth: 1000,
      imageHeight: 500,
      grid: { cell_size: 100, cols: 10, rows: 5 },
    })).toBeNull();
  });

  it("uses the existing snap behavior for blocked and all-blocked cells", () => {
    const meta = { cell_size: 10, cols: 3, rows: 1 };
    expect(snapStartToWalkableCell({ svgX: 15, svgY: 5 }, new Uint8Array([1, 0, 1]), meta, 30)?.gridIndex).toBe(0);
    expect(snapStartToWalkableCell({ svgX: 15, svgY: 5 }, new Uint8Array([0, 0, 0]), meta, 30)).toBeNull();
  });
});
