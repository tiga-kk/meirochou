// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import "../apps/webapp/js/components/storage-delete-dialog";
import type { StorageDeleteDialog } from "../apps/webapp/js/components/storage-delete-dialog";
import type { ManagementEventDetailMap } from "../apps/webapp/js/shared/ui/management-events";

describe("StorageDeleteDialog Component (Lit)", () => {
  it("renders closed when model is closed or null", async () => {
    const el = document.createElement(
      "storage-delete-dialog",
    ) as StorageDeleteDialog;
    document.body.appendChild(el);
    el.model = null;
    await el.updateComplete;

    expect(el.querySelector(".modal-overlay")).toBeNull();
    document.body.removeChild(el);
  });

  it("renders scope details, requires checkbox consent, and dispatches storage-delete-request", async () => {
    const el = document.createElement(
      "storage-delete-dialog",
    ) as StorageDeleteDialog;
    document.body.appendChild(el);
    el.model = {
      open: true,
      scope: { type: "circles", ref: { eventId: "c104", dayId: "day1" } },
      option: {
        scope: { type: "circles", ref: { eventId: "c104", dayId: "day1" } },
        label: "サークルリストの削除（10件）",
        consequence: "サークル配置情報を削除し、空のリストにします。",
        blocked: false,
        blockedReason: null,
      },
      eventDayLabel: "コミックマーケット104 1日目",
      busy: false,
      errorMessage: "",
    };
    await el.updateComplete;

    const dialog = el.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-labelledby")).toBe(
      "storage-delete-dialog-title",
    );
    expect(el.querySelector("#storage-delete-dialog-title")).not.toBeNull();
    expect(dialog?.getAttribute("aria-describedby")).toBe(
      "storage-delete-dialog-desc",
    );
    expect(el.querySelector("#storage-delete-dialog-desc")).not.toBeNull();

    const text = el.textContent || "";
    expect(text).toContain("サークルリストの削除");
    expect(text).toContain("コミックマーケット104 1日目");

    const deleteEvents: ManagementEventDetailMap["storage-delete-request"][] =
      [];
    el.addEventListener("storage-delete-request", (e: Event) => {
      deleteEvents.push(
        (e as CustomEvent<ManagementEventDetailMap["storage-delete-request"]>)
          .detail,
      );
    });

    const confirmBtn = el.querySelector<HTMLButtonElement>(
      ".btn-confirm-delete",
    );
    expect(confirmBtn?.disabled).toBe(true); // Consent checkbox not checked yet

    const consentCheck = el.querySelector<HTMLInputElement>(
      'input[type="checkbox"].consent-check',
    );
    expect(consentCheck).not.toBeNull();
    consentCheck?.click();
    await el.updateComplete;

    expect(confirmBtn?.disabled).toBe(false);
    confirmBtn?.click();

    expect(deleteEvents).toHaveLength(1);
    expect(deleteEvents[0]).toEqual({
      scope: { type: "circles", ref: { eventId: "c104", dayId: "day1" } },
      confirmation: "",
    });

    document.body.removeChild(el);
  });

  it("requires exact text '全イベントを削除' for all-events scope", async () => {
    const el = document.createElement(
      "storage-delete-dialog",
    ) as StorageDeleteDialog;
    document.body.appendChild(el);
    el.model = {
      open: true,
      scope: { type: "all-events" },
      option: {
        scope: { type: "all-events" },
        label: "全日程データの削除（2日程）",
        consequence:
          "登録されている全日程のサークル情報・履歴・距離行列・ナビゲーション再開情報を消去します。",
        blocked: false,
        blockedReason: null,
      },
      eventDayLabel: "全イベント",
      busy: false,
      errorMessage: "",
    };
    await el.updateComplete;

    const consentCheck = el.querySelector<HTMLInputElement>(
      'input[type="checkbox"].consent-check',
    );
    consentCheck?.click();
    await el.updateComplete;

    const confirmInput = el.querySelector<HTMLInputElement>(
      ".delete-confirm-input",
    );
    const confirmBtn = el.querySelector<HTMLButtonElement>(
      ".btn-confirm-delete",
    );
    expect(confirmInput).not.toBeNull();
    expect(confirmBtn?.disabled).toBe(true);

    if (confirmInput) {
      confirmInput.value = "全イベントを削除 "; // invalid space
      confirmInput.dispatchEvent(new Event("input"));
    }
    await el.updateComplete;
    expect(confirmBtn?.disabled).toBe(true);

    if (confirmInput) {
      confirmInput.value = "全イベントを削除";
      confirmInput.dispatchEvent(new Event("input"));
    }
    await el.updateComplete;
    expect(confirmBtn?.disabled).toBe(false);

    document.body.removeChild(el);
  });

  it("keeps the dialog diagnosable on failure and emits cancel on Escape", async () => {
    const el = document.createElement(
      "storage-delete-dialog",
    ) as StorageDeleteDialog;
    document.body.appendChild(el);
    el.model = {
      open: true,
      scope: { type: "activity", ref: { eventId: "c104", dayId: "day1" } },
      option: {
        scope: { type: "activity", ref: { eventId: "c104", dayId: "day1" } },
        label: "購入・チェック履歴の削除（2件）",
        consequence: "活動履歴を削除します。",
        blocked: false,
        blockedReason: null,
      },
      eventDayLabel: "コミックマーケット104 1日目",
      busy: false,
      errorMessage: "データの削除に失敗しました。",
    };
    await el.updateComplete;

    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(document.activeElement).toBe(alert);

    const cancelEvents: CustomEvent[] = [];
    el.addEventListener("storage-delete-cancel", (event) => {
      cancelEvents.push(event as CustomEvent);
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(cancelEvents).toHaveLength(1);
    document.body.removeChild(el);
  });
});
