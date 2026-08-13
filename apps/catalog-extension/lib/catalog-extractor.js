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
  const PIXIV_SELECTORS = [
    "#mainSection > div.m-media.m-circletable > div.m-media__body.md-circleinfo > div.item > table > tbody > tr:nth-child(3) > td > div > ul > li > a[href]",
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

  function extractPixivUrl(document) {
    for (const selector of PIXIV_SELECTORS) {
      const links = document.querySelectorAll(selector);
      for (const link of links) {
        try {
          const url = new URL(link.href, document.baseURI);
          const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
          if (
            hostname === "pixiv.net" &&
            /^\/users\/[^/]+(?:\/|$)/i.test(url.pathname)
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

  function extractAccountUrl(document) {
    return extractTwitterUrl(document) || extractPixivUrl(document);
  }

  globalThis.ComiPathCatalogExtractor = Object.freeze({
    SPACE_SELECTORS,
    PIXIV_SELECTORS,
    extractSpace,
    extractTwitterUrl,
    extractPixivUrl,
    extractAccountUrl,
  });
})();
