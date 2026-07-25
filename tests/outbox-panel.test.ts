// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import "../apps/webapp/js/components/outbox-panel";
import type { OutboxPanel } from "../apps/webapp/js/components/outbox-panel";
import type { ManagementEventDetailMap } from "../apps/webapp/js/ui/management-events";
import type { OutboxPanelModel } from "../apps/webapp/js/ui/management-view-model";

function createSampleModel(): OutboxPanelModel {
  return {
    groups: [
      {
        ref: { eventId: "c104", dayId: "day1" },
        label: "コミックマーケット104 1日目",
        entries: [
          {
            id: "entry-1",
            refLabel: "コミックマーケット104 1日目",
            sourceLabel: "day1",
            space: "東A01a",
            desiredLabel: "購入済みにする",
            attemptsLabel: "1回試行",
            errorLabel: "通信エラー",
          },
          {
            id: "entry-2",
            refLabel: "コミックマーケット104 1日目",
            sourceLabel: "day1",
            space: "東A02b",
            desiredLabel: "購入を取り消す",
            attemptsLabel: "0回試行",
            errorLabel: null,
          },
        ],
      },
      {
        ref: { eventId: "c104", dayId: "day2" },
        label: "コミックマーケット104 2日目",
        entries: [
          {
            id: "entry-3",
            refLabel: "コミックマーケット104 2日目",
            sourceLabel: "day2",
            space: "西10a",
            desiredLabel: "購入済みにする",
            attemptsLabel: "2回試行",
            errorLabel: "タイムアウト",
          },
        ],
      },
    ],
    totalPending: 3,
    processing: false,
    resultMessage: "",
    errorMessage: "",
  };
}

