import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalizeSpace,
  isRuntimeSpaceLabelCharacter,
  isRuntimeSpacePrefixCharacter,
  parseSpace,
} from "../apps/webapp/js/shared/domain/space-parser";

const cases = JSON.parse(
  readFileSync(
    new URL("./fixtures/space-canonicalization.json", import.meta.url),
    "utf8",
  ),
) as readonly { input: string; canonical: string }[];

describe("space parser", () => {
  it("canonicalizes the shared fixture", () => {
    for (const { input, canonical } of cases) {
      expect(canonicalizeSpace(input)).toBe(canonical);
    }
  });

  it("rejects unknown area prefix and label when an area registry is provided", () => {
    const areas = [{ name: "東", prefixes: ["東"], labels: ["A"] }];
    expect(canonicalizeSpace("西A32a", areas)).toBeNull();
    expect(canonicalizeSpace("東B32a", areas)).toBeNull();
  });

  it("uses the same parser for hyphenated legacy inputs", () => {
    expect(parseSpace("東A-032-a")).toEqual(["", "A", 32]);
  });

  it("defines runtime-compatible area prefix characters", () => {
    for (const value of ["東", "西", "南", "A"]) {
      expect(isRuntimeSpacePrefixCharacter(value)).toBe(true);
    }

    for (const value of ["", " ", "東館", "Ａ", "①", "😀"]) {
      expect(isRuntimeSpacePrefixCharacter(value)).toBe(false);
    }
  });

  it("defines runtime-compatible area label characters", () => {
    for (const value of ["A", "z", "あ", "ん", "ア", "ン"]) {
      expect(isRuntimeSpaceLabelCharacter(value)).toBe(true);
    }

    for (const value of ["", " ", "1", "東", "AB", "Ａ", "😀"]) {
      expect(isRuntimeSpaceLabelCharacter(value)).toBe(false);
    }
  });

  it("rejects side suffixes longer than two ASCII letters", () => {
    expect(canonicalizeSpace("東ア01abc")).toBeNull();
  });
});
