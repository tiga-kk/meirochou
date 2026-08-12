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
            while (self.data.length < row) self.data.push([]);
            while (self.data[row - 1].length < col) self.data[row - 1].push("");
            self.data[row - 1][col - 1] = val;
          },
        };
      },
      getLastRow() {
        return this.data.length;
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

function loadGas(sheetsData) {
  const gas = setupGasContext(sheetsData);
  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(codePath, "utf8"), context);
  return { gas, context };
}

function post(context, body) {
  return JSON.parse(
    context
      .doPost({ postData: { contents: JSON.stringify(body) } })
      .getContent(),
  );
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

  const response = context.doGet({
    parameter: { action: "getSheets" },
  });

  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, true);
  assert.equal(payload.status, "success");
  assert.deepEqual(payload.sheets, ["Sheet1", "Sheet2"]);
  assert.equal(payload.spreadsheetTitle, "C108 Book");
});

test("doGet with sheets parameter returns validated circles list including purchased rows", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext(
    {
      Sheet1: [
        ["space", "isSale", "priority", "tweet"],
        ["東A01a", "", "10", "http://example.com/1.png"],
        ["東A01b", "x", "5", "http://example.com/2.png"], // purchased (must be included)
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

  // 1. Invoke doGet without sheets parameter -> returns error
  const resEmpty = context.doGet({
    parameter: {},
  });
  const payloadEmpty = JSON.parse(resEmpty.getContent());
  assert.equal(payloadEmpty.ok, false);
  assert.equal(payloadEmpty.status, "error");

  // 2. Invoke doGet with sheets=Sheet1
  const resData = context.doGet({
    parameter: { sheets: "Sheet1" },
  });
  const payloadData = JSON.parse(resData.getContent());
  assert.equal(payloadData.ok, true);
  assert.equal(payloadData.status, "success");
  assert.equal(payloadData.spreadsheetTitle, "C108 Book");
  assert.equal(payloadData.circles.length, 2);

  const item1 = payloadData.circles.find((item) => item.space === "東A01a");
  assert.ok(item1);
  assert.equal(item1.priority, 10);
  assert.equal(item1.tweet, "http://example.com/1.png");
  assert.equal(item1.sheetName, "Sheet1");

  const item2 = payloadData.circles.find((item) => item.space === "東A01b");
  assert.ok(item2);
  assert.equal(item2.isSale, "x");
  assert.equal(item2.priority, 5);
  assert.equal(item2.tweet, "http://example.com/2.png");
});

test("doGet returns error when sheet has missing required space header", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["priority", "tweet"],
      ["10", "http://example.com/1.png"],
    ],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doGet({ parameter: { sheets: "Sheet1" } });
  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
  assert.ok(payload.message.includes("Sheet1"));
});

test("doGet returns error when the selected sheet has no header row", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({ Sheet1: [] });
  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doGet({ parameter: { sheets: "Sheet1" } });
  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "INVALID_SHEET_DATA");
});

test("doGet converts unexpected spreadsheet failures to a safe error", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [["space"], ["東A01a"]],
  });
  gas.SpreadsheetApp.getActiveSpreadsheet = () => {
    throw new Error("internal spreadsheet secret");
  };
  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doGet({ parameter: { sheets: "Sheet1" } });
  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "SERVER_ERROR");
  assert.equal(payload.message, "Unexpected server error.");
  assert.doesNotMatch(payload.message, /secret/);
});

test("doGet returns error when sheet has duplicate space header", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "space", "tweet"],
      ["東A01a", "東A01a", "http://example.com/1.png"],
    ],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doGet({ parameter: { sheets: "Sheet1" } });
  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doGet returns error when sheet has duplicate optional header", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "priority", "priority"],
      ["東A01a", "10", "5"],
    ],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doGet({ parameter: { sheets: "Sheet1" } });
  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doGet returns error when duplicate space row exists in sheet", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "isSale"],
      ["東A01a", ""],
      ["東A01a", "x"],
    ],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doGet({ parameter: { sheets: "Sheet1" } });
  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
  assert.ok(payload.message.includes("Sheet1"));
  assert.ok(payload.message.includes("3")); // row 3
});

test("doGet returns error when row has invalid non-numeric priority", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "priority"],
      ["東A01a", "not-a-number"],
    ],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doGet({ parameter: { sheets: "Sheet1" } });
  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doGet returns error when requesting unknown sheet", () => {
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

  const response = context.doGet({ parameter: { sheets: "NonExistentSheet" } });
  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doGet returns error when non-empty row has missing space", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "priority"],
      ["", "10"],
    ],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doGet({ parameter: { sheets: "Sheet1" } });
  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doGet parses optional empty fields without error", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "priority", "memo", "tweet", "account", "isSale"],
      ["東A01a", "", "", "", "", ""],
    ],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doGet({ parameter: { sheets: "Sheet1" } });
  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, true);
  assert.equal(payload.status, "success");
  assert.equal(payload.circles.length, 1);
  assert.equal(payload.circles[0].space, "東A01a");
  assert.equal(payload.circles[0].priority, undefined);
  assert.equal(payload.circles[0].memo, undefined);
});

