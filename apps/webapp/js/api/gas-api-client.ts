import {
  parseGasCircleResponse,
  parseGasSheetListResponse,
} from "../types/boundary-parsers";
import type { SaleUpdatePayload } from "../types/domain";

type UrlParameter = string | number | boolean | null | undefined;

export class GasApiClient {
  buildUrl(
    baseUrl: string,
    params: Record<string, UrlParameter>,
    currentHref = window.location.href,
  ): string {
    const url = new URL(baseUrl, currentHref);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  async fetchSheetList(baseUrl: string) {
    const url = this.buildUrl(baseUrl, { action: "getSheets" });
    const res = await fetch(url);
    if (!res.ok) throw new Error("通信エラー");
    return parseGasSheetListResponse(await res.json());
  }

  async fetchCircles(
    baseUrl: string,
    {
      selectedSheets = [],
      forceRefresh = false,
    }: { selectedSheets?: string[]; forceRefresh?: boolean } = {},
  ) {
    const params: Record<string, UrlParameter> = {};
    if (selectedSheets.length > 0) {
      params.sheets = selectedSheets.join(",");
    }
    if (forceRefresh) {
      params.cacheBust = Date.now();
    }

    const res = await fetch(this.buildUrl(baseUrl, params));
    if (!res.ok) throw new Error("通信エラー");
    return parseGasCircleResponse(await res.json());
  }

  async sendSaleUpdate(
    baseUrl: string,
    payload: SaleUpdatePayload,
  ): Promise<void> {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const jsonResponse = (await res.json()) as {
      status?: string;
      ok?: boolean;
      message?: string;
      error?: string;
    };
    if (jsonResponse.status !== "success" && jsonResponse.ok !== true) {
      const message =
        jsonResponse.message || jsonResponse.error || "Unknown error";
      throw new Error(`GAS Error: ${message}`);
    }
  }
}
