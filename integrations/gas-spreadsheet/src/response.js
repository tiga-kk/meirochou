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
function errorResponse(message, code, payload) {
  const errCode = typeof code === "string" ? code : "BAD_REQUEST";
  const extra = typeof code === "object" ? code : payload;
  return Object.assign(
    {
      ok: false,
      status: "error",
      code: errCode,
      message,
    },
    extra || {},
  );
}

// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
