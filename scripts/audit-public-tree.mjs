import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXCLUDE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "test-results",
  "playwright-report",
  ".superpowers",
]);

const FORBIDDEN_PATHS = [
  "apps/catalog-extension",
  "apps/pebble",
  "apps/webapp/AGENT.md",
  "apps/webapp/README.md",
  "apps/webapp/assets/maps",
  "integrations/gas-spreadsheet/catalog-api.js",
  "integrations/gas-spreadsheet/space-normalizer.js",
  "integrations/gas-spreadsheet/config.js",
  "python",
  ".clasp.json",
  ".vscode",
  "CODEX.md",
  ".local-docs",
  ".superpowers",
];

// Content scanning:
// Runtime scan rejects deployed GAS URLs, catalogSpreadsheetId, non-empty scriptId values,
// and non-empty Cloudflare credential assignments.
// Exclude tests, plan documents, and the auditor's own pattern definitions.
// Deployed GAS URL pattern matches script.google.com/macros/s/<id>
const GAS_URL_PATTERN = /script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+/i;
const CATALOG_SSID_PATTERN = /catalogSpreadsheetId/i;
// Match non-empty scriptId (i.e. not empty string)
const SCRIPT_ID_PATTERN = /"scriptId"\s*:\s*"[^"]+"/i;
const SCRIPT_ID_JS_PATTERN = /scriptId\s*:\s*"[^"]+"/i;
const CLOUDFLARE_ASSIGNMENT_PATTERN =
  /\b(CLOUDFLARE_API_TOKEN|CF_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|CF_ACCOUNT_ID|CLOUDFLARE_ZONE_ID)\b["']?\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i;

export function auditPublicTree(rootUrl) {
  const rootPath = resolve(fileURLToPath(rootUrl));
  const files = [];

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDE_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = join(dir, entry.name);
      const relPath = relative(rootPath, fullPath).replace(/\\/g, "/");

      // Check forbidden path prefix
      for (const forbidden of FORBIDDEN_PATHS) {
        if (relPath === forbidden || relPath.startsWith(`${forbidden}/`)) {
          throw new Error(`Forbidden path detected: ${relPath}`);
        }
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push(relPath);

        // Content scanning
        // Exclude tests, docs, and audit-public-tree.mjs itself
        const isExcludedFromScan =
          relPath.startsWith("tests/") ||
          relPath.startsWith("docs/") ||
          relPath === "scripts/audit-public-tree.mjs";

        if (!isExcludedFromScan) {
          const content = readFileSync(fullPath, "utf8");

          if (GAS_URL_PATTERN.test(content)) {
            throw new Error(
              `Credential leak: Deployed GAS URL found in ${relPath}`,
            );
          }
          if (CATALOG_SSID_PATTERN.test(content)) {
            throw new Error(
              `Forbidden term: catalogSpreadsheetId found in ${relPath}`,
            );
          }
          if (
            SCRIPT_ID_PATTERN.test(content) ||
            SCRIPT_ID_JS_PATTERN.test(content)
          ) {
            // Check if scriptId has a non-empty value
            const match =
              content.match(SCRIPT_ID_PATTERN) ||
              content.match(SCRIPT_ID_JS_PATTERN);
            const value = match[0].split(":")[1].replace(/['"\s]/g, "");
            if (value !== "") {
              throw new Error(
                `Credential leak: Non-empty scriptId found in ${relPath}`,
              );
            }
          }
          if (CLOUDFLARE_ASSIGNMENT_PATTERN.test(content)) {
            throw new Error(
              `Cloudflare credential assignment found in ${relPath}`,
            );
          }
        }
      }
    }
  }

  walk(rootPath);

  const sortedRelativeFiles = files.slice().sort();
  return { files: Object.freeze(sortedRelativeFiles) };
}
