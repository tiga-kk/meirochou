export interface XPost {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
}

export interface XPostPage {
  readonly schemaVersion: 1;
  readonly handle: string;
  readonly posts: readonly XPost[];
  readonly nextCursor: string | null;
  readonly fetchedAt: string;
}

export type XPostApiErrorCode =
  | "invalid_request"
  | "upstream_rate_limited"
  | "upstream_unavailable"
  | "upstream_schema_changed";

export interface XPostApiErrorBody {
  readonly schemaVersion: 1;
  readonly error: {
    readonly code: XPostApiErrorCode;
    readonly message: string;
  };
}

export function createXPostErrorBody(
  code: XPostApiErrorCode,
  message: string,
): XPostApiErrorBody {
  return { schemaVersion: 1, error: { code, message } };
}

export function isXPostApiErrorBody(input: unknown): input is XPostApiErrorBody {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  const error = value.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  const code = (error as Record<string, unknown>).code;
  return value.schemaVersion === 1 &&
    ["invalid_request", "upstream_rate_limited", "upstream_unavailable", "upstream_schema_changed"].includes(String(code)) &&
    typeof (error as Record<string, unknown>).message === "string";
}
