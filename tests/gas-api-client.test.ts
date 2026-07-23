import { describe, expect, it, vi } from "vitest";
import {
  GasApiClient,
  GasResponseError,
  GasTransportError,
  parseGasWebAppUrl,
} from "../apps/webapp/js/api/gas-api-client";

describe("parseGasWebAppUrl", () => {
  it("accepts valid GAS web app URLs", () => {
    const validUrl =
      "https://script.google.com/macros/s/AKfycbx_example-id_123/exec";
    expect(parseGasWebAppUrl(validUrl)).toBe(validUrl);
  });

  it("rejects invalid URLs without echoing input URL", () => {
    const invalidUrls = [
      "http://script.google.com/macros/s/xyz/exec",
      "https://example.com/macros/s/xyz/exec",
      "https://script.google.com/macros/s/xyz/exec?query=1",
      "https://script.google.com/macros/s/xyz/exec#fragment",
      "https://user:pass@script.google.com/macros/s/xyz/exec",
      "https://script.google.com/macros/s//exec",
      " https://script.google.com/macros/s/xyz/exec ",
      "https://script.google.com/macros/s/xyz/other",
    ];

    for (const url of invalidUrls) {
      expect(() => parseGasWebAppUrl(url)).toThrow(GasResponseError);
      try {
        parseGasWebAppUrl(url);
      } catch (err) {
        expect((err as Error).message).not.toContain(url);
      }
    }
  });
});

describe("GasApiClient request shape", () => {
  it("fetches sheet list with correct query parameter and Accept header", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: "success",
          sheets: ["1日目", "2日目"],
          spreadsheetTitle: "Demo",
        }),
      ),
    );

    const client = new GasApiClient({ fetcher });
    const baseUrl =
      "https://script.google.com/macros/s/AKfycbx_example-id_123/exec";

    const result = await client.fetchSheetList(baseUrl);

    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}?action=getSheets`,
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
    expect(result).toEqual({
      sheets: ["1日目", "2日目"],
      spreadsheetTitle: "Demo",
    });
  });

  it("fetches circles for a single sheet", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: "success",
          wantToBuy: [{ space: "東A01a", priority: 1 }],
          spreadsheetTitle: "Demo",
        }),
      ),
    );

    const client = new GasApiClient({ fetcher });
    const baseUrl =
      "https://script.google.com/macros/s/AKfycbx_example-id_123/exec";

    const result = await client.fetchCircles(baseUrl, "1日目");

    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}?sheets=${encodeURIComponent("1日目")}`,
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
    expect(result.wantToBuy[0].space).toBe("東A01a");
  });

  it("sends sale update via POST text/plain with JSON body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: "success",
        }),
      ),
    );

    const client = new GasApiClient({ fetcher });
    const baseUrl =
      "https://script.google.com/macros/s/AKfycbx_example-id_123/exec";

    await client.sendSaleUpdate(baseUrl, {
      action: "sale",
      sheetName: "1日目",
      space: "東A01a",
      undo: false,
    });

    expect(fetcher).toHaveBeenCalledWith(
      baseUrl,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "text/plain;charset=utf-8",
        }),
        body: JSON.stringify({
          action: "sale",
          sheetName: "1日目",
          space: "東A01a",
          undo: false,
        }),
      }),
    );
  });
});

