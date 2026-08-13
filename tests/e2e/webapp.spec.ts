import { expect, type Locator, type Page, test } from "@playwright/test";
import { routeDemoEventRegistry } from "./fixture-registry";

const pinFor = (page: Page, space: string) =>
  page.locator(`#navigation-pin-layer .map-pin[data-space="${space}"]`);

async function dispatchTouchSwipe(
  item: Locator,
  startX: number,
  endX: number,
): Promise<void> {
  await item.evaluate(
    (element, coordinates) => {
      const touch = (clientX: number) => ({
        identifier: 1,
        target: element,
        clientX,
        clientY: 100,
      });
      const dispatch = (type: string, touches: object[]) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "touches", { value: touches });
        element.dispatchEvent(event);
      };
      dispatch("touchstart", [touch(coordinates.startX)]);
      dispatch("touchmove", [touch(coordinates.endX)]);
      dispatch("touchend", []);
    },
    { startX, endX },
  );
}

async function readRouteCueSignal(page: Page, overlay: Locator) {
  const box = await overlay.boundingBox();
  expect(box).not.toBeNull();
  const samples = await overlay
    .locator(".route-flow-comet")
    .evaluate((element) => {
      const path = element as SVGGeometryElement;
      const matrix = path.getScreenCTM();
      if (!matrix) throw new Error("route cue has no screen transform");
      const totalLength = path.getTotalLength();
      return Array.from({ length: 41 }, (_, index) => {
        const point = path.getPointAtLength((totalLength * index) / 40);
        return {
          x: matrix.a * point.x + matrix.c * point.y + matrix.e,
          y: matrix.b * point.x + matrix.d * point.y + matrix.f,
        };
      });
    });
  const image = await overlay.screenshot();
  return page.evaluate(
    async ({ base64, box, samples }) => {
      const response = await fetch(`data:image/png;base64,${base64}`);
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2d canvas is unavailable");
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const scaleX = bitmap.width / box.width;
      const scaleY = bitmap.height / box.height;
      const scores = samples.map(({ x, y }) => {
        const centerX = Math.round((x - box.x) * scaleX);
        const centerY = Math.round((y - box.y) * scaleY);
        let score = 0;
        for (let offsetY = -4; offsetY <= 4; offsetY += 1) {
          for (let offsetX = -4; offsetX <= 4; offsetX += 1) {
            const pixelX = centerX + offsetX;
            const pixelY = centerY + offsetY;
            if (
              pixelX < 0 ||
              pixelY < 0 ||
              pixelX >= bitmap.width ||
              pixelY >= bitmap.height
            )
              continue;
            const offset = (pixelY * bitmap.width + pixelX) * 4;
            if (
              pixels[offset + 3] > 0 &&
              pixels[offset] > 220 &&
              pixels[offset + 1] > 220 &&
              pixels[offset + 2] > 220
            ) {
              score += 1;
            }
          }
        }
        return score;
      });
      return {
        scores,
        visibleSampleCount: scores.filter((score) => score > 0).length,
      };
    },
    {
      base64: image.toString("base64"),
      box: { x: box?.x ?? 0, y: box?.y ?? 0, width: box?.width ?? 1, height: box?.height ?? 1 },
      samples,
    },
  );
}

function differenceBetweenSignals(left: number[], right: number[]): number {
  return left.reduce(
    (difference, score, index) => difference + Math.abs(score - (right[index] ?? 0)),
    0,
  );
}

test.beforeEach(async ({ context, page }) => {
  await context.route(
    /(?:cdnjs\.cloudflare\.com|platform\.twitter\.com)/,
    (route) => route.abort(),
  );
  await routeDemoEventRegistry(page);
});

test("route未開始でもヘッダーの地図を開閉できる", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#header-area-title")).not.toHaveText("地図読込中");
  const opener = page.getByRole("button", { name: "地図" });
  await opener.click();

  const surface = page.locator("#nearby-map-surface");
  await expect(surface).toBeVisible();
  await expect(surface).toHaveAttribute("role", "dialog");
  await expect(surface).toHaveAttribute("aria-modal", "true");
  await expect(page.locator("#nearby-map-area option")).not.toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(surface).toBeHidden();
  await expect(opener).toBeFocused();
});

test("周辺地図のお品書きカードとleader lineから既存拡大表示を開ける", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      schemaVersion: 2,
      source: { type: "csv", fileName: "nearby-catalog-e2e.csv" },
      sourceGeneration: "nearby-catalog-e2e",
      circles: [
        {
          space: "東ア23a",
          priority: 10,
          tweet: "https://example.test/nearby-catalog.png",
        },
        {
          space: "東ア31b",
          priority: 9,
          tweet: "https://example.test/nearby-catalog.png",
        },
      ],
      circleStates: {},
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
      },
    };
    const ref = { eventId: "demo-v1", dayId: "day1" };
    localStorage.setItem("comipath:v1:index:event-days", JSON.stringify([ref]));
    localStorage.setItem("comipath:v1:last-opened", JSON.stringify(ref));
    localStorage.setItem(
      "comipath:v1:demo-v1:day1:state",
      JSON.stringify(state),
    );
  });

  await page.goto("/");
  await expect(page.locator("#loc-ewsn")).toHaveValue("demo-east");
  await expect(page.locator("#loc-label")).toHaveValue("ア");
  await page.locator("#loc-number").fill("10");
  await page.getByRole("button", { name: "地図" }).click();
  await page.getByRole("button", { name: "現在地を使う" }).click();

  const cards = page.locator(".nearby-catalog-card");
  await expect(cards).toHaveCount(2);
  await expect(page.locator("#nearby-map-controls")).toBeVisible();
  const nearbyControls = page.locator("#nearby-map-controls");
  await expect(
    nearbyControls.getByRole("button", { name: "10", exact: true }),
  ).toBeVisible();
  await expect(
    nearbyControls.getByRole("button", { name: "9", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#nearby-map-limit option")).toHaveCount(4);
  await expect(page.getByLabel("保留も表示")).toBeVisible();
  await nearbyControls.getByRole("button", { name: "10", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await nearbyControls.getByRole("button", { name: "9", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await nearbyControls.getByRole("button", { name: "すべて", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await page.locator("#nearby-map-limit").selectOption("10");
  await expect(page.locator("#nearby-map-limit")).toHaveValue("10");
  await page.getByLabel("保留も表示").check();
  await expect(page.getByLabel("保留も表示")).toBeChecked();
  const cardSpaces = await cards.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-space")),
  );
  for (let index = 0; index < cardSpaces.length; index += 1) {
    const space = cardSpaces[index];
    expect(space).not.toBeNull();
    await expect(cards.nth(index)).toContainText(space ?? "");
    await expect(cards.nth(index)).toContainText(/優先度: (?:10|9)/);
  }

  const leaders = page.locator(".nearby-map-leader");
  await expect(cards.first()).toBeVisible();
  await expect(leaders.first()).toBeVisible();
  await expect(leaders).toHaveCount(cardSpaces.length);
  const leaderSpaces = await leaders.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-space")),
  );
  expect(leaderSpaces).toEqual(cardSpaces);
  const cardRects = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }),
  );
  for (let left = 0; left < cardRects.length; left += 1) {
    for (let right = left + 1; right < cardRects.length; right += 1) {
      expect(
        Math.max(0, Math.min(cardRects[left].right, cardRects[right].right) - Math.max(cardRects[left].left, cardRects[right].left)) *
          Math.max(0, Math.min(cardRects[left].bottom, cardRects[right].bottom) - Math.max(cardRects[left].top, cardRects[right].top)),
      ).toBe(0);
    }
  }
  expect(Number.parseFloat(await leaders.first().evaluate((element) => getComputedStyle(element).strokeWidth))).toBeGreaterThan(2);
  await cards.first().focus();
  await page.keyboard.press("Enter");
  await expect(cards.first()).toHaveAttribute("aria-selected", "true");
  await expect(cards.first()).toHaveClass(/nearby-catalog-card--selected/);
  const beforeZoomAnchor = await leaders.first().getAttribute("x1");
  await page.evaluate(() => {
    document.getElementById("nearby-map-viewport")?.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100, clientX: 200, clientY: 300 }),
    );
  });
  await expect.poll(() => page.locator("#nearby-map-layer").getAttribute("style")).toContain("scale(1.1)");
  await expect.poll(() => leaders.first().getAttribute("x1")).not.toBe(beforeZoomAnchor);
  await expect(cards.first()).toHaveAttribute("aria-selected", "true");
  await expect(
    cards.first().getByRole("button", { name: "お品書きを見る" }),
  ).toBeVisible();
  await cards.first()
    .getByRole("button", { name: "お品書きを見る" })
    .click({ force: true });
  await expect(page.locator("#pdf-modal")).toBeVisible();
  await page.locator("#btn-close-pdf").click({ force: true });
  await cards.first()
    .getByRole("button", { name: "目的地にする" })
    .click({ force: true });
  await expect(page.locator("#nearby-map-surface")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("目的地を");
});

