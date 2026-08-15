import assert from "node:assert/strict";
import { test } from "vitest";
import { extractXHandle } from "../apps/webapp/js/features/x-post-monitoring/domain/x-account";

test("extractXHandle accepts only one-segment X profiles", () => {
  assert.equal(extractXHandle("https://x.com/Example_1/"), "Example_1");
  assert.equal(extractXHandle("https://mobile.twitter.com/user?x=1#top"), "user");
  assert.equal(extractXHandle("https://www.pixiv.net/users/123"), null);
  assert.equal(extractXHandle("https://example.test/user"), null);
});

test("extractXHandle rejects reserved routes, malformed URLs, and invalid handles", () => {
  for (const value of [
    "",
    null,
    "javascript:alert(1)",
    "https://x.com/home",
    "https://x.com/i/status/1",
    "https://x.com/user/status/1",
    "https://x.com/this_handle_is_way_too_long",
    "https://x.com/user/name",
  ]) {
    assert.equal(extractXHandle(value), null, String(value));
  }
});
