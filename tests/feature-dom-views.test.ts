import { describe, expect, it } from "vitest";
import { DomCircleDataSourceView } from "../apps/webapp/js/features/circle-data-source/ui/dom-circle-data-source-view";
import { DomEventDaySelectorView } from "../apps/webapp/js/features/event-day/ui/dom-event-day-selector-view";
import { DomLocalDataDeletionView } from "../apps/webapp/js/features/local-data-deletion/ui/dom-local-data-deletion-view";
import { DomUserNotificationView } from "../apps/webapp/js/shared/ui/dom-user-notification-view";

describe("feature-specific DOM views", () => {
  it("exposes independent source, event-day, and deletion view contracts", () => {
    expect(new DomCircleDataSourceView(null)).toBeInstanceOf(
      DomCircleDataSourceView,
    );
    expect(new DomEventDaySelectorView(null)).toBeInstanceOf(
      DomEventDaySelectorView,
    );
    expect(new DomLocalDataDeletionView(null)).toBeInstanceOf(
      DomLocalDataDeletionView,
    );
  });

  it("can stop a notification timer without retaining a browser resource", () => {
    const view = new DomUserNotificationView(null);
    view.showNotification("保存しました");
    view.stop();
    expect(view).toBeInstanceOf(DomUserNotificationView);
  });
});