test("doPost sale updates specific space status on specified sheet", () => {
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

  const response = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "sale",
        space: "東A01a",
        sheetName: "Sheet1",
        undo: false,
      }),
    },
  });
  const payload = JSON.parse(response.getContent());

  assert.equal(payload.ok, true);
  assert.equal(payload.status, "success");

  // Verify sheet was updated
  const sheetData = gas.spreadsheet.sheets[0].data;
  assert.equal(sheetData[1][1], "x");
});

test("doPost returns error when sheetName is missing or invalid", () => {
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

  const response = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "sale",
        space: "東A01a",
        undo: false,
      }),
    },
  });
  const payload = JSON.parse(response.getContent());

  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doPost returns error when sheetName is unknown", () => {
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

  const response = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "sale",
        sheetName: "UnknownSheet",
        space: "東A01a",
        undo: false,
      }),
    },
  });
  const payload = JSON.parse(response.getContent());

  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doPost returns error when space is missing or empty", () => {
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

  const response = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "sale",
        sheetName: "Sheet1",
        space: "",
        undo: false,
      }),
    },
  });
  const payload = JSON.parse(response.getContent());

  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doPost returns error when undo is non-boolean", () => {
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

  const response = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "sale",
        sheetName: "Sheet1",
        space: "東A01a",
        undo: "false",
      }),
    },
  });
  const payload = JSON.parse(response.getContent());

  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doPost returns error when sheet lacks required space or isSale column", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [["space"], ["東A01a"]],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "sale",
        sheetName: "Sheet1",
        space: "東A01a",
        undo: false,
      }),
    },
  });
  const payload = JSON.parse(response.getContent());

  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doPost returns error when sheet has duplicate headers", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "isSale", "isSale"],
      ["東A01a", "", ""],
    ],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "sale",
        sheetName: "Sheet1",
        space: "東A01a",
        undo: false,
      }),
    },
  });
  const payload = JSON.parse(response.getContent());

  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doPost returns error when sheet has duplicate space rows", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "isSale"],
      ["東A01a", ""],
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

  const response = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "sale",
        sheetName: "Sheet1",
        space: "東A01a",
        undo: false,
      }),
    },
  });
  const payload = JSON.parse(response.getContent());

  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
});

test("doPost updates exact target sheet without modifying second sheet with same space", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "isSale"],
      ["東A01a", ""],
    ],
    Sheet2: [
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

  const response = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "sale",
        sheetName: "Sheet1",
        space: "東A01a",
        undo: false,
      }),
    },
  });
  const payload = JSON.parse(response.getContent());

  assert.equal(payload.ok, true);
  assert.equal(payload.status, "success");

  assert.equal(gas.spreadsheet.sheets[0].data[1][1], "x");
  assert.equal(gas.spreadsheet.sheets[1].data[1][1], "");
});

test("doPost is idempotent on repeated purchase and repeat cancel", () => {
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

  const post = (undo) =>
    JSON.parse(
      context
        .doPost({
          postData: {
            contents: JSON.stringify({
              action: "sale",
              sheetName: "Sheet1",
              space: "東A01a",
              undo,
            }),
          },
        })
        .getContent(),
    );

  // 1st purchase
  let payload = post(false);
  assert.equal(payload.ok, true);
  assert.equal(gas.spreadsheet.sheets[0].data[1][1], "x");

  // 2nd purchase (idempotent)
  payload = post(false);
  assert.equal(payload.ok, true);
  assert.equal(gas.spreadsheet.sheets[0].data[1][1], "x");

  // 1st cancel
  payload = post(true);
  assert.equal(payload.ok, true);
  assert.equal(gas.spreadsheet.sheets[0].data[1][1], "");

  // 2nd cancel (idempotent)
  payload = post(true);
  assert.equal(payload.ok, true);
  assert.equal(gas.spreadsheet.sheets[0].data[1][1], "");
});

test("doPost ignores legacy batch reset payload and returns error", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({
    Sheet1: [
      ["space", "isSale"],
      ["東A01a", "x"],
    ],
  });

  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const response = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "sale",
        spaces: ["東A01a"],
        undo: true,
      }),
    },
  });
  const payload = JSON.parse(response.getContent());
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "error");
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
  assert.equal(payload.code, "UNKNOWN_ACTION");
  assert.equal(payload.message, "Unknown action.");
});

