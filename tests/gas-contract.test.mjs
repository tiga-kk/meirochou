import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "vitest";

const codePath = new URL(
  "../integrations/gas-spreadsheet/Code.gs",
  import.meta.url,
);

function setupGasContext(sheetsData, spreadsheetTitle = "Test Spreadsheet") {
  const sheets = Object.entries(sheetsData).map(([name, data]) => {
    return {
      name,
      data: JSON.parse(JSON.stringify(data)), // clone
      getName() {
        return this.name;
      },
      getDataRange() {
        const self = this;
        return {
          getValues() {
            return self.data;
          },
        };
      },
      getRange(row, col) {
        const self = this;
        return {
          setValue(val) {
            // Row and Col are 1-based indexes
            self.data[row - 1][col - 1] = val;
          },
        };
      },
    };
  });

  const spreadsheet = {
    title: spreadsheetTitle,
    sheets,
    getName() {
      return this.title;
    },
    getSheets() {
      return this.sheets;
    },
    getSheetByName(name) {
      return this.sheets.find((s) => s.name === name) || null;
    },
  };

  const textOutputs = [];
  const ContentService = {
    MimeType: {
      JSON: "JSON",
    },
    createTextOutput(text) {
      const output = {
        text,
        mimeType: null,
        setMimeType(mime) {
          this.mimeType = mime;
          return this;
        },
        getContent() {
          return this.text;
        },
      };
      textOutputs.push(output);
      return output;
    },
  };

  const SpreadsheetApp = {
    getActiveSpreadsheet() {
      return spreadsheet;
    },
  };

  return {
    SpreadsheetApp,
    ContentService,
    spreadsheet,
    textOutputs,
  };
}

test("gas Code.gs matches basic public constraints", () => {
  assert.ok(existsSync(codePath), "Code.gs should exist");
  const code = readFileSync(codePath, "utf8");

  // Private terms audit
  assert.doesNotMatch(code, /openById/);
  assert.doesNotMatch(code, /catalogSpreadsheetId/);
  assert.doesNotMatch(code, /doPostCatalogSpace/);
  assert.doesNotMatch(code, /makeCircleClean/);
});

test("doGet with action=getSheets returns all sheet names and spreadsheet title", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext(
    {
      Sheet1: [
        ["space", "isSale"],
        ["東A01a", ""],
      ],
      Sheet2: [
        ["space", "isSale"],
        ["西B02b", ""],
      ],
    },
    "C108 Book",
  );

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  // Invoke doGet
  const response = context.doGet({
    parameter: { action: "getSheets" },
  });

  const payload = JSON.parse(response.getContent());
  assert.deepEqual(payload.sheets, ["Sheet1", "Sheet2"]);
  assert.equal(payload.spreadsheetTitle, "C108 Book");
});

test("doGet with sheets parameters returns filtered wantToBuy list", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext(
    {
      Sheet1: [
        ["space", "isSale", "priority", "imageUrl"],
        ["東A01a", "", "10", "http://example.com/1.png"],
        ["東A01b", "x", "5", "http://example.com/2.png"], // purchased (should be excluded)
      ],
      Sheet2: [
        ["space", "isSale", "priority", "imageUrl"],
        ["西B02b", "", "8", ""],
      ],
    },
    "C108 Book",
  );

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  // 1. Invoke doGet without sheets parameter -> returns empty wantToBuy
  const resEmpty = context.doGet({
    parameter: {},
  });
  const payloadEmpty = JSON.parse(resEmpty.getContent());
  assert.deepEqual(payloadEmpty.wantToBuy, []);

  // 2. Invoke doGet with sheets=Sheet1,Sheet2
  const resData = context.doGet({
    parameter: { sheets: "Sheet1, Sheet2" },
  });
  const payloadData = JSON.parse(resData.getContent());
  assert.equal(payloadData.spreadsheetTitle, "C108 Book");
  assert.equal(payloadData.wantToBuy.length, 2);

  const item1 = payloadData.wantToBuy.find((item) => item.space === "東A01a");
  assert.ok(item1);
  assert.equal(item1.priority, "10");
  assert.equal(item1.tweet, "http://example.com/1.png"); // imageUrl is mapped to tweet
  assert.equal(item1.sheetName, "Sheet1");

  const item2 = payloadData.wantToBuy.find((item) => item.space === "西B02b");
  assert.ok(item2);
  assert.equal(item2.sheetName, "Sheet2");
});

test("doPost updates specific space status on specified sheet", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "isSale"],
      ["東A01a", ""],
    ],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  // doPost sale
  const e = {
    postData: {
      contents: JSON.stringify({
        action: "sale",
        space: "東A01a",
        sheetName: "Sheet1",
        undo: false,
      }),
    },
  };

  const response = context.doPost(e);
  const payload = JSON.parse(response.getContent());

  assert.equal(payload.ok, true);
  assert.equal(payload.status, "success");

  // Verify sheet was updated
  const sheetData = gas.spreadsheet.sheets[0].data;
  assert.equal(sheetData[1][1], "x"); // space=東A01a, isSale=x
});

test("doPost with unknown action returns error response", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "isSale"],
      ["東A01a", ""],
    ],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const e = {
    postData: {
      contents: JSON.stringify({
        action: "unknown-action-xyz",
      }),
    },
  };

  const response = context.doPost(e);
  const payload = JSON.parse(response.getContent());

  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});
