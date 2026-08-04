import type { CircleRecord, GasDataSource } from "../../event-day/public-api";
import type { CancelableRequest } from "../use-cases/cancelable-request";
import type { CircleDataSourceSession } from "../use-cases/circle-data-source-session";
import type {
  GoogleSheetCircleClient,
  GoogleSheetCircleSource,
} from "../use-cases/google-sheet-circle-client";

export interface CircleDataSourceControllerDependencies {
  readonly client: GoogleSheetCircleClient;
  readonly session: CircleDataSourceSession;
}

function parseGasUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new Error("Invalid WebApp URL");
  }
  if (
    !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(
      value,
    )
  ) {
    throw new Error("Invalid WebApp URL");
  }
  return value;
}

function parseGasSource(value: unknown): GoogleSheetCircleSource {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid GAS source");
  }
  const source = value as Partial<GasDataSource>;
  if (
    source.type !== "gas" ||
    typeof source.sheetName !== "string" ||
    source.sheetName.trim() === ""
  ) {
    throw new Error("Invalid GAS source");
  }
  return {
    type: "gas",
    gasUrl: parseGasUrl(source.gasUrl),
    sheetName: source.sheetName,
  };
}

export class CircleDataSourceController {
  private currentRequest: CancelableRequest<unknown> | null = null;
  private requestSequence = 0;
  private stopped = false;

  constructor(private readonly deps: CircleDataSourceControllerDependencies) {}

  async loadGoogleSheetNames(webAppUrl: unknown): Promise<void> {
    const url = parseGasUrl(webAppUrl);
    await this.runRequest(
      this.deps.client.startLoadingSheetNames(url),
      (sheets) => this.deps.session.setSheetNames(this.parseStringList(sheets)),
    );
  }

  async loadGoogleSheetCircles(
    source: unknown,
  ): Promise<readonly CircleRecord[]> {
    const parsed = parseGasSource(source);
    let circles: readonly CircleRecord[] = [];
    await this.runRequest(
      this.deps.client.startLoadingCircles(parsed),
      (value) => {
        circles = value;
      },
    );
    return circles;
  }

  cancelCurrentRequest(): void {
    this.requestSequence += 1;
    this.currentRequest?.cancel();
    this.currentRequest = null;
    this.deps.session.setBusy(false);
  }

  stop(): void {
    this.stopped = true;
    this.cancelCurrentRequest();
  }

  private parseStringList(value: unknown): readonly string[] {
    if (
      !Array.isArray(value) ||
      !value.every((item) => typeof item === "string")
    ) {
      throw new Error("Invalid sheet list response");
    }
    return value;
  }

  private async runRequest<T>(
    request: CancelableRequest<T>,
    onSuccess: (value: T) => void,
  ): Promise<void> {
    this.cancelCurrentRequest();
    const sequence = ++this.requestSequence;
    const generation = this.deps.session.beginRequest();
    this.currentRequest = request as CancelableRequest<unknown>;
    try {
      const value = await request.result;
      if (
        !this.stopped &&
        sequence === this.requestSequence &&
        this.deps.session.isCurrentRequest(generation)
      ) {
        onSuccess(value);
      }
    } catch {
      if (
        !this.stopped &&
        sequence === this.requestSequence &&
        this.deps.session.isCurrentRequest(generation)
      ) {
        this.deps.session.setError("network_error");
      }
    } finally {
      if (this.currentRequest === request) {
        this.currentRequest = null;
      }
    }
  }
}
