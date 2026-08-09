import type { CancelableRequest } from "./cancelable-request";
import type { CircleDataSourceSession } from "./circle-data-source-session";
import type { GoogleSheetCircleClient } from "./google-sheet-circle-client";

export interface LoadGoogleSheetNamesInput {
  readonly webAppUrl: string;
}

/**
 * Starts loading GAS sheet names via the GoogleSheetCircleClient.
 * Returns a CancelableRequest; the controller owns cancellation.
 */
export class LoadGoogleSheetNamesUseCase {
  constructor(
    private readonly client: GoogleSheetCircleClient,
    private readonly session: CircleDataSourceSession,
  ) {}

  start(input: LoadGoogleSheetNamesInput): CancelableRequest<readonly string[]> {
    const request = this.client.startLoadingSheetNames(input.webAppUrl);
    return {
      result: request.result.then((names) => {
        this.session.setSheetNames(names);
        return names;
      }),
      cancel: request.cancel.bind(request),
    };
  }
}