test("地図の基準地点は選択モード中のtapだけで変更される", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "地図" }).click();
  const viewport = page.locator("#nearby-map-viewport");
  const stage = page.locator("#nearby-map-layer");
  const marker = page.locator("#nearby-map-origin-marker");
  await expect(page.getByRole("button", { name: "基準地点を変更" })).toHaveCSS(
    "min-height",
    "44px",
  );
  await expect(page.getByRole("button", { name: "現在地を使う" })).toHaveCSS(
    "min-height",
    "44px",
  );
  await expect(page.locator("#nearby-map-image")).toHaveJSProperty(
    "complete",
    true,
  );
  const nearbyMapGeometry = await page.evaluate(() => {
    const image = document.querySelector("#nearby-map-image") as HTMLImageElement;
    const stage = document.querySelector("#nearby-map-layer") as HTMLElement;
    const rect = stage.getBoundingClientRect();
    return {
      imageRatio: image.naturalWidth / image.naturalHeight,
      stageRatio: rect.width / rect.height,
    };
  });
  expect(nearbyMapGeometry.stageRatio).toBeCloseTo(
    nearbyMapGeometry.imageRatio,
    2,
  );

  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  await viewport.click({ position: { x: 4, y: 4 } });
  await expect(marker).toBeHidden();

  await page.getByRole("button", { name: "現在地を使う" }).click();
  await expect(marker).toBeVisible();

  await page.getByRole("button", { name: "基準地点を変更" }).click();
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  await page.mouse.click(
    (stageBox?.x ?? 0) + (stageBox?.width ?? 0) * (4 / 960),
    (stageBox?.y ?? 0) + (stageBox?.height ?? 0) * (4 / 640),
  );
  await expect(marker).toBeVisible();
  await expect(page.getByText("地図を1回タップして基準地点を選択してください")).toHaveCount(0);
});

test("初回訪問では空のローカルイベント・日程で起動する", async ({ page }) => {
  await page.goto("/");

  const settings = page.locator("#settings-area");
  await expect(settings).toBeHidden();
  const managementButton = page.getByRole("button", { name: "管理" });
  await expect(managementButton).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.locator("#toast")).toContainText("CSVデータ未設定");

  await managementButton.click();
  await expect(settings).toBeVisible();
  await expect(page.locator("event-day-management-view")).toBeVisible();
  await expect(page.locator(".container > comipath-settings.card")).toHaveCount(0);
  await expect(settings.locator(".management-surface-close")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  await expect(managementButton).toBeFocused();
});

test("予定を開くと巡回順と地図pinの番号が一致し案内状態を変えない", async ({
  page,
}) => {
  await page.goto("/?demo_ui=1");

  await expect(page.locator("#target-space-heading")).not.toHaveText("---");
  const beforeTarget = await page
    .locator("#target-space-heading")
    .textContent();
  await page.locator("#btn-open-itinerary").click();

  const dialog = page.locator("#route-itinerary-dialog");
  await expect(dialog.getByRole("dialog")).toBeVisible();
  const entries = dialog.locator("[data-itinerary-index]");
  await expect(entries).not.toHaveCount(0);
  const entryIndexes = await entries.evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-itinerary-index")),
  );
  const pinIndexes = await page
    .locator("#navigation-pin-layer .itinerary-pin")
    .evaluateAll((pins) =>
      pins
        .map((pin) => pin.getAttribute("data-itinerary-index"))
        .sort((left, right) => Number(left) - Number(right)),
    );
  expect(pinIndexes).toEqual(
    entryIndexes
      .filter((index) => index !== null)
      .sort((left, right) => Number(left) - Number(right)),
  );
  for (const index of pinIndexes) {
    await expect(
      page.locator(
        `#navigation-pin-layer .itinerary-pin[data-itinerary-index="${index}"]`,
      ),
    ).toHaveAccessibleName(new RegExp(`^${index}番、`));
  }
  await expect(page.locator("#target-space-heading")).toHaveText(
    beforeTarget || "",
  );

  await dialog.getByRole("button", { name: "予定を閉じる" }).click();
  await expect(dialog.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator("#navigation-pin-layer .itinerary-pin"),
  ).toHaveCount(0);
  await expect(page.locator("#target-space-heading")).toHaveText(
    beforeTarget || "",
  );
});

test("使い方をheaderから開き、本文を拡大表示して閉じられる", async ({
  page,
}) => {
  await page.goto("/?demo_ui=1");

  const guideButton = page.locator("#btn-open-user-guide");
  await guideButton.click();
  const guide = page.locator("#user-guide-dialog");
  const dialog = guide.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(guide.getByRole("heading", { name: "CSVを使う" })).toBeVisible();
  await expect(
    guide.getByRole("heading", { name: "Google Spreadsheet / GASを使う" }),
  ).toBeVisible();
  await expect(
    guide.getByRole("heading", { name: "地図と経路変更" }),
  ).toBeVisible();
  await expect(
    guide.getByRole("heading", { name: "一覧とスワイプ" }),
  ).toBeVisible();
  await expect(
    guide.getByRole("heading", { name: "未送信GASデータ" }),
  ).toBeVisible();
  const csvSection = guide
    .getByRole("heading", { name: "CSVを使う" })
    .locator("..");
  const gasSection = guide
    .getByRole("heading", { name: "Google Spreadsheet / GASを使う" })
    .locator("..");
  await expect(csvSection).toContainText("space");
  await expect(csvSection).toContainText("不正なpriority");
  await expect(csvSection).not.toContainText("認識済みヘッダーの重複");
  await expect(gasSection).toContainText("isSale");
  await expect(gasSection).toContainText("認識済みヘッダーの重複");
  await expect(gasSection).not.toContainText("不正なpriority");

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const scrollMetrics = await guide
    .locator(".user-guide-body")
    .evaluate((body) => {
      const dialogElement = body.closest<HTMLElement>(".user-guide-dialog");
      const dialogStyle = dialogElement
        ? getComputedStyle(dialogElement)
        : null;
      const bodyStyle = getComputedStyle(body);
      return {
        dialogMaxHeight: dialogStyle?.maxHeight,
        dialogOverflow: dialogStyle?.overflow,
        bodyOverflowY: bodyStyle.overflowY,
        bodyCanScroll: body.scrollHeight > body.clientHeight,
      };
    });
  expect(scrollMetrics.dialogMaxHeight).not.toBe("none");
  expect(scrollMetrics.dialogOverflow).toBe("hidden");
  expect(["auto", "scroll"]).toContain(scrollMetrics.bodyOverflowY);
  expect(scrollMetrics.bodyCanScroll).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(guideButton).toBeFocused();
});

