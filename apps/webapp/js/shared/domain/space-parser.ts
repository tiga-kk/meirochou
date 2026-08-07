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

export function parseSpace(
  value: unknown,
  areas: readonly SpaceArea[] = [],
): [string, string, number] {
  if (typeof value !== "string") return ["", "", 0];

  const cleaned = toHalfWidth(value.trim());
  if (cleaned.length < 2) return ["", "", 0];

  const prefix = cleaned[0];
  const label = cleaned[1];
  const area = areas.find(
    (candidate) =>
      (candidate.prefixes === undefined ||
        candidate.prefixes.includes(prefix)) &&
      candidate.labels.includes(label),
  );
  let number = "";
  for (const character of cleaned.slice(2)) {
    if (character < "0" || character > "9") break;
    number += character;
  }
  return [area?.name ?? "", label, Number.parseInt(number, 10) || 0];
}
