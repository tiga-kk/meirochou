const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function catalogSvg(label, background, ink, width = 320, height = 220) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/><rect x="16" y="16" width="${width - 32}" height="${height - 32}" fill="none" stroke="${ink}" stroke-width="4"/><text x="32" y="64" font-family="serif" font-size="28" fill="${ink}">${label}</text><text x="32" y="112" font-family="serif" font-size="18" fill="${ink}">新刊 / 既刊 / セット</text><text x="32" y="154" font-family="serif" font-size="16" fill="${ink}">OCR import sample</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function isDevDemoEnabled(locationLike) {
  const location = locationLike || window.location;
  const params = new URLSearchParams(location.search);
  return (
    params.get("demo_ui") === "1" && LOCAL_HOSTNAMES.has(location.hostname)
  );
}

export function createDevDemoData() {
  const wantToBuy = [
    {
      space: "東ア23a",
      priority: 10,
      sheetName: "東456チェックリスト",
      account: "https://x.com/circle_a",
      tweet: catalogSvg("東ア23a お品書き", "#fffdf7", "#111820"),
    },
    {
      space: "東ア31b",
      priority: 9,
      sheetName: "東456チェックリスト",
      account: "https://x.com/circle_b",
      tweet: catalogSvg("東ア31b お品書き", "#eef5f8", "#004c8c", 220, 360),
    },
    {
      space: "東ア41a",
      priority: 7,
      sheetName: "東456チェックリスト",
      account: "https://x.com/circle_c",
      tweet: catalogSvg("東ア41a お品書き", "#f7f1e3", "#6b3f16"),
    },
    {
      space: "東イ08b",
      priority: 5,
      sheetName: "東456チェックリスト",
      account: "https://x.com/circle_d",
    },
  ];

  return {
    wantToBuy,
    spreadsheetTitle: "C108 サークル巡回リスト",
    purchasedList: [],
    holdList: ["東ア41a"],
  };
}
