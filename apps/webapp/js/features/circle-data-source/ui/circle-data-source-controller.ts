import type { GoogleSheetCircleClient } from "../use-cases/google-sheet-circle-client";
import type { CircleDataSourceSession } from "../use-cases/circle-data-source-session";
import type { CancelableRequest } from "../use-cases/cancelable-request";

export interface CircleDataSourceControllerDependencies {
  client: GoogleSheetCircleClient;
  session: CircleDataSourceSession;
  activeEventDayReader?: any;
  eventDayRepository?: any;
  routeGuidanceInvalidator?: any;
  downloader?: any;
}

export class CircleDataSourceController {
  private currentRequest: CancelableRequest<any> | null = null;

  constructor(private deps: CircleDataSourceControllerDependencies) {}

  async loadGoogleSheetNames(webAppUrl: string): Promise<void> {
    this.cancelCurrentRequest();
    const generation = this.deps.session.beginRequest();
    const req = this.deps.client.startLoadingSheetNames(webAppUrl);
    this.currentRequest = req;

    try {
      const sheets = await req.result;
      if (this.deps.session.isCurrentRequest(generation)) {
        this.deps.session.setSheetNames(sheets);
      }
    } catch (err) {
      if (this.deps.session.isCurrentRequest(generation)) {
        this.deps.session.setError("network_error");
      }
    } finally {
      if (this.currentRequest === req) {
        this.currentRequest = null;
      }
    }
  }

  cancelCurrentRequest(): void {
    if (this.currentRequest) {
      this.currentRequest.cancel();
      this.currentRequest = null;
    }
    this.deps.session.setBusy(false);
  }

  stop(): void {
    this.cancelCurrentRequest();
  }
}
