// biome-ignore lint/correctness/noUnusedVariables: global config exposed to Apps Script environment
var spreadsheetConfig = {
  spaceColumnName: "space",
  saleStatusColumnName: "isSale",
  purchasedStatusText: "x",
};

// biome-ignore lint/correctness/noUnusedVariables: global helper used by concatenated Apps Script files
function canonicalizeSpace(value) {
  if (typeof value !== "string") return null;
  var cleaned = value.normalize("NFKC").replace(/\s/g, "");
  var match =
    /^(?:(.)([A-Za-z\u3041-\u3096\u30A1-\u30FA])-?([0-9]+)(?:-?([A-Za-z]))?|([A-Za-z\u3041-\u3096\u30A1-\u30FA])-?([0-9]+)(?:-?([A-Za-z]))?|(.+?)-?([A-Za-z0-9\u3041-\u3096\u30A1-\u30FA])([0-9]+)(?:-?([A-Za-z]))?)$/.exec(
      cleaned,
    );
  if (!match) return null;
  var prefix = match[1] || match[8] || "";
  var label = match[2] || match[5] || match[9];
  var number = match[3] || match[6] || match[10];
  var side = match[4] || match[7] || match[11] || "";
  prefix = prefix.replace(/-$/, "");
  return prefix + label + number.replace(/^0+(?=\d)/, "") + side.toLowerCase();
}
