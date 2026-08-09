// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { CircleDetailDialog } from "../apps/webapp/js/components/circle-detail-dialog";
import type { CircleRecord } from "../apps/webapp/js/features/event-day/domain/application-contract-types";

describe("Phase 5C Task 3: Circle Detail Dialog Component", () => {
  const sampleCircle: CircleRecord = {
    space: "東A-01a",
    priority: 1,
    account: "@test_user",
    memo: "新刊セット予約済み",
  };

  test("map marker and list row pass identical circle data to detail component", async () => {
    const dialog = new CircleDetailDialog();
    document.body.appendChild(dialog);

    dialog.circle = sampleCircle;
    dialog.visitState = "pending";
    dialog.open = true;
    await dialog.updateComplete;

    const titleEl = dialog.shadowRoot?.querySelector(".circle-space");
    expect(titleEl?.textContent?.trim()).toBe("東A-01a");

    const badgeEl = dialog.shadowRoot?.querySelector(".state-badge");
    expect(badgeEl?.textContent?.trim()).toBe("巡回対象");

    dialog.remove();
  });

  test("renders valid actions based on visit state", async () => {
    const dialog = new CircleDetailDialog();
    document.body.appendChild(dialog);

    // Pending state actions
    dialog.circle = sampleCircle;
    dialog.visitState = "pending";
    dialog.open = true;
    await dialog.updateComplete;

    let targetBtn = dialog.shadowRoot?.querySelector(
      "button[data-action='set-target']",
    );
    expect(targetBtn).not.toBeNull();

    // Purchased state actions
    dialog.visitState = "purchased";
    await dialog.updateComplete;

    targetBtn = dialog.shadowRoot?.querySelector(
      "button[data-action='set-target']",
    );
    expect(targetBtn).toBeNull(); // Set target should not exist for purchased

    const unmarkBtn = dialog.shadowRoot?.querySelector(
      "button[data-action='unmark-purchased']",
    );
    expect(unmarkBtn).not.toBeNull();
    expect(
      [...(dialog.shadowRoot?.querySelectorAll("button") ?? [])].every(
        (button) => button.type === "button",
      ),
    ).toBe(true);

    dialog.remove();
  });

  test("keeps menu actions behind the その他 control", async () => {
    const dialog = new CircleDetailDialog();
    document.body.appendChild(dialog);

    dialog.circle = sampleCircle;
    dialog.visitState = "pending";
    dialog.open = true;
    await dialog.updateComplete;

    expect(
      dialog.shadowRoot?.querySelector("button[data-action='mark-purchased']"),
    ).toBeNull();

    const menuToggle = dialog.shadowRoot?.querySelector(
      "button[data-action='open-menu']",
    ) as HTMLButtonElement;
    expect(menuToggle?.textContent?.trim()).toBe("その他");

    menuToggle.click();
    await dialog.updateComplete;

    expect(
      dialog.shadowRoot?.querySelector("button[data-action='mark-purchased']"),
    ).not.toBeNull();

    dialog.remove();
  });

  test("emits action-selected event when action button is clicked", async () => {
    const dialog = new CircleDetailDialog();
    document.body.appendChild(dialog);

    dialog.circle = sampleCircle;
    dialog.visitState = "pending";
    dialog.open = true;
    await dialog.updateComplete;

    const handler = vi.fn();
    dialog.addEventListener("action-selected", handler);

    const holdBtn = dialog.shadowRoot?.querySelector(
      "button[data-action='hold']",
    ) as HTMLButtonElement;
    expect(holdBtn).not.toBeNull();
    holdBtn.click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({
      action: "hold",
      circle: sampleCircle,
    });

    dialog.remove();
  });

  test("supports focus return and Escape key to close dialog", async () => {
    const triggerBtn = document.createElement("button");
    triggerBtn.id = "trigger-btn";
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();

    const dialog = new CircleDetailDialog();
    document.body.appendChild(dialog);

    dialog.circle = sampleCircle;
    dialog.visitState = "pending";
    dialog.open = true;
    await dialog.updateComplete;

    // Simulate Escape key
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await dialog.updateComplete;

    expect(dialog.open).toBe(false);

    dialog.remove();
    triggerBtn.remove();
  });
});
