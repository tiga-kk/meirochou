// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SourceManager,
  SourceManagerModel,
} from "../apps/webapp/js/components/source-manager";
import type { SourceSummaryViewModel } from "../apps/webapp/js/ui/management-view-model";
import "../apps/webapp/js/components/source-manager";

describe("SourceManager Component", () => {
  let element: SourceManager;

  const sampleCsvSource: SourceSummaryViewModel = {
    typeLabel: "CSV",
    detail: "circles.csv",
    endpointSummary: null,
    pendingCount: 0,
  };

  const defaultModel: SourceManagerModel = {
    activeRefLabel: "C104 1日目",
    source: sampleCsvSource,
    sourceType: "csv",
    gasUrlInput: "",
    selectedSheetName: "",
    sheetNames: [],
    pendingCount: 0,
    busy: false,
    errorMessage: "",
  };

  beforeEach(async () => {
    document.body.innerHTML = "";
    element = document.createElement("source-manager") as SourceManager;
    element.model = defaultModel;
    document.body.appendChild(element);
    await element.updateComplete;
  });

  it("renders active ref label and current source summary", async () => {
    await element.updateComplete;
    expect(element.textContent).toContain("C104 1日目");
    expect(element.textContent).toContain("CSV");
    expect(element.textContent).toContain("circles.csv");
  });

  it("dispatches csv-preview-request when a valid .csv file <= 5MiB is selected", async () => {
    await element.updateComplete;
    const listener = vi.fn();
    element.addEventListener("csv-preview-request", listener);

    const fileInput =
      element.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const validFile = new File(["space,priority\nA-01a,1"], "my_circles.CSV", {
      type: "text/csv",
    });

    Object.defineProperty(fileInput, "files", {
      value: [validFile],
      configurable: true,
    });

    fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    await element.updateComplete;

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail.file).toBe(validFile);
    // Native file input value must be cleared so re-selecting the same file fires change
    expect(fileInput?.value).toBe("");
  });

  it("rejects files exceeding 5MiB before dispatching event", async () => {
    await element.updateComplete;
    const listener = vi.fn();
    element.addEventListener("csv-preview-request", listener);

    const fileInput =
      element.querySelector<HTMLInputElement>('input[type="file"]');
    const largeFile = new File(["a"], "large.csv");
    Object.defineProperty(largeFile, "size", { value: 5 * 1024 * 1024 + 1 });

    Object.defineProperty(fileInput, "files", {
      value: [largeFile],
      configurable: true,
    });

    fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    await element.updateComplete;

    expect(listener).not.toHaveBeenCalled();
    expect(element.textContent).toContain("5MB");
  });

  it("dispatches gas-sheets-request for valid GAS webapp URL", async () => {
    element.model = {
      ...defaultModel,
      sourceType: "gas",
      gasUrlInput:
        "https://script.google.com/macros/s/AKfycbx_TEST_DEPLOYMENT_ID/exec",
    };
    await element.updateComplete;

    const listener = vi.fn();
    element.addEventListener("gas-sheets-request", listener);

    const fetchButton = element.querySelector<HTMLButtonElement>(
      'button[data-action="fetch-sheets"]',
    );
    expect(fetchButton).not.toBeNull();
    fetchButton?.click();

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail.gasUrl).toBe(
      "https://script.google.com/macros/s/AKfycbx_TEST_DEPLOYMENT_ID/exec",
    );
  });

  it("prevents gas-sheets-request when URL contains query strings, fragments, or non-HTTPS", async () => {
    element.model = {
      ...defaultModel,
      sourceType: "gas",
      gasUrlInput:
        "https://script.google.com/macros/s/ID/exec?token=SECRET#hash",
    };
    await element.updateComplete;

    const listener = vi.fn();
    element.addEventListener("gas-sheets-request", listener);

    const fetchButton = element.querySelector<HTMLButtonElement>(
      'button[data-action="fetch-sheets"]',
    );
    fetchButton?.click();

    expect(listener).not.toHaveBeenCalled();
  });

  it("clears previously fetched sheet choices when the draft URL changes", async () => {
    const oldUrl = "https://script.google.com/macros/s/AKfycbx_OLD/exec";
    element.model = {
      ...defaultModel,
      sourceType: "gas",
      gasUrlInput: oldUrl,
      sheetNames: ["旧シート"],
      selectedSheetName: "旧シート",
    };
    await element.updateComplete;

    const urlInput = element.querySelector<HTMLInputElement>("#gas-url-input");
    expect(urlInput).not.toBeNull();
    if (!urlInput) return;

    urlInput.value = "https://script.google.com/macros/s/AKfycbx_NEW/exec";
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));
    await element.updateComplete;

    expect(element.querySelector("#gas-sheet-select")).toBeNull();
  });

  it("dispatches gas-preview-request when sheet is selected and preview button clicked", async () => {
    const validUrl =
      "https://script.google.com/macros/s/AKfycbx_TEST_DEPLOYMENT_ID/exec";
    element.model = {
      ...defaultModel,
      sourceType: "gas",
      gasUrlInput: validUrl,
      sheetNames: ["配置シート1", "配置シート2"],
      selectedSheetName: "配置シート1",
    };
    await element.updateComplete;

    const listener = vi.fn();
    element.addEventListener("gas-preview-request", listener);

    const previewButton = element.querySelector<HTMLButtonElement>(
      'button[data-action="gas-preview"]',
    );
    expect(previewButton).not.toBeNull();
    previewButton?.click();

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      source: {
        type: "gas",
        gasUrl: validUrl,
        sheetName: "配置シート1",
      },
      mode: "initial",
    });
  });

  it("disables source controls and shows guidance when pendingCount > 0", async () => {
    element.model = {
      ...defaultModel,
      pendingCount: 2,
    };
    await element.updateComplete;

    const fileInput =
      element.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput?.disabled).toBe(true);
    expect(element.textContent).toContain("送信待ち");
  });
});
