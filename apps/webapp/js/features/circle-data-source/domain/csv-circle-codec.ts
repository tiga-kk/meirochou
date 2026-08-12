import { canonicalizeSpace } from "../../../shared/domain/space-parser";
import type { CircleRecord } from "../../event-day/public-api";
import type { CsvImportResult, CsvIssue } from "./circle-data-source-types";

/**
 * Parses raw CSV text into a structured array of fields and line numbers.
 * Conforms to RFC 4180 with support for CRLF/LF line endings and quoted fields.
 */
function parseCsvRaw(
  text: string,
  syntaxErrors: CsvIssue[],
): { fields: string[]; line: number }[] {
  const records: { fields: string[]; line: number }[] = [];
  let currentFields: string[] = [];
  let currentField = "";
  let state: "start" | "unquoted" | "quoted" | "quote_in_quoted" = "start";
  let line = 1;
  let recordStartLine = 1;

  const pushField = () => {
    currentFields.push(currentField);
    currentField = "";
  };

  const pushRecord = () => {
    pushField();
    records.push({ fields: currentFields, line: recordStartLine });
    currentFields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (state === "start") {
      recordStartLine = line;
      if (char === '"') {
        state = "quoted";
      } else if (char === ",") {
        pushField();
      } else if (char === "\r") {
        if (nextChar === "\n") {
          i++;
        }
        pushRecord();
        line++;
      } else if (char === "\n") {
        pushRecord();
        line++;
      } else {
        currentField += char;
        state = "unquoted";
      }
    } else if (state === "unquoted") {
      if (char === ",") {
        pushField();
        state = "start";
      } else if (char === "\r") {
        if (nextChar === "\n") {
          i++;
        }
        pushRecord();
        state = "start";
        line++;
      } else if (char === "\n") {
        pushRecord();
        state = "start";
        line++;
      } else {
        currentField += char;
      }
    } else if (state === "quoted") {
      if (char === '"') {
        state = "quote_in_quoted";
      } else {
        currentField += char;
        if (char === "\r") {
          if (nextChar === "\n") {
            i++;
            currentField += "\n";
          }
          line++;
        } else if (char === "\n") {
          line++;
        }
      }
    } else if (state === "quote_in_quoted") {
      if (char === '"') {
        currentField += '"';
        state = "quoted";
      } else if (char === ",") {
        pushField();
        state = "start";
      } else if (char === "\r") {
        if (nextChar === "\n") {
          i++;
        }
        pushRecord();
        state = "start";
        line++;
      } else if (char === "\n") {
        pushRecord();
        state = "start";
        line++;
      } else {
        syntaxErrors.push({
          row: line,
          column: "",
          message: `Syntax error: unexpected character '${char}' after closing quote`,
        });
        currentField += char;
        state = "unquoted";
      }
    }
  }

  if (state === "unquoted" || state === "quote_in_quoted") {
    pushRecord();
  } else if (state === "quoted") {
    syntaxErrors.push({
      row: recordStartLine,
      column: "",
      message: "Syntax error: unclosed double quote",
    });
    pushRecord();
  } else if (currentFields.length > 0) {
    pushRecord();
  }

  return records;
}

/**
 * Parses circle list CSV content.
 * Validates header names, missing spaces, duplicate spaces, and non-numeric priority.
 */
export function parseCircleCsv(text: string): CsvImportResult {
  const syntaxErrors: CsvIssue[] = [];
  const records = parseCsvRaw(text, syntaxErrors);

  if (records.length === 0) {
    return {
      ok: false,
      issues: [
        {
          row: 1,
          column: "space",
          message: "Missing required header column 'space'",
        },
      ],
    };
  }

  const headerRecord = records[0];
  const headers = headerRecord.fields.map((h) => h.trim());
  const spaceIdx = headers.indexOf("space");
  const priorityIdx = headers.indexOf("priority");
  const isSaleIdx = headers.indexOf("isSale");
  const accountIdx = headers.indexOf("account");
  const tweetIdx = headers.indexOf("tweet");
  const memoIdx = headers.indexOf("memo");

  if (spaceIdx === -1) {
    return {
      ok: false,
      issues: [
        {
          row: 1,
          column: "space",
          message: "Missing required header column 'space'",
        },
      ],
    };
  }

  const issues: CsvIssue[] = [...syntaxErrors];
  const circles: CircleRecord[] = [];
  const seenSpaces = new Set<string>();

  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    const fields = record.fields;

    // Skip empty rows (a completely blank line)
    if (
      fields.length === 0 ||
      (fields.length === 1 && fields[0].trim() === "")
    ) {
      continue;
    }

    const rawSpace = spaceIdx < fields.length ? fields[spaceIdx].trim() : "";
    const space = canonicalizeSpace(rawSpace);
    if (!rawSpace) {
      issues.push({
        row: record.line,
        column: "space",
        message: "Missing required field: space",
      });
    } else if (!space) {
      issues.push({
        row: record.line,
        column: "space",
        message: `Invalid space: ${rawSpace}`,
      });
    } else if (seenSpaces.has(space)) {
      issues.push({
        row: record.line,
        column: "space",
        message: `Duplicate space: ${rawSpace}`,
      });
    } else {
      seenSpaces.add(space);
    }

    let priority: number | undefined;
    if (priorityIdx !== -1 && priorityIdx < fields.length) {
      const priorityStr = fields[priorityIdx].trim();
      if (priorityStr !== "") {
        const val = Number(priorityStr);
        if (Number.isNaN(val) || !Number.isFinite(val)) {
          issues.push({
            row: record.line,
            column: "priority",
            message: "Invalid priority value: must be a number",
          });
        } else {
          priority = val;
        }
      }
    }

    const isSale =
      isSaleIdx !== -1 && isSaleIdx < fields.length ? fields[isSaleIdx] : "";
    const account =
      accountIdx !== -1 && accountIdx < fields.length ? fields[accountIdx] : "";
    const tweet =
      tweetIdx !== -1 && tweetIdx < fields.length ? fields[tweetIdx] : "";
    const memo =
      memoIdx !== -1 && memoIdx < fields.length ? fields[memoIdx] : "";

    circles.push({
      space: space ?? rawSpace,
      priority,
      isSale,
      account,
      tweet,
      memo,
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, circles };
}

/**
 * Escapes a single field value for RFC 4180 compliance.
 */
function escapeCsvField(val: string | number | undefined): string {
  if (val === undefined || val === null) {
    return "";
  }
  const str = String(val);
  const needsQuotes =
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r");
  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes circle records to a deterministic RFC 4180 CRLF CSV string.
 */
export function serializeCircleCsv(
  circles: readonly CircleRecord[],
  purchased: ReadonlySet<string>,
): string {
  const header = "space,priority,isSale,account,tweet,memo";
  const rows = [header];

  for (const circle of circles) {
    const isSale = purchased.has(circle.space) ? "x" : "";
    const space = escapeCsvField(circle.space);
    const priority = escapeCsvField(circle.priority);
    const isSaleEscaped = escapeCsvField(isSale);
    const account = escapeCsvField(circle.account);
    const tweet = escapeCsvField(circle.tweet);
    const memo = escapeCsvField(circle.memo);

    rows.push(
      `${space},${priority},${isSaleEscaped},${account},${tweet},${memo}`,
    );
  }

  return `${rows.join("\r\n")}\r\n`;
}
