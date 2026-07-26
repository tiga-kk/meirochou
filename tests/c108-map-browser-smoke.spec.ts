import { expect, test } from "@playwright/test";

const RUN_C108_SMOKE = process.env.RUN_C108_SMOKE === "1";
const areaPrefixes = {
  e456: "東",
  e7: "東",
  s12: "南",
  w12: "西",
};

function pointSpace(
  areaId: string,
  point: { identifier: string; number: string | number },
) {
  return `${areaPrefixes[areaId as keyof typeof areaPrefixes]}${point.identifier}${point.number}`;
}

function buildSmokeState(spaces: readonly string[]) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    source: { type: "csv", fileName: "c108-browser-smoke.csv" },
    sourceGeneration: "source-c108-browser-smoke",
    circles: spaces.map((space) => ({ space })),
    purchased: [],
    hold: [],
    history: [],
    redo: [],
    gasOutbox: [],
    timestamps: { createdAt: now, updatedAt: now, sourceUpdatedAt: now },
  };
}

function closeEnough(actual: number, expected: number, epsilon = 0.01) {
  return Math.abs(actual - expected) <= epsilon;
}

test.describe("C108 Map Real Browser Smoke Test", () => {
  test.skip(
    !RUN_C108_SMOKE,
    "RUN_C108_SMOKE=1 is required to run C108 real map browser smoke test",
  );

  const areaIds = ["e456", "e7", "s12", "w12"];
  const allowedExternalHosts = new Set([
    "cdnjs.cloudflare.com",
    "platform.twitter.com",
    "syndication.twitter.com",
    "cdn.jsdelivr.net",
  ]);

  for (const areaId of areaIds) {
    test(`renders marker and route overlay for area ${areaId}`, async ({
      page,
      baseURL,
    }) => {
      const consoleErrors: string[] = [];
      const pageErrors: Error[] = [];
      const unexpectedExternalRequests: string[] = [];

      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error));
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (
          ["http:", "https:"].includes(url.protocol) &&
          url.hostname !== "127.0.0.1" &&
          url.hostname !== "localhost" &&
          !allowedExternalHosts.has(url.hostname)
        ) {
          unexpectedExternalRequests.push(request.url());
        }
      });

      const manifestResponse = await page.request.get(
        `${baseURL}/assets/maps/C108/manifest.json`,
      );
      expect(manifestResponse.ok()).toBe(true);
      const manifest = await manifestResponse.json();
      const area = manifest.areas.find(
        (candidate: { areaId: string }) => candidate.areaId === areaId,
      );
      expect(area).toBeDefined();

      const pointsResponse = await page.request.get(
        `${baseURL}/assets/maps/C108/${areaId}/points.json`,
      );
      expect(pointsResponse.ok()).toBe(true);
      const pointsData = await pointsResponse.json();
      const uniquePoints = [];
      const seenSpaces = new Set<string>();
      for (const point of pointsData.points) {
        const space = pointSpace(areaId, point);
        if (seenSpaces.has(space)) continue;
        seenSpaces.add(space);
        uniquePoints.push({ point, space });
      }
      expect(uniquePoints.length).toBeGreaterThanOrEqual(2);

      const startPoint = uniquePoints[0];
      const targetPoint = uniquePoints
        .slice(1)
        .reduce((farthest, candidate) => {
          const farthestDistance =
            (farthest.point.center_x - startPoint.point.center_x) ** 2 +
            (farthest.point.center_y - startPoint.point.center_y) ** 2;
          const candidateDistance =
            (candidate.point.center_x - startPoint.point.center_x) ** 2 +
            (candidate.point.center_y - startPoint.point.center_y) ** 2;
          return candidateDistance > farthestDistance ? candidate : farthest;
        });

      const smokeState = buildSmokeState([targetPoint.space]);
      await page.addInitScript(
        ({ state }) => {
          localStorage.setItem(
            "comipath:v1:C108:day1:state",
            JSON.stringify(state),
          );
          localStorage.setItem(
            "comipath:v1:index:event-days",
            JSON.stringify([{ eventId: "C108", dayId: "day1" }]),
          );
          localStorage.setItem(
            "comipath:v1:last-opened",
            JSON.stringify({ eventId: "C108", dayId: "day1" }),
          );
        },
        { state: smokeState },
      );

      await page.goto(`${baseURL}/`);
      const areaSelect = page.locator("#loc-ewsn").locator("..");
      await areaSelect.locator(".custom-select-trigger").click();
      await areaSelect
        .locator(`.custom-option[data-value="${areaId}"]`)
        .click();
      const labelSelect = page.locator("#loc-label").locator("..");
      await labelSelect.locator(".custom-select-trigger").click();
      await labelSelect
        .locator(`.custom-option[data-value="${startPoint.point.identifier}"]`)
        .click();
      await page.locator("#loc-number").fill(String(startPoint.point.number));
      await page.locator("#btn-search").click();

      const targetSpace = targetPoint.space;
      const startSpace = startPoint.space;
      await expect(page.locator("#navigation-map-image")).toHaveJSProperty(
        "complete",
        true,
      );
      await expect(page.locator("#navigation-map-image")).toHaveAttribute(
        "src",
        new RegExp(`/assets/maps/C108/${areaId}/map\\.svg$`),
      );
      await expect(
        page.locator(`.map-pin[data-space="${startSpace}"]`),
      ).toBeVisible();
      await expect(
        page.locator(`.map-pin[data-space="${targetSpace}"]`),
      ).toBeVisible();
      await expect(page.locator(".map-pin.start")).toBeVisible();
      await expect(page.locator(".map-pin.next")).toBeVisible();
      await expect(page.locator(".route-overlay")).toBeVisible();

      const gridResponse = await page.request.get(
        `${baseURL}/assets/maps/C108/${areaId}/grid-meta.json`,
      );
      expect(gridResponse.ok()).toBe(true);
      const gridMeta = await gridResponse.json();
      const gridBinaryResponse = await page.request.get(
        `${baseURL}/assets/maps/C108/${areaId}/grid.bin`,
      );
      expect(gridBinaryResponse.ok()).toBe(true);
      const gridBytes = new Uint8Array(await gridBinaryResponse.body());
      const svgResponse = await page.request.get(
        `${baseURL}/assets/maps/C108/${areaId}/map.svg`,
      );
      expect(svgResponse.headers()["content-type"]).toContain("image/svg+xml");
      const svgText = await svgResponse.text();
      const viewBox = svgText
        .match(/viewBox=["']([^"']+)["']/)?.[1]
        .split(/[\s,]+/)
        .map(Number);
      expect(viewBox).toHaveLength(4);
      expect(viewBox?.slice(2)).toEqual([gridMeta.width, gridMeta.height]);

      const routeGeometry = await page
        .locator(".route-overlay")
        .evaluate((overlay) => {
          const svg = overlay as SVGSVGElement;
          const polyline = svg.querySelector("polyline");
          return {
            viewBox: svg.getAttribute("viewBox"),
            points: (polyline?.getAttribute("points") ?? "")
              .trim()
              .split(/\s+/)
              .map((pair) => pair.split(",").map(Number)),
          };
        });
      expect(routeGeometry.viewBox).toBe(
        `0 0 ${gridMeta.width} ${gridMeta.height}`,
      );
      expect(routeGeometry.points.length).toBeGreaterThanOrEqual(2);

      const endpointCandidates = [startPoint.point, targetPoint.point];
      for (const [index, [x, y]] of routeGeometry.points.entries()) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(gridMeta.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(gridMeta.height);

        const col = Math.min(
          gridMeta.cols - 1,
          Math.floor(x / gridMeta.cell_size),
        );
        const row = Math.min(
          gridMeta.rows - 1,
          Math.floor(y / gridMeta.cell_size),
        );
        expect(gridBytes[row * gridMeta.cols + col]).not.toBe(0);

        if (index === 0 || index === routeGeometry.points.length - 1) {
          const endpoint = endpointCandidates[index === 0 ? 0 : 1];
          expect(
            endpoint.portals.some(
              (portal: { x: number; y: number }) =>
                closeEnough(portal.x, x) && closeEnough(portal.y, y),
            ),
          ).toBe(true);
        }
      }

      const pinPositions = await page.locator(".map-pin").evaluateAll((pins) =>
        pins.map((pin) => ({
          space: pin.getAttribute("data-space"),
          left: Number.parseFloat((pin as HTMLElement).style.left),
          top: Number.parseFloat((pin as HTMLElement).style.top),
        })),
      );
      for (const { space, point } of [startPoint, targetPoint]) {
        const pin = pinPositions.find((candidate) => candidate.space === space);
        expect(pin).toBeDefined();
        expect(pin?.left).toBeCloseTo(
          (point.center_x / gridMeta.width) * 100,
          2,
        );
        expect(pin?.top).toBeCloseTo(
          (point.center_y / gridMeta.height) * 100,
          2,
        );
      }

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(unexpectedExternalRequests).toEqual([]);
    });
  }
});
