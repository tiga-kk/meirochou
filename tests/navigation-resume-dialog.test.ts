// @vitest-environment happy-dom
import { expect, test } from "vitest";
import "../apps/webapp/js/components/navigation-resume-dialog";

test("reflects open=false after resume confirmation", async () => {
  const dialog = document.createElement("navigation-resume-dialog");
  document.body.append(dialog);
  (dialog as HTMLElement & { open: boolean }).open = true;
  await (dialog as HTMLElement & { updateComplete: Promise<unknown> })
    .updateComplete;
  (dialog as HTMLElement & { open: boolean }).open = false;
  await (dialog as HTMLElement & { updateComplete: Promise<unknown> })
    .updateComplete;

  expect(dialog.hasAttribute("open")).toBe(false);
});
