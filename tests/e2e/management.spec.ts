import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { routeDemoEventRegistry } from "./fixture-registry";

const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx_E2E_TEST_DEPLOYMENT/exec";

type EventDayRef = { eventId: string; dayId: string };

type SeedState = {
  ref: EventDayRef;
  state: Record<string, unknown>;
};

function createState(
  options: {
    source?: Record<string, unknown>;
    sourceGeneration?: string;
    circles?: Array<Record<string, unknown>>;
    purchased?: string[];
    hold?: string[];
    gasOutbox?: Array<Record<string, unknown>>;
  } = {},
): Record<string, unknown> {
  const circleStates: Record<string, "held" | "purchased"> = {};
  for (const space of options.purchased ?? []) {
    circleStates[space] = "purchased";
  }
  for (const space of options.hold ?? []) {
    if (!circleStates[space]) circleStates[space] = "held";
  }
  const timestamp = "2026-07-25T00:00:00.000Z";
  return {
    schemaVersion: 2,
    source: options.source ?? { type: "csv", fileName: "empty.csv" },
    sourceGeneration: options.sourceGeneration ?? "gen-e2e-01",
    circles: options.circles ?? [],
    circleStates,
    gasOutbox: options.gasOutbox ?? [],
    timestamps: {
      createdAt: timestamp,
      updatedAt: timestamp,
      sourceUpdatedAt: timestamp,
    },
  };
}

async function seedStates(
  page: Page,
  entries: readonly SeedState[],
): Promise<void> {
  await page.addInitScript((items: readonly SeedState[]) => {
    localStorage.setItem(
      "comipath:v1:index:event-days",
      JSON.stringify(items.map((item) => item.ref)),
    );
    localStorage.setItem(
      "comipath:v1:last-opened",
      JSON.stringify(items[0]?.ref ?? null),
    );
    for (const item of items) {
      localStorage.setItem(
        `comipath:v1:${item.ref.eventId}:${item.ref.dayId}:state`,
        JSON.stringify(item.state),
      );
    }
  }, entries);
}

async function readState(
  page: Page,
  ref: EventDayRef,
): Promise<Record<string, unknown>> {
  return page.evaluate((target) => {
    const raw = localStorage.getItem(
      `comipath:v1:${target.eventId}:${target.dayId}:state`,
    );
    if (!raw)
      throw new Error(`Missing state for ${target.eventId}/${target.dayId}`);
    return JSON.parse(raw) as Record<string, unknown>;
  }, ref);
}

async function routeRegistry(
  page: Page,
  events: readonly Record<string, unknown>[],
) {
  await page.route("**/assets/events/manifest.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schemaVersion: 1, events }),
    });
  });
}

async function routeGas(
  page: Page,
  handler: (route: import("@playwright/test").Route) => Promise<void>,
): Promise<void> {
  await page.route("**/*", async (route) => {
    if (!route.request().url().startsWith(GAS_URL)) {
      await route.fallback();
      return;
    }
    await handler(route);
  });
}

async function openSettings(page: Page): Promise<void> {
  await page.locator("#toggle-settings").click();
  const settings = page.locator("#settings-area");
  await expect(settings).toHaveClass(/show/);
  const detail = settings.locator(".management-detail-surface");
  if (!(await detail.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await detail.locator("summary").click();
  }
  await expect(settings.locator(".source-manager-panel")).toBeVisible();
}

async function confirmDelete(page: Page, phrase?: string): Promise<void> {
  const dialog = page.locator("storage-delete-dialog");
  await expect(dialog.locator(".modal-overlay")).toBeVisible();
  await dialog.locator(".consent-check").check();
  if (phrase) {
    await dialog.locator(".delete-confirm-input").fill(phrase);
  }
  await dialog.locator(".btn-confirm-delete").click();
  await expect(dialog.locator(".modal-overlay")).not.toBeVisible();
}

test.beforeEach(async ({ context, page }) => {
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (
      url.startsWith("http://localhost") ||
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("blob:") ||
      url.startsWith("data:") ||
      url === GAS_URL ||
      url.startsWith(`${GAS_URL}?`)
    ) {
      await route.continue();
    } else {
      await route.abort();
    }
  });
  await routeDemoEventRegistry(page);
});

