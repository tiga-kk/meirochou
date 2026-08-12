export interface SpaceArea {
  readonly name: string;
  readonly prefixes?: readonly string[];
  readonly labels: readonly string[];
}

export function toHalfWidth(value: string): string {
  return value.replace(/[！-～]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0),
  );
}

interface SpaceParts {
  readonly prefix: string;
  readonly label: string;
  readonly number: string;
  readonly side: string;
  readonly area?: SpaceArea;
}

const spaceLabel = "[A-Za-z\\u3041-\\u3096\\u30A1-\\u30FA]";
const spacePartsPattern = new RegExp(
  `^(?<prefix>.)(?<label>${spaceLabel})-?(?<number>[0-9]+)(?:-?(?<side>[A-Za-z]{1,2}))?$`,
  "u",
);
const legacySpacePartsPattern = new RegExp(
  `^(?<label>${spaceLabel})-?(?<number>[0-9]+)(?:-?(?<side>[A-Za-z]{1,2}))?$`,
  "u",
);
const compatibilitySpacePartsPattern =
  /^(?<prefix>.+?)-?(?<label>[A-Za-z0-9\u3041-\u3096\u30A1-\u30FA])(?<number>[0-9]+)(?:-?(?<side>[A-Za-z]{1,2}))?$/u;

function parseSpaceParts(
  value: unknown,
  areas: readonly SpaceArea[],
): SpaceParts | null {
  if (typeof value !== "string") return null;

  const cleaned = value.normalize("NFKC").replace(/\s/gu, "");
  const match =
    spacePartsPattern.exec(cleaned) ??
    legacySpacePartsPattern.exec(cleaned) ??
    (areas.length === 0 ? compatibilitySpacePartsPattern.exec(cleaned) : null);
  if (!match?.groups) return null;

  const prefix = (match.groups.prefix ?? "").replace(/-$/, "");
  const label = match.groups.label;
  const area = areas.find(
    (candidate) =>
      (candidate.prefixes === undefined ||
        candidate.prefixes.includes(prefix)) &&
      candidate.labels.includes(label),
  );
  if (areas.length > 0 && !area) return null;

  return {
    prefix,
    label,
    number: match.groups.number,
    side: match.groups.side ?? "",
    area,
  };
}

/** Returns the stable identity used when comparing circle space values. */
export function canonicalizeSpace(
  value: unknown,
  areas: readonly SpaceArea[] = [],
): string | null {
  const parts = parseSpaceParts(value, areas);
  if (!parts) return null;
  const number = parts.number.replace(/^0+(?=\d)/, "");
  return `${parts.prefix}${parts.label}${number}${parts.side.toLowerCase()}`;
}

export function parseSpace(
  value: unknown,
  areas: readonly SpaceArea[] = [],
): [string, string, number] {
  const parts = parseSpaceParts(value, areas);
  if (!parts) return ["", "", 0];
  return [
    parts.area?.name ?? "",
    parts.label,
    Number.parseInt(parts.number, 10) || 0,
  ];
}
