import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("event-day layer boundaries", () => {
  it("keeps the event-day repository contract free of concrete storage", () => {
    const contract = readFileSync(
      "apps/webapp/js/features/event-day/use-cases/event-day-repository.ts",
      "utf8",
    );
    expect(contract).not.toMatch(
      /StorageService|localStorage|INDEX_KEY|LAST_OPENED_KEY/,
    );
  });

  it("does not export LocalStorage infrastructure from the feature public API", () => {
    const publicApi = readFileSync(
      "apps/webapp/js/features/event-day/public-api.ts",
      "utf8",
    );
    expect(publicApi).not.toMatch(/LocalStorageEventDayRepository/);
  });
});
