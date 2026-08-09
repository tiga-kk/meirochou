// @vitest-environment happy-dom
import { expect, test } from "vitest";
import "../apps/webapp/js/components/user-guide-dialog";

type GuideElement = HTMLElement & {
  open: boolean;
  updateComplete: Promise<unknown>;
};

async function renderGuide(opener: HTMLButtonElement) {
  document.body.replaceChildren(opener);
  opener.focus();
  const guide = document.createElement("user-guide-dialog") as GuideElement;
  document.body.append(guide);
  guide.open = true;
  await guide.updateComplete;
  return guide;
}

test("shows the in-app data and operation guide", async () => {
  const guide = await renderGuide(document.createElement("button"));
  const dialog = guide.querySelector('[role="dialog"]');

  expect(dialog?.getAttribute("aria-modal")).toBe("true");
  expect(guide.textContent).toContain("CSVを使う");
  expect(guide.textContent).toContain("space");
  expect(guide.textContent).toContain("priority");
  expect(guide.textContent).toContain("isSale");
  expect(guide.textContent).toContain("認識済みヘッダーの重複");
  expect(guide.textContent).toContain("経路を比較");
  expect(guide.textContent).toContain("左列の縦長カードは左方向");
  expect(guide.textContent).toContain("未送信データは設定画面から再送");
  expect(guide.querySelector(".user-guide-body")?.getAttribute("style")).toBeNull();
});

test("closes with Escape and restores focus to the opener", async () => {
  const opener = document.createElement("button");
  const guide = await renderGuide(opener);

  expect(guide.querySelector("#btn-close-user-guide")).toBe(document.activeElement);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await guide.updateComplete;

  expect(guide.open).toBe(false);
  expect(document.activeElement).toBe(opener);
});
