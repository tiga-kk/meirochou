import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const areas = ["e456", "e7", "s12", "w12"];

test("C108 map sources are SVG vector assets without embedded bitmap references", async () => {
  for (const area of areas) {
    const file = resolve(
      "apps/webapp/map-bundles/C108",
      area,
      "map.svg",
    );
    const source = await readFile(file, "utf8");
    const viewBox = source.match(/\bviewBox="([^"]+)"/i)?.[1] ?? "";
    const bitmapReferences = source.match(
      /<image\b|data:image|(?:href|xlink:href)="https?:\/\//gi,
    );

    assert.match(source, /<svg\b/i, `${area} is not an SVG document`);
    assert.match(
      viewBox,
      /^0 0 [1-9][0-9]* [1-9][0-9]*$/,
      `${area} has no positive SVG viewBox`,
    );
    assert.equal(bitmapReferences, null, `${area} embeds a bitmap reference`);
    console.log(`${area}: SVG viewBox=${viewBox}, embedded bitmaps=0`);
  }
});
