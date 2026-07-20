import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function buildPublicGas({ repositoryRoot }) {
  const rootPath =
    repositoryRoot instanceof URL
      ? fileURLToPath(repositoryRoot)
      : repositoryRoot;
  const order = ["config.js", "response.js", "web-api.js", "post-router.js"];
  return `${order
    .map((name) =>
      readFileSync(
        resolve(rootPath, "integrations/gas-spreadsheet/src", name),
        "utf8",
      ).trimEnd(),
    )
    .join("\n\n")}\n`;
}

const isMain =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)));

if (isMain) {
  try {
    const rootUrl = new URL("../", import.meta.url);
    const codePath = resolve(
      fileURLToPath(rootUrl),
      "integrations/gas-spreadsheet/Code.gs",
    );
    const generated = buildPublicGas({ repositoryRoot: rootUrl });
    const isCheck = process.argv.includes("--check");

    if (isCheck) {
      if (!existsSync(codePath)) {
        console.error("Code.gs does not exist.");
        process.exit(1);
      }
      const current = readFileSync(codePath, "utf8");
      if (current !== generated) {
        console.error("Code.gs is out of sync. Please run npm run build:gas.");
        process.exit(1);
      }
      console.log("Code.gs is up to date.");
    } else {
      writeFileSync(codePath, generated, "utf8");
      console.log("Code.gs generated successfully.");
    }
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}
