// biome-ignore lint/correctness/noUnusedVariables: global config exposed to Apps Script environment
var spreadsheetConfig = {
  spaceColumnName: "space",
  saleStatusColumnName: "isSale",
  purchasedStatusText: "x",
};

// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function successResponse(payload) {
  return Object.assign(
    {
      ok: true,
      status: "success",
    },
    payload || {},
  );
}

// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function errorResponse(message, payload) {
  return Object.assign(
    {
      ok: false,
      status: "error",
      message,
      error: message,
    },
    payload || {},
  );
}

// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * WebページからのGETリクエストを処理するメイン関数。
 * アクションに応じてシート一覧取得、または指定シートのデータ取得を行う。
 *
 * パラメータ:
 * - action: 'getSheets' の場合、全シート名を返す。
 * - sheets: カンマ区切りのシート名リスト（データ取得時）。
 *
 * @param {object} e - Apps Scriptが受け取るイベントオブジェクト。
 * @returns {ContentService.TextOutput} - JSON形式のレスポンス。
 */
// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function doGet(e) {
  const action = e.parameter.action;
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const spreadsheetTitle = spreadsheet.getName();

  // シート一覧の取得
  if (action === "getSheets") {
    const allSheets = spreadsheet.getSheets();
    const sheetNames = allSheets.map((s) => s.getName());
    return ContentService.createTextOutput(
      JSON.stringify({ sheets: sheetNames, spreadsheetTitle }),
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // データ取得（デフォルト動作）
  let targetSheets = [];
  if (e.parameter.sheets) {
    targetSheets = e.parameter.sheets.split(",").map((s) => s.trim());
  }

  let combinedResult = []; // 複数のシートの結果を結合するための配列。

  // 設定されたシート名でループ処理。
  targetSheets.forEach((sheetName) => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    // シートが見つからない場合はスキップ。
    if (!sheet) {
      console.warn(`Sheet "${sheetName}" not found. Skipping.`);
      return;
    }

    const data = sheet.getDataRange().getValues(); // シートの全データを二次元配列として取得。
    if (data.length === 0) return;

    // ヘッダー行（1行目）を取得し、小文字に変換・空白削除して整形。
    const headers = data
      .shift()
      .map((h) => String(h).toLowerCase().replace(/\s+/g, ""));

    // データ行をオブジェクトの配列に変換。
    const sheetResult = data
      .map((row) => {
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = row[i];
        });
        if (obj.imageurl) {
          obj.tweet = obj.imageurl;
        }
        obj.sheetName = sheetName;
        return obj;
      })
      .filter(
        (row) =>
          // スペース列に値があり、かつ購入済みステータスでない行のみをフィルタリング。
          row[spreadsheetConfig.spaceColumnName.toLowerCase()] &&
          row[spreadsheetConfig.saleStatusColumnName.toLowerCase()] !==
            spreadsheetConfig.purchasedStatusText,
      );

    // 現在のシートの結果を全体の結果に結合。
    combinedResult = combinedResult.concat(sheetResult);
  });

  // 最終的な結果をJSON形式で返す。
  return ContentService.createTextOutput(
    JSON.stringify({ wantToBuy: combinedResult, spreadsheetTitle }),
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * WebページからのPOSTリクエストを処理するメイン関数。
 * 指定されたスペースの購入ステータスを更新（または元に戻す）。
 *
 * @param {object} e - Apps Scriptが受け取るイベントオブジェクト（POSTデータを含む）。
 * @returns {ContentService.TextOutput} - JSON形式の処理結果レスポンス。
 */
// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function doPostSale(requestData) {
  try {
    const undo = requestData.undo || false; // undoフラグ（購入取り消しかどうか）。なければfalseになる。

    // 通常の購入・Undoは取得元シートを優先し、同じスペース番号を持つ別シートの
    // 行を誤更新しない。古いキャッシュなどsheetNameを持たないpayloadと一括Undoは,
    // 後方互換のため全シートを探索する。

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const requestedSheetName =
      typeof requestData.sheetName === "string"
        ? requestData.sheetName.trim()
        : "";
    let targetSheets;
    if (requestedSheetName) {
      const requestedSheet = spreadsheet.getSheetByName(requestedSheetName);
      if (!requestedSheet) {
        return jsonResponse(
          errorResponse(`Sheet "${requestedSheetName}" not found.`),
        );
      }
      targetSheets = [requestedSheet];
    } else {
      targetSheets = spreadsheet.getSheets();
    }

    // --- バッチリセット処理 ---
    // requestDataに 'spaces' というキーで配列が渡され、かつ undo=true の場合に動作。
    if (requestData.spaces && Array.isArray(requestData.spaces) && undo) {
      const spacesToReset = requestData.spaces;
      let resetCount = 0;

      // 各シートを順番に検索。
      for (const sheet of targetSheets) {
        const data = sheet.getDataRange().getValues();
        if (data.length === 0) continue;

        const headers = data[0];
        const spaceColumnIndex = headers.indexOf(
          spreadsheetConfig.spaceColumnName,
        );
        const statusColumnIndex = headers.indexOf(
          spreadsheetConfig.saleStatusColumnName,
        );

        if (spaceColumnIndex === -1 || statusColumnIndex === -1) continue; // 必要な列がなければスキップ。

        // データ行をループして、リセット対象のスペースを探す。
        for (let i = 1; i < data.length; i++) {
          // リセット対象のスペース配列に、現在の行のスペースが含まれているかチェック。
          if (spacesToReset.includes(data[i][spaceColumnIndex])) {
            // 含まれていれば、ステータス列のセルを空にする。
            sheet.getRange(i + 1, statusColumnIndex + 1).setValue("");
            resetCount++;
          }
        }
      }
      // 処理結果を返す。
      return jsonResponse(
        successResponse({
          message: `Batch reset successful for ${resetCount} items.`,
          resetCount,
        }),
      );
    }
    // --- バッチリセット処理ここまで ---

    // --- 既存の単一更新処理 ---
    const spaceToUpdate = requestData.space;
    // スペース番号が提供されていない場合はエラーを返す。
    if (!spaceToUpdate) {
      return jsonResponse(errorResponse("No space provided"));
    }

    let foundAndUpdated = false;
    // 各シートを順番に検索。
    for (const sheet of targetSheets) {
      const data = sheet.getDataRange().getValues();
      if (data.length === 0) continue;

      const headers = data[0];
      // ヘッダー名から「space」列と「isSale」列のインデックス番号を取得。
      const spaceColumnIndex = headers.indexOf(
        spreadsheetConfig.spaceColumnName,
      );
      const statusColumnIndex = headers.indexOf(
        spreadsheetConfig.saleStatusColumnName,
      );

      // 必要な列が見つからない場合は、このシートをスキップして次のシートへ。
      if (spaceColumnIndex === -1 || statusColumnIndex === -1) {
        continue;
      }

      // データ行をループして、一致するスペースを探す。
      for (let i = 1; i < data.length; i++) {
        // biome-ignore lint/suspicious/noDoubleEquals: spreadsheet cell values can be numeric or string
        if (data[i][spaceColumnIndex] == spaceToUpdate) {
          // undoがtrueならステータスを空に、falseなら購入済みの印を書き込む。
          if (undo) {
            sheet.getRange(i + 1, statusColumnIndex + 1).setValue("");
          } else {
            sheet
              .getRange(i + 1, statusColumnIndex + 1)
              .setValue(spreadsheetConfig.purchasedStatusText);
          }
          foundAndUpdated = true;
          break; // 見つかったらループを抜ける (単一更新のため)
        }
      }
      if (foundAndUpdated) break; // シートが見つかったらシートのループも抜ける
    }

    if (foundAndUpdated) {
      // 成功レスポンスを返して処理を終了。
      return jsonResponse(
        successResponse({
          message: `Updated ${spaceToUpdate}, undo: ${undo}`,
          space: spaceToUpdate,
          undo,
        }),
      );
    } else {
      // 全てのシートを検索してもスペースが見つからなかった場合。
      return jsonResponse(
        errorResponse(
          `Space "${spaceToUpdate}" not found in any of the specified sheets.`,
        ),
      );
    }
  } catch (error) {
    // その他の予期せぬエラーが発生した場合。
    return jsonResponse(errorResponse(error.message));
  }
}

// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (error) {
    return jsonResponse(errorResponse(`Invalid JSON: ${error.message}`));
  }

  if (data.action === "sale") {
    return doPostSale(data);
  }

  return jsonResponse(errorResponse(`Unknown action: ${data.action}`));
}
