// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { assembleComiPathApplication } from "../apps/webapp/js/app/assemble-comipath-application";
import type { CircleDataPreview } from "../apps/webapp/js/features/circle-data-source/public-api";
import type { CircleDataSourceView } from "../apps/webapp/js/features/circle-data-source/ui/circle-data-source-view";
import type { RouteGuidanceInvalidation } from "../apps/webapp/js/features/circle-data-source/use-cases/route-guidance-invalidation";
import type {
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import type { EventDaySelectorView } from "../apps/webapp/js/features/event-day/ui/event-day-selector-view";

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
  it("assembles application, starts controllers, and routes public view events to use cases", async () => {
    const repository = createFakeRepository();
    const eventDayView = createFakeEventDayView();
    const circleDataSourceView = createFakeCircleDataSourceView();
    const routeGuidanceInvalidation = createFakeRouteGuidanceInvalidation();

    const targetElement = document.createElement("div");
    const diffDialogElement = document.createElement("div");
    diffDialogElement.id = "source-diff-dialog";
    document.body.appendChild(targetElement);
    document.body.appendChild(diffDialogElement);

    const app = assembleComiPathApplication({
      document,
      window,
      repository,
      eventDayView,
      circleDataSourceView,
      routeGuidanceInvalidation,
      registry: REGISTRY,
      targetElement,
    });

    await app.start();

    // Verification step 1: getLastOpenedEventDay & render called
    expect(repository.getLastOpenedEventDay).toHaveBeenCalled();
    expect(eventDayView.render).toHaveBeenCalled();

    // Verification step 2: CSV preview request via public DOM event triggers showPreview
    const csvFile = new File(["space,priority\nE1-01,1"], "test.csv", {
      type: "text/csv",
    });
    const previewEvent = new CustomEvent("csv-preview-request", {
      detail: { file: csvFile, ref: REF },
      bubbles: true,
    });
    targetElement.dispatchEvent(previewEvent);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(circleDataSourceView.showPreview).toHaveBeenCalledWith(
      expect.objectContaining({ previewId: expect.any(String) }),
    );

    // Get the previewId from showPreview call
    const previewCall = circleDataSourceView.showPreview.mock.calls[0];
    if (!previewCall) throw new Error("Circle preview was not rendered");
    const previewId = (previewCall[0] as CircleDataPreview).previewId;

    // Verification step 3: source-preview-apply triggers route guidance invalidation
    const applyEvent = new CustomEvent("source-preview-apply", {
      detail: { previewId },
      bubbles: true,
    });
    diffDialogElement.dispatchEvent(applyEvent);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      routeGuidanceInvalidation.invalidateAfterCircleSourceChange,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "demo-v1", dayId: "day1" }),
    );

    app.stop();
  });
});
