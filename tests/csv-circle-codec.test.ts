import { describe, expect, it } from "vitest";
import {
  parseCircleCsv,
  serializeCircleCsv,
} from "../apps/webapp/js/features/circle-data-source/public-api";
import type { CircleRecord } from "../apps/webapp/js/features/event-day/domain/application-contract-types";

describe("csv-circle-codec", () => {
  describe("parseCircleCsv", () => {
    it("should parse valid CSV content with CRLF/LF line endings", () => {
      const csv =
        "space,priority,isSale,account,tweet,memo\n" +
        "東A01a,10,x,acc1,https://x.com/c1,memo1\r\n" +
        "東A01b,,X,acc2,https://x.com/c2,memo2\n" +
        "東A02a,5,,acc3,,memo3";

      const result = parseCircleCsv(csv);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.circles).toEqual([
          {
            space: "東A1a",
            priority: 10,
            isSale: "x",
            account: "acc1",
            tweet: "https://x.com/c1",
            memo: "memo1",
          },
          {
            space: "東A1b",
            priority: undefined,
            isSale: "X",
            account: "acc2",
            tweet: "https://x.com/c2",
            memo: "memo2",
          },
          {
            space: "東A2a",
            priority: 5,
            isSale: "",
            account: "acc3",
            tweet: "",
            memo: "memo3",
          },
        ]);
      }
    });

    it("should handle quoted commas, newlines, and escaped quotes", () => {
      const csv =
        "space,priority,isSale,account,tweet,memo\n" +
        '"東A01a",10,,"acc,1","https://x.com/c1","memo ""with"" quotes"\n' +
        '"東A01b",5,x,acc2,https://x.com/c2,"memo\nwith\nnewlines"';

      const result = parseCircleCsv(csv);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.circles).toEqual([
          {
            space: "東A1a",
            priority: 10,
            isSale: "",
            account: "acc,1",
            tweet: "https://x.com/c1",
            memo: 'memo "with" quotes',
          },
          {
            space: "東A1b",
            priority: 5,
            isSale: "x",
            account: "acc2",
            tweet: "https://x.com/c2",
            memo: "memo\nwith\nnewlines",
          },
        ]);
      }
    });

    it("should ignore unknown columns in the header", () => {
      const csv =
        "space,unknown_col,priority,isSale,account,tweet,memo\n" +
        "東A01a,foo,10,x,acc1,https://x.com/c1,memo1";

      const result = parseCircleCsv(csv);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.circles).toEqual([
          {
            space: "東A1a",
            priority: 10,
            isSale: "x",
            account: "acc1",
            tweet: "https://x.com/c1",
            memo: "memo1",
          },
        ]);
      }
    });

    it("should fail when space column is missing in the header", () => {
      const csv =
        "priority,isSale,account,tweet,memo\n" +
        "10,x,acc1,https://x.com/c1,memo1";

      const result = parseCircleCsv(csv);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toEqual([
          {
            row: 1,
            column: "space",
            message: "Missing required header column 'space'",
          },
        ]);
      }
    });

    it("should fail when space value is missing in a row", () => {
      const csv =
        "space,priority,isSale,account,tweet,memo\n" +
        ",10,x,acc1,https://x.com/c1,memo1\n" +
        " ,5,,acc2,,memo2";

      const result = parseCircleCsv(csv);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toEqual([
          {
            row: 2,
            column: "space",
            message: "Missing required field: space",
          },
          {
            row: 3,
            column: "space",
            message: "Missing required field: space",
          },
        ]);
      }
    });

    it("should fail when there are duplicate space values", () => {
      const csv =
        "space,priority,isSale,account,tweet,memo\n" +
        "東A01a,10,x,acc1,https://x.com/c1,memo1\n" +
        "東A01a,5,,acc2,https://x.com/c2,memo2";

      const result = parseCircleCsv(csv);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toEqual([
          {
            row: 3,
            column: "space",
            message: "Duplicate space: 東A01a",
          },
        ]);
      }
    });

    it("should canonicalize space formatting before storing and detecting duplicates", () => {
      const csv =
        "space,priority,isSale,account,tweet,memo\n" +
        "東Ａ３２ａ,10,,,,\n" +
        "東A 032-A,5,,,,";

      const result = parseCircleCsv(csv);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toEqual([
          {
            row: 3,
            column: "space",
            message: "Duplicate space: 東A 032-A",
          },
        ]);
      }
    });

    it("should fail when priority is invalid", () => {
      const csv =
        "space,priority,isSale,account,tweet,memo\n" +
        "東A01a,abc,x,acc1,https://x.com/c1,memo1";

      const result = parseCircleCsv(csv);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toEqual([
          {
            row: 2,
            column: "priority",
            message: "Invalid priority value: must be a number",
          },
        ]);
      }
    });

    it("should track 1-indexed row numbers correctly, even with multiline quoted fields", () => {
      const csv =
        "space,priority,isSale,account,tweet,memo\n" +
        '東A01a,10,x,acc1,https://x.com/c1,"memo\n' +
        "with\n" +
        'newlines"\n' +
        "東A01a,5,,acc2,https://x.com/c2,memo2";

      const result = parseCircleCsv(csv);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // The first record starts at row 2, ends on row 5.
        // The duplicate record is on row 5 (which is the starting row index of the second record).
        expect(result.issues).toEqual([
          {
            row: 5,
            column: "space",
            message: "Duplicate space: 東A01a",
          },
        ]);
      }
    });

    it("should handle syntax errors like unclosed quote", () => {
      const csv =
        "space,priority,isSale,account,tweet,memo\n" +
        '東A01a,10,x,acc1,https://x.com/c1,"unclosed memo';

      const result = parseCircleCsv(csv);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues[0].message).toContain("Syntax error");
      }
    });
  });

  describe("serializeCircleCsv", () => {
    it("should serialize circles to deterministic CRLF CSV", () => {
      const circles: CircleRecord[] = [
        {
          space: "東A01a",
          priority: 10,
          account: "acc1",
          tweet: "https://x.com/c1",
          memo: "memo1",
        },
        {
          space: "東A01b",
          priority: undefined,
          account: "acc2",
          tweet: "https://x.com/c2",
          memo: "memo2",
        },
      ];
      const purchased = new Set(["東A01a"]);

      const expectedCsv =
        "space,priority,isSale,account,tweet,memo\r\n" +
        "東A01a,10,x,acc1,https://x.com/c1,memo1\r\n" +
        "東A01b,,,acc2,https://x.com/c2,memo2\r\n";

      const result = serializeCircleCsv(circles, purchased);
      expect(result).toBe(expectedCsv);
    });

    it("should escape fields with commas, quotes, and newlines", () => {
      const circles: CircleRecord[] = [
        {
          space: "東A01a",
          priority: 10,
          account: "acc,1",
          tweet: "https://x.com/c1",
          memo: 'memo "with" quotes',
        },
        {
          space: "東A01b",
          priority: 5,
          account: "acc2",
          tweet: "https://x.com/c2",
          memo: "memo\nwith\nnewlines",
        },
      ];
      const purchased = new Set<string>();

      const expectedCsv =
        "space,priority,isSale,account,tweet,memo\r\n" +
        '東A01a,10,,"acc,1",https://x.com/c1,"memo ""with"" quotes"\r\n' +
        '東A01b,5,,acc2,https://x.com/c2,"memo\nwith\nnewlines"\r\n';

      const result = serializeCircleCsv(circles, purchased);
      expect(result).toBe(expectedCsv);
    });
  });
});
