/** Webpage POST handler for catalog metadata upserts. */
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
      !requestData.space.trim()
    ) {
      return jsonResponse(
        errorResponse("Sheet name and space are required.", "INVALID_INPUT"),
      );
    }

    const tweet =
      typeof requestData.tweet === "string" ? requestData.tweet.trim() : "";
    if (tweet && !/^https?:\/\/[^/\s]+(?:\/[^\s]*)?$/i.test(tweet)) {
      return jsonResponse(
        errorResponse("Tweet must be an HTTP or HTTPS URL.", "INVALID_INPUT"),
      );
    }

    const account =
      typeof requestData.account === "string" ? requestData.account.trim() : "";
    if (account && !/^https?:\/\/[^/\s]+(?:\/[^\s]*)?$/i.test(account)) {
      return jsonResponse(
        errorResponse("Account must be an HTTP or HTTPS URL.", "INVALID_INPUT"),
      );
    }

    const sheetName = requestData.sheetName.trim();
    const requestedSpace = requestData.space.trim();
    const space = canonicalizeSpace(requestedSpace);
    if (!space) {
      return jsonResponse(errorResponse("Space is invalid.", "INVALID_INPUT"));
    }
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
    if (tweet && headerParsed.cols.tweet === undefined) {
      return jsonResponse(
        errorResponse(
          `Header 'tweet' is missing in sheet "${sheetName}".`,
          "INVALID_SHEET_DATA",
        ),
      );
    }
    if (account && headerParsed.cols.account === undefined) {
      return jsonResponse(
        errorResponse(
          `Header 'account' is missing in sheet "${sheetName}".`,
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
      const canonicalSpace = canonicalizeSpace(rawSpace);
      if (!canonicalSpace) {
        return jsonResponse(
          errorResponse(
            `Row ${rowNum} in sheet "${sheetName}" has an invalid 'space'.`,
            "INVALID_SHEET_DATA",
          ),
        );
      }
      if (seenSpaces.has(canonicalSpace)) {
        return jsonResponse(
          errorResponse(
            `Duplicate space at row ${rowNum} in sheet "${sheetName}".`,
            "INVALID_SHEET_DATA",
          ),
        );
      }
      seenSpaces.add(canonicalSpace);
      if (canonicalSpace === space) targetRowIndex = i;
    }

    const created = targetRowIndex === -1;
    const rowNumber = created ? sheet.getLastRow() + 1 : targetRowIndex + 1;
    const spaceColumnNumber = headerParsed.cols.space + 1;
    const tweetColumnNumber =
      headerParsed.cols.tweet === undefined
        ? null
        : headerParsed.cols.tweet + 1;
    const accountColumnNumber =
      headerParsed.cols.account === undefined
        ? null
        : headerParsed.cols.account + 1;
    if (created) {
      sheet.getRange(rowNumber, spaceColumnNumber).setValue(requestedSpace);
    }
    if (account && accountColumnNumber !== null) {
      sheet.getRange(rowNumber, accountColumnNumber).setValue(account);
    }
    if (tweet && tweetColumnNumber !== null) {
      sheet.getRange(rowNumber, tweetColumnNumber).setValue(tweet);
    }

    const stored = { sheetName, space: requestedSpace };
    if (account) stored.account = account;
    if (tweet) stored.tweet = tweet;
    return jsonResponse(
      successResponse({
        stored,
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