test("doPost returns a stable safe error for invalid or missing JSON", () => {
  const code = readFileSync(codePath, "utf8");
  const gas = setupGasContext({});
  const context = {
    SpreadsheetApp: gas.SpreadsheetApp,
    ContentService: gas.ContentService,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  for (const event of [{ postData: { contents: "not-json" } }, {}]) {
    const response = context.doPost(event);
    const payload = JSON.parse(response.getContent());
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "INVALID_JSON");
    assert.equal(payload.message, "Invalid JSON.");
  }

  for (const contents of ["null", "[]", '"sale"']) {
    const response = context.doPost({ postData: { contents } });
    const payload = JSON.parse(response.getContent());
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "INVALID_INPUT");
    assert.equal(payload.message, "Invalid request body.");
  }
});

test("upsertCatalog updates account and tweet in the matching row regardless of header order", () => {
  const { gas, context } = loadGas({
    Sheet1: [
      ["memo", "tweet", "space", "priority", "isSale", "account"],
      ["keep memo", "old", "東A01a", "7", "x", "@circle"],
    ],
  });

  const payload = post(context, {
    action: "upsertCatalog",
    sheetName: "Sheet1",
    space: "東A01a",
    account: "https://twitter.com/new-account",
    tweet: "https://example.invalid/new.jpg",
  });

  assert.deepEqual(payload.stored, {
    sheetName: "Sheet1",
    space: "東A01a",
    account: "https://twitter.com/new-account",
    tweet: "https://example.invalid/new.jpg",
  });
  assert.equal(payload.row, 2);
  assert.equal(payload.created, false);
  assert.deepEqual(gas.spreadsheet.sheets[0].data[1], [
    "keep memo",
    "https://example.invalid/new.jpg",
    "東A01a",
    "7",
    "x",
    "https://twitter.com/new-account",
  ]);
});

test("upsertCatalog creates a new row without overwriting unrelated columns", () => {
  const { gas, context } = loadGas({
    Sheet1: [
      ["priority", "space", "account", "tweet", "memo"],
      ["5", "東A01a", "old-account", "old", "keep"],
    ],
  });

  const payload = post(context, {
    action: "upsertCatalog",
    sheetName: "Sheet1",
    space: "西B02b",
    account: "https://x.com/new-account",
    tweet: "http://example.invalid/catalog.png",
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.row, 3);
  assert.equal(payload.created, true);
  assert.deepEqual(gas.spreadsheet.sheets[0].data[2], [
    "",
    "西B02b",
    "https://x.com/new-account",
    "http://example.invalid/catalog.png",
  ]);
});

test("upsertCatalog rejects duplicate spaces, missing tweet headers, and invalid URLs", () => {
  const duplicate = loadGas({
    Sheet1: [
      ["space", "tweet"],
      ["東A01a", "old"],
      ["東A01a", "duplicate"],
    ],
  });
  assert.equal(
    post(duplicate.context, {
      action: "upsertCatalog",
      sheetName: "Sheet1",
      space: "東A01a",
      tweet: "https://example.invalid/new.jpg",
    }).code,
    "INVALID_SHEET_DATA",
  );

  const missingTweet = loadGas({ Sheet1: [["space"], ["東A01a"]] });
  assert.equal(
    post(missingTweet.context, {
      action: "upsertCatalog",
      sheetName: "Sheet1",
      space: "東A01a",
      tweet: "https://example.invalid/new.jpg",
    }).code,
    "INVALID_SHEET_DATA",
  );

  const invalidUrl = loadGas({
    Sheet1: [
      ["space", "tweet"],
      ["東A01a", "old"],
    ],
  });
  assert.equal(
    post(invalidUrl.context, {
      action: "upsertCatalog",
      sheetName: "Sheet1",
      space: "東A01a",
      tweet: "javascript:alert(1)",
    }).code,
    "INVALID_INPUT",
  );

  const missingAccount = loadGas({
    Sheet1: [
      ["space", "tweet"],
      ["東A01a", "old"],
    ],
  });
  assert.equal(
    post(missingAccount.context, {
      action: "upsertCatalog",
      sheetName: "Sheet1",
      space: "東A01a",
      account: "https://twitter.com/mignon",
      tweet: "https://example.invalid/new.jpg",
    }).code,
    "INVALID_SHEET_DATA",
  );

  const invalidAccount = loadGas({
    Sheet1: [
      ["space", "account", "tweet"],
      ["東A01a", "old", "old"],
    ],
  });
  assert.equal(
    post(invalidAccount.context, {
      action: "upsertCatalog",
      sheetName: "Sheet1",
      space: "東A01a",
      account: "javascript:alert(1)",
      tweet: "https://example.invalid/new.jpg",
    }).code,
    "INVALID_INPUT",
  );
});
