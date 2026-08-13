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

test("extracts space from the primary catalog selector", () => {
  const { document, extractor } = loadExtractor(
    readFileSync(
      new URL("fixtures/catalog-extension/circle-page.html", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(extractor.extractSpace(document), "東ア01a");
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
});

test("normalizes the classic day prefix from the space label", () => {
  const { document, extractor } = loadExtractor(`
    <div class="m-circletable">
      <div class="space-box"><div>日-東ア31ab</div></div>
    </div>
  `);

  assert.equal(extractor.extractSpace(document), "東ア31ab");
});

test("extracts the Twitter account without extracting the catalog image", () => {
  const { document, extractor } = loadExtractor(`
    <div class="m-circletable">
      <div class="m-media__image">
        <img src="https://classic-webcatalog.circle.ms/Spa/CachedImage/23005658/2/catalog.jpg">
      </div>
      <div class="md-detailsns">
        <div class="md-twitter md-snssection">
          <a href="https://twitter.com/mignon">MIGNON</a>
        </div>
      </div>
    </div>
  `);

  assert.equal(
    extractor.extractTwitterUrl(document),
    "https://twitter.com/mignon",
  );
  assert.equal("extractCatalogImageUrl" in extractor, false);
});

test("prefers Twitter/X over the scoped Pixiv profile link", () => {
  const { document, extractor } = loadExtractor(`
    <main id="mainSection">
      <div class="m-media m-circletable">
        <div class="md-detailsns"><a href="https://x.com/mignon">X</a></div>
        <div class="m-media__body md-circleinfo"><div class="item"><table><tbody>
          <tr><td></td></tr><tr><td></td></tr>
          <tr><td><div><ul><li></li><li></li>
            <li><a href="https://www.pixiv.net/users/123">Pixiv</a></li>
          </ul></div></td></tr>
        </tbody></table></div></div>
      </div>
    </main>
  `);

  assert.equal(extractor.extractAccountUrl(document), "https://x.com/mignon");
});

test("falls back to the scoped Pixiv profile link when Twitter/X is missing", () => {
  const { document, extractor } = loadExtractor(`
    <main id="mainSection">
      <div class="m-media m-circletable">
        <div class="m-media__body md-circleinfo"><div class="item"><table><tbody>
          <tr><td></td></tr><tr><td></td></tr>
          <tr><td><div><ul><li></li><li></li><li></li>
            <li><a href="https://www.dlsite.com/maniax/circle/123">DLsite</a></li>
            <li><a href="https://www.pixiv.net/users/123">Pixiv</a></li>
            <li><a href="https://www.pixiv.net/artworks/456">Artwork</a></li>
          </ul></div></td></tr>
        </tbody></table></div></div>
      </div>
    </main>
  `);

  assert.equal(
    extractor.extractAccountUrl(document),
    "https://www.pixiv.net/users/123",
  );
});

test("returns null when neither Twitter/X nor the scoped Pixiv profile exists", () => {
  const { document, extractor } = loadExtractor(`
    <main id="mainSection">
      <div class="m-media m-circletable">
        <div class="m-media__body md-circleinfo"><div class="item"><table><tbody>
          <tr><td></td></tr><tr><td></td></tr><tr><td><div><ul>
            <li><a href="https://www.pixiv.net/artworks/123">Artwork</a></li>
          </ul></div></td></tr>
        </tbody></table></div></div>
      </div>
    </main>
  `);

  assert.equal(extractor.extractAccountUrl(document), null);
});

test("returns null for missing space or non-HTTP(S) catalog URLs", () => {
  const missing = loadExtractor(
    '<main id="mainSection"><div class="m-media m-circletable"><div class="m-media__image"><img src="https://example.invalid/catalog.jpg"></div></div></main>',
  );
  assert.equal(missing.extractor.extractSpace(missing.document), null);

  const invalid = loadExtractor(
    '<main id="mainSection"><div class="m-media m-circletable"><div class="m-media__image"><div class="space-box"><div>東A01a</div></div><img src="javascript:alert(1)"></div></div></main>',
  );
  assert.equal(invalid.extractor.extractTwitterUrl(invalid.document), null);
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
    "https://classic-webcatalog.circle.ms/Circle/*",
    "https://script.google.com/*",
    "https://script.googleusercontent.com/*",
  ]);
  assert.equal(manifest.host_permissions.includes("<all_urls>"), false);
  assert.deepEqual(manifest.commands["send-catalog"], {
    suggested_key: { default: "Alt+S", mac: "Alt+S" },
    description: "現在のカタログをGASへ送信",
  });
  assert.equal(manifest.background.type, "module");
  assert.deepEqual(manifest.content_scripts[0].js, [
    "lib/catalog-shortcut.js",
    "lib/catalog-extractor.js",
    "content.js",
  ]);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "https://classic-webcatalog.circle.ms/CircleRapid/Cut2*",
    "https://classic-webcatalog.circle.ms/Circle/*",
  ]);
  assert.doesNotMatch(
    readFileSync(
      new URL("../apps/catalog-extension/content.js", import.meta.url),
      "utf8",
    ),
    /extractCatalogImageUrl|CachedImage/,
  );
  assert.match(
    readFileSync(
      new URL("../apps/catalog-extension/content.js", import.meta.url),
      "utf8",
    ),
    /COMIPATH_SHOW_CATALOG_TOAST/,
  );
  assert.doesNotMatch(
    readFileSync(
      new URL("../apps/catalog-extension/content.js", import.meta.url),
      "utf8",
    ),
    /\bexport\b|\bimport\b/,
  );
});