describe("OutboxPanel Component (Lit)", () => {
  it("renders empty state when there are no pending entries", async () => {
    const el = document.createElement("outbox-panel") as OutboxPanel;
    document.body.appendChild(el);
    el.model = {
      groups: [],
      totalPending: 0,
      processing: false,
      resultMessage: "",
      errorMessage: "",
    };
    await el.updateComplete;

    expect(el.textContent).toContain("送信待ちのGAS同期はありません");
    expect(el.innerHTML).not.toContain("script.google.com");
    document.body.removeChild(el);
  });

  it("renders safe groups, entries, counts, and error labels without raw URL or secret leakage", async () => {
    const el = document.createElement("outbox-panel") as OutboxPanel;
    document.body.appendChild(el);
    const model = createSampleModel();
    el.model = model;
    await el.updateComplete;

    const text = el.textContent || "";
    expect(text).toContain("コミックマーケット104 1日目");
    expect(text).toContain("東A01a");
    expect(text).toContain("購入済みにする");
    expect(text).toContain("1回試行");
    expect(text).toContain("通信エラー");

    expect(text).toContain("コミックマーケット104 2日目");
    expect(text).toContain("西10a");
    expect(text).toContain("タイムアウト");

    // Total pending badge or text
    expect(text).toContain("3件");

    // Verify DOM contains no raw secrets or URLs
    expect(el.innerHTML).not.toContain("https://");
    expect(el.innerHTML).not.toContain("AKfycb");
    document.body.removeChild(el);
  });

  it("dispatches gas-retry-request for all or specific group", async () => {
    const el = document.createElement("outbox-panel") as OutboxPanel;
    document.body.appendChild(el);
    el.model = createSampleModel();
    await el.updateComplete;

    const retryEvents: ManagementEventDetailMap["gas-retry-request"][] = [];
    el.addEventListener("gas-retry-request", (e: Event) => {
      const customEv = e as CustomEvent<
        ManagementEventDetailMap["gas-retry-request"]
      >;
      retryEvents.push(customEv.detail);
    });

    const retryAllBtn = el.querySelector<HTMLButtonElement>(".btn-retry-all");
    expect(retryAllBtn).not.toBeNull();
    retryAllBtn?.click();

    expect(retryEvents).toHaveLength(1);
    expect(retryEvents[0]).toEqual({ ref: null });

    const retryGroupBtns =
      el.querySelectorAll<HTMLButtonElement>(".btn-retry-group");
    expect(retryGroupBtns.length).toBeGreaterThanOrEqual(1);
    retryGroupBtns[0]?.click();

    expect(retryEvents).toHaveLength(2);
    expect(retryEvents[1]).toEqual({ ref: { eventId: "c104", dayId: "day1" } });

    document.body.removeChild(el);
  });

  it("disables retry buttons when processing is true", async () => {
    const el = document.createElement("outbox-panel") as OutboxPanel;
    document.body.appendChild(el);
    el.model = {
      ...createSampleModel(),
      processing: true,
    };
    await el.updateComplete;

    const retryAllBtn = el.querySelector<HTMLButtonElement>(".btn-retry-all");
    expect(retryAllBtn?.disabled).toBe(true);

    const retryGroupBtns =
      el.querySelectorAll<HTMLButtonElement>(".btn-retry-group");
    for (const btn of retryGroupBtns) {
      expect(btn.disabled).toBe(true);
    }

    document.body.removeChild(el);
  });

  it("handles selection, prevents cross-group selection, requires exact confirmation, and dispatches gas-discard-request", async () => {
    const el = document.createElement("outbox-panel") as OutboxPanel;
    document.body.appendChild(el);
    el.model = createSampleModel();
    await el.updateComplete;

    const discardEvents: ManagementEventDetailMap["gas-discard-request"][] = [];
    el.addEventListener("gas-discard-request", (e: Event) => {
      const customEv = e as CustomEvent<
        ManagementEventDetailMap["gas-discard-request"]
      >;
      discardEvents.push(customEv.detail);
    });

    // Check entry 1 in group 1
    const checkboxes = el.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"].entry-select',
    );
    expect(checkboxes.length).toBe(3);

    checkboxes[0].click();
    await el.updateComplete;

    // Check entry 3 in group 2 -> should be disabled or prevented
    checkboxes[2].click();
    await el.updateComplete;

    // Checkbox 2 (entry-3 in group 2) should not be selected together with group 1 entries
    expect(checkboxes[2].checked).toBe(false);

    // Open discard dialog/confirm area
    const openDiscardBtn =
      el.querySelector<HTMLButtonElement>(".btn-open-discard");
    openDiscardBtn?.click();
    await el.updateComplete;

    const confirmInput = el.querySelector<HTMLInputElement>(
      ".discard-confirm-input",
    );
    const confirmBtn = el.querySelector<HTMLButtonElement>(
      ".btn-confirm-discard",
    );
    expect(confirmInput).not.toBeNull();
    expect(confirmBtn?.disabled).toBe(true);

    // Input with leading/trailing spaces or wrong text
    if (confirmInput) {
      confirmInput.value = "未送信を破棄 ";
      confirmInput.dispatchEvent(new Event("input"));
    }
    await el.updateComplete;
    expect(confirmBtn?.disabled).toBe(true);

    // Input exact confirmation text
    if (confirmInput) {
      confirmInput.value = "未送信を破棄";
      confirmInput.dispatchEvent(new Event("input"));
    }
    await el.updateComplete;
    expect(confirmBtn?.disabled).toBe(false);

    confirmBtn?.click();

    expect(discardEvents).toHaveLength(1);
    expect(discardEvents[0]).toEqual({
      ref: { eventId: "c104", dayId: "day1" },
      ids: ["entry-1"],
      confirmation: "未送信を破棄",
    });

    document.body.removeChild(el);
  });

  it("keeps the discard selection and dialog open when the parent reports failure", async () => {
    const el = document.createElement("outbox-panel") as OutboxPanel;
    document.body.appendChild(el);
    el.model = createSampleModel();
    await el.updateComplete;

    const checkbox = el.querySelector<HTMLInputElement>(
      'input[type="checkbox"].entry-select',
    );
    checkbox?.click();
    await el.updateComplete;
    el.querySelector<HTMLButtonElement>(".btn-open-discard")?.click();
    await el.updateComplete;

    const confirmInput = el.querySelector<HTMLInputElement>(
      ".discard-confirm-input",
    );
    if (confirmInput) {
      confirmInput.value = "未送信を破棄";
      confirmInput.dispatchEvent(new Event("input"));
    }
    await el.updateComplete;
    el.querySelector<HTMLButtonElement>(".btn-confirm-discard")?.click();

    el.model = {
      ...createSampleModel(),
      errorMessage: "未送信データの破棄に失敗しました",
    };
    await el.updateComplete;

    expect(el.querySelector(".discard-modal-overlay")).not.toBeNull();
    expect(
      el.querySelector<HTMLInputElement>('input[type="checkbox"].entry-select')
        ?.checked,
    ).toBe(true);
    expect(
      el.querySelector<HTMLInputElement>(".discard-confirm-input")?.value,
    ).toBe("未送信を破棄");
    document.body.removeChild(el);
  });

  it("clears the discard selection after the selected entry disappears", async () => {
    const el = document.createElement("outbox-panel") as OutboxPanel;
    document.body.appendChild(el);
    el.model = createSampleModel();
    await el.updateComplete;

    el.querySelector<HTMLInputElement>(
      'input[type="checkbox"].entry-select',
    )?.click();
    await el.updateComplete;
    el.querySelector<HTMLButtonElement>(".btn-open-discard")?.click();
    await el.updateComplete;

    el.model = {
      ...createSampleModel(),
      groups: [
        {
          ...createSampleModel().groups[0],
          entries: [createSampleModel().groups[0].entries[1]],
        },
        createSampleModel().groups[1],
      ],
      totalPending: 2,
      resultMessage: "選択した未送信データを破棄しました",
    };
    await el.updateComplete;
    await el.updateComplete;

    expect(el.querySelector(".discard-modal-overlay")).toBeNull();
    expect(el.querySelector(".btn-open-discard")).toBeNull();
    document.body.removeChild(el);
  });

  it("discard modal has aria-modal and aria-labelledby pointing to heading", async () => {
    const el = document.createElement("outbox-panel") as OutboxPanel;
    document.body.appendChild(el);
    el.model = createSampleModel();
    await el.updateComplete;

    el.querySelector<HTMLInputElement>(
      'input[type="checkbox"].entry-select',
    )?.click();
    await el.updateComplete;
    el.querySelector<HTMLButtonElement>(".btn-open-discard")?.click();
    await el.updateComplete;

    const modal = el.querySelector<HTMLElement>('[role="dialog"]');
    expect(modal).not.toBeNull();
    expect(modal?.getAttribute("aria-modal")).toBe("true");

    const labelId = modal?.getAttribute("aria-labelledby");
    expect(labelId).toBe("outbox-discard-title");
    expect(el.querySelector(`#${labelId}`)).not.toBeNull();
    expect(modal?.getAttribute("aria-describedby")).toBe("outbox-discard-desc");
    expect(el.querySelector("#outbox-discard-desc")).not.toBeNull();

    document.body.removeChild(el);
  });

  it("does not expose GAS URL or CSV content in rendered outbox entries", async () => {
    const el = document.createElement("outbox-panel") as OutboxPanel;
    document.body.appendChild(el);
    el.model = createSampleModel();
    await el.updateComplete;

    expect(el.innerHTML).not.toContain("script.google.com/macros/s/");
    expect(el.innerHTML).not.toContain("AKfycb");

    document.body.removeChild(el);
  });
});
