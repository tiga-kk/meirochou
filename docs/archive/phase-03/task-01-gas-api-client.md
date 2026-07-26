# Phase 3 Task 1: Harden the Typed GAS API Client

> **Scope:** Implement transport and runtime response parsing only. Do not create sources, mutate repository state, enqueue outbox entries, or attach browser lifecycle listeners.

## Goal

Replace the legacy global-`fetch` client with an injected, timeout-aware client whose success and failure contracts are explicit enough for later retry decisions.

## Files

- Modify: `apps/webapp/js/api/gas-api-client.ts`
- Modify: `apps/webapp/js/types/boundary-parsers.ts`
- Modify: `apps/webapp/js/types/domain.ts`
- Create: `tests/gas-api-client.test.ts`
- Modify: `package.json` to include the new test in `test:webapp`

## Interfaces

```ts
export interface GasApiClientOptions {
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface GasSaleUpdate {
  readonly action: "sale";
  readonly sheetName: string;
  readonly space: string;
  readonly undo: boolean;
}

export class GasTransportError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;
  readonly cause: unknown;
}

export class GasResponseError extends Error {
  readonly fieldPath: string | null;
}

export class GasApiClient {
  constructor(options?: GasApiClientOptions);
  fetchSheetList(baseUrl: string, signal?: AbortSignal): Promise<GasSheetListResponse>;
  fetchCircles(baseUrl: string, sheetName: string, signal?: AbortSignal): Promise<GasCircleResponse>;
  sendSaleUpdate(baseUrl: string, payload: GasSaleUpdate, signal?: AbortSignal): Promise<void>;
}

export function parseGasWebAppUrl(value: unknown): string;
```

`fetchCircles` accepts exactly one sheet because each event/day owns one GAS sheet. Remove the old `selectedSheets[]` and `forceRefresh` transport API. Cache busting, if needed, is an internal query parameter added by explicit refresh calls, never a reason to support multiple sheets.

`parseGasWebAppUrl` accepts only `https://script.google.com/macros/s/<deployment-id>/exec` with no username/password, query, or fragment. It returns a normalized string and rejects every other origin/path. All three client methods call it before creating a request. Tests may route a fictional URL with that shape; production code must not expose an option that widens the allowed origin.

## Error classification

| Failure | Error | retryable |
|---|---|---|
| caller abort | `GasTransportError` | false |
| client timeout | `GasTransportError` | true |
| fetch rejection/network loss | `GasTransportError` | true |
| HTTP 408, 425, 429, or 5xx | `GasTransportError` | true |
| other non-2xx | `GasTransportError` | false |
| invalid JSON | `GasResponseError` | n/a |
| `{ok:false}`/`status:"error"` | `GasResponseError` | n/a |
| malformed success payload | `GasResponseError` with parser path | n/a |

Never include the full `baseUrl`, response body, spreadsheet rows, or POST payload in error messages.

## TDD steps

- [ ] **Step 1: Write URL and request-shape tests**

Use an injected `vi.fn<typeof fetch>()`. Assert:

```ts
await client.fetchCircles(
  "https://script.google.com/macros/s/example-deployment/exec",
  "1日目",
);
expect(fetcher).toHaveBeenCalledWith(
  "https://script.google.com/macros/s/example-deployment/exec?sheets=1%E6%97%A5%E7%9B%AE",
  expect.objectContaining({ headers: { Accept: "application/json" } }),
);
```

For POST, assert method `POST`, `Content-Type: text/plain;charset=utf-8`, and an exact body containing `action`, `sheetName`, `space`, and `undo`. Assert no bulk `spaces` payload remains.

- [ ] **Step 2: Write failure-classification tests**

Cover caller abort, fake-timer timeout, rejected fetch, HTTP 404/429/500, invalid JSON, `{ok:false,status:"error",message:"sheet contract failed"}`, and malformed success data. Assert the error class and retryability, not Japanese presentation text.

Add a table for `http:`, non-Google HTTPS origin, wrong `/macros/s/.../exec` path, URL credentials, query, fragment, whitespace, and empty deployment ID. Assert rejection occurs before `fetcher` is called and the diagnostic does not echo the input URL.

- [ ] **Step 3: Write strict success-parser tests**

Accept only the final contracts:

```ts
{ ok: true, status: "success", sheets: ["day1"], spreadsheetTitle: "Demo" }
{ ok: true, status: "success", circles: [{ space: "東A01a", priority: 1 }], spreadsheetTitle: "Demo" }
{ ok: true, status: "success" }
```

Reject duplicate circle spaces, empty sheet names, non-finite priority, and missing `ok/status`. Normalize neither URL nor sheet text silently.

- [ ] **Step 4: Verify RED**

```bash
npx vitest run --root . tests/gas-api-client.test.ts
```

Expected: missing constructor/error exports or old signature failures.

- [ ] **Step 5: Implement abort composition and response parsing**

Create one internal `requestJson()` helper. It must compose the optional caller signal with a timeout controller, clear the timer in `finally`, check `response.ok`, parse JSON as `unknown`, reject GAS error envelopes, and then call the endpoint-specific parser.

Do not cast `response.json()` to a success type.

- [ ] **Step 6: Update the explicit test script**

Add `tests/gas-api-client.test.ts` to `package.json#scripts.test:webapp`. Preserve all existing test paths.

- [ ] **Step 7: Verify GREEN and regression**

```bash
npx vitest run --root . tests/gas-api-client.test.ts tests/boundary-parsers.test.ts
npm run test:webapp
npm run check:webapp
npx biome check apps/webapp/js/api/gas-api-client.ts apps/webapp/js/types/boundary-parsers.ts apps/webapp/js/types/domain.ts tests/gas-api-client.test.ts package.json
```

- [ ] **Step 8: Present commit candidate**

Proposed message: `refactor(gas): harden typed API transport`.

## Review checklist

- Global `fetch` and timeout timing are not hard-coded where injection is required; relative URLs and `window.location` are not used.
- One event/day cannot request multiple sheets.
- No full endpoint or response content leaks through errors.
- Retryability is deterministic and tested.
- Client code performs no LocalStorage/repository work.
