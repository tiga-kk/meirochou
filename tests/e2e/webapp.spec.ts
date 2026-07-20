import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route(
    /(?:cdnjs\.cloudflare\.com|platform\.twitter\.com)/,
    (route) => route.abort(),
  );
});

test("初回訪問では設定欄を表示する", async ({ page }) => {
  await page.goto("/");

  const settings = page.locator("#settings-area");
  await expect(settings).toBeVisible();
  await expect(page.locator("#toggle-settings")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.locator("#toast")).toContainText(
    "GAS URLを設定してください",
  );
  await expect(settings).toHaveScreenshot("first-visit-settings.png");
});

test("デモデータで地図・ピン・経路・ボトムシートを表示する", async ({
  page,
}) => {
  await page.goto("/?demo_ui=1");

  await expect(page.locator("#target-content")).toBeVisible();
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
  await expect(page.locator(".target-bottom-sheet")).toBeVisible();
  await page
    .getByRole("button", { name: "東ア23a", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  const catalog = page.locator("#tweet-embed-container img");
  await expect(catalog).toBeVisible();
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
  await expect(page.locator("#next-target")).toHaveScreenshot(
    "navigation-map-catalog.png",
  );

  await page
    .getByRole("button", { name: "東ア31b", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  const portraitCatalog = page.locator("#tweet-embed-container img");
  await expect(portraitCatalog).toHaveCSS("object-fit", "contain");
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

test("ピンの候補経路を比較してから目的地を変更する", async ({ page }) => {
  await page.goto("/?demo_ui=1");

  const heading = page.locator("#target-space-heading");
  await expect(heading).not.toHaveText("---");
  const originalTarget = (await heading.textContent())?.trim();
  const candidate = originalTarget === "東ア23a" ? "東ア31b" : "東ア23a";

  await page
    .getByRole("button", { name: candidate, exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());

  await expect(heading).toHaveText(originalTarget || "");
  await expect(page.locator("#target-status-label")).toHaveText("選択中");
  await expect(page.locator("#selected-target-space")).toHaveText(candidate);
  await expect(
    page.getByRole("button", { name: candidate, exact: true }),
  ).toHaveClass(/selected/);
  await expect(
    page.getByRole("button", { name: candidate, exact: true }),
  ).toHaveCSS("background-color", "rgba(0, 90, 156, 0.4)");
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
  await expect(
    page.locator('[data-route-kind="candidate"] .route-overlay-line'),
  ).toHaveCSS("stroke-dasharray", "22px, 14px");
  await page
    .locator("#toast")
    .evaluate((toast) => toast.classList.remove("show"));
  await expect(page.locator("#next-target")).toHaveScreenshot(
    "navigation-map-route-candidate.png",
  );

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
  ).toHaveCSS("stroke-dasharray", "22px, 14px");
  await expect(page.locator("#btn-purchased")).toBeDisabled();
  await expect(page.locator("#btn-hold")).toBeDisabled();
  await expect(page.locator("#next-target")).toHaveScreenshot(
    "route-comparison.png",
  );

  await page.locator("#btn-cancel-route-change").click();
  await expect(page.locator("#route-change-confirmation")).toBeHidden();
  await expect(page.locator('[data-route-kind="candidate"]')).toBeVisible();
  await expect(heading).toHaveText(originalTarget || "");

  await page.locator("#btn-preview-route").click();
  await page.locator("#btn-confirm-route-change").click();
  await expect(heading).toHaveText(candidate);
  await expect(page.locator('[data-route-kind="candidate"]')).toHaveCount(0);
  await expect(page.locator('[data-route-kind="current"]')).toBeVisible();
  await expect(page.locator("#target-status-label")).toHaveText("次の目的地");
});

test("URLがない次地点ではNo Imageを大きく表示する", async ({ page }) => {
  await page.goto("/?demo_ui=1");
  await page
    .getByRole("button", { name: "東イ08b", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());

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

  await page
    .getByRole("button", { name: "東ア23a", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page
    .getByRole("button", { name: "東ア31b", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());

  await expect(page.locator("#selected-target-space")).toHaveText("東ア31b");
  await expect(page.locator("#target-tweet-link")).toHaveAttribute(
    "href",
    "https://x.com/circle_b",
  );
  await expect(page.locator("#target-dist")).toHaveText(/^距離 \d+$/);
  await expect(page.locator("#btn-preview-route")).toBeEnabled();
});

test("候補経路を探索できない時は現在経路を維持する", async ({ page }) => {
  await page.route("**/assets/maps/demo-east/points.json", async (route) => {
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

  await page
    .getByRole("button", { name: "東ア23a", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());

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
  await page.route("**/assets/maps/manifest.json", (route) =>
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
  await page.route("**/assets/maps/demo-east/points.json", (route) =>
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
  await page
    .getByRole("button", { name: "東ア23a", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());

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
  await page
    .getByRole("button", { name: "東ア23a", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());

  const staleCatalog = await page
    .locator("#tweet-embed-container img")
    .elementHandle();
  expect(staleCatalog).not.toBeNull();
  await page
    .getByRole("button", { name: "東ア31b", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#target-space-heading")).toHaveText(
    originalTarget || "",
  );
  await expect(page.locator("#selected-target-space")).toHaveText("東ア31b");
  await expect(page.locator("#tweet-embed-container img")).toBeVisible();

  await staleCatalog?.evaluate((image) =>
    image.dispatchEvent(new Event("error")),
  );

  await expect(page.locator("#tweet-embed-container img")).toBeVisible();
  await expect(
    page.locator("#tweet-embed-container .catalog-placeholder"),
  ).toHaveCount(0);
});

test("Lit設定欄からGAS取得とシート選択を操作する", async ({ page }) => {
  let salePayload: Record<string, unknown> | null = null;
  await page.route("https://example.test/gas**", async (route) => {
    if (route.request().method() === "POST") {
      salePayload = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, status: "success" } });
      return;
    }
    const url = new URL(route.request().url());
    const body =
      url.searchParams.get("action") === "getSheets"
        ? { sheets: ["東456", "西12"], spreadsheetTitle: "C108 テスト" }
        : {
            wantToBuy: [{ space: "東ア23a", priority: 10, sheetName: "東456" }],
            spreadsheetTitle: "C108 テスト",
          };
    await route.fulfill({ json: body });
  });
  await page.goto("/");

  await page.locator("#gas-url").fill("https://example.test/gas");
  await page.locator("#btn-fetch-sheets").click();
  await expect(page.getByLabel("東456")).toBeChecked();
  await expect(page.getByLabel("西12")).toBeChecked();
  await page.getByLabel("西12").uncheck();
  await expect(page.getByLabel("西12")).not.toBeChecked();

  await page.locator("#btn-refresh").click();
  await expect(page.locator("#toast")).toContainText("1件 読み込みました");
  await expect(page.locator("#spreadsheet-title")).toHaveText("C108 テスト");

  await page.locator("#btn-search").click();
  await expect(page.locator("#target-content")).toBeVisible();
  await page.locator("#btn-purchased").click();
  await expect(page.locator("#toast")).toContainText("購入！");
  expect(salePayload).toEqual({
    action: "sale",
    space: "東ア23a",
    sheetName: "東456",
    undo: false,
  });
});

test("一覧から目的地を選び購入・保留状態を更新する", async ({ page }) => {
  await page.goto("/?demo_ui=1");
  await expect(page.locator("#target-content")).toBeVisible();

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
  await page.locator('#gallery-filter-controls [data-priority="10"]').click();
  await expect(page.locator("#gallery-grid .gallery-item")).toHaveCount(1);

  await page.locator("#btn-close-gallery").click();
  await page.locator("#btn-open-gallery").click();

  await expect(page.locator("#gallery-grid .gallery-item")).toHaveCount(3);
  await expect(
    page.locator("#gallery-filter-controls .filter-btn.active"),
  ).toHaveCount(0);
});
