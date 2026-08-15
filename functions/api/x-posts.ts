import {
  createXPostErrorBody,
  type XPostApiErrorCode,
} from "../_lib/x-post-contract";
import {
  buildYahooRealtimeRequest,
  parseYahooRealtimeResponse,
} from "../_lib/yahoo-realtime";

export interface XPostFunctionEnv {
  readonly fetchYahoo?: typeof fetch;
  readonly now?: () => Date;
}

const errorMessages: Record<XPostApiErrorCode, string> = {
  invalid_request: "リクエストを確認してください",
  upstream_rate_limited: "上流サービスがレート制限を返しました",
  upstream_unavailable: "投稿サービスを利用できません",
  upstream_schema_changed: "投稿サービスの応答形式が変わりました",
};

function responseFor(code: XPostApiErrorCode, status: number, retryAfter?: string): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (retryAfter) headers.set("Retry-After", retryAfter);
  return new Response(JSON.stringify(createXPostErrorBody(code, errorMessages[code])), { status, headers });
}

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function handleXPostRequest(request: Request, env: XPostFunctionEnv = {}): Promise<Response> {
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle");
  const cursor = url.searchParams.get("cursor");
  const day = url.searchParams.get("day");
  if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle) ||
      (cursor !== null && !/^[0-9]{1,32}$/.test(cursor)) ||
      (day !== null && !validDay(day))) {
    return responseFor("invalid_request", 400);
  }

  const now = env.now ?? (() => new Date());
  const fetchedAt = now().toISOString();
  const fetchYahoo = env.fetchYahoo ?? globalThis.fetch.bind(globalThis);
  let upstream: Response;
  try {
    upstream = await fetchYahoo(buildYahooRealtimeRequest({ handle, cursor, day }), { signal: request.signal });
  } catch {
    return responseFor("upstream_unavailable", 502);
  }
  if (upstream.status === 429) return responseFor("upstream_rate_limited", 429, upstream.headers.get("Retry-After") ?? undefined);
  if (!upstream.ok) return responseFor("upstream_unavailable", 502);
  try {
    const page = parseYahooRealtimeResponse(await upstream.json(), { handle, day, fetchedAt });
    return Response.json(page);
  } catch {
    return responseFor("upstream_schema_changed", 502);
  }
}

export async function onRequestGet(context: {
  readonly request: Request;
  readonly env?: XPostFunctionEnv;
}): Promise<Response> {
  return handleXPostRequest(context.request, context.env);
}
