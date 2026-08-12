(() => {
  const SPACE_SELECTORS = [
    ".m-circletable .infotable-space",
    "#mainSection > div.m-media.m-circletable > div.m-media__image > div.space-box > div",
    ".m-circletable .space-box > *",
    ".m-circletable .space-box",
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
    extractTwitterUrl,
  });
})();
