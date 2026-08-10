// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DialogFocusController } from "../apps/webapp/js/ui/dialog-focus";

describe("DialogFocusController nested dialogs", () => {
  it("inerts siblings along every ancestor while keeping the dialog usable", () => {
    const header = document.createElement("header");
    const main = document.createElement("main");
    const settings = document.createElement("section");
    const overview = document.createElement("article");
    const detail = document.createElement("details");
    const summary = document.createElement("summary");
    const dialog = document.createElement("div");
    const button = document.createElement("button");
    const opener = document.createElement("button");
    button.textContent = "confirm";
    dialog.append(button);
    detail.append(summary, dialog);
    settings.append(overview, detail);
    document.body.append(opener, header, main, settings);
    opener.focus();

    const controller = new DialogFocusController(dialog, {
      backgroundSelector: "section",
    });
    controller.activate();

    expect(header.hasAttribute("inert")).toBe(true);
    expect(main.hasAttribute("inert")).toBe(true);
    expect(overview.hasAttribute("inert")).toBe(true);
    expect(summary.hasAttribute("inert")).toBe(true);
    expect(settings.hasAttribute("inert")).toBe(false);
    expect(dialog.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(button);

    let clicked = false;
    button.addEventListener("click", () => {
      clicked = true;
    });
    button.click();
    expect(clicked).toBe(true);

    controller.deactivate();
    expect(header.hasAttribute("inert")).toBe(false);
    expect(main.hasAttribute("inert")).toBe(false);
    expect(overview.hasAttribute("inert")).toBe(false);
    expect(summary.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});
