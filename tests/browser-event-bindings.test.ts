// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { bindBrowserEvents } from "../apps/webapp/js/app/bind-browser-events";
import { BrowserApplication } from "../apps/webapp/js/app/browser-application";

function createDependencies() {
  document.body.innerHTML = `
    <button id="toggle-settings"></button>
    <button id="btn-open-gallery"></button>
    <button id="btn-search"></button>
    <button id="btn-purchased"></button>
    <button id="btn-hold"></button>
    <button id="btn-reset-all"></button>
    <select id="loc-ewsn"><option value="east">east</option></select>
    <div id="settings-area"></div>
    <div id="navigation-resume-dialog"></div>`;
  const settings = document.getElementById("settings-area") as HTMLElement & {
    open?: boolean;
  };
  const application = {
    ui: {
      els: { settingsArea: settings },
      statsRenderer: null,
      toggleSettings: vi.fn(),
      showGallery: vi.fn(),
      setSettingsError: vi.fn(),
    },
    routeMapAreaCatalog: { getAllMapAreas: () => [] },
    searchNext: vi.fn(),
    handleAction: vi.fn(),
    handleReset: vi.fn(),
    handleResumeConfirm: vi.fn(),
    handleResumeResetStart: vi.fn(),
    handleGasRetryRequest: vi.fn(),
    handleGasDiscardRequest: vi.fn(),
    handleDeleteOptionSelect: vi.fn(),
    handleStorageDeleteRequest: vi.fn(),
    handleDeleteDialogCancel: vi.fn(),
    clearActivePreviewIfAny: vi.fn(),
    updateManagementModels: vi.fn(),
    toggleSettings: vi.fn(),
    closeSettings: vi.fn(),
    handleOptimizationTimeLimitChange: vi.fn(),
    showGallery: vi.fn(),
    showGalleryForArea: vi.fn(),
  };
  return { application, settings };
}

describe("bindBrowserEvents", () => {
  it("registers app-owned actions once and disables them after stop", () => {
    const { application } = createDependencies();
    const binding = bindBrowserEvents({
      application: application as never,
      document,
    });

    document.getElementById("btn-purchased")?.dispatchEvent(new Event("click"));
    expect(application.handleAction).toHaveBeenCalledOnce();

    binding.stop();
    document.getElementById("btn-purchased")?.dispatchEvent(new Event("click"));
    expect(application.handleAction).toHaveBeenCalledOnce();
    binding.stop();
  });

  it("opens the global gallery without reading the location selector", () => {
    const { application } = createDependencies();
    const binding = bindBrowserEvents({ application: application as never, document });

    document.getElementById("loc-ewsn")?.remove();
    document.getElementById("btn-open-gallery")?.dispatchEvent(new Event("click"));

    expect(application.showGallery).toHaveBeenCalledWith({ kind: "all-unvisited" });
    expect(application.showGalleryForArea).not.toHaveBeenCalled();
    binding.stop();
  });

  it("does not double-fire after stop and start", () => {
    const { application } = createDependencies();
    const first = bindBrowserEvents({ application: application as never, document });
    first.stop();
    const second = bindBrowserEvents({ application: application as never, document });

    document.getElementById("btn-search")?.dispatchEvent(new Event("click"));
    expect(application.searchNext).toHaveBeenCalledOnce();

    second.stop();
    document.getElementById("btn-search")?.dispatchEvent(new Event("click"));
    expect(application.searchNext).toHaveBeenCalledOnce();
  });

  it("delegates settings close to the public application operation", () => {
    const { application } = createDependencies();
    const toggle = document.getElementById("toggle-settings")!;
    const settings = document.getElementById("settings-area") as HTMLElement & {
      open?: boolean;
    };
    settings.open = true;
    const binding = bindBrowserEvents({ application: application as never, document });

    toggle.dispatchEvent(new Event("click"));

    expect(application.toggleSettings).toHaveBeenCalledWith(toggle);
    expect(application.closeSettings).not.toHaveBeenCalled();
    binding.stop();
  });

  it("closes settings on Escape only while open", () => {
    const { application, settings } = createDependencies();
    const binding = bindBrowserEvents({ application: application as never, document });

    settings.open = false;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(application.toggleSettings).not.toHaveBeenCalled();

    settings.open = true;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(application.toggleSettings).toHaveBeenCalledOnce();
    binding.stop();
  });

  it("delegates valid optimization changes and does not handle invalid values in the binder", () => {
    const { application } = createDependencies();
    const settings = document.getElementById("settings-area")!;
    const binding = bindBrowserEvents({ application: application as never, document });

    settings.dispatchEvent(
      new CustomEvent("optimization-time-limit-change", {
        detail: { searchTimeLimitMs: 10000 },
      }),
    );
    settings.dispatchEvent(
      new CustomEvent("optimization-time-limit-change", {
        detail: { searchTimeLimitMs: 7000 },
      }),
    );

    expect(application.handleOptimizationTimeLimitChange).toHaveBeenNthCalledWith(
      1,
      { searchTimeLimitMs: 10000 },
    );
    expect(application.handleOptimizationTimeLimitChange).toHaveBeenCalledTimes(2);
    binding.stop();
  });

  it("does not throw or retain listeners when settings DOM is absent", () => {
    const { application } = createDependencies();
    document.body.innerHTML = '<button id="btn-purchased"></button>';
    application.ui.els.settingsArea = null as never;

    const binding = bindBrowserEvents({ application: application as never, document });
    expect(() => binding.stop()).not.toThrow();

    document.getElementById("btn-purchased")?.dispatchEvent(new Event("click"));
    expect(application.handleAction).not.toHaveBeenCalled();
  });

  it("saves a snapshot only for valid limits with active navigation", () => {
    const setOptimizationTimeLimit = vi.fn();
    const saveNavigationSnapshot = vi.fn();
    const application = {
      routeGuidanceController: { setOptimizationTimeLimit },
      routeGuidanceSession: { getSnapshot: () => ({ navigationState: {} }) },
      saveNavigationSnapshot,
    };

    BrowserApplication.prototype.handleOptimizationTimeLimitChange.call(
      application,
      { searchTimeLimitMs: 15000 },
    );
    BrowserApplication.prototype.handleOptimizationTimeLimitChange.call(
      application,
      { searchTimeLimitMs: 7000 },
    );

    expect(setOptimizationTimeLimit).toHaveBeenCalledOnce();
    expect(setOptimizationTimeLimit).toHaveBeenCalledWith(15000);
    expect(saveNavigationSnapshot).toHaveBeenCalledOnce();
  });

  it("does not save a snapshot when valid optimization changes have no navigation", () => {
    const setOptimizationTimeLimit = vi.fn();
    const saveNavigationSnapshot = vi.fn();
    const application = {
      routeGuidanceController: { setOptimizationTimeLimit },
      routeGuidanceSession: { getSnapshot: () => ({ navigationState: null }) },
      saveNavigationSnapshot,
    };

    BrowserApplication.prototype.handleOptimizationTimeLimitChange.call(
      application,
      { searchTimeLimitMs: 5000 },
    );

    expect(setOptimizationTimeLimit).toHaveBeenCalledWith(5000);
    expect(saveNavigationSnapshot).not.toHaveBeenCalled();
  });
});
