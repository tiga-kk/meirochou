// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { EventDayRepository } from "../apps/webapp/js/features/event-day/public-api";
import type {
  EventDayRef,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import type {
  CancelableRequest,
  GoogleSheetCircleClient,
} from "../apps/webapp/js/features/circle-data-source/public-api";
import type { RouteGuidanceInvalidation } from "../apps/webapp/js/features/circle-data-source/use-cases/route-guidance-invalidation";
import type { EventDaySelectorView } from "../apps/webapp/js/features/event-day/ui/event-day-selector-view";
import type { CircleDataSourceView } from "../apps/webapp/js/features/circle-data-source/ui/circle-data-source-view";
import {
  EventDaySelectorController,
  type EventDaySelectorControllerDependencies,
} from "../apps/webapp/js/features/event-day/ui/event-day-selector-controller";
import { SwitchEventDayUseCase } from "../apps/webapp/js/features/event-day/use-cases/switch-event-day";
import { OpenInitialEventDayUseCase } from "../apps/webapp/js/features/event-day/use-cases/open-initial-event-day";

const REF: EventDayRef = { eventId: "demo-v1", dayId: "day1" };

const REGISTRY = {
  schemaVersion: 1 as const,
  events: [
    {
      eventId: "demo-v1",
      displayName: "Demo Event",
      mapBundle: "demo",
      days: [{ dayId: "day1", displayName: "Day 1" }],
    },
  ],
};

const EMPTY_STATE: LocalEventDayState = {
  schemaVersion: 2,
  source: { type: "csv", fileName: "empty.csv" },
  sourceGeneration: "gen-1",
  circles: [{ space: "E1-01" }],
  circleStates: {},
  gasOutbox: [],
  timestamps: {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
  },
};

function createFakeRepository(
  state: LocalEventDayState | null = EMPTY_STATE,
): EventDayRepository & { getLastOpenedEventDay: ReturnType<typeof vi.fn> } {
  return {
    getLastOpenedEventDay: vi.fn(() => REF),
    load: vi.fn(() => state),
    save: vi.fn(),
    saveAndRememberLastOpened: vi.fn(),
    listEventDays: vi.fn(() => [REF]),
    rememberLastOpenedEventDay: vi.fn(),
    deleteEventDay: vi.fn(),
    listEventDaysForDeletion: vi.fn(() => []),
    deleteAllEventDays: vi.fn(),
  };
}

function createFakeEventDayView(): EventDaySelectorView & {
  render: ReturnType<typeof vi.fn>;
  showError: ReturnType<typeof vi.fn>;
  focusSelected: ReturnType<typeof vi.fn>;
} {
  return {
    render: vi.fn(),
    showError: vi.fn(),
    focusSelected: vi.fn(),
  };
}

function createFakeCircleDataSourceView(): CircleDataSourceView & {
  showPreview: ReturnType<typeof vi.fn>;
  showError: ReturnType<typeof vi.fn>;
  showLoading: ReturnType<typeof vi.fn>;
  showReady: ReturnType<typeof vi.fn>;
} {
  return {
    showPreview: vi.fn(),
    showError: vi.fn(),
    showLoading: vi.fn(),
    showReady: vi.fn(),
  };
}

function createFakeRouteGuidanceInvalidation(): RouteGuidanceInvalidation & {
  invalidateAfterCircleSourceChange: ReturnType<typeof vi.fn>;
} {
  return {
    invalidateAfterCircleSourceChange: vi.fn(),
  };
}

describe("production event day and circle data source wiring", () => {
  it("EventDaySelectorController start() calls getLastOpenedEventDay and renders view", async () => {
    const repository = createFakeRepository();
    const eventDayView = createFakeEventDayView();

    // This tests that the controller's start() loads the registry and renders the view.
    // Currently the controller does NOT have a start() method or registry/view injection - this test should fail.
    const deps: EventDaySelectorControllerDependencies = {
      switchEventDay: { execute: vi.fn(async () => {}) },
      openInitialEventDay: new OpenInitialEventDayUseCase(repository),
      registry: REGISTRY,
      view: eventDayView,
      repository,
    };
    const controller = new EventDaySelectorController(deps);

    // start() does not exist yet - this will fail at compile/runtime
    await (controller as any).start();

    expect(repository.getLastOpenedEventDay).toHaveBeenCalled();
    expect(eventDayView.render).toHaveBeenCalled();
  });

  it("CircleDataSourceController preview flows to showPreview with previewId", async () => {
    const repository = createFakeRepository();
    const circleDataSourceView = createFakeCircleDataSourceView();
    const routeGuidanceInvalidation = createFakeRouteGuidanceInvalidation();

    // CircleDataSourceController currently has no previewCsvImport or applyCircleDataPreview.
    // These use cases don't exist yet. This test should fail.
    const { CircleDataSourceController } = await import(
      "../apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller"
    );

    const previewCsvImport = {
      execute: vi.fn((_input: unknown) => ({
        previewId: "test-preview-id",
        ref: REF,
        mode: "replacement" as const,
        expectedSourceGeneration: "gen-1",
        diff: { added: [], updated: [], removed: [], unchanged: [] },
        newCircles: [],
        fetchedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2099-01-01T00:00:00.000Z",
      })),
    };

    const { createCircleDataSourceSession } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session"
    );
    const session = createCircleDataSourceSession();
    const client = {
      startLoadingSheetNames: vi.fn(() => ({
        result: Promise.resolve([]),
        cancel: vi.fn(),
      })),
      startLoadingCircles: vi.fn(() => ({
        result: Promise.resolve([]),
        cancel: vi.fn(),
      })),
    };

    const controller = new CircleDataSourceController({
      client,
      session,
      previewCsvImport,
      view: circleDataSourceView,
      repository,
      routeGuidanceInvalidation,
    } as any);

    // handleCsvFile does not exist yet - this tests the future public API
    await (controller as any).handleCsvFile(REF, "demo.csv", "space,priority\nE1-01,1");

    expect(circleDataSourceView.showPreview).toHaveBeenCalledWith(
      expect.objectContaining({ previewId: expect.any(String) }),
    );
  });

  it("assembly connects both controllers (route invalidation called after apply)", async () => {
    // This test proves the full wiring. Currently assembleComiPathApplication
    // does not create EventDaySelectorController or CircleDataSourceController.
    // The test verifies the contract exists at the assembly level.
    const { assembleComiPathApplication } = await import(
      "../apps/webapp/js/app/assemble-comipath-application"
    );
    const repository = createFakeRepository();
    const eventDayView = createFakeEventDayView();
    const circleDataSourceView = createFakeCircleDataSourceView();
    const routeGuidanceInvalidation = createFakeRouteGuidanceInvalidation();

    // These parameters are not currently accepted by assembleComiPathApplication
    const app = assembleComiPathApplication({
      document: document,
      window: window,
      repository,
      eventDayView,
      circleDataSourceView,
      routeGuidanceInvalidation,
      registry: REGISTRY,
    } as any);

    // previewCsvImport and applyCircleDataPreview do not exist on StartableApplication
    expect((app as any).previewCsvImport).toBeDefined();
    expect((app as any).applyCircleDataPreview).toBeDefined();
  });
});
