import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { Window } from "happy-dom";

const extractorSource = readFileSync(
  new URL(
    "../apps/catalog-extension/lib/catalog-extractor.js",
    import.meta.url,
  ),
  "utf8",
);

function loadExtractor(html) {
  const window = new Window();
  window.document.body.innerHTML = html;
  const context = { console, URL };
  vm.createContext(context);
  vm.runInContext(extractorSource, context);
  return {
    document: window.document,
    extractor: context.ComiPathCatalogExtractor,
  };
}

test("extracts space and catalog image from the primary catalog selector", () => {
  const { document, extractor } = loadExtractor(
    readFileSync(
      new URL("fixtures/catalog-extension/circle-page.html", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(extractor.extractSpace(document), "東ア01a");
  assert.equal(
    extractor.extractCatalogImageUrl(document),
    "https://catalog.youyou.co.jp/images/east-01a.jpg",
  );
  assert.doesNotMatch(extractorSource, /\bexport\b/);
});

test("uses only the scoped space-box fallback when the primary selector changes", () => {
  const { document, extractor } = loadExtractor(`
    <main id="mainSection">
      <div class="m-media m-circletable">
        <div class="m-media__image">
          <div class="space-box"><span> 西B02b\n </span></div>
          <img src="https://example.invalid/catalog.jpg">
        </div>
      </div>
      <p>東Z99z</p>
    </main>
  `);

  assert.equal(extractor.extractSpace(document), "西B02b");
});

test("extracts space from the classic web catalog infotable", () => {
  const { document, extractor } = loadExtractor(`
    <div class="m-circletable m-media">
      <div class="m-media__image">
        <img src="https://example.test/catalog.jpg">
      </div>
      <div class="m-media__body">
        <table class="m-infotable">
          <tr><td class="infotable-space"> 東ア01a </td></tr>
        </table>
      </div>
    </div>
  `);

  assert.equal(extractor.extractSpace(document), "東ア01a");
  assert.equal(
    extractor.extractCatalogImageUrl(document),
    "https://example.test/catalog.jpg",
  );
});

test("returns null for missing space or non-HTTP(S) catalog URLs", () => {
  const missing = loadExtractor(
    '<main id="mainSection"><div class="m-media m-circletable"><div class="m-media__image"><img src="https://example.invalid/catalog.jpg"></div></div></main>',
  );
  assert.equal(missing.extractor.extractSpace(missing.document), null);

  const invalid = loadExtractor(
    '<main id="mainSection"><div class="m-media m-circletable"><div class="m-media__image"><div class="space-box"><div>東A01a</div></div><img src="javascript:alert(1)"></div></div></main>',
  );
  assert.equal(
    invalid.extractor.extractCatalogImageUrl(invalid.document),
    null,
  );
});

test("prefers currentSrc over src inside the scoped media image", () => {
  const { document, extractor } = loadExtractor(`
    <main id="mainSection">
      <div class="m-media m-circletable">
        <div class="m-media__image">
          <div class="space-box"><div>東A01a</div></div>
          <img src="https://example.invalid/fallback.jpg">
        </div>
      </div>
    </main>
  `);
  const image = document.querySelector("#mainSection .m-media__image img");
  Object.defineProperty(image, "currentSrc", {
    configurable: true,
    value: "https://example.invalid/current.jpg",
  });

  assert.equal(
    extractor.extractCatalogImageUrl(document),
    "https://example.invalid/current.jpg",
  );
});

test("keeps Manifest V3 permissions and script formats scoped", () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../apps/catalog-extension/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage", "activeTab"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://classic-webcatalog.circle.ms/CircleRapid/Cut2*",
    "https://script.google.com/*",
  ]);
  assert.equal(manifest.host_permissions.includes("<all_urls>"), false);
  assert.deepEqual(manifest.commands["send-catalog"], {
    suggested_key: { default: "Alt+S", mac: "Alt+S" },
    description: "現在のカタログをGASへ送信",
  });
  assert.equal(manifest.background.type, "module");
  assert.deepEqual(manifest.content_scripts[0].js, [
    "lib/catalog-extractor.js",
    "content.js",
  ]);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "https://classic-webcatalog.circle.ms/CircleRapid/Cut2*",
  ]);
  assert.doesNotMatch(
    readFileSync(
      new URL("../apps/catalog-extension/content.js", import.meta.url),
      "utf8",
    ),
    /\bexport\b|\bimport\b/,
  );
});