test("デモデータで地図・ピン・経路・ボトムシートを表示する", async ({
  page,
}) => {
  await page.goto("/?demo_ui=1");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await expect(page.locator("#target-content")).toBeVisible();
  await expect(page.locator('[data-route-kind="candidate"]')).toHaveCount(0);
  await expect(page.locator("#navigation-map-image")).toHaveJSProperty(
    "complete",
    true,
  );
  const pins = page.locator("#navigation-pin-layer .map-pin");
  await expect(pins.first()).toBeVisible();
  await expect(page.locator(".map-pin.todo").first()).toHaveCSS(
    "background-color",
    "rgba(107, 114, 128, 0.4)",
  );
  await expect(page.locator(".map-pin.hold")).toHaveCSS(
    "background-color",
    "rgba(183, 121, 31, 0.4)",
  );
  await expect(page.locator(".map-pin.start")).toHaveCSS(
    "background-color",
    "rgba(255, 255, 255, 0.4)",
  );

  const nextPin = page.locator("#navigation-pin-layer .map-pin.next");
  await expect(nextPin).toBeVisible();
  await expect(nextPin).toHaveCSS("background-color", "rgba(210, 47, 39, 0.4)");
  const outlines = await pins.evaluateAll((elements) =>
    elements.map((element) => ({
      borderWidth: getComputedStyle(element).borderWidth,
      boxShadow: getComputedStyle(element).boxShadow,
    })),
  );
  expect(outlines.every(({ borderWidth }) => borderWidth === "0px")).toBe(true);
  expect(outlines.every(({ boxShadow }) => boxShadow === "none")).toBe(true);
  expect(
    await page
      .locator(".map-pin.start")
      .evaluate((element) => getComputedStyle(element, "::after").borderWidth),
  ).toBe("0px");

  await page.locator("#navigation-pin-layer").evaluate((layer) => {
    const donePin = document.createElement("button");
    donePin.id = "test-done-pin";
    donePin.className = "map-pin done";
    layer.appendChild(donePin);
  });
  const donePin = page.locator("#test-done-pin");
  await expect(donePin).toHaveCSS("background-color", "rgba(21, 128, 61, 0.4)");
  await donePin.evaluate((pin) => pin.remove());
  await expect(
    page.locator("#navigation-pin-layer .route-overlay"),
  ).toBeVisible();
  await expect(
    page.locator('[data-route-kind="current"] .route-overlay-line'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-route-kind="current"] .route-flow-line'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-route-kind="current"] .route-flow-comet'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-route-kind="current"] .route-flow-direction'),
  ).toHaveAttribute("marker-end", "url(#route-direction-arrow)");
  await expect(
    page.locator('[data-route-kind="current"] .route-start-marker'),
  ).toHaveText("S");
  await expect(
    page.locator('[data-route-kind="current"] .route-goal-marker'),
  ).toHaveText("G");
  await expect(
    page.locator('[data-route-kind="current"] .route-flow-direction'),
  ).toBeVisible();
  await expect(
    page.locator('[data-route-kind="current"] .route-flow-line'),
  ).toHaveCSS("animation-name", "route-flow-comet");
  const routeFlow = page.locator(
    '[data-route-kind="current"] .route-flow-comet',
  );
  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
  ).toBe(false);
  const naturalStart = await routeFlow.evaluate((element) => {
    const animation = element
      .getAnimations()
      .find((candidate) => candidate instanceof CSSAnimation);
    return {
      animationCount: element
        .getAnimations()
        .filter((candidate) => candidate instanceof CSSAnimation).length,
      currentTime: animation?.currentTime,
      duration: animation?.effect?.getComputedTiming().duration,
    };
  });
  expect(naturalStart.animationCount).toBeGreaterThan(0);
  expect(typeof naturalStart.currentTime).toBe("number");
  expect(typeof naturalStart.duration).toBe("number");
  await page.waitForTimeout(180);
  const naturalEnd = await routeFlow.evaluate((element) => {
    const animation = element
      .getAnimations()
      .find((candidate) => candidate instanceof CSSAnimation);
    return animation?.currentTime;
  });
  expect(naturalEnd).toBeGreaterThan(naturalStart.currentTime ?? 0);

  const offsets = [];
  for (let index = 0; index < 3; index += 1) {
    offsets.push(
      await routeFlow.evaluate(
        (element) => getComputedStyle(element).strokeDashoffset,
      ),
    );
    await page.waitForTimeout(180);
  }
  expect(new Set(offsets).size).toBeGreaterThan(1);

  const seekAnimation = async (time: number) => {
    await routeFlow.evaluate((element, animationTime) => {
      const animation = element
        .getAnimations()
        .find((candidate) => candidate instanceof CSSAnimation);
      if (!animation) throw new Error("production CSSAnimation is missing");
      animation.pause();
      animation.currentTime = animationTime;
    }, time);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const duration = Number(naturalStart.duration);
  await seekAnimation(0);
  const samePhaseA = await readRouteCueSignal(
    page,
    page.locator('[data-route-kind="current"]'),
  );
  await seekAnimation(0);
  const samePhaseB = await readRouteCueSignal(
    page,
    page.locator('[data-route-kind="current"]'),
  );
  await seekAnimation(duration / 4);
  const laterPhase = await readRouteCueSignal(
    page,
    page.locator('[data-route-kind="current"]'),
  );
  expect(samePhaseA.visibleSampleCount).toBeGreaterThan(0);
  expect(laterPhase.visibleSampleCount).toBeGreaterThan(0);
  const samePhaseDifference = differenceBetweenSignals(
    samePhaseA.scores,
    samePhaseB.scores,
  );
  const crossPhaseDifference = differenceBetweenSignals(
    samePhaseA.scores,
    laterPhase.scores,
  );
  expect(crossPhaseDifference).toBeGreaterThan(samePhaseDifference * 3 + 1);
  const positiveDelta = laterPhase.scores.reduce(
    (sum, score, index) =>
      sum + Math.max(0, score - (samePhaseA.scores[index] ?? 0)),
    0,
  );
  const negativeDelta = laterPhase.scores.reduce(
    (sum, score, index) =>
      sum + Math.max(0, (samePhaseA.scores[index] ?? 0) - score),
    0,
  );
  expect(positiveDelta).toBeGreaterThan(negativeDelta + 1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.locator('[data-route-kind="current"] .route-flow-comet'),
  ).toHaveCSS("animation-name", "none");
  await expect(
    page.locator('[data-route-kind="current"] .route-overlay-line'),
  ).toBeVisible();
  await expect(
    page.locator('[data-route-kind="current"] .route-start-marker'),
  ).toBeVisible();
  await expect(
    page.locator('[data-route-kind="current"] .route-goal-marker'),
  ).toBeVisible();
  await expect(
    page.locator('[data-route-kind="current"] .route-flow-direction'),
  ).toBeVisible();
  const currentSummaryTarget = (
    await page.locator("#target-space-heading").textContent()
  )?.trim();
  const currentSummaryDistance = (
    await page.locator("#target-route-log").textContent()
  )
    ?.split(" /")[0]
    .trim();
  await expect(page.locator("#target-start-space")).not.toHaveText("---");
  await expect(page.locator("#target-route-log")).toHaveText(/^距離 \d+$/);
  await expect(page.locator(".target-bottom-sheet")).not.toContainText(
    currentSummaryTarget || "",
  );
  await expect(page.locator(".target-bottom-sheet")).not.toContainText(
    currentSummaryDistance || "",
  );
  await expect(page.locator("#route-selection-controls")).toBeHidden();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".target-bottom-sheet")).toBeVisible();
  await pinFor(page, "東ア23a").evaluate((button: HTMLButtonElement) =>
    button.click(),
  );
  const catalog = page.locator("#tweet-embed-container img");
  await expect(catalog).toBeVisible();
  await expect(page.locator("#next-target")).toHaveAttribute(
    "data-catalog-orientation",
    "landscape",
  );
  await expect(catalog).toHaveCSS("object-fit", "contain");
  const imageBox = await catalog.boundingBox();
  const previewBox = await page.locator("#tweet-embed-container").boundingBox();
  expect(imageBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(imageBox?.width).toBeGreaterThan(250);
  expect(imageBox?.x).toBeGreaterThanOrEqual(previewBox?.x);
  expect(imageBox?.x + imageBox?.width).toBeLessThanOrEqual(
    previewBox?.x + previewBox?.width + 1,
  );
  await page
    .locator("#toast")
    .evaluate((toast) => toast.classList.remove("show"));
  await expect(page.locator("#toast")).toBeHidden();
  await expect(page.locator("#next-target")).toHaveScreenshot(
    "navigation-map-catalog.png",
  );
  await expect(page.locator("#next-target")).toHaveScreenshot(
    "navigation-target-landscape-mobile.png",
  );

  await pinFor(page, "東ア31b").evaluate((button: HTMLButtonElement) =>
    button.click(),
  );
  const portraitCatalog = page.locator("#tweet-embed-container img");
  await expect(portraitCatalog).toHaveCSS("object-fit", "contain");
  await expect(page.locator("#next-target")).toHaveAttribute(
    "data-catalog-orientation",
    "portrait",
  );
  const portraitDimensions = await portraitCatalog.evaluate(
    (image: HTMLImageElement) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    }),
  );
  expect(portraitDimensions.height).toBeGreaterThan(portraitDimensions.width);
  const portraitBox = await portraitCatalog.boundingBox();
  const portraitPreviewBox = await page
    .locator("#tweet-embed-container")
    .boundingBox();
  expect(portraitBox).not.toBeNull();
  expect(portraitPreviewBox).not.toBeNull();
  expect(portraitBox?.width).toBeLessThanOrEqual(portraitPreviewBox?.width + 1);
  expect(portraitBox?.height).toBeLessThanOrEqual(
    portraitPreviewBox?.height + 1,
  );
  const targetLayout = page.locator(".target-detail-layout");
  const mobileLayout = await targetLayout.evaluate((element) => {
    const style = getComputedStyle(element);
    const meta = element.querySelector(".target-detail-meta");
    const actions = element.querySelector(".target-detail-actions");
    const metaBox = meta?.getBoundingClientRect();
    const actionsBox = actions?.getBoundingClientRect();
    return {
      columns: style.gridTemplateColumns,
      areas: style.gridTemplateAreas,
      metaTop: metaBox?.top ?? 0,
      actionsTop: actionsBox?.top ?? 0,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(mobileLayout.columns.split(" ")).toHaveLength(1);
  expect(mobileLayout.areas).toContain('"catalog"');
  expect(mobileLayout.actionsTop).toBeGreaterThanOrEqual(mobileLayout.metaTop);
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(
    mobileLayout.viewportWidth,
  );
  expect(portraitBox?.height).toBeLessThanOrEqual(
    (page.viewportSize()?.height ?? 0) * 0.6 + 2,
  );
  await expect(page.locator("#next-target")).toHaveScreenshot(
    "navigation-target-portrait-mobile.png",
  );
});

test("巡回対象priority chipで通常検索の対象を絞り込める", async ({ page }) => {
  await page.goto("/?demo_ui=1");

  await expect(page.locator("#route-priority-filter .priority-chip")).toHaveCount(4);
  const priorityChip = page.getByRole("button", { name: "9", exact: true });
  await expect(priorityChip).toHaveCSS("min-height", "44px");
  await priorityChip.click();
  await expect(
    priorityChip,
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator("#btn-search").click();

  await expect(page.locator("#target-space-heading")).toHaveText("東ア31b");
  await expect(page.locator("#target-space-heading")).not.toHaveText("東ア23a");
});

test("390pxのcurrent経路は実画面線幅を保ちcandidateは静的経路になる", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo_ui=1");

  const screenStrokeWidth = async (selector: string) =>
    page.locator(selector).evaluate((element) => {
      const svg = element.ownerSVGElement;
      const ctm = (element as SVGGeometryElement).getScreenCTM();
      const style = getComputedStyle(element);
      const stage = document.getElementById("navigation-map-layer");
      if (!svg || !ctm || !stage) return { screenWidth: 0, viewBoxWidth: 0, stageWidth: 0 };
      const strokeWidth = Number.parseFloat(
        style.getPropertyValue("stroke-width"),
      );
      const scale = Math.hypot(ctm.a, ctm.b);
      return {
        screenWidth:
          style.getPropertyValue("vector-effect") === "non-scaling-stroke"
            ? strokeWidth
            : strokeWidth * scale,
        viewBoxWidth: svg.viewBox.baseVal.width,
        stageWidth: stage.getBoundingClientRect().width,
      };
    });

  await expect(
    page.locator('[data-route-kind="current"] .route-overlay-line'),
  ).toBeVisible();
  const currentBaseMetrics = await screenStrokeWidth(
    '[data-route-kind="current"] .route-overlay-line',
  );
  const currentFlowMetrics = await screenStrokeWidth(
    '[data-route-kind="current"] .route-flow-comet',
  );
  expect(currentBaseMetrics.viewBoxWidth).toBeGreaterThan(0);
  expect(currentBaseMetrics.stageWidth).toBeGreaterThan(0);
  expect(currentBaseMetrics.screenWidth).toBeGreaterThanOrEqual(3);
  expect(currentFlowMetrics.screenWidth).toBeGreaterThanOrEqual(3);

  const candidatePin = page.locator('.map-pin[data-space="東ア31b"]');
  await candidatePin.evaluate((button: HTMLButtonElement) => button.click());
  await page
    .locator(".candidate-preview-card")
    .getByRole("button", { name: "経路を比較" })
    .click();
  await expect(
    page.locator('[data-route-kind="candidate"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-route-kind="candidate"] .route-overlay-line'),
  ).toBeVisible();
  await expect(
    page.locator('[data-route-kind="candidate"] .route-flow-comet'),
  ).toHaveCount(0);
});

test("小さく描画されたmap-pinも44pxの操作領域と8pxの視認領域を保つ", async ({
  page,
}) => {
  await page.goto("/?demo_ui=1");
  const pin = page.locator("#navigation-pin-layer .map-pin.todo").first();
  await expect(pin).toBeVisible();
  await page.locator("#navigation-map-layer").evaluate((layer) => {
    (layer as HTMLElement).style.transform = "scale(1)";
  });

  const metrics = await pin.evaluate((element) => {
    const pin = element as HTMLElement;
    pin.style.width = "3px";
    pin.style.height = "3px";
    const style = getComputedStyle(pin);
    const box = pin.getBoundingClientRect();
    const borderWidth =
      Number.parseFloat(style.borderLeftWidth) +
      Number.parseFloat(style.borderRightWidth);
    const paddingWidth =
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight);
    return {
      hitboxWidth: box.width,
      hitboxHeight: box.height,
      contentWidth: box.width - borderWidth - paddingWidth,
      contentHeight:
        box.height -
        Number.parseFloat(style.borderTopWidth) -
        Number.parseFloat(style.borderBottomWidth) -
        Number.parseFloat(style.paddingTop) -
        Number.parseFloat(style.paddingBottom),
    };
  });

  expect(metrics.hitboxWidth).toBeGreaterThanOrEqual(44);
  expect(metrics.hitboxHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.contentWidth).toBeGreaterThanOrEqual(8);
  expect(metrics.contentHeight).toBeGreaterThanOrEqual(8);
});