describe("GasApiClient failure classification", () => {
  const baseUrl =
    "https://script.google.com/macros/s/AKfycbx_example-id_123/exec";

  it("classifies network rejection as retryable GasTransportError", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const client = new GasApiClient({ fetcher });

    await expect(client.fetchSheetList(baseUrl)).rejects.toSatisfy(
      (err: unknown) => {
        return (
          err instanceof GasTransportError &&
          err.retryable === true &&
          err.status === null
        );
      },
    );
  });

  it("classifies HTTP 429 and 5xx as retryable GasTransportError", async () => {
    for (const status of [408, 425, 429, 500, 503]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("Error", { status }));
      const client = new GasApiClient({ fetcher });

      await expect(client.fetchSheetList(baseUrl)).rejects.toSatisfy(
        (err: unknown) => {
          return (
            err instanceof GasTransportError &&
            err.retryable === true &&
            err.status === status
          );
        },
      );
    }
  });

  it("classifies other non-2xx HTTP errors as non-retryable GasTransportError", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Not Found", { status: 404 }));
    const client = new GasApiClient({ fetcher });

    await expect(client.fetchSheetList(baseUrl)).rejects.toSatisfy(
      (err: unknown) => {
        return (
          err instanceof GasTransportError &&
          err.retryable === false &&
          err.status === 404
        );
      },
    );
  });

  it("classifies invalid JSON as GasResponseError", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("<html>Not JSON</html>", { status: 200 }),
      );
    const client = new GasApiClient({ fetcher });

    await expect(client.fetchSheetList(baseUrl)).rejects.toBeInstanceOf(
      GasResponseError,
    );
  });

  it("classifies ok:false / status:error as GasResponseError", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          status: "error",
          message: "sheet contract failed",
        }),
        { status: 200 },
      ),
    );
    const client = new GasApiClient({ fetcher });

    await expect(client.fetchSheetList(baseUrl)).rejects.toBeInstanceOf(
      GasResponseError,
    );
  });

  it("classifies malformed success payload as GasResponseError", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: "success",
          wantToBuy: [{ space: "東A01a", priority: "not-a-number" }],
        }),
        { status: 200 },
      ),
    );
    const client = new GasApiClient({ fetcher });

    await expect(client.fetchCircles(baseUrl, "1日目")).rejects.toSatisfy(
      (err: unknown) => {
        return err instanceof GasResponseError && err.fieldPath !== null;
      },
    );
  });
});

describe("GasApiClient strict success parser", () => {
  const baseUrl =
    "https://script.google.com/macros/s/AKfycbx_example-id_123/exec";

  it("rejects duplicate circle spaces", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: "success",
          wantToBuy: [
            { space: "東A01a", priority: 1 },
            { space: "東A01a", priority: 2 },
          ],
        }),
      ),
    );
    const client = new GasApiClient({ fetcher });

    await expect(client.fetchCircles(baseUrl, "1日目")).rejects.toBeInstanceOf(
      GasResponseError,
    );
  });
});

describe("GasApiClient abort and timeout", () => {
  const baseUrl =
    "https://script.google.com/macros/s/AKfycbx_example-id_123/exec";

  it("classifies caller abort as non-retryable GasTransportError", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const client = new GasApiClient({ fetcher });
    const promise = client.fetchSheetList(baseUrl, controller.signal);
    controller.abort();

    await expect(promise).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof GasTransportError &&
        err.retryable === false &&
        err.status === null
      );
    });
  });

  it("classifies client timeout as retryable GasTransportError", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Timeout", "AbortError"));
        });
      });
    });

    const client = new GasApiClient({ fetcher, timeoutMs: 1000 });
    const promise = client.fetchSheetList(baseUrl);

    vi.advanceTimersByTime(1001);

    await expect(promise).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof GasTransportError &&
        err.retryable === true &&
        err.status === null
      );
    });

    vi.useRealTimers();
  });

  it("classifies sendSaleUpdate failure as GasResponseError", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          status: "error",
          message: "Write failed",
        }),
      ),
    );
    const client = new GasApiClient({ fetcher });

    await expect(
      client.sendSaleUpdate(baseUrl, {
        action: "sale",
        sheetName: "1日目",
        space: "東A01a",
        undo: false,
      }),
    ).rejects.toBeInstanceOf(GasResponseError);
  });

  it("rejects a POST response with only one success marker", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const client = new GasApiClient({ fetcher });

    await expect(
      client.sendSaleUpdate(baseUrl, {
        action: "sale",
        sheetName: "1日目",
        space: "東A01a",
        undo: false,
      }),
    ).rejects.toBeInstanceOf(GasResponseError);
  });

  it("times out while reading a response body", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Timeout", "AbortError"));
            });
          }),
      } as Response);
    });

    const client = new GasApiClient({ fetcher, timeoutMs: 1000 });
    const request = client.fetchSheetList(baseUrl);
    const outcome = Promise.race([
      request.then(
        () => "resolved" as const,
        (error: unknown) => error,
      ),
      new Promise<"hung">((resolve) => {
        setTimeout(() => resolve("hung"), 1100);
      }),
    ]);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1100);
    const result = await outcome;

    expect(result).toSatisfy((value: unknown) => {
      return (
        value instanceof GasTransportError &&
        value.retryable === true &&
        value.status === null
      );
    });
    vi.useRealTimers();
  });
});
