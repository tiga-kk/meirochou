// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AsyncOperationIndicator,
} from "../apps/webapp/js/components/async-operation-indicator";

describe("AsyncOperationIndicator", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps loading visible until status changes", async () => {
    const indicator = new AsyncOperationIndicator();
    document.body.append(indicator);
    indicator.status = { kind: "loading", label: "GASからデータを読み込み中…" };
    await indicator.updateComplete;

    vi.advanceTimersByTime(10_000);
    await indicator.updateComplete;

    expect(indicator.textContent).toContain("GASからデータを読み込み中");
  });

  it("returns success to idle after the success display window", async () => {
    const indicator = new AsyncOperationIndicator();
    document.body.append(indicator);
    indicator.status = { kind: "success", label: "GASデータを読み込みました" };
    await indicator.updateComplete;
    expect(indicator.textContent).toContain("GASデータを読み込みました");

    vi.advanceTimersByTime(1_500);
    await indicator.updateComplete;

    expect(indicator.textContent?.trim()).toBe("");
  });
});