test("320px幅・200% zoomでも候補と距離を横スクロールなしで表示する", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/?demo_ui=1");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  await expect(page.locator("#target-space-heading")).not.toHaveText("---");
  const currentTarget = (
    await page.locator("#target-space-heading").textContent()
  )?.trim();
  const candidate = currentTarget === "東ア23a" ? "東ア31b" : "東ア23a";
  await pinFor(page, candidate).evaluate((button: HTMLButtonElement) =>
    button.click(),
  );
  const candidatePreview = page.locator(".candidate-preview-card");
  await expect(candidatePreview).toBeVisible();
  await candidatePreview.getByRole("button", { name: "経路を比較" }).click();
  await expect(page.locator("#selected-target-space")).toBeVisible();
  await expect(page.locator("#target-dist")).toHaveText(/^距離 /);

  const overflow = await page.evaluate(() => {
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(overflow.documentWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(
    overflow.viewportWidth,
  );
  await expect(page.locator("#next-target")).toHaveScreenshot(
    "navigation-target-portrait-200-percent.png",
  );
});

test("390px幅のportraitカタログは一列で横スクロールしない", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo_ui=1");
  await pinFor(page, "東ア31b").evaluate((button: HTMLButtonElement) =>
    button.click(),
  );
  await expect(pinFor(page, "東ア31b")).toBeVisible();
  await page.getByRole("button", { name: "行き先変更" }).click();
  await expect(page.locator("#tweet-embed-container img")).toBeVisible();
  await expect(page.locator("#next-target")).toHaveAttribute(
    "data-catalog-orientation",
    "portrait",
  );
  const layout = page.locator(".target-detail-layout");
  const metrics = await layout.evaluate((element) => {
    const style = getComputedStyle(element);
    const meta = element.querySelector(".target-detail-meta");
    const actions = element.querySelector(".target-detail-actions");
    return {
      columns: style.gridTemplateColumns,
      metaTop: meta?.getBoundingClientRect().top ?? 0,
      actionsTop: actions?.getBoundingClientRect().top ?? 0,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(metrics.columns.split(" ")).toHaveLength(1);
  expect(metrics.actionsTop).toBeGreaterThanOrEqual(metrics.metaTop);
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);

  await page.setViewportSize({ width: 700, height: 844 });
  const wideColumns = await layout.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(" "),
  );
  expect(wideColumns).toHaveLength(2);
});

test("同一地点では次目的地ピンを通常ピンより前面に表示する", async ({
  page,
}) => {
  await page.goto("/?demo_ui=1");
  const nextPin = page.locator("#navigation-pin-layer .map-pin.next");
  await expect(nextPin).toBeVisible();

  const nextPinIsTopmost = await nextPin.evaluate((pin) => {
    const overlap = document.createElement("button");
    overlap.className = "map-pin todo";
    overlap.style.left = (pin as HTMLElement).style.left;
    overlap.style.top = (pin as HTMLElement).style.top;
    overlap.style.width = getComputedStyle(pin).width;
    overlap.style.height = getComputedStyle(pin).height;
    pin.parentElement?.appendChild(overlap);

    const rect = pin.getBoundingClientRect();
    const topmost = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    overlap.remove();
    return topmost === pin;
  });

  expect(nextPinIsTopmost).toBe(true);
});

test("重なるピンはpointer位置に近い候補を選ぶ", async ({ page }) => {
  await page.goto("/?demo_ui=1");

  const leftPin = pinFor(page, "東ア31b");
  const rightPin = pinFor(page, "東ア41a");
  await expect(leftPin).toBeVisible();
  await expect(rightPin).toBeVisible();

  await leftPin.evaluate((element) => {
    element.style.left = "60px";
    element.style.top = "20px";
  });
  await rightPin.evaluate((element) => {
    element.style.left = "calc(60px + 18px)";
    element.style.top = "20px";
  });

  const leftBox = await leftPin.boundingBox();
  const rightBox = await rightPin.boundingBox();
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();

  await rightPin.evaluate(
    (element, point) =>
      element.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: point.x,
          clientY: point.y,
          detail: 1,
        }),
      ),
    {
      x: (leftBox?.x ?? 0) + (leftBox?.width ?? 0) / 2,
      y: (leftBox?.y ?? 0) + (leftBox?.height ?? 0) / 2,
    },
  );
  await expect(page.locator(".candidate-preview-card")).toContainText(
    "東ア31b",
  );
  await page.getByRole("button", { name: "候補を閉じる" }).click();

  await rightPin.evaluate(
    (element, point) =>
      element.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: point.x,
          clientY: point.y,
          detail: 1,
        }),
      ),
    {
      x: (rightBox?.x ?? 0) + (rightBox?.width ?? 0) / 2,
      y: (rightBox?.y ?? 0) + (rightBox?.height ?? 0) / 2,
    },
  );
  await expect(page.locator(".candidate-preview-card")).toContainText(
    "東ア41a",
  );
});

