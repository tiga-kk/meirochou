export interface CurrentLocationFormInput {
  blockPrefix: string;
  spaceNumber: number;
}

export function parseCurrentLocationForm(
  blockPrefix: string,
  spaceNumberStr: string,
): CurrentLocationFormInput | null {
  const num = parseInt(spaceNumberStr, 10);
  if (!blockPrefix || Number.isNaN(num) || num <= 0) return null;
  return { blockPrefix, spaceNumber: num };
}

export function buildSpaceFromLocation(arg: {
  areaName?: unknown;
  label?: unknown;
  number?: unknown;
}): string | null {
  const area = typeof arg.areaName === "string" ? arg.areaName.trim() : "";
  const label = typeof arg.label === "string" ? arg.label.trim() : "";
  const number = Number(arg.number);
  if (!area || !label || !Number.isInteger(number) || number < 1 || number > 99)
    return null;
  return `${area[0]}${label[0]}${number}`;
}