test.describe("Mobile Management Flows", () => {
  test("管理overviewにconfiguredとunconfiguredの全日程を表示する", async ({
    page,
  }) => {
    await seedStates(page, [
      {
        ref: { eventId: "demo-v1", dayId: "day1" },
        state: createState({
          source: { type: "csv", fileName: "circles.csv" },
          circles: [
            { space: "東ア23a", tweet: "https://example.test/catalog.png" },
            { space: "東ア31b" },
          ],
          gasOutbox: [
            {
              id: "pending-1",
              eventId: "demo-v1",
              dayId: "day1",
              sourceGeneration: "gen-e2e-01",
              gasUrl: GAS_URL,
              sheetName: "day1",
              space: "東ア23a",
              purchased: true,
              createdAt: "2026-07-25T00:00:00.000Z",
              attempts: 0,
              lastError: null,
            },
          ],
        }),
      },
    ]);

    await page.goto("/");
    await page.locator("#toggle-settings").click();
    await expect(page.locator("#settings-area")).toHaveClass(/show/);
    await expect(page.locator("event-day-management-view")).toBeVisible();
    await expect(page.locator("source-manager")).toBeHidden();
    const rows = page.locator("event-day-management-view .event-day-management-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("CSV");
    await expect(rows.nth(0)).toContainText("Data 2件");
    await expect(rows.nth(0)).toContainText("GAS同期 1件待ち");
    await expect(rows.nth(1)).toContainText("未設定");
    await expect(rows.nth(1)).toContainText("設定する");
  });

  test("管理overviewはoffline status取得失敗を0件保存済みと混同しない", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const originalMatch = Cache.prototype.match;
      Cache.prototype.match = function matchWithFailure() {
        void originalMatch;
        return Promise.reject(new Error("status unavailable"));
      };
    });
    await seedStates(page, [
      {
        ref: { eventId: "demo-v1", dayId: "day1" },
        state: createState({
          circles: [{ space: "東ア23a", tweet: "https://example.test/status.png" }],
        }),
      },
    ]);

    await page.goto("/");
    await openSettings(page);
    const row = page.locator("event-day-management-view .event-day-management-row").first();
    await expect(row).toContainText("お品書き 保存状況を確認できません");
    await expect(row).not.toContainText("お品書き 0 / 1 保存済み");
  });

  test("管理overviewの開くと保存済みGAS再読込を既存フローへ接続する", async ({
    page,
  }) => {
    await routeGas(page, async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "success",
          sheetName: url.searchParams.get("sheets"),
          circles: [{ space: "東ア99a", priority: 1 }],
        }),
      });
    });
    await seedStates(page, [
      {
        ref: { eventId: "demo-v1", dayId: "day1" },
        state: createState({
          source: { type: "gas", gasUrl: GAS_URL, sheetName: "day1" },
          circles: [{ space: "東ア23a", priority: 1 }],
        }),
      },
      {
        ref: { eventId: "demo-v1", dayId: "day2" },
        state: createState({
          source: { type: "csv", fileName: "day2.csv" },
          circles: [{ space: "東ア31b", priority: 2 }],
        }),
      },
    ]);

    await page.goto("/");
    await openSettings(page);
    const rows = page.locator("event-day-management-view .event-day-management-row");
    await rows.nth(1).locator('button[data-action="open"]').click();
    await expect(page.locator("#settings-area")).toBeHidden();

    await openSettings(page);
    await expect(page.locator("source-manager h3")).toContainText("day2");

    await rows.nth(0).locator('button[data-action="refresh"]').click();
    await expect(page.locator("source-manager h3")).toContainText("day1");
    await expect(
      page.locator("#source-diff-dialog .source-diff-dialog-overlay"),
    ).toBeVisible();
    await page.locator('#source-diff-dialog button[data-action="cancel"]').click();
  });

  test("Flow 1: 初回訪問とCSVプレビュー・適用・ナビゲーション反映", async ({
    page,
  }) => {
    await page.goto("/");
    await openSettings(page);
    await expect(page.locator("#settings-area")).toHaveScreenshot(
      "settings-shell-source-manager.png",
    );

    const sourceManager = page.locator("source-manager");
    const csvContent =
      "space,priority,isSale,account,tweet,memo\r\n東ア01a,1,,@test,tweet1,memo1\r\n東ア02b,2,,,,\r\n";
    await sourceManager.locator('input[type="file"]').setInputFiles({
      name: "circles.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent, "utf-8"),
    });

    const diffDialog = page.locator("#source-diff-dialog");
    const diffOverlay = diffDialog.locator(".source-diff-dialog-overlay");
    await expect(diffOverlay).toBeVisible();
    await expect(diffOverlay).toHaveScreenshot("source-diff-dialog.png");
    await diffDialog.locator('button[data-action="cancel"]').click();
    await expect(diffOverlay).not.toBeVisible();

    await sourceManager.locator('input[type="file"]').setInputFiles({
      name: "circles.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent, "utf-8"),
    });
    await diffDialog.locator('button[data-action="apply"]').click();
    await expect(diffOverlay).not.toBeVisible();

    await page.locator("#settings-area .management-surface-close").click();
    await page.locator("#btn-open-gallery").click();
    await expect(page.locator("#gallery-grid .gallery-item")).toHaveCount(2);
  });

  test("Flow 2: 日程ごとのデータ独立性と重複マニフェスト請求の防止", async ({
    page,
  }) => {
    await routeRegistry(page, [
      {
        eventId: "demo-v1",
        displayName: "ComiPath Demo",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [
          { dayId: "day1", displayName: "デモ1日目" },
          { dayId: "day2", displayName: "デモ2日目" },
        ],
      },
    ]);
    await seedStates(page, [
      {
        ref: { eventId: "demo-v1", dayId: "day1" },
        state: createState({
          circles: [
            { space: "東ア23a", priority: 1 },
            { space: "東ア31b", priority: 2 },
          ],
        }),
      },
      {
        ref: { eventId: "demo-v1", dayId: "day2" },
        state: createState({
          circles: [{ space: "東ア31b", priority: 2 }],
          hold: ["東ア31b"],
        }),
      },
    ]);
    let manifestRequestCount = 0;
    await page.route("**/assets/maps/demo-v1/manifest.json", async (route) => {
      manifestRequestCount += 1;
      await route.continue();
    });

    await page.goto("/");
    await expect(page.locator("#target-space-heading")).toContainText(
      "東ア23a",
    );
    const initialManifestCount = manifestRequestCount;
    await page.locator("#btn-purchased").click();
    await expect
      .poll(
        async () =>
          (await readState(page, { eventId: "demo-v1", dayId: "day1" }))
            .circleStates,
      )
      .toEqual({ 東ア23a: "purchased" });
    await page.locator("#loc-number").fill("10");

    await openSettings(page);
    await page.locator("event-day-selector #day-select").selectOption("day2");
    await expect
      .poll(() => page.locator("event-day-selector #day-select").inputValue())
      .toBe("day2");
    await expect(page.locator("source-manager h3")).toContainText("day2");
    expect(manifestRequestCount).toBe(initialManifestCount);

    expect(
      (await readState(page, { eventId: "demo-v1", dayId: "day2" }))
        .circleStates,
    ).toEqual({ 東ア31b: "held" });
    await page.locator("event-day-selector #day-select").selectOption("day1");
    await expect(page.locator("source-manager h3")).toContainText("day1");
    const day1 = await readState(page, { eventId: "demo-v1", dayId: "day1" });
    const day2 = await readState(page, { eventId: "demo-v1", dayId: "day2" });
    expect(day1.circleStates).toEqual({ 東ア23a: "purchased" });
    expect(day2.circleStates).toEqual({ 東ア31b: "held" });
  });

  test("Flow 3: イベント地図の分離とマニフェスト取得遅延・失敗時の安全挙動", async ({
    page,
  }) => {
    await routeRegistry(page, [
      {
        eventId: "demo-v1",
        displayName: "Demo Event 1",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [{ dayId: "day1", displayName: "1日目" }],
      },
      {
        eventId: "demo-v2",
        displayName: "Demo Event 2",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [{ dayId: "day1", displayName: "1日目" }],
      },
    ]);
    await seedStates(page, [
      {
        ref: { eventId: "demo-v1", dayId: "day1" },
        state: createState({ circles: [{ space: "東ア23a", priority: 1 }] }),
      },
    ]);

    let manifestRequestCount = 0;
    let releaseSecondManifest: (() => void) | null = null;
    await page.route("**/assets/maps/demo-v1/manifest.json", async (route) => {
      manifestRequestCount += 1;
      const response = await route.fetch();
      const payload = (await response.json()) as Record<string, unknown>;
      if (manifestRequestCount === 2) {
        await new Promise<void>((resolve) => {
          releaseSecondManifest = resolve;
        });
        payload.eventId = "demo-v2";
      } else if (manifestRequestCount >= 3) {
        payload.eventId = "wrong-event";
      }
      await route.fulfill({ response, json: payload });
    });

    await page.goto("/");
    await openSettings(page);
    await page
      .locator("event-day-selector #event-select")
      .selectOption("demo-v2");
    await expect.poll(() => manifestRequestCount).toBe(2);
    await expect(page.locator("source-manager h3")).toContainText(
      "Demo Event 1",
    );
    releaseSecondManifest?.();
    await expect(page.locator("source-manager h3")).toContainText(
      "Demo Event 2",
    );

    await page
      .locator("event-day-selector #event-select")
      .selectOption("demo-v1");
    await expect(page.locator(".settings-error")).toBeVisible();
    await expect(page.locator("source-manager h3")).toContainText(
      "Demo Event 2",
    );
  });

  test("Flow 4: GASの初期インポート・置換・リフレッシュ", async ({ page }) => {
    let getCallCount = 0;
    let delayPreview = false;
    let releasePreview: (() => void) | null = null;
    await routeGas(page, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      getCallCount += 1;
      const url = new URL(route.request().url());
      if (url.searchParams.get("action") === "getSheets") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            status: "success",
            sheets: ["配置シート1", "配置シート2"],
            spreadsheetTitle: "E2E Spreadsheet",
          }),
        });
        return;
      }
      if (delayPreview) {
        await new Promise<void>((resolve) => {
          releasePreview = resolve;
        });
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "success",
          sheetName: url.searchParams.get("sheets"),
          spreadsheetTitle: "E2E Spreadsheet",
          circles: [{ space: "東ア01a", priority: 1, isSale: "x" }],
        }),
      });
    });

    await page.goto("/");
    await openSettings(page);
    expect(getCallCount).toBe(0);
    const sourceManager = page.locator("source-manager");
    await sourceManager
      .getByRole("tab", { name: "Googleスプレッドシート" })
      .click();
    await sourceManager.locator("#gas-url-input").fill(GAS_URL);
    await sourceManager.locator('button[data-action="fetch-sheets"]').click();
    await expect(sourceManager.locator("#gas-sheet-select")).toBeVisible();
    expect(getCallCount).toBe(1);

    delayPreview = true;
    await sourceManager.locator('button[data-action="gas-preview"]').click();
    await expect(page.locator("async-operation-indicator")).toContainText(
      "GASからデータを読み込み中…",
    );
    releasePreview?.();
    delayPreview = false;
    const diffDialog = page.locator("#source-diff-dialog");
    const diffOverlay = diffDialog.locator(".source-diff-dialog-overlay");
    await expect(diffOverlay).toBeVisible();
    await expect(page.locator("async-operation-indicator")).toContainText(
      "GASデータを読み込みました",
    );
    await diffDialog.locator('button[data-action="apply"]').click();
    await expect(diffOverlay).not.toBeVisible();
    await expect(page.locator("async-operation-indicator")).toContainText(
      "データを保存しました",
    );
    await expect(sourceManager).toContainText("Googleスプレッドシート");

    await sourceManager.locator('button[data-action="gas-preview"]').click();
    await expect(diffOverlay).toBeVisible();
    await diffDialog.locator('button[data-action="apply"]').click();
    await expect(diffOverlay).not.toBeVisible();
    expect(getCallCount).toBe(3);

    await sourceManager
      .locator("#gas-sheet-select")
      .selectOption({ label: "配置シート2" });
    await sourceManager.locator('button[data-action="gas-preview"]').click();
    await expect(diffOverlay).toBeVisible();
    await diffDialog.locator('button[data-action="apply"]').click();
    await expect(diffOverlay).not.toBeVisible();
    expect(getCallCount).toBe(4);
  });

  test("Flow 5: 失敗したPOSTと未送信リカバリーパネルからの再送", async ({
    page,
  }) => {
    let postFail = true;
    await routeGas(page, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      if (postFail) {
        await route.fulfill({ status: 500, body: "unavailable" });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, status: "success" }),
        });
      }
    });
    await seedStates(page, [
      {
        ref: { eventId: "demo-v1", dayId: "day1" },
        state: createState({
          source: { type: "gas", gasUrl: GAS_URL, sheetName: "day1" },
          circles: [{ space: "東ア23a", priority: 1 }],
        }),
      },
    ]);

    await page.goto("/");
    await expect(page.locator("#target-space-heading")).toContainText(
      "東ア23a",
    );
    await page.locator("#btn-purchased").click();
    await expect(page.locator("#toast")).toContainText("東ア23a 購入！");
    const failedState = await readState(page, {
      eventId: "demo-v1",
      dayId: "day1",
    });
    expect(failedState.circleStates).toEqual({ 東ア23a: "purchased" });
    expect(failedState.gasOutbox).toHaveLength(1);

    await openSettings(page);
    const outboxPanel = page.locator("outbox-panel");
    await expect(outboxPanel).toContainText("GAS同期 キュー管理 (1件)");
    await expect(outboxPanel).toContainText("サーバーエラー (500)");
    await expect(outboxPanel.locator(".outbox-panel")).toHaveScreenshot(
      "outbox-recovery-panel.png",
    );
    postFail = false;
    await outboxPanel.locator("button.btn-retry-all").click();
    await expect(page.locator("#toast")).toContainText("GAS同期完了");
    await expect
      .poll(
        async () =>
          (await readState(page, { eventId: "demo-v1", dayId: "day1" }))
            .gasOutbox,
      )
      .toEqual([]);
  });

  test("Flow 6: 未送信ロックと確定入力による破棄操作", async ({ page }) => {
    const pendingEntry = {
      id: "entry-e2e-01",
      eventId: "demo-v1",
      dayId: "day1",
      sourceGeneration: "gen-e2e-01",
      gasUrl: GAS_URL,
      sheetName: "day1",
      space: "東ア23a",
      purchased: true,
      createdAt: "2026-07-23T12:00:00.000Z",
      attempts: 1,
      lastError: "http-500",
    };
    await routeGas(page, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "unavailable" });
      } else {
        await route.continue();
      }
    });
    await seedStates(page, [
      {
        ref: { eventId: "demo-v1", dayId: "day1" },
        state: createState({
          source: { type: "gas", gasUrl: GAS_URL, sheetName: "day1" },
          circles: [{ space: "東ア23a", priority: 1 }],
          purchased: ["東ア23a"],
          gasOutbox: [pendingEntry],
        }),
      },
    ]);

    await page.goto("/");
    await openSettings(page);
    const sourceManager = page.locator("source-manager");
    await expect(sourceManager).toContainText("送信待ち");
    await expect(
      sourceManager.locator('button[role="tab"]').first(),
    ).toBeDisabled();
    await expect(
      page.locator(".storage-delete-option button:disabled"),
    ).toHaveCount(0);

    const outboxPanel = page.locator("outbox-panel");
    await outboxPanel.locator("input.entry-select").check();
    await outboxPanel.locator("button.btn-open-discard").click();
    await outboxPanel
      .locator("input.discard-confirm-input")
      .fill("未送信を破棄");
    await outboxPanel.locator("button.btn-confirm-discard").click();
    await expect(page.locator("#toast")).toContainText(
      "未送信データを破棄しました",
    );
    await expect(
      sourceManager.locator('button[role="tab"]').first(),
    ).toBeEnabled();
    expect(
      (await readState(page, { eventId: "demo-v1", dayId: "day1" }))
        .circleStates,
    ).toEqual({ 東ア23a: "purchased" });

    await sourceManager.getByRole("tab", { name: "CSVファイル" }).click();
    await sourceManager.locator('input[type="file"]').setInputFiles({
      name: "replacement.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "space,priority,isSale,account,tweet,memo\r\n東ア31b,1,,,,\r\n",
      ),
    });
    await expect(
      page.locator("#source-diff-dialog .source-diff-dialog-overlay"),
    ).toBeVisible();
    await page
      .locator('#source-diff-dialog button[data-action="cancel"]')
      .click();
  });

  test("Flow 7: 4つのストレージ削除スコープと確定ダイアログ制御", async ({
    page,
  }) => {
    await routeRegistry(page, [
      {
        eventId: "demo-v1",
        displayName: "ComiPath Demo",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [
          { dayId: "day1", displayName: "デモ1日目" },
          { dayId: "day2", displayName: "デモ2日目" },
        ],
      },
    ]);
    await seedStates(page, [
      {
        ref: { eventId: "demo-v1", dayId: "day1" },
        state: createState({
          circles: [{ space: "東ア23a", priority: 1 }],
          purchased: ["東ア23a"],
          hold: ["東ア31b"],
        }),
      },
      {
        ref: { eventId: "demo-v1", dayId: "day2" },
        state: createState({ circles: [{ space: "東ア31b", priority: 2 }] }),
      },
    ]);

    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /サークルリストの削除/ }).click();
    await expect(
      page.locator("storage-delete-dialog .modal-overlay"),
    ).toHaveScreenshot("scoped-deletion-dialog.png");
    await confirmDelete(page);
    let state = await readState(page, { eventId: "demo-v1", dayId: "day1" });
    expect(state.circles).toEqual([]);
    expect(state.circleStates).toEqual({
      東ア23a: "purchased",
      東ア31b: "held",
    });

    await page
      .getByRole("button", { name: /購入・チェック履歴の削除/ })
      .click();
    await confirmDelete(page);
    state = await readState(page, { eventId: "demo-v1", dayId: "day1" });
    expect(state.circleStates).toEqual({});

    await page.getByRole("button", { name: "この日（データ）の削除" }).click();
    await confirmDelete(page);
    await expect(page.locator("source-manager h3")).toContainText("day2");

    await page.getByRole("button", { name: /全日程データの削除/ }).click();
    await confirmDelete(page, "全イベントを削除");
    await expect(page.locator("#toast")).toContainText("データを削除しました");
    const recreated = await readState(page, {
      eventId: "demo-v1",
      dayId: "day1",
    });
    expect(recreated.circles).toEqual([]);
    expect(recreated.source).toEqual({ type: "csv", fileName: "empty.csv" });
  });

  test("Flow 7.1: pending GAS同期付き全日程削除の確認と破棄", async ({
    page,
  }) => {
    const pendingEntry = {
      id: "entry-delete-e2e-01",
      eventId: "demo-v1",
      dayId: "day1",
      sourceGeneration: "gen-e2e-01",
      gasUrl: GAS_URL,
      sheetName: "day1",
      space: "東ア23a",
      purchased: true,
      createdAt: "2026-07-23T12:00:00.000Z",
      attempts: 1,
      lastError: "http-500",
    };
    let postCount = 0;
    await routeGas(page, async (route) => {
      if (route.request().method() === "POST") postCount += 1;
      await route.fulfill({ status: 500, body: "must not send" });
    });
    await seedStates(page, [
      {
        ref: { eventId: "demo-v1", dayId: "day1" },
        state: createState({
          circles: [{ space: "東ア23a" }],
          purchased: ["東ア23a"],
          gasOutbox: [pendingEntry],
        }),
      },
    ]);

    await page.goto("/");
    await openSettings(page);
    await page.evaluate(() => {
      localStorage.setItem(
        "comipath:nav-snapshot:demo-v1:day1",
        JSON.stringify({ schemaVersion: 1, eventId: "demo-v1", dayId: "day1" }),
      );
    });
    const before = await readState(page, { eventId: "demo-v1", dayId: "day1" });
    const postCountBeforeDeletion = postCount;
    await page.getByRole("button", { name: /全日程データの削除/ }).click();
    const dialog = page.locator("storage-delete-dialog");
    await expect(dialog).toContainText("未送信GAS同期 1件も破棄されます");
    await dialog.locator(".btn-cancel").click();
    await expect(dialog.locator(".modal-overlay")).not.toBeVisible();
    expect(
      await readState(page, { eventId: "demo-v1", dayId: "day1" }),
    ).toEqual(before);

    await page.getByRole("button", { name: /全日程データの削除/ }).click();
    await confirmDelete(page, "全イベントを削除");
    expect(
      await page.evaluate(() =>
        localStorage.getItem("comipath:nav-snapshot:demo-v1:day1"),
      ),
    ).toBeNull();
    expect(
      (await readState(page, { eventId: "demo-v1", dayId: "day1" })).gasOutbox,
    ).toEqual([]);
    expect(postCount).toBe(postCountBeforeDeletion);
  });

  test("Flow 8: CSVエクスポートと非変容・除外ルール検証", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-07-25T12:34:56.000Z") });
    await page.clock.setFixedTime(new Date("2026-07-25T12:34:56.000Z"));
    const ref = { eventId: "demo-v1", dayId: "day1" };
    const before = createState({
      source: { type: "csv", fileName: "circles.csv" },
      circles: [
        { space: "東ア23a", priority: 1, memo: "=SUM(A1)" },
        { space: "東ア31b", priority: 2, removedFromSource: true },
      ],
      purchased: ["東ア23a"],
    });
    await seedStates(page, [{ ref, state: before }]);
    await page.goto("/");
    await openSettings(page);
    const exportButton = page.locator(
      'source-manager button[data-action="csv-export"]',
    );
    await expect(exportButton).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportButton.click(),
    ]);
    expect(download.suggestedFilename()).toBe(
      "comipath-demo-v1-day1-20260725-123456.csv",
    );
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const content = await readFile(downloadPath as string, "utf8");
    expect(content).toContain("space,priority,isSale,account,tweet,memo\r\n");
    expect(content).toContain("東ア23a,1,x,,," + "=SUM(A1)");
    expect(content).not.toContain("東ア31b");
    expect(await readState(page, ref)).toEqual(before);
  });

  test("Flow 9: ソース取得およびプレビューの競合排除", async ({ page }) => {
    await routeRegistry(page, [
      {
        eventId: "demo-v1",
        displayName: "ComiPath Demo",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [
          { dayId: "day1", displayName: "デモ1日目" },
          { dayId: "day2", displayName: "デモ2日目" },
        ],
      },
    ]);
    let releaseFirstSheetRequest: (() => void) | null = null;
    let sheetRequestCount = 0;
    await routeGas(page, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const url = new URL(route.request().url());
      if (url.searchParams.get("action") === "getSheets") {
        sheetRequestCount += 1;
        if (sheetRequestCount === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstSheetRequest = resolve;
          });
        }
        try {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              status: "success",
              sheets: ["古いシート"],
            }),
          });
        } catch {
          // The transition aborts stale source requests by design.
        }
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "success",
          sheetName: "配置シート1",
          circles: [{ space: "東ア01a", priority: 1 }],
        }),
      });
    });
    await page.goto("/");
    await openSettings(page);
    const sourceManager = page.locator("source-manager");
    await sourceManager
      .getByRole("tab", { name: "Googleスプレッドシート" })
      .click();
    await sourceManager.locator("#gas-url-input").fill(GAS_URL);
    await sourceManager.locator('button[data-action="fetch-sheets"]').click();
    await expect.poll(() => sheetRequestCount).toBe(1);
    await page.locator("event-day-selector #day-select").selectOption("day2");
    releaseFirstSheetRequest?.();
    await expect(page.locator("source-manager h3")).toContainText("day2");
    await expect(sourceManager.locator("#gas-sheet-select")).not.toBeVisible();
  });

  test("Flow 10: パネルモデル間の表示整合性", async ({ page }) => {
    const pendingEntry = {
      id: "entry-e2e-10",
      eventId: "demo-v1",
      dayId: "day1",
      sourceGeneration: "gen-e2e-01",
      gasUrl: GAS_URL,
      sheetName: "day1",
      space: "東ア23a",
      purchased: true,
      createdAt: "2026-07-23T12:00:00.000Z",
      attempts: 1,
      lastError: "http-500",
    };
    await routeGas(page, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "unavailable" });
      } else {
        await route.continue();
      }
    });
    await seedStates(page, [
      {
        ref: { eventId: "demo-v1", dayId: "day1" },
        state: createState({
          source: { type: "gas", gasUrl: GAS_URL, sheetName: "day1" },
          circles: [{ space: "東ア23a", priority: 1 }],
          purchased: ["東ア23a"],
          gasOutbox: [pendingEntry],
        }),
      },
    ]);
    await page.goto("/");
    await openSettings(page);

    await expect(page.locator("event-day-selector #day-select")).toContainText(
      "送信待ち:1",
    );
    await expect(
      page.locator("source-manager .pending-warning-box"),
    ).toBeVisible();
    await expect(page.locator("outbox-panel h3")).toContainText("(1件)");
    await expect(
      page.locator(".storage-delete-option button:not(:disabled)"),
    ).toHaveCount(4);
    await expect(
      page.locator('source-manager button[data-action="csv-export"]'),
    ).toBeDisabled();
  });

  test("Task 10: 管理画面が機密値をDOMとconsoleへ漏らさない", async ({
    page,
  }) => {
    const sensitive = {
      deploymentId: "AKfycbx_E2E_TEST_DEPLOYMENT",
      queryToken: "TASK10_SECRET_QUERY_TOKEN",
      csvBody: "space,priority,memo\n東ア01a,1,TASK10_RAW_CSV_BODY",
      responseBody: "TASK10_RAW_RESPONSE_BODY",
      stack: "Error: TASK10_PRIVATE_STACK at line 42",
      memo: "TASK10_PRIVATE_MEMO",
      tweet: "https://x.com/TASK10_PRIVATE_TWEET",
    };
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));

    await routeGas(page, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            status: "error",
            message: sensitive.responseBody,
            stack: sensitive.stack,
            csv: sensitive.csvBody,
            token: sensitive.queryToken,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "success",
          sheets: ["day1"],
          circles: [
            {
              space: "東ア01a",
              priority: 1,
              memo: sensitive.memo,
              tweet: sensitive.tweet,
            },
          ],
        }),
      });
    });

    await seedStates(page, [
      {
        ref: { eventId: "demo-v1", dayId: "day1" },
        state: createState({
          source: {
            type: "gas",
            gasUrl: GAS_URL,
            sheetName: "day1",
          },
          sourceGeneration: "gen-e2e-task10",
          circles: [
            {
              space: "東ア01a",
              priority: 1,
              memo: sensitive.memo,
              tweet: sensitive.tweet,
            },
          ],
          gasOutbox: [
            {
              id: "entry-task10-sensitive",
              eventId: "demo-v1",
              dayId: "day1",
              sourceGeneration: "gen-e2e-task10",
              gasUrl: GAS_URL,
              sheetName: "day1",
              space: "東ア01a",
              purchased: true,
              createdAt: "2026-07-25T00:00:00.000Z",
              attempts: 1,
              lastError: sensitive.stack,
            },
          ],
        }),
      },
    ]);

    await page.goto("/");
    await openSettings(page);

    const rendered = await page.evaluate(() => ({
      text: document.body.innerText,
      nonInputAttributes: Array.from(document.querySelectorAll("*"))
        .filter((element) => element.tagName !== "INPUT")
        .flatMap((element) =>
          Array.from(element.attributes).map(
            (attribute) => `${attribute.name}=${attribute.value}`,
          ),
        )
        .join("\n"),
    }));
    for (const value of Object.values(sensitive)) {
      expect(rendered.text).not.toContain(value);
      expect(rendered.nonInputAttributes).not.toContain(value);
      expect(consoleMessages.join("\n")).not.toContain(value);
    }

    const gasInput = page.locator("#gas-url-input");
    await expect(gasInput).toHaveValue(GAS_URL);
  });
});
