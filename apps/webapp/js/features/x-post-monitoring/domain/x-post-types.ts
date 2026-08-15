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

export type SaleMentionState =
  | { readonly status: "unknown" }
  | { readonly status: "no-mention"; readonly checkedAt: string }
  | {
      readonly status: "mention";
      readonly matchedPostIds: readonly string[];
      readonly matchedKeywords: readonly string[];
      readonly checkedAt: string;
    };
