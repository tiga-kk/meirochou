import type { Page } from "@playwright/test";

export const DEMO_EVENT_REGISTRY = {
  schemaVersion: 1,
  events: [
    {
      eventId: "demo-v1",
      displayName: "ComiPath Demo",
      mapBundle: "../maps/demo-v1/manifest.json",
      mapBundleContract: "legacy",
      days: [
        { dayId: "day1", displayName: "デモ1日目" },
        { dayId: "day2", displayName: "デモ2日目" },
      ],
    },
  ],
} as const;

export interface DemoEventRegistryRouteOptions {
  readonly firstUseGuideSeen?: boolean;
}

/** Keep browser tests on the fictional demo bundle after production switches to C108. */
export async function routeDemoEventRegistry(
  page: Page,
  options: DemoEventRegistryRouteOptions = {},
): Promise<void> {
  const firstUseGuideSeen = options.firstUseGuideSeen ?? true;
  if (firstUseGuideSeen) {
    await page.addInitScript(() => {
      localStorage.setItem("meirochou.first-use-guide-seen", "1");
    });
  }
  await page.route("**/assets/events/manifest.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DEMO_EVENT_REGISTRY),
    });
  });
}