test("ピンの候補経路を比較してから目的地を変更する", async ({ page }) => {
  await page.goto("/?demo_ui=1");

  const heading = page.locator("#target-space-heading");
  await expect(heading).not.toHaveText("---");
  const originalTarget = (await heading.textContent())?.trim();
  const candidate = originalTarget === "東ア23a" ? "東ア31b" : "東ア23a";

  const candidatePin = pinFor(page, candidate);
  await candidatePin.evaluate((button: HTMLButtonElement) => button.click());
  const candidatePreview = page.locator(".candidate-preview-card");
  await expect(candidatePreview).toBeVisible();
  await candidatePreview.getByRole("button", { name: "経路を比較" }).click();

  await expect(heading).toHaveText(originalTarget || "");
  await expect(page.locator("#target-status-label")).toHaveText("変更候補");
  await expect(page.locator("#selected-target-space")).toHaveText(candidate);
  await expect(candidatePin).toHaveClass(/selected/);
  await expect(candidatePin).toHaveCSS(
    "background-color",
    "rgba(0, 90, 156, 0.4)",
  );
  await expect(candidatePin).toHaveAccessibleName(`候補選択中 ${candidate}`);
  await expect(page.locator(".candidate-selection-label")).toHaveText(
    "変更候補",
  );
  await expect(page.locator("#route-selection-controls")).toBeVisible();
  await expect(page.locator("#btn-close-route-selection")).toBeVisible();
  await expect(page.locator("#target-dist")).toHaveText(/^距離 \d+$/);
  await expect(page.locator("#target-tweet-link")).toHaveAttribute(
    "href",
    candidate === "東ア23a"
      ? "https://x.com/circle_a"
      : "https://x.com/circle_b",
  );
  await expect(page.locator("#target-tweet-link")).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await expect(page.locator("#btn-preview-route")).toBeEnabled();
  await expect(page.locator('[data-route-kind="current"]')).toBeVisible();
  await expect(page.locator('[data-route-kind="candidate"]')).toBeVisible();

  await page.locator("#btn-close-route-selection").click();
  await expect(page.locator("#route-selection-controls")).toBeHidden();
  await expect(page.locator("#target-status-label")).toHaveText("お品書き");
  await expect(heading).toHaveText(originalTarget || "");
  await expect(page.locator('[data-route-kind="candidate"]')).toHaveCount(0);

  await candidatePin.evaluate((button: HTMLButtonElement) => button.click());
  await expect(candidatePreview).toBeVisible();
  await candidatePreview.getByRole("button", { name: "経路を比較" }).click();
  await expect(page.locator("#btn-preview-route")).toBeEnabled();

  await page.locator("#btn-preview-route").click();

  await expect(page.locator("#route-change-confirmation")).toBeVisible();
  await expect(page.locator("#route-change-current")).toHaveText(
    originalTarget || "",
  );
  await expect(page.locator("#route-change-candidate")).toHaveText(candidate);
  await expect(page.locator('[data-route-kind="current"]')).toBeVisible();
  await expect(page.locator('[data-route-kind="candidate"]')).toBeVisible();
  await expect(
    page.locator('[data-route-kind="candidate"] .route-overlay-line'),
  ).toHaveCSS("stroke-dasharray", "none");
  await expect(
    page.locator('[data-route-kind="candidate"] .route-flow-comet'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-route-kind="candidate"] .route-start-marker'),
  ).toHaveText("S");
  await expect(
    page.locator('[data-route-kind="candidate"] .route-goal-marker'),
  ).toHaveText("G");
  await expect(
    page.locator('[data-route-kind="candidate"] .route-start-marker circle'),
  ).toHaveCSS("fill", "rgb(0, 76, 140)");
  await expect(
    page.locator('[data-route-kind="candidate"] .route-flow-direction'),
  ).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.locator('[data-route-kind="candidate"] .route-overlay-line'),
  ).toBeVisible();
  await expect(
    page.locator('[data-route-kind="candidate"] .route-start-marker'),
  ).toBeVisible();
  await expect(
    page.locator('[data-route-kind="candidate"] .route-goal-marker'),
  ).toBeVisible();
  await expect(page.locator("#btn-purchased")).toBeDisabled();
  await expect(page.locator("#btn-hold")).toBeDisabled();
  await expect(page.locator("#toast")).toBeHidden();
  await expect(page.locator("#next-target")).toHaveScreenshot(
    "route-comparison.png",
  );

  await page.locator("#btn-cancel-route-change").click();
  await expect(page.locator("#route-change-confirmation")).toBeHidden();
  await expect(page.locator('[data-route-kind="candidate"]')).toBeVisible();
  await expect(heading).toHaveText(originalTarget || "");
  await expect(page.locator("#target-status-label")).toHaveText("変更候補");
  await expect(page.locator("#route-selection-controls")).toBeVisible();

  await page.locator("#btn-preview-route").click();
  await page.locator("#btn-confirm-route-change").click();
  await expect(heading).toHaveText(candidate);
  await expect(page.locator('[data-route-kind="candidate"]')).toHaveCount(0);
  await expect(page.locator('[data-route-kind="current"]')).toBeVisible();
  await expect(page.locator("#target-status-label")).toHaveText("お品書き");
  await page.locator("#btn-purchased").click();
  await expect(page.locator("#toast")).toContainText(`${candidate} 購入`);
  await expect(heading).not.toHaveText(candidate);
  await expect(page.locator('[data-route-kind="candidate"]')).toHaveCount(0);
});

