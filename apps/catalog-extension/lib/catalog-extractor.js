(() => {
  const SPACE_SELECTOR =
    "#mainSection > div.m-media.m-circletable > div.m-media__image > div.space-box > div";

  function normalizeSpace(value) {
    return String(value || "")
      .replace(/[\s\u3000]+/g, "")
      .trim();
  }

  function extractSpace(document) {
    const primary = document.querySelector(SPACE_SELECTOR);
    if (primary) return normalizeSpace(primary.textContent);

    const media = document.querySelector(
      "#mainSection .m-media.m-circletable .m-media__image",
    );
    const fallback =
      media?.querySelector(".space-box > *") ||
      media?.querySelector(".space-box");
    return fallback ? normalizeSpace(fallback.textContent) || null : null;
  }

  function extractCatalogImageUrl(document) {
    const media = document.querySelector(
      "#mainSection .m-media.m-circletable .m-media__image",
    );
    const image = media?.querySelector("img");
    const raw = image?.currentSrc || image?.src || "";
    if (!raw) return null;
    try {
      const url = new URL(raw, document.baseURI);
      return url.protocol === "http:" || url.protocol === "https:"
        ? url.href
        : null;
    } catch {
      return null;
    }
  }

  globalThis.ComiPathCatalogExtractor = Object.freeze({
    SPACE_SELECTOR,
    extractSpace,
    extractCatalogImageUrl,
  });
})();
