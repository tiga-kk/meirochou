import {
  BoundaryValidationError,
  parseGasCircleResponse,
  parseGasSaleResponse,
  parseGasSheetListResponse,
} from "../types/boundary-parsers";
import type {
  GasCircleResponse,
  GasSaleUpdate,
  GasSheetListResponse,
} from "../types/domain";

export interface GasApiClientOptions {
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
}

export class GasTransportError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;
  readonly cause: unknown;

  constructor(
    message: string,
    options: { retryable: boolean; status?: number | null; cause?: unknown },
  ) {
    super(message);
    this.name = "GasTransportError";
    this.retryable = options.retryable;
    this.status = options.status ?? null;
    this.cause = options.cause;
  }
}

export class GasResponseError extends Error {
  readonly fieldPath: string | null;

  constructor(message: string, fieldPath: string | null = null) {
    super(message);
    this.name = "GasResponseError";
    this.fieldPath = fieldPath;
  }
}

export function parseGasWebAppUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new GasResponseError(
      "Invalid WebApp URL: expected a string",
      "gasUrl",
    );
  }
  const trimmed = value.trim();
  if (trimmed !== value || !value) {
    throw new GasResponseError(
      "Invalid WebApp URL: whitespace or empty string not allowed",
      "gasUrl",
    );
  }

  const match =
    /^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec$/.exec(
      trimmed,
    );
  if (!match?.[1]) {
    throw new GasResponseError(
      "Invalid WebApp URL: must be https://script.google.com/macros/s/<deployment-id>/exec with no query or hash",
      "gasUrl",
    );
  }

  return trimmed;
}

export class GasApiClient {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options?: GasApiClientOptions) {
    this.fetcher = options?.fetcher ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options?.timeoutMs ?? 30000;
  }

  private async requestJson<T>(
    rawBaseUrl: string,
    buildUrlFn: (normalizedUrl: string) => string,
    init: RequestInit,
    parser: (input: unknown) => T,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    const baseUrl = parseGasWebAppUrl(rawBaseUrl);
    const targetUrl = buildUrlFn(baseUrl);

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    if (this.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error("Timeout"));
      }, this.timeoutMs);
    }

    const onCallerAbort = () => {
      controller.abort(callerSignal?.reason);
    };

    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort(callerSignal.reason);
      } else {
        callerSignal.addEventListener("abort", onCallerAbort, { once: true });
      }
    }

    try {
      let response: Response;
      try {
        response = await this.fetcher(targetUrl, {
          ...init,
          signal: controller.signal,
        });
      } catch (err: unknown) {
        if (timedOut) {
          throw new GasTransportError("Request timed out", {
            retryable: true,
            status: null,
            cause: err,
          });
        }
        if (callerSignal?.aborted) {
          throw new GasTransportError("Request aborted by caller", {
            retryable: false,
            status: null,
            cause: err,
          });
        }
        throw new GasTransportError("Network error or request failure", {
          retryable: true,
          status: null,
          cause: err,
        });
      }

      if (timedOut) {
        throw new GasTransportError("Request timed out", {
          retryable: true,
          status: null,
        });
      }
      if (callerSignal?.aborted) {
        throw new GasTransportError("Request aborted by caller", {
          retryable: false,
          status: null,
        });
      }

      if (!response.ok) {
        const status = response.status;
        const retryable =
          status === 408 || status === 425 || status === 429 || status >= 500;
        throw new GasTransportError(`HTTP error status ${status}`, {
          retryable,
          status,
        });
      }

      let rawJson: unknown;
      try {
        rawJson = await response.json();
      } catch (err: unknown) {
        if (timedOut) {
          throw new GasTransportError("Request timed out", {
            retryable: true,
            status: null,
            cause: err,
          });
        }
        if (callerSignal?.aborted) {
          throw new GasTransportError("Request aborted by caller", {
            retryable: false,
            status: null,
            cause: err,
          });
        }
        throw new GasResponseError("Failed to parse response JSON", null);
      }

      if (
        rawJson &&
        typeof rawJson === "object" &&
        !Array.isArray(rawJson) &&
        (("ok" in rawJson && (rawJson as { ok: unknown }).ok === false) ||
          ("status" in rawJson &&
            (rawJson as { status: unknown }).status === "error"))
      ) {
        throw new GasResponseError("GAS returned error status", null);
      }

      try {
        return parser(rawJson);
      } catch (err: unknown) {
        if (err instanceof BoundaryValidationError) {
          throw new GasResponseError(err.message, err.path);
        }
        if (err instanceof GasResponseError) {
          throw err;
        }
        throw new GasResponseError("Malformed response payload", null);
      }
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      if (callerSignal) {
        callerSignal.removeEventListener("abort", onCallerAbort);
      }
    }
  }

  async fetchSheetList(
    baseUrl: string,
    signal?: AbortSignal,
  ): Promise<GasSheetListResponse> {
    return this.requestJson(
      baseUrl,
      (url) => `${url}?action=getSheets`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      parseGasSheetListResponse,
      signal,
    );
  }

  async fetchCircles(
    baseUrl: string,
    sheetName: string,
    signal?: AbortSignal,
  ): Promise<GasCircleResponse> {
    if (!sheetName?.trim()) {
      throw new GasResponseError(
        "Sheet name must be a non-empty string",
        "sheetName",
      );
    }
    return this.requestJson(
      baseUrl,
      (url) => `${url}?sheets=${encodeURIComponent(sheetName)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      parseGasCircleResponse,
      signal,
    );
  }

  async sendSaleUpdate(
    baseUrl: string,
    payload: GasSaleUpdate,
    signal?: AbortSignal,
  ): Promise<void> {
    if (payload?.action !== "sale") {
      throw new GasResponseError("Invalid sale payload", "payload");
    }
    await this.requestJson(
      baseUrl,
      (url) => url,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "sale",
          sheetName: payload.sheetName,
          space: payload.space,
          undo: payload.undo,
        }),
      },
      parseGasSaleResponse,
      signal,
    );
  }
}