test("通常画面の購入buttonが最新1件Undoへ到達する", async ({ page }) => {
  await page.goto("/?demo_ui=1");
  const heading = page.locator("#target-space-heading");
  await expect(heading).not.toHaveText("---");
  const space = (await heading.textContent())?.trim() || "";
  await page.locator("#btn-purchased").click();

  const snackbar = page.locator(".gallery-undo-snackbar");
  await expect(snackbar).toBeVisible();
  await expect(snackbar.getByRole("button", { name: "元に戻す" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((target) => {
        const state = JSON.parse(
          localStorage.getItem("comipath:v1:demo-v1:day1:state") || "null",
        );
        return state?.circleStates?.[target];
      }, space),
    )
    .toBe("purchased");

  await snackbar.getByRole("button", { name: "元に戻す" }).click();
  await expect(heading).toHaveText(space);
  await expect
    .poll(() =>
      page.evaluate((target) => {
        const state = JSON.parse(
          localStorage.getItem("comipath:v1:demo-v1:day1:state") || "null",
        );
        return state?.circleStates?.[target];
      }, space),
    )
    .not.toBe("purchased");
});

test("URLがない次地点ではNo Imageを大きく表示する", async ({ page }) => {
  await page.goto("/?demo_ui=1");
  await pinFor(page, "東イ08b").evaluate((button: HTMLButtonElement) =>
    button.click(),
  );
  const candidatePreview = page.locator(".candidate-preview-card");
  await expect(candidatePreview).toBeVisible();
  await candidatePreview.getByRole("button", { name: "行き先変更" }).click();

  const placeholder = page.locator(
    "#tweet-embed-container .catalog-placeholder",
  );
  await expect(placeholder).toBeVisible();
  await expect(placeholder).toHaveText("No Image");
  const box = await placeholder.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThan(250);
});

test("連続してピンを押した時は最後に選んだ候補だけを表示する", async ({
  page,
}) => {
  await page.goto("/?demo_ui=1");
  await expect(page.locator("#target-space-heading")).not.toHaveText("---");

  await pinFor(page, "東ア23a").evaluate((button: HTMLButtonElement) =>
    button.click(),
  );
  let candidatePreview = page.locator(".candidate-preview-card");
  await expect(candidatePreview).toBeVisible();
  await candidatePreview.getByRole("button", { name: "経路を比較" }).click();
  await pinFor(page, "東ア31b").evaluate((button: HTMLButtonElement) =>
    button.click(),
  );
  candidatePreview = page.locator(".candidate-preview-card");
  await expect(candidatePreview).toBeVisible();
  await candidatePreview.getByRole("button", { name: "経路を比較" }).click();

  await expect(page.locator("#selected-target-space")).toHaveText("東ア31b");
  await expect(page.locator("#target-tweet-link")).toHaveAttribute(
    "href",
    "https://x.com/circle_b",
  );
  await expect(page.locator("#target-dist")).toHaveText(/^距離 \d+$/);
  await expect(page.locator("#btn-preview-route")).toBeEnabled();
});

test("候補経路を探索できない時は現在経路を維持する", async ({ page }) => {
  await page.route("**/assets/maps/**/points.json", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.points = payload.points.map((point: Record<string, unknown>) =>
      point.identifier === "ア" && String(point.number) === "23"
        ? { ...point, portals: [] }
        : point,
    );
    await route.fulfill({ response, json: payload });
  });
  await page.goto("/?demo_ui=1");
  await expect(page.locator("#target-space-heading")).not.toHaveText("---");
  const originalTarget = await page
    .locator("#target-space-heading")
    .textContent();

  await pinFor(page, "東ア23a").evaluate((button: HTMLButtonElement) =>
    button.click(),
  );
  const candidatePreview = page.locator(".candidate-preview-card");
  await expect(candidatePreview).toBeVisible();
  await candidatePreview.getByRole("button", { name: "経路を比較" }).click();

  await expect(page.locator("#target-space-heading")).toHaveText(
    originalTarget || "",
  );
  await expect(page.locator("#target-dist")).toHaveText("距離 計算不可");
  await expect(page.locator("#route-selection-message")).toContainText(
    "探索できません",
  );
  await expect(page.locator("#btn-preview-route")).toBeDisabled();
  await expect(page.locator('[data-route-kind="current"]')).toBeVisible();
  await expect(page.locator('[data-route-kind="candidate"]')).toHaveCount(0);
});

test("マニフェストの2エリアから現在地候補を切り替える", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#loc-ewsn option")).toHaveCount(2);
  await expect(page.locator("#header-area-mark")).toHaveText("東");
  await expect(page.locator("#header-area-title")).toHaveText("デモ東");
  await page.locator("#toggle-settings").click();
  await page.locator("#settings-area .management-surface-close").click();
  const areaSelect = page.locator("#loc-ewsn").locator("..");
  await areaSelect.locator(".custom-select-trigger").click();
  await areaSelect.locator('[data-value="demo-west"]').click();
  await expect(page.locator("#loc-label option")).toHaveText(["A", "B", "C"]);
  await expect(page.locator("#header-area-mark")).toHaveText("西");
  await expect(page.locator("#header-area-title")).toHaveText("デモ西");
});

