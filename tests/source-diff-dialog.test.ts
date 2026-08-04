// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SourceDiffDialog,
  SourceDiffDialogModel,
} from "../apps/webapp/js/components/source-diff-dialog";
import type { SourceDiffViewModel } from "../apps/webapp/js/shared/ui/management-view-model";
import "../apps/webapp/js/components/source-diff-dialog";

function createDummyDiff(): SourceDiffViewModel {
  return {
    added: [{ space: "東1-A01a", changedFields: [] }],
    updated: [{ space: "東1-A02b", changedFields: ["優先度", "X(Twitter)"] }],
    removed: [{ space: "東1-A03a", changedFields: [] }],
    countsLabel: "追加: 1件 / 更新: 1件 / 削除: 1件",
  };
}

function createModel(
  overrides: Partial<SourceDiffDialogModel> = {},
): SourceDiffDialogModel {
  return {
    open: true,
    previewId: "prev_test_123",
    sourceLabel: "demo.csv",
    diff: createDummyDiff(),
    busy: false,
    errorMessage: "",
    ...overrides,
  };
}

async function setModel(
  dialog: SourceDiffDialog,
  model: SourceDiffDialogModel,
) {
  dialog.model = model;
  await dialog.updateComplete;
}

describe("SourceDiffDialog Component", () => {
  let container: HTMLElement;
  let dialog: SourceDiffDialog;
  let openerBtn: HTMLButtonElement;

  beforeEach(async () => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    container.id = "main-container";

    openerBtn = document.createElement("button");
    openerBtn.id = "opener-btn";
    container.appendChild(openerBtn);

    document.body.appendChild(container);

    dialog = document.createElement("source-diff-dialog") as SourceDiffDialog;
    document.body.appendChild(dialog);

    openerBtn.focus();
  });

  describe("Render tests", () => {
    it("renders dialog elements with aria attributes when open", async () => {
      await setModel(dialog, createModel());

      const dialogEl = dialog.querySelector('[role="dialog"]');
      expect(dialogEl).not.toBeNull();
      expect(dialogEl?.getAttribute("aria-modal")).toBe("true");
      expect(dialogEl?.getAttribute("aria-labelledby")).toBeTruthy();
      expect(dialogEl?.getAttribute("aria-describedby")).toBeTruthy();
    });

    it("displays counts label, row summaries, and preservation explanation", async () => {
      await setModel(dialog, createModel());

      const text = dialog.textContent || "";
      expect(text).toContain("追加: 1件 / 更新: 1件 / 削除: 1件");
      expect(text).toContain("東1-A01a");
      expect(text).toContain("東1-A02b");
      expect(text).toContain("優先度");
      expect(text).toContain("東1-A03a");
      expect(text).toContain("購入");
      expect(text).toContain("キープ");
    });

    it("disables action buttons when busy", async () => {
      await setModel(dialog, createModel({ busy: true }));

      const applyBtn = dialog.querySelector<HTMLButtonElement>(
        '[data-action="apply"]',
      );
      const cancelBtn = dialog.querySelector<HTMLButtonElement>(
        '[data-action="cancel"]',
      );

      expect(applyBtn?.disabled).toBe(true);
      expect(cancelBtn?.disabled).toBe(true);
    });

    it("renders error message in an alert element when error occurs", async () => {
      await setModel(
        dialog,
        createModel({ errorMessage: "プレビューの適用に失敗しました" }),
      );

      const alertEl = dialog.querySelector('[role="alert"]');
      expect(alertEl).not.toBeNull();
      expect(alertEl?.textContent).toContain("プレビューの適用に失敗しました");
      expect(document.activeElement).toBe(alertEl);
    });

    it("does not render dialog body or applies hidden attribute when closed", async () => {
      await setModel(dialog, createModel({ open: false }));

      const dialogEl = dialog.querySelector('[role="dialog"]');
      expect(
        dialogEl === null ||
          dialog.hasAttribute("hidden") ||
          dialog.classList.contains("hidden"),
      ).toBe(true);
    });
  });

  describe("Focus & Event tests", () => {
    it("sets main container inert and focuses heading or control on open", async () => {
      await setModel(dialog, createModel());

      expect(container.hasAttribute("inert")).toBe(true);
      expect(document.activeElement).not.toBe(openerBtn);
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it("emits source-preview-apply event with previewId when apply button is clicked", async () => {
      await setModel(dialog, createModel());

      const applySpy = vi.fn();
      dialog.addEventListener("source-preview-apply", applySpy);

      const applyBtn = dialog.querySelector<HTMLButtonElement>(
        '[data-action="apply"]',
      );
      applyBtn?.click();

      expect(applySpy).toHaveBeenCalledTimes(1);
      const detail = (applySpy.mock.calls[0][0] as CustomEvent).detail;
      expect(detail).toEqual({ previewId: "prev_test_123" });
    });

    it("emits source-preview-cancel event when cancel button is clicked", async () => {
      await setModel(dialog, createModel());

      const cancelSpy = vi.fn();
      dialog.addEventListener("source-preview-cancel", cancelSpy);

      const cancelBtn = dialog.querySelector<HTMLButtonElement>(
        '[data-action="cancel"]',
      );
      cancelBtn?.click();

      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it("emits source-preview-cancel on Escape press when not busy", async () => {
      await setModel(dialog, createModel({ busy: false }));

      const cancelSpy = vi.fn();
      dialog.addEventListener("source-preview-cancel", cancelSpy);

      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      });
      window.dispatchEvent(event);

      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it("ignores Escape key when busy", async () => {
      await setModel(dialog, createModel({ busy: true }));

      const cancelSpy = vi.fn();
      dialog.addEventListener("source-preview-cancel", cancelSpy);

      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      });
      window.dispatchEvent(event);

      expect(cancelSpy).not.toHaveBeenCalled();
    });

    it("wraps focus inside enabled dialog controls on Tab", async () => {
      await setModel(dialog, createModel());

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length > 1) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        last.focus();
        const tabEvent = new KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
        });
        window.dispatchEvent(tabEvent);

        expect(document.activeElement).toBe(first);

        first.focus();
        const shiftTabEvent = new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
        });
        window.dispatchEvent(shiftTabEvent);

        expect(document.activeElement).toBe(last);
      }
    });

    it("removes inert and restores focus to opener on close", async () => {
      await setModel(dialog, createModel({ open: true }));
      expect(container.hasAttribute("inert")).toBe(true);

      await setModel(dialog, createModel({ open: false }));
      expect(container.hasAttribute("inert")).toBe(false);
      expect(document.activeElement).toBe(openerBtn);
    });

    it("removes inert on element disconnect", async () => {
      await setModel(dialog, createModel({ open: true }));
      expect(container.hasAttribute("inert")).toBe(true);

      dialog.remove();

      expect(container.hasAttribute("inert")).toBe(false);
    });

    it("restores a pre-existing inert state on close", async () => {
      container.setAttribute("inert", "");

      await setModel(dialog, createModel({ open: true }));
      await setModel(dialog, createModel({ open: false }));

      expect(container.hasAttribute("inert")).toBe(true);
    });

    it("focuses the settings heading when the opener was removed", async () => {
      const heading = document.createElement("h2");
      heading.textContent = "設定";
      container.appendChild(heading);

      await setModel(dialog, createModel({ open: true }));
      openerBtn.remove();
      await setModel(dialog, createModel({ open: false }));

      expect(document.activeElement).toBe(heading);
    });
  });
});
