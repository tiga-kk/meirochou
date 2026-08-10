import { expect, type Page, type Route, test } from "@playwright/test";
import { routeDemoEventRegistry } from "./fixture-registry";

const GAS_URL =
  "https://script.google.com/macros/s/example-e2e-deployment/exec";
const STATE_KEY = "comipath:v1:demo-v1:day1:state";

type GasStateSnapshot = {
  purchased: string[];
  gasOutbox: Array<{
    attempts: number;
    lastError: string | null;
    purchased: boolean;
    space: string;
  }>;
};

test.beforeEach(async ({ context, page }) => {
  await context.route(
    /(?:cdnjs\.cloudflare\.com|platform\.twitter\.com)/,
    async (route) => {
      await route.abort();
    },
  );
  await routeDemoEventRegistry(page);
});

async function seedGasState(
  page: Page,
  options?: { pendingOutbox?: boolean },
): Promise<void> {
  await page.addInitScript(
    (opts: { gasUrl: string; pendingOutbox?: boolean; stateKey: string }) => {
      if (localStorage.getItem(opts.stateKey)) return;

      localStorage.setItem(
        "comipath:v1:index:event-days",
        JSON.stringify([{ eventId: "demo-v1", dayId: "day1" }]),
      );
      localStorage.setItem(
        "comipath:v1:last-opened",
        JSON.stringify({ eventId: "demo-v1", dayId: "day1" }),
      );

      const pending = opts?.pendingOutbox === true;
      const gasOutbox = pending
        ? [
            {
              id: "entry-e2e-01",
              eventId: "demo-v1",
              dayId: "day1",
              sourceGeneration: "gen-e2e-01",
              gasUrl: opts.gasUrl,
              sheetName: "day1",
              space: "東ア23a",
              purchased: true,
              createdAt: "2026-07-23T12:00:00.000Z",
              attempts: 1,
              lastError: "http-500",
            },
          ]
        : [];

      localStorage.setItem(
        opts.stateKey,
        JSON.stringify({
          schemaVersion: 1,
          source: { type: "gas", gasUrl: opts.gasUrl, sheetName: "day1" },
          sourceGeneration: "gen-e2e-01",
          circles: [
            { space: "東ア23a", priority: 1 },
            { space: "東ア31b", priority: 2 },
          ],
          purchased: pending ? ["東ア23a"] : [],
          hold: [],
          history: pending
            ? [
                {
                  type: "purchase",
                  space: "東ア23a",
                  timestamp: "2026-07-23T12:00:00.000Z",
                },
              ]
            : [],
          redo: [],
          gasOutbox,
          timestamps: {
            createdAt: "2026-07-23T12:00:00.000Z",
            updatedAt: "2026-07-23T12:00:00.000Z",
            sourceUpdatedAt: "2026-07-23T12:00:00.000Z",
          },
        }),
      );
    },
    { ...options, gasUrl: GAS_URL, stateKey: STATE_KEY },
  );
}

async function readGasState(page: Page): Promise<GasStateSnapshot> {
  return page.evaluate((stateKey) => {
    const raw = localStorage.getItem(stateKey);
    if (!raw) throw new Error("GAS state was not persisted");
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") {
      throw new Error("GAS state is not an object");
    }
    const state = value as {
      purchased?: unknown;
      circleStates?: unknown;
      gasOutbox?: unknown;
    };
    const purchased =
      state.circleStates &&
      typeof state.circleStates === "object" &&
      !Array.isArray(state.circleStates)
        ? Object.entries(state.circleStates).flatMap(([space, visitState]) =>
            visitState === "purchased" ? [space] : [],
          )
        : Array.isArray(state.purchased)
          ? state.purchased.filter(
              (space): space is string => typeof space === "string",
            )
          : null;
    if (purchased === null || !Array.isArray(state.gasOutbox)) {
      throw new Error("GAS state has an invalid activity shape");
    }
    return {
      purchased,
      gasOutbox: state.gasOutbox.map((entry) => {
        if (!entry || typeof entry !== "object") {
          throw new Error("GAS outbox entry is not an object");
        }
        const item = entry as {
          attempts?: unknown;
          lastError?: unknown;
          purchased?: unknown;
          space?: unknown;
        };
        return {
          attempts: Number(item.attempts),
          lastError: typeof item.lastError === "string" ? item.lastError : null,
          purchased: item.purchased === true,
          space: String(item.space),
        };
      }),
    };
  }, STATE_KEY);
}

