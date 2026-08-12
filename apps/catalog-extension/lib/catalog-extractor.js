(() => {
  const SPACE_SELECTORS = [
    ".m-circletable .infotable-space",
    "#mainSection > div.m-media.m-circletable > div.m-media__image > div.space-box > div",
    ".m-circletable .space-box > *",
    ".m-circletable .space-box",
  ];
  const IMAGE_SELECTORS = [
    ".m-circletable .m-media__image img",
    ".md-circleinfo .circleinfo-cut img",
    ".circleinfo-cut img",
  ];
  const TWITTER_SELECTORS = [
    ".md-detailsns .md-twitter a[href]",
    ".md-twitter a[href]",
    'a[href*="twitter.com/"]',
    'a[href*="x.com/"]',
  ];

  function normalizeSpace(value) {
    return String(value || "")
      .replace(/[\s\u3000]+/g, "")
      .trim()
      .replace(/^(?:[1-4]日|日)[-‐‑‒–—―ー−]+/u, "");
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
    const image = IMAGE_SELECTORS.map((selector) =>
      document.querySelector(selector),
    ).find(Boolean);
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

  function extractTwitterUrl(document) {
    for (const selector of TWITTER_SELECTORS) {
      const links = document.querySelectorAll(selector);
      for (const link of links) {
        try {
          const url = new URL(link.href, document.baseURI);
          const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
          if (
            (hostname === "twitter.com" || hostname === "x.com") &&
            url.pathname.length > 1 &&
            !/^\/intent\//i.test(url.pathname)
          ) {
            return url.href;
          }
        } catch {
          // Ignore unrelated or malformed links.
        }
      }
    }
    return null;
  }

  globalThis.ComiPathCatalogExtractor = Object.freeze({
    SPACE_SELECTORS,
    extractSpace,
    extractCatalogImageUrl,
    extractTwitterUrl,
  });
})();
