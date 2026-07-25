import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "vitest";
import { auditPublicTree } from "../scripts/audit-public-tree.mjs";

function withFixture(files, callback) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "comipath-public-audit-"));
  try {
    mkdirSync(join(fixtureRoot, "apps/webapp"), { recursive: true });
    writeFileSync(join(fixtureRoot, "apps/webapp/index.html"), "<!doctype html>\n");

    for (const [relativePath, content] of Object.entries(files)) {
      const path = join(fixtureRoot, relativePath);
      mkdirSync(new URL(".", pathToFileURL(path)), { recursive: true });
      writeFileSync(path, content);
    }

    return callback(pathToFileURL(`${fixtureRoot}/`));
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test("tracked public tree excludes private projects and credentials", () => {
  const result = auditPublicTree(new URL("../", import.meta.url));
  assert.ok(result.files.includes("apps/webapp/index.html"));
  assert.ok(
    result.files.includes("apps/webapp/map-bundles/demo-v1/manifest.json"),
  );

  for (const path of [
    "wrangler.toml",
    "wrangler.json",
    "wrangler.jsonc",
    ".dev.vars",
    "functions",
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false);
  }
});

test("rejects an equals-style Cloudflare credential assignment", () => {
  withFixture(
    {
      "apps/webapp/config.js":
        'export const token = "CLOUDFLARE_API_TOKEN=abcdefghijklmnopqrstuvwxyz123456";\n',
    },
    (rootUrl) => {
      assert.throws(
        () => auditPublicTree(rootUrl),
        /Cloudflare credential assignment found in apps\/webapp\/config\.js/,
      );
    },
  );
});

test("rejects a colon-style Cloudflare account assignment", () => {
  withFixture(
    {
      "apps/webapp/config.json":
        '{ "CF_ACCOUNT_ID": "0123456789abcdef0123456789abcdef" }\n',
    },
    (rootUrl) => {
      assert.throws(
        () => auditPublicTree(rootUrl),
        /Cloudflare credential assignment found in apps\/webapp\/config\.json/,
      );
    },
  );
});

test("allows a harmless Cloudflare variable-name mention", () => {
  const result = withFixture(
    {
      "apps/webapp/config.js":
        'export const documentation = "Set CLOUDFLARE_API_TOKEN in the dashboard";\n',
    },
    (rootUrl) => auditPublicTree(rootUrl),
  );

  assert.ok(result.files.includes("apps/webapp/config.js"));
});