async function interceptGas(
  page: Page,
  handler: (route: Route) => Promise<void>,
): Promise<void> {
  await page.route("**/*", async (route) => {
    if (!route.request().url().startsWith(GAS_URL)) {
      await route.fallback();
      return;
    }
    await handler(route);
  });
}

test("キャッシュ済みGAS stateの起動ではGET/POSTを行わない", async ({
  page,
}) => {
  const requests: string[] = [];
  await interceptGas(page, async (route) => {
    requests.push(route.request().method());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "success" }),
    });
  });

  await seedGasState(page);
  await page.goto("/");

  await expect(page.locator("#target-content")).toBeVisible();
  await expect(page.locator("#target-space-heading")).toContainText("東ア23a");
  await expect.poll(() => requests).toEqual([]);
});

test("購入は失敗POSTより先にLocalStorageへ保存される", async ({ page }) => {
  const requests: string[] = [];
  let stateBeforeResponse: GasStateSnapshot | null = null;
  await interceptGas(page, async (route) => {
    requests.push(route.request().method());
    if (route.request().method() === "POST") {
      stateBeforeResponse = await readGasState(page);
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, status: "error" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "success" }),
    });
  });

  await seedGasState(page);
  await page.goto("/");
  await expect(page.locator("#target-space-heading")).toContainText("東ア23a");

  await page.locator("#btn-purchased").click();

  await expect
    .poll(() => requests.filter((method) => method === "POST"))
    .toHaveLength(1);
  await expect.poll(() => stateBeforeResponse).not.toBeNull();
  expect(stateBeforeResponse).toMatchObject({
    purchased: ["東ア23a"],
    gasOutbox: [
      { attempts: 0, lastError: null, purchased: true, space: "東ア23a" },
    ],
  });

  await expect
    .poll(async () => (await readGasState(page)).gasOutbox)
    .toMatchObject([
      { attempts: 1, lastError: "http-500", purchased: true, space: "東ア23a" },
    ]);
  await expect(page.locator("#toast")).toContainText("東ア23a 購入！");
  expect(requests).toEqual(["POST"]);
  expect((await readGasState(page)).purchased).toEqual(["東ア23a"]);
  await expect(page.locator("#target-space-heading")).toHaveText("東ア31b");
  await expect(page.locator('[data-route-kind="candidate"]')).toHaveCount(0);
});

test("reload時の再試行が成功するとoutboxを消去する", async ({ page }) => {
  let mode: "failure" | "success" = "failure";
  const requests: string[] = [];
  await interceptGas(page, async (route) => {
    requests.push(route.request().method());
    if (route.request().method() === "POST" && mode === "failure") {
      await route.fulfill({ status: 500, body: "unavailable" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "success" }),
    });
  });

  await seedGasState(page);
  await page.goto("/");
  await page.locator("#btn-purchased").click();
  await expect.poll(() => requests).toEqual(["POST"]);
  await expect
    .poll(async () => (await readGasState(page)).gasOutbox[0]?.attempts)
    .toBe(1);

  mode = "success";
  requests.length = 0;
  await page.reload();

  await expect.poll(() => requests).toEqual(["POST"]);
  await expect
    .poll(async () => (await readGasState(page)).gasOutbox)
    .toEqual([]);
  expect((await readGasState(page)).purchased).toEqual(["東ア23a"]);
});

test("online復帰イベントを同時発火しても再試行は一度だけ実行する", async ({
  page,
}) => {
  let mode: "failure" | "success" = "failure";
  const requests: string[] = [];
  await interceptGas(page, async (route) => {
    requests.push(route.request().method());
    if (route.request().method() === "POST" && mode === "failure") {
      await route.fulfill({ status: 500, body: "unavailable" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "success" }),
    });
  });

  await seedGasState(page, { pendingOutbox: true });
  await page.goto("/");
  await expect.poll(() => requests).toEqual(["POST"]);
  await expect
    .poll(async () => (await readGasState(page)).gasOutbox[0]?.attempts)
    .toBe(2);

  mode = "success";
  requests.length = 0;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
  });

  await expect.poll(() => requests).toEqual(["POST"]);
  await expect
    .poll(async () => (await readGasState(page)).gasOutbox)
    .toEqual([]);
});