test("地図マニフェスト取得失敗時はAppを起動せず診断画面を表示する", async ({
  page,
}) => {
  await page.route("**/assets/maps/**/manifest.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );

  await page.goto("/");

  const errorPage = page.locator("[data-map-bootstrap-error]");
  await expect(errorPage).toBeVisible();
  await expect(errorPage).toContainText("地図設定を読み込めませんでした");
  await expect(errorPage).toContainText("HTTP 503");
  await expect(page.locator("#settings-area")).toHaveCount(0);
});

test("地点JSON取得失敗時は推測位置のピンを表示しない", async ({ page }) => {
  await page.route("**/assets/maps/**/points.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );

  await page.goto("/?demo_ui=1");

  await expect(page.locator("#navigation-map-image")).toHaveJSProperty(
    "complete",
    true,
  );
  await expect(page.locator("#navigation-pin-layer .map-pin")).toHaveCount(0);
});

test("次地点のお品書き読込失敗をNo Imageへ置き換える", async ({ page }) => {
  await page.goto("/?demo_ui=1");
  await pinFor(page, "東ア23a").evaluate((button: HTMLButtonElement) =>
    button.click(),
  );

  const catalog = page.locator("#tweet-embed-container img");
  await expect(catalog).toBeVisible();
  await catalog.evaluate((image: HTMLImageElement) => {
    image.src = "data:image/png;base64,not-an-image";
  });
  await expect(
    page.locator("#tweet-embed-container .catalog-placeholder"),
  ).toHaveText("No Image");
});

test("切替前の画像エラーで現在の次地点画像を消さない", async ({ page }) => {
  await page.goto("/?demo_ui=1");
  await expect(page.locator("#target-space-heading")).not.toHaveText("---");
  const originalTarget = await page
    .locator("#target-space-heading")
    .textContent();
  await pinFor(page, "東ア23a").evaluate((button: HTMLButtonElement) =>
    button.click(),
  );
  let candidatePreview = page.locator(".candidate-preview-card");
  await expect(candidatePreview).toBeVisible();
  await candidatePreview.getByRole("button", { name: "行き先変更" }).click();

  const staleCatalog = await page
    .locator("#tweet-embed-container img")
    .elementHandle();
  expect(staleCatalog).not.toBeNull();
  await pinFor(page, "東ア31b").evaluate((button: HTMLButtonElement) =>
    button.click(),
  );
  candidatePreview = page.locator(".candidate-preview-card");
  await expect(candidatePreview).toBeVisible();
  await candidatePreview.getByRole("button", { name: "行き先変更" }).click();
  await expect(page.locator("#target-space-heading")).toHaveText(
    "東ア31b",
  );
  await expect(page.locator("#tweet-embed-container img")).toBeVisible();

  await staleCatalog?.evaluate((image) =>
    image.dispatchEvent(new Event("error")),
  );

  await expect(page.locator("#tweet-embed-container img")).toBeVisible();
  await expect(
    page.locator("#tweet-embed-container .catalog-placeholder"),
  ).toHaveCount(0);
});

test("設定画面の開閉やソース閲覧時に明示的な取得なしにGAS GETを実行しない", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("https://script.google.com/**", async (route) => {
    requestCount += 1;
    await route.abort();
  });
  await page.goto("/");

  await page.locator("#toggle-settings").click();
  const selectedRow = page.locator(
    'event-day-management-view .event-day-management-row[aria-current="true"]',
  );
  await selectedRow.locator('button[data-action="detail"]').click();
  await expect(page.locator("#settings-area .management-detail-pane")).toBeVisible();
  await expect(page.locator(".source-manager-panel")).toBeVisible();
  expect(requestCount).toBe(0);
});

test("一覧から目的地を選び購入・保留状態を更新する", async ({ page }) => {
  await page.goto("/?demo_ui=1");
  await expect(page.locator("#target-content")).toBeVisible();
  await expect(page.locator('[data-route-kind="candidate"]')).toHaveCount(0);

  await page.locator("#btn-open-gallery").click();
  await expect(page.locator("#gallery-modal")).toBeVisible();
  const galleryItems = page.locator("#gallery-grid .gallery-item");
  await expect(galleryItems).toHaveCount(3);
  await expect(page.locator("#gallery-grid .no-image-placeholder")).toHaveCount(
    1,
  );
  await expect(
    page.locator("#gallery-grid .no-image-placeholder"),
  ).toContainText("No Image");
  await expect(page.locator("#gallery-grid .gallery-item img")).toHaveCount(2);
  const buyButton = page.locator("#gallery-grid .gallery-btn-buy").first();
  const buyButtonSize = await buyButton.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(buyButtonSize.width).toBeGreaterThanOrEqual(44);
  expect(buyButtonSize.height).toBeGreaterThanOrEqual(44);
  await page
    .locator("#toast")
    .evaluate((toast) => toast.classList.remove("show"));
  await expect(page.locator("#gallery-modal")).toHaveScreenshot(
    "catalog-gallery.png",
  );
  await page.locator("#gallery-grid .gallery-item").first().click();
  await expect(page.locator("#pdf-modal")).toBeVisible();
  await page.locator("#btn-set-target").click();
  await expect(page.locator("#gallery-modal")).toBeHidden();
  await expect(page.locator("#target-space-heading")).not.toHaveText("---");

  const purchasedSpace = await page
    .locator("#target-space-heading")
    .textContent();
  await page.locator("#btn-purchased").click();
  await expect(page.locator("#toast")).toContainText(`${purchasedSpace} 購入`);

  await expect(page.locator("#target-space-heading")).not.toHaveText(
    purchasedSpace || "",
  );
  const heldSpace = await page.locator("#target-space-heading").textContent();
  await page.locator("#btn-hold").click();
  await expect(page.locator("#toast")).toContainText(`${heldSpace} 保留`);
  await expect(
    page.locator("#stats-table .hold-row .count-cell").first(),
  ).toHaveText("2");
});

test("一覧の左右スワイプが外側方向の購入と端末保存へ到達する", async ({
  page,
}) => {
  await page.goto("/?demo_ui=1");
  await page.locator("#btn-open-gallery").click();
  await expect(page.locator("#gallery-modal")).toBeVisible();

  const leftCard = page.locator('.gallery-item[data-space="東ア31b"]');
  const rightCard = page.locator('.gallery-item[data-space="東イ08b"]');
  await expect(leftCard).toBeVisible();
  await expect(rightCard).toBeVisible();

  const columnCenters = await Promise.all(
    [leftCard, rightCard].map((card) => card.boundingBox()),
  );
  const gridBox = await page.locator("#gallery-grid").boundingBox();
  expect(columnCenters[0]?.x).toBeLessThan(
    (gridBox?.x ?? 0) + (gridBox?.width ?? 0) / 2,
  );
  expect(columnCenters[1]?.x).toBeGreaterThan(
    (gridBox?.x ?? 0) + (gridBox?.width ?? 0) / 2,
  );

  await dispatchTouchSwipe(rightCard, 20, 170);
  await expect(rightCard).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(
          localStorage.getItem("comipath:v1:demo-v1:day1:state") || "null",
        );
        return state?.circleStates?.東イ08b;
      }),
    )
    .not.toBe("purchased");

  await dispatchTouchSwipe(rightCard, 20, 200);
  await expect(rightCard).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(
          localStorage.getItem("comipath:v1:demo-v1:day1:state") || "null",
        );
        return state?.circleStates?.東イ08b;
      }),
    )
    .toBe("purchased");

  const remainingLeftCard = page.locator('.gallery-item[data-space="東ア31b"]');
  await expect(remainingLeftCard).toBeVisible();
  await dispatchTouchSwipe(remainingLeftCard, 200, 20);
  await expect(remainingLeftCard).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(
          localStorage.getItem("comipath:v1:demo-v1:day1:state") || "null",
        );
        return state?.circleStates?.東ア31b;
      }),
    )
    .toBe("purchased");
});

