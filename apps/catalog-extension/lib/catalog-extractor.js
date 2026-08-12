(() => {
  const SPACE_SELECTORS = [
    ".m-circletable .infotable-space",
    "#mainSection > div.m-media.m-circletable > div.m-media__image > div.space-box > div",
    ".m-circletable .space-box > *",
    ".m-circletable .space-box",
  ];

  function normalizeSpace(value) {
    return String(value || "")
      .replace(/[\s\u3000]+/g, "")
      .trim();
  }

  function extractSpace(document) {
    for (const selector of SPACE_SELECTORS) {
      const element = document.querySelector(selector);
      const space = normalizeSpace(element?.textContent);
      if (space) return space;
    }
    return null;
  }

  function extractCatalogImageUrl(document) {
    const media = document.querySelector(".m-circletable .m-media__image");
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
    SPACE_SELECTORS,
    extractSpace,
    extractCatalogImageUrl,
  });
})();
