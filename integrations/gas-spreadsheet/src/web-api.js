/**
 * Helper to validate header row of a sheet.
 * Required: space (exactly 1)
 * Optional: priority, isSale, account, tweet, memo (at most 1 each)
 */
function parseSheetHeaders(headerRow, sheetName) {
  if (!Array.isArray(headerRow)) {
    return { error: `Sheet "${sheetName}" header is invalid.` };
  }

  const supportedOptional = ["priority", "isSale", "account", "tweet", "memo"];
  const cols = {};
  const headerCounts = new Set();

  for (let i = 0; i < headerRow.length; i++) {
    const rawHeader = String(headerRow[i]).trim();
    if (!rawHeader) continue;

    if (headerCounts.has(rawHeader)) {
      return {
        error: `Duplicate header '${rawHeader}' in sheet "${sheetName}".`,
      };
    }
    headerCounts.add(rawHeader);

    if (rawHeader === "space") {
      cols.space = i;
    } else if (supportedOptional.indexOf(rawHeader) !== -1) {
      cols[rawHeader] = i;
    }
  }

  if (cols.space === undefined) {
    return { error: `Header 'space' is missing in sheet "${sheetName}".` };
  }

  return { cols, error: null };
}

/**
 * Validate and extract circle rows from a sheet.
 */
function parseSheetDataRows(data, sheetName) {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      circles: null,
      error: `Sheet "${sheetName}" header is invalid.`,
    };
  }

  const headerParsed = parseSheetHeaders(data[0], sheetName);
  if (headerParsed.error) {
    return { circles: null, error: headerParsed.error };
  }

  const cols = headerParsed.cols;
  const circles = [];
  const seenSpaces = new Set();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const isRowEmpty = row.every(
      (cell) =>
        cell === undefined || cell === null || String(cell).trim() === "",
    );
    if (isRowEmpty) continue;

    const rowNum = i + 1;
    const rawSpace =
      cols.space !== undefined &&
      row[cols.space] !== undefined &&
      row[cols.space] !== null
        ? String(row[cols.space]).trim()
        : "";

    if (!rawSpace) {
      return {
        circles: null,
        error: `Row ${rowNum} in sheet "${sheetName}" is missing required 'space'.`,
      };
    }

    if (seenSpaces.has(rawSpace)) {
      return {
        circles: null,
        error: `Duplicate space at row ${rowNum} in sheet "${sheetName}".`,
      };
    }
    seenSpaces.add(rawSpace);

    const circle = { space: rawSpace, sheetName: sheetName };

    if (
      cols.priority !== undefined &&
      row[cols.priority] !== undefined &&
      row[cols.priority] !== null
    ) {
      const pStr = String(row[cols.priority]).trim();
      if (pStr !== "") {
        const num = Number(pStr);
        if (Number.isNaN(num) || !Number.isFinite(num)) {
          return {
            circles: null,
            error: `Invalid priority at row ${rowNum} in sheet "${sheetName}".`,
          };
        }
        circle.priority = num;
      }
    }

    if (
      cols.isSale !== undefined &&
      row[cols.isSale] !== undefined &&
      row[cols.isSale] !== null
    ) {
      const sStr = String(row[cols.isSale]).trim();
      if (sStr !== "") circle.isSale = sStr;
    }

    if (
      cols.account !== undefined &&
      row[cols.account] !== undefined &&
      row[cols.account] !== null
    ) {
      const aStr = String(row[cols.account]).trim();
      if (aStr !== "") circle.account = aStr;
    }

    if (
      cols.tweet !== undefined &&
      row[cols.tweet] !== undefined &&
      row[cols.tweet] !== null
    ) {
      const tStr = String(row[cols.tweet]).trim();
      if (tStr !== "") circle.tweet = tStr;
    }

    if (
      cols.memo !== undefined &&
      row[cols.memo] !== undefined &&
      row[cols.memo] !== null
    ) {
      const mStr = String(row[cols.memo]).trim();
      if (mStr !== "") circle.memo = mStr;
    }

    circles.push(circle);
  }

  return { circles: circles, error: null };
}

/**
 * Webpage GET handler.
 */
// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function doGet(e) {
  try {
    const action = e?.parameter ? e.parameter.action : undefined;
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const spreadsheetTitle = spreadsheet.getName();

    if (action === "getSheets") {
      const allSheets = spreadsheet.getSheets();
      const sheetNames = allSheets.map((s) => s.getName());
      return jsonResponse(
        successResponse({
          sheets: sheetNames,
          spreadsheetTitle: spreadsheetTitle,
        }),
      );
    }

    const sheetsParam = e?.parameter ? e.parameter.sheets : undefined;
    if (typeof sheetsParam !== "string" || !sheetsParam.trim()) {
      return jsonResponse(
        errorResponse("Parameter 'sheets' is required.", "MISSING_PARAMETER"),
      );
    }

    const targetSheetName = sheetsParam.trim();
    const sheet = spreadsheet.getSheetByName(targetSheetName);
    if (!sheet) {
      return jsonResponse(
        errorResponse(
          `Sheet "${targetSheetName}" not found.`,
          "SHEET_NOT_FOUND",
        ),
      );
    }

    const data = sheet.getDataRange().getValues();
    const parsed = parseSheetDataRows(data, targetSheetName);
    if (parsed.error) {
      return jsonResponse(errorResponse(parsed.error, "INVALID_SHEET_DATA"));
    }

    return jsonResponse(
      successResponse({
        circles: parsed.circles,
        spreadsheetTitle: spreadsheetTitle,
      }),
    );
  } catch {
    return jsonResponse(
      errorResponse("Unexpected server error.", "SERVER_ERROR"),
    );
  }
}

/**
 * Webpage POST handler for sale state updates.
 */
// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function doPostSale(requestData) {
  try {
    if (!requestData || typeof requestData !== "object") {
      return jsonResponse(
        errorResponse("Invalid request body.", "INVALID_INPUT"),
      );
    }

    if (
      typeof requestData.sheetName !== "string" ||
      !requestData.sheetName.trim()
    ) {
      return jsonResponse(
        errorResponse(
          "Sheet name must be a non-empty string.",
          "INVALID_INPUT",
        ),
      );
    }

    if (typeof requestData.space !== "string" || !requestData.space.trim()) {
      return jsonResponse(
        errorResponse("Space must be a non-empty string.", "INVALID_INPUT"),
      );
    }

    if (typeof requestData.undo !== "boolean") {
      return jsonResponse(
        errorResponse("Undo must be a boolean.", "INVALID_INPUT"),
      );
    }

    const requestedSheetName = requestData.sheetName.trim();
    const spaceToUpdate = requestData.space.trim();
    const undo = requestData.undo;

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(requestedSheetName);
    if (!sheet) {
      return jsonResponse(
        errorResponse(
          `Sheet "${requestedSheetName}" not found.`,
          "SHEET_NOT_FOUND",
        ),
      );
    }

    const data = sheet.getDataRange().getValues();
    const headerParsed = parseSheetHeaders(data[0], requestedSheetName);
    if (headerParsed.error) {
      return jsonResponse(
        errorResponse(headerParsed.error, "INVALID_SHEET_DATA"),
      );
    }

    const cols = headerParsed.cols;
    if (cols.isSale === undefined) {
      return jsonResponse(
        errorResponse(
          `Header 'isSale' is missing in sheet "${requestedSheetName}".`,
          "INVALID_SHEET_DATA",
        ),
      );
    }

    let targetRowIndex = -1;
    const seenSpaces = new Set();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const isRowEmpty = row.every(
        (cell) =>
          cell === undefined || cell === null || String(cell).trim() === "",
      );
      if (isRowEmpty) continue;

      const rowNum = i + 1;
      const rawSpace =
        row[cols.space] !== undefined && row[cols.space] !== null
          ? String(row[cols.space]).trim()
          : "";

      if (!rawSpace) {
        return jsonResponse(
          errorResponse(
            `Row ${rowNum} in sheet "${requestedSheetName}" is missing required 'space'.`,
            "INVALID_SHEET_DATA",
          ),
        );
      }

      if (seenSpaces.has(rawSpace)) {
        return jsonResponse(
          errorResponse(
            `Duplicate space at row ${rowNum} in sheet "${requestedSheetName}".`,
            "INVALID_SHEET_DATA",
          ),
        );
      }
      seenSpaces.add(rawSpace);

      if (rawSpace === spaceToUpdate) {
        targetRowIndex = i;
      }
    }

    if (targetRowIndex === -1) {
      return jsonResponse(
        errorResponse(
          `Space was not found in sheet "${requestedSheetName}".`,
          "SPACE_NOT_FOUND",
        ),
      );
    }

    const targetRowNumber = targetRowIndex + 1;
    const statusColumnNumber = cols.isSale + 1;

    if (undo) {
      sheet.getRange(targetRowNumber, statusColumnNumber).setValue("");
    } else {
      sheet
        .getRange(targetRowNumber, statusColumnNumber)
        .setValue(spreadsheetConfig.purchasedStatusText);
    }

    return jsonResponse(successResponse());
  } catch {
    return jsonResponse(
      errorResponse("Unexpected server error.", "SERVER_ERROR"),
    );
  }
}
