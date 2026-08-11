/**
 * Webpage POST handler for catalog image URL upserts.
 */
// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function doPostCatalog(requestData) {
  try {
    if (!requestData || typeof requestData !== "object") {
      return jsonResponse(
        errorResponse("Invalid request body.", "INVALID_INPUT"),
      );
    }

    if (
      typeof requestData.sheetName !== "string" ||
      !requestData.sheetName.trim() ||
      typeof requestData.space !== "string" ||
      !requestData.space.trim() ||
      typeof requestData.tweet !== "string" ||
      !requestData.tweet.trim()
    ) {
      return jsonResponse(
        errorResponse(
          "Sheet name, space, and tweet are required.",
          "INVALID_INPUT",
        ),
      );
    }

    const tweet = requestData.tweet.trim();
    if (!/^https?:\/\/[^/\s]+(?:\/[^\s]*)?$/i.test(tweet)) {
      return jsonResponse(
        errorResponse("Tweet must be an HTTP or HTTPS URL.", "INVALID_INPUT"),
      );
    }

    const sheetName = requestData.sheetName.trim();
    const space = requestData.space.trim();
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      return jsonResponse(
        errorResponse(`Sheet "${sheetName}" not found.`, "SHEET_NOT_FOUND"),
      );
    }

    const data = sheet.getDataRange().getValues();
    const headerParsed = parseSheetHeaders(data[0], sheetName);
    if (headerParsed.error) {
      return jsonResponse(
        errorResponse(headerParsed.error, "INVALID_SHEET_DATA"),
      );
    }
    if (headerParsed.cols.tweet === undefined) {
      return jsonResponse(
        errorResponse(
          `Header 'tweet' is missing in sheet "${sheetName}".`,
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
        row[headerParsed.cols.space] !== undefined &&
        row[headerParsed.cols.space] !== null
          ? String(row[headerParsed.cols.space]).trim()
          : "";
      if (!rawSpace) {
        return jsonResponse(
          errorResponse(
            `Row ${rowNum} in sheet "${sheetName}" is missing required 'space'.`,
            "INVALID_SHEET_DATA",
          ),
        );
      }
      if (seenSpaces.has(rawSpace)) {
        return jsonResponse(
          errorResponse(
            `Duplicate space at row ${rowNum} in sheet "${sheetName}".`,
            "INVALID_SHEET_DATA",
          ),
        );
      }
      seenSpaces.add(rawSpace);
      if (rawSpace === space) targetRowIndex = i;
    }

    const created = targetRowIndex === -1;
    const rowNumber = created ? sheet.getLastRow() + 1 : targetRowIndex + 1;
    const spaceColumnNumber = headerParsed.cols.space + 1;
    const tweetColumnNumber = headerParsed.cols.tweet + 1;
    if (created) {
      sheet.getRange(rowNumber, spaceColumnNumber).setValue(space);
    }
    sheet.getRange(rowNumber, tweetColumnNumber).setValue(tweet);

    return jsonResponse(
      successResponse({
        stored: { sheetName, space, tweet },
        row: rowNumber,
        created,
      }),
    );
  } catch {
    return jsonResponse(
      errorResponse("Unexpected server error.", "SERVER_ERROR"),
    );
  }
}
