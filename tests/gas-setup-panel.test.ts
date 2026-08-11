// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";
import { ComipathSettings } from "../apps/webapp/js/components/comipath-settings";
import { GasSetupPanel } from "../apps/webapp/js/components/gas-setup-panel";

const code = "function doPost() {}\n";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

function response(ok: boolean, text = code): Response {
  return { ok, text: async () => text } as Response;
}

test("copies the generated GAS artifact and announces success", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  setClipboard(writeText);
  const fetchMock = vi.fn().mockResolvedValue(response(true));
  vi.stubGlobal("fetch", fetchMock);

  const element = new GasSetupPanel();
  document.body.appendChild(element);
  await element.updateComplete;
  await element.copyGasCode();

  expect(fetchMock).toHaveBeenCalledWith(
    "/assets/integrations/gas-spreadsheet/Code.gs.txt",
  );
  expect(writeText).toHaveBeenCalledWith(code);
  expect(element.querySelector("[role='status']")?.textContent).toContain(
    "GASコードをコピーしました",
  );
});

test("reports artifact fetch failures without claiming a copy", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  setClipboard(writeText);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(false)));

  const element = new GasSetupPanel();
  document.body.appendChild(element);
  await element.updateComplete;
  await element.copyGasCode();

  expect(writeText).not.toHaveBeenCalled();
  expect(element.querySelector("[role='alert']")?.textContent).toContain(
    "GASコードを取得できませんでした",
  );
});

test("shows fetched code in a manual fallback when clipboard is unavailable", async () => {
  setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(true)));

  const element = new GasSetupPanel();
  document.body.appendChild(element);
  await element.updateComplete;
  await element.copyGasCode();

  const fallback = element.querySelector<HTMLTextAreaElement>("textarea");
  expect(fallback?.value).toBe(code);
  expect(fallback?.readOnly).toBe(true);
  expect(element.querySelector("[role='status']")?.textContent).toContain(
    "手動でコピーしてください",
  );
});

test("renders GAS setup independently of event/day configuration", async () => {
  const element = new ComipathSettings();
  document.body.appendChild(element);
  await element.updateComplete;

  expect(element.querySelector("gas-setup-panel")).not.toBeNull();
});
