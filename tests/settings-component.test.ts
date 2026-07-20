// @vitest-environment happy-dom
import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import {
  ComipathSettings,
  type SettingsGasUrlChangeDetail,
  type SettingsSelectionChangeDetail,
} from "../apps/webapp/js/components/comipath-settings";

afterEach(() => {
  document.body.innerHTML = "";
});

test("settings component renders reactive properties in light DOM", async () => {
  const element = new ComipathSettings();
  element.open = true;
  element.gasUrl = "https://example.test/gas";
  element.sheets = ["東456", "西12"];
  element.selectedSheets = ["西12"];
  element.busy = true;
  element.errorMessage = "通信に失敗しました";
  document.body.appendChild(element);
  await element.updateComplete;

  assert.equal(element.classList.contains("show"), true);
  assert.equal(
    element.querySelector<HTMLInputElement>("#gas-url")?.value,
    element.gasUrl,
  );
  assert.equal(
    element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').length,
    2,
  );
  assert.equal(
    element.querySelector<HTMLInputElement>('input[value="西12"]')?.checked,
    true,
  );
  assert.equal(
    element.querySelector<HTMLButtonElement>("#btn-refresh")?.disabled,
    true,
  );
  assert.match(element.textContent || "", /通信に失敗しました/);
});

test("settings component emits typed events for every user operation", async () => {
  const element = new ComipathSettings();
  element.sheets = ["東456", "西12"];
  element.selectedSheets = ["東456"];
  document.body.appendChild(element);
  await element.updateComplete;

  let gasDetail: SettingsGasUrlChangeDetail | null = null;
  let selectionDetail: SettingsSelectionChangeDetail | null = null;
  let refreshRequests = 0;
  let fetchRequests = 0;
  element.addEventListener("settings-gas-url-change", (event) => {
    gasDetail = (event as CustomEvent<SettingsGasUrlChangeDetail>).detail;
  });
  element.addEventListener("settings-selection-change", (event) => {
    selectionDetail = (event as CustomEvent<SettingsSelectionChangeDetail>)
      .detail;
  });
  element.addEventListener(
    "settings-refresh-request",
    () => (refreshRequests += 1),
  );
  element.addEventListener(
    "settings-fetch-sheets-request",
    () => (fetchRequests += 1),
  );

  const gasInput = element.querySelector<HTMLInputElement>("#gas-url");
  assert.ok(gasInput);
  gasInput.value = "https://example.test/new";
  gasInput.dispatchEvent(new Event("input", { bubbles: true }));
  element.querySelector<HTMLButtonElement>("#btn-refresh")?.click();
  element.querySelector<HTMLButtonElement>("#btn-fetch-sheets")?.click();
  element.querySelector<HTMLInputElement>('input[value="西12"]')?.click();

  assert.deepEqual(gasDetail, { gasUrl: "https://example.test/new" });
  assert.equal(refreshRequests, 1);
  assert.equal(fetchRequests, 1);
  assert.deepEqual(selectionDetail, { selectedSheets: ["東456", "西12"] });
});
