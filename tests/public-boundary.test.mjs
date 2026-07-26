import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
    writeFileSync(
      join(fixtureRoot, "apps/webapp/index.html"),
      "<!doctype html>\n",
    );

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
  assert.ok(
    result.files.includes("apps/webapp/map-bundles/C108/manifest.json"),
  );
  assert.ok(result.files.includes("apps/webapp/map-bundles/C108/e456/map.svg"));

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

test("Cloudflare Pages runbook documents the minimal deployment contract", () => {
  const guide = readFileSync(
    new URL("../guides/cloudflare-pages-deployment.md", import.meta.url),
    "utf8",
  );
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

  assert.match(guide, /Git integration/);
  assert.match(guide, /`meirochou`/);
  assert.match(guide, /`main`/);
  assert.match(guide, /`npm run build:webapp`/);
  assert.match(guide, /`dist\/webapp`/);
  assert.match(guide, /`NODE_VERSION=22\.14\.0`/);
  assert.match(guide, /`meirochou\.tiga\.moe`/);
  assert.match(guide, /preview.*Access|Access.*preview/i);
  assert.match(guide, /X-Robots-Tag.*noindex/i);
  assert.match(guide, /Rollback/);

  assert.doesNotMatch(guide, /wrangler\s+(pages\s+)?deploy/i);
  assert.doesNotMatch(
    guide,
    /(?:Pages Functions|KV|R2|D1|Web Analytics).*(?:有効にする|追加する|使用する)/i,
  );
  assert.doesNotMatch(guide, /CLOUDFLARE_API_TOKEN\s*=/);
  assert.match(readme, /guides\/cloudflare-pages-deployment\.md/);
});

test("rejects python files and private folders in public tree audit", () => {
  for (const forbiddenFile of [
    "script.py",
    "private/secret.json",
    "work/draft.txt",
    "output/map.png",
    "apps/webapp/private/secret.json",
    "apps/webapp/work/draft.txt",
    "apps/webapp/output/map.png",
    "apps/webapp/assets/__pycache__/module.pyc",
  ]) {
    withFixture(
      {
        [forbiddenFile]: "content\n",
      },
      (rootUrl) => {
        assert.throws(
          () => auditPublicTree(rootUrl),
          /Forbidden path|Forbidden python file/,
        );
      },
    );
  }
});

test("rejects local absolute paths in public content", () => {
  withFixture(
    {
      "apps/webapp/assets/leak.json":
        '{"source":"/home/tiga/projects/private-map"}\n',
    },
    (rootUrl) => {
      assert.throws(
        () => auditPublicTree(rootUrl),
        /Local absolute path found/,
      );
    },
  );
});

test("does not hide a forbidden nested maps directory", () => {
  withFixture(
    {
      "apps/webapp/assets/maps/private.txt": "content\n",
    },
    (rootUrl) => {
      assert.throws(
        () => auditPublicTree(rootUrl),
        /Forbidden path detected: apps\/webapp\/assets\/maps/,
      );
    },
  );
});

test("does not hide nested test-results-like directories", () => {
  withFixture(
    {
      "apps/webapp/assets/test-results-private/secret.txt": "content\n",
    },
    (rootUrl) => {
      const result = auditPublicTree(rootUrl);
      assert.ok(
        result.files.includes(
          "apps/webapp/assets/test-results-private/secret.txt",
        ),
      );
    },
  );
});