test("Galleryの購入buttonが退出表示と完全Undoへ到達する", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?demo_ui=1");
  await page.locator("#btn-open-gallery").click();

  const space = "東ア31b";
  const card = page.locator(`.gallery-item[data-space="${space}"]`);
  await expect(card).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(
          localStorage.getItem("comipath:v1:demo-v1:day1:state") || "null",
        );
        return state?.circleStates?.["東ア31b"];
      }),
    )
    .not.toBe("purchased");

  await card.evaluate((element) => {
    const state = {
      connectedWithExitClass: false,
      snackbarVisibleWithExitClass: false,
    };
    const observer = new MutationObserver(() => {
      if (element.classList.contains("is-purchased-leaving")) {
        state.connectedWithExitClass = element.isConnected;
        state.snackbarVisibleWithExitClass = Boolean(
          document.querySelector(".gallery-undo-snackbar"),
        );
      }
    });
    observer.observe(element, { attributes: true, attributeFilter: ["class"] });
    (window as Window & { galleryPurchaseFeedback?: typeof state }).galleryPurchaseFeedback = state;
  });
  await card.locator(".gallery-btn-buy").click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as Window & {
          galleryPurchaseFeedback?: {
            connectedWithExitClass: boolean;
            snackbarVisibleWithExitClass: boolean;
          };
        }).galleryPurchaseFeedback,
      ),
    )
    .toEqual({ connectedWithExitClass: true, snackbarVisibleWithExitClass: true });
  const snackbar = page.locator(".gallery-undo-snackbar");
  await expect(snackbar).toBeVisible();
  await expect(snackbar.getByRole("button", { name: "元に戻す" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(
          localStorage.getItem("comipath:v1:demo-v1:day1:state") || "null",
        );
        return state?.circleStates?.["東ア31b"];
      }),
    )
    .toBe("purchased");

  await snackbar.getByRole("button", { name: "元に戻す" }).click();
  await expect(card).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(
          localStorage.getItem("comipath:v1:demo-v1:day1:state") || "null",
        );
        return state?.circleStates?.["東ア31b"];
      }),
    )
    .not.toBe("purchased");
});

test("一覧の初回swipe hintは短い横移動を示しreduced motionでは停止する", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?demo_ui=1");
  await page.evaluate(() =>
    localStorage.removeItem("comipath:ui:v2:gallery-swipe-hint-seen"),
  );
  await page.locator("#btn-open-gallery").click();

  const hint = page.locator(".gallery-swipe-hint");
  const demo = page.locator(".gallery-swipe-hint-demo-card");
  await expect(hint).toContainText("外側へスワイプして購入済みにできます");
  await expect(demo).toBeVisible();
  await expect(demo).toHaveCSS("animation-name", "gallery-swipe-hint-slide");
  const initialTransform = await demo.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await expect
    .poll(() => demo.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(initialTransform);

  await hint.click();
  await expect(hint).toBeHidden();
  await page.locator("#btn-close-gallery").click();
  await page.locator("#btn-open-gallery").click();
  await expect(page.locator(".gallery-swipe-hint")).toHaveCount(0);

  await page.locator("#btn-close-gallery").click();
  await page.evaluate(() =>
    localStorage.removeItem("comipath:ui:v2:gallery-swipe-hint-seen"),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#btn-open-gallery").click();
  await expect(page.locator(".gallery-swipe-hint")).toContainText(
    "外側へスワイプして購入済みにできます",
  );
  await expect(page.locator(".gallery-swipe-hint-demo-card")).toHaveCSS(
    "animation-name",
    "none",
  );
});

test("一覧の画像読込失敗をNo Imageへ置き換える", async ({ page }) => {
  await page.goto("/?demo_ui=1");
  await page.locator("#btn-open-gallery").click();

  const card = page.locator("#gallery-grid .gallery-item").first();
  const firstImage = card.locator("img");
  await expect(firstImage).toBeVisible();
  await firstImage.evaluate((image: HTMLImageElement) => {
    image.src = "data:image/png;base64,not-an-image";
  });
  await expect(card.locator(".no-image-placeholder")).toHaveText("No Image");
  await expect(card.locator("img")).toHaveCount(0);
});

test("一覧を開き直すと優先度フィルターを解除する", async ({ page }) => {
  await page.goto("/?demo_ui=1");
  await page.locator("#btn-open-gallery").click();
  await page.locator("#gallery-filter-controls .filter-btn").first().click();
  await expect(page.locator("#gallery-grid .gallery-item")).toHaveCount(1);

  await page.locator("#btn-close-gallery").click();
  await page.locator("#btn-open-gallery").click();

  await expect(page.locator("#gallery-grid .gallery-item")).toHaveCount(3);
  await expect(
    page.locator("#gallery-filter-controls .filter-btn.active"),
  ).toHaveCount(0);
});

test("一覧の操作方法からswipe hintを再表示できる", async ({ page }) => {
  await page.goto("/?demo_ui=1");
  await page.evaluate(() =>
    localStorage.setItem("comipath:ui:v2:gallery-swipe-hint-seen", "1"),
  );
  await page.locator("#btn-open-gallery").click();
  await expect(page.locator(".gallery-swipe-hint")).toHaveCount(0);

  await page.locator("#btn-gallery-help").click();
  await expect(page.locator(".gallery-swipe-hint")).toBeVisible();
});
