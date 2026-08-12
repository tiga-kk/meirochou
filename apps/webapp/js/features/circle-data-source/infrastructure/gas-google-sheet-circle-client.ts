import { canonicalizeSpace } from "../../../shared/domain/space-parser";
import type { CircleRecord } from "../../event-day/public-api";
import type { CancelableRequest } from "../use-cases/cancelable-request";
import type {
  GoogleSheetCircleClient,
  GoogleSheetCircleSource,
} from "../use-cases/google-sheet-circle-client";

interface GasPayload {
  readonly circles?: unknown;
  readonly sheets?: unknown;
}

function validateGasUrl(value: string): string {
  if (
    !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(
      value,
    )
  ) {
    throw new Error("Invalid WebApp URL");
  }
  return value;
}

function parseStringList(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error("Invalid sheet list response");
  }
  return value;
}

function parseCircles(value: unknown): readonly CircleRecord[] {
  if (!Array.isArray(value)) throw new Error("Invalid circle response");
  const seenSpaces = new Set<string>();
  return value.map((item): CircleRecord => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Invalid circle response");
    }
    const record = item as Record<string, unknown>;
    const space = canonicalizeSpace(record.space);
    if (!space) {
      throw new Error("Invalid circle response");
    }
    if (seenSpaces.has(space)) throw new Error("Invalid circle response");
    seenSpaces.add(space);
    return {
      space,
      ...(typeof record.priority === "number"
        ? { priority: record.priority }
        : {}),
      ...(typeof record.account === "string"
        ? { account: record.account }
        : {}),
      ...(typeof record.tweet === "string" ? { tweet: record.tweet } : {}),
      ...(typeof record.memo === "string" ? { memo: record.memo } : {}),
      ...(typeof record.isSale === "string" ? { isSale: record.isSale } : {}),
    };
  });
}

function createCancelableRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): CancelableRequest<T> {
  const controller = new AbortController();
  let cancelled = false;
  const result = operation(controller.signal).catch((error: unknown) => {
    if (cancelled) throw new Error("Request cancelled");
    throw error;
  });
  return {
    result,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      controller.abort();
    },
  };
}

async function getJson(url: string, signal: AbortSignal): Promise<GasPayload> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("GAS request failed");
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new Error("Invalid GAS response");
  }
  return payload as GasPayload;
}

export class GasGoogleSheetCircleClient implements GoogleSheetCircleClient {
  startLoadingSheetNames(
    webAppUrl: string,
  ): CancelableRequest<readonly string[]> {
    return createCancelableRequest(async (signal) => {
      const payload = await getJson(
        `${validateGasUrl(webAppUrl)}?action=getSheets`,
        signal,
      );
      return parseStringList(payload.sheets);
    });
  }

  startLoadingCircles(
    source: GoogleSheetCircleSource,
  ): CancelableRequest<readonly CircleRecord[]> {
    return createCancelableRequest(async (signal) => {
      const url = `${validateGasUrl(source.gasUrl)}?sheets=${encodeURIComponent(source.sheetName)}`;
      const payload = await getJson(url, signal);
      return parseCircles(payload.circles);
    });
  }
}
