import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, normalize, relative, resolve } from "node:path";

const SOURCE_EXTENSIONS = new Set([".ts", ".js", ".mjs"]);
const VAGUE_NAME_PARTS = new Set([
  "manager",
  "handler",
  "helper",
  "utils",
  "common",
  "misc",
]);
const LEGACY_FILES = new Set([
  "app.js",
  "data-manager.ts",
  "ui-manager.js",
  "config.ts",
  "types/domain.ts",
  "types/boundary-parsers.ts",
]);
const APPLICATION_FORBIDDEN_IMPORTS = [
  "/route-planner",
  "/routing/",
  "/csv-circle-codec",
  "/storage-schema",
  "/gas-api-client",
  "/gas-outbox-service",
];

function toPosix(value) {
  return value.replaceAll("\\", "/");
}

function relativeName(rootDir, filePath) {
  return toPosix(relative(rootDir, filePath));
}

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(filePath));
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      found.push(filePath);
    }
  }
  return found;
}

function stripComments(source) {
  let result = "";
  let state = "code";
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === "line-comment") {
      if (character === "\n") {
        state = "code";
        result += character;
      } else {
        result += " ";
      }
      continue;
    }
    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else {
        result += character === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (state === "string") {
      result += character;
      if (character === "\\") {
        result += next ?? "";
        index += 1;
      } else if (character === quote) {
        state = "code";
      }
      continue;
    }
    if (character === "/" && next === "/") {
      result += "  ";
      index += 1;
      state = "line-comment";
      continue;
    }
    if (character === "/" && next === "*") {
      result += "  ";
      index += 1;
      state = "block-comment";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      state = "string";
      quote = character;
    }
    result += character;
  }
  return result;
}

function stripStringLiterals(source) {
  let result = "";
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") {
        result += "  ";
        index += 1;
      } else if (character === quote) {
        result += " ";
        quote = null;
      } else {
        result += character === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      result += " ";
    } else {
      result += character;
    }
  }
  return result;
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      )
        index += 1;
      index += 2;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      const quote = character;
      let value = "";
      index += 1;
      while (index < source.length) {
        const current = source[index];
        if (current === "\\") {
          value += source[index + 1] ?? "";
          index += 2;
        } else if (current === quote) {
          index += 1;
          break;
        } else {
          value += current;
          index += 1;
        }
      }
      tokens.push({ type: "string", value });
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_$][\w$]*/);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    tokens.push({ type: "punctuation", value: character });
    index += 1;
  }
  return tokens;
}

function parseImports(source) {
  const tokens = tokenize(source);
  const imports = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      token.type !== "identifier" ||
      !["import", "export"].includes(token.value)
    )
      continue;
    const next = tokens[index + 1];
    if (token.value === "import" && next?.value === "(") {
      const argument = tokens[index + 2];
      if (argument?.type === "string" && tokens[index + 3]?.value === ")") {
        imports.push({ specifier: argument.value, kind: "dynamic-literal" });
      } else {
        imports.push({ specifier: null, kind: "dynamic-non-literal" });
      }
      continue;
    }
    const limit = Math.min(tokens.length, index + 40);
    for (let cursor = index + 1; cursor < limit; cursor += 1) {
      const candidate = tokens[cursor];
      if (
        candidate.value === ";" ||
        candidate.value === "import" ||
        candidate.value === "export"
      )
        break;
      if (
        candidate.type === "string" &&
        (token.value === "import" || tokens[cursor - 1]?.value === "from")
      ) {
        imports.push({ specifier: candidate.value, kind: "static" });
        break;
      }
    }
  }
  return imports;
}

function resolveImportPath(importerPath, specifier, sourceRoot) {
  if (!specifier?.startsWith(".")) return null;
  const base = normalize(join(importerPath, "..", specifier));
  const candidates = [
    base,
    ...[".ts", ".js", ".mjs"].map((extension) => `${base}${extension}`),
    ...[".ts", ".js", ".mjs"].map((extension) =>
      join(base, `index${extension}`),
    ),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return relativeName(sourceRoot, candidate);
  }
  const unresolved = relativeName(sourceRoot, candidates[0]);
  return unresolved.startsWith("../") ? toPosix(specifier) : unresolved;
}

function featureName(filePath) {
  const match = filePath.match(/(?:^|\/)features\/([^/]+)\//);
  return match?.[1] ?? null;
}

function isAllowedUseCaseDependency(importer, resolvedImport, importedFeature) {
  if (!resolvedImport) return false;
  const feature = featureName(importer);
  if (!feature) return false;
  if (
    new RegExp(`(?:^|/)features/${feature}/(?:domain|use-cases)/`).test(
      resolvedImport,
    )
  ) {
    return true;
  }
  if (/(?:^|\/)shared\/domain\//.test(resolvedImport)) return true;
  return Boolean(
    importedFeature &&
      importedFeature !== feature &&
      (resolvedImport.endsWith("/public-api.ts") ||
        resolvedImport.endsWith("/public-api")),
  );
}

function isLegacyPath(filePath) {
  return [...LEGACY_FILES].some(
    (legacy) =>
      filePath === `apps/webapp/js/${legacy}` ||
      filePath.endsWith(`/${legacy}`),
  );
}

function addViolation(violations, ruleId, importer, imported, message) {
  violations.push({ ruleId, importer, imported, message });
}

function loadAllowlist(rootDir, allowlistPath) {
  const path = allowlistPath
    ? resolve(rootDir, allowlistPath)
    : join(rootDir, "scripts/webapp-architecture-legacy-allowlist.json");
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(parsed) ? parsed : (parsed.entries ?? []);
}

function isAllowed(violation, allowlist) {
  return allowlist.some(
    (entry) =>
      entry?.ruleId === violation.ruleId &&
      entry?.importer === violation.importer &&
      entry?.imported === violation.imported,
  );
}

function validateAllowlist(allowlist, rawViolations) {
  const violations = [];
  const seen = new Set();
  for (const entry of allowlist) {
    const key = JSON.stringify(entry);
    const validShape =
      entry &&
      typeof entry === "object" &&
      typeof entry.ruleId === "string" &&
      typeof entry.importer === "string" &&
      (typeof entry.imported === "string" || entry.imported === null) &&
      Object.keys(entry).every((keyName) =>
        ["ruleId", "importer", "imported"].includes(keyName),
      );
    const hasWildcard = [entry?.ruleId, entry?.importer, entry?.imported]
      .filter((value) => typeof value === "string")
      .some(
        (value) =>
          value.includes("*") || value.includes("[") || value.includes("]"),
      );
    if (!validShape || hasWildcard) {
      violations.push({
        ruleId: "invalid-allowlist-entry",
        importer: String(entry?.importer ?? ""),
        imported: typeof entry?.imported === "string" ? entry.imported : null,
        message:
          "Allowlist entries require exact ruleId/importer/imported fields",
      });
    }
    if (!validShape) continue;
    if (seen.has(key)) {
      violations.push({
        ruleId: "duplicate-allowlist-entry",
        importer: entry.importer,
        imported: entry.imported,
        message: "Allowlist entries must be unique",
      });
      continue;
    }
    seen.add(key);
    if (!rawViolations.some((item) => isAllowed(item, [entry]))) {
      violations.push({
        ruleId: "stale-allowlist-entry",
        importer: entry.importer,
        imported: entry.imported,
        message: "Allowlist entry does not match a current violation",
      });
    }
  }
  return violations;
}

export function scanWebappArchitecture(options = {}) {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const sourceRoot = resolve(
    options.sourceRoot ?? join(rootDir, "apps/webapp/js"),
  );
  const files = (options.files ?? sourceFiles(sourceRoot)).map((file) =>
    resolve(file),
  );
  const violations = [];
  const imports = [];

  for (const filePath of files) {
    if (!SOURCE_EXTENSIONS.has(extname(filePath))) continue;
    const importer = relativeName(rootDir, filePath);
    const source = readFileSync(filePath, "utf8");
    const importsInFile = parseImports(source);
    const feature = featureName(importer);
    const fileBase = importer.split("/").at(-1) ?? importer;
    const isLegacy = isLegacyPath(importer);
    const importerIsDomain = Boolean(
      feature &&
        new RegExp(`(?:^|/)features/${feature}/domain/`).test(importer),
    );
    const importerIsUseCase = Boolean(
      feature &&
        new RegExp(`(?:^|/)features/${feature}/use-cases/`).test(importer),
    );
    const importerIsComponent = /(?:^|\/)components\//.test(importer);
    const importerIsApp = /(?:^|\/)app\//.test(importer);

    if (importer.endsWith("/public-api.ts")) {
      const concreteExport = stripComments(source).match(
        /\b(?:LocalStorage|Http|Browser|WebWorker|Gas\w*Client)\w*\b/,
      );
      if (concreteExport) {
        addViolation(
          violations,
          "public-api-exports-concrete-infrastructure",
          importer,
          null,
          "Public API cannot export concrete infrastructure",
        );
      }
    }

    if (filePath.endsWith("/app/comipath-application.ts")) {
      const lineCount = source.split("\n").length;
      if (lineCount > 200) {
        addViolation(
          violations,
          "application-line-limit",
          importer,
          null,
          `Composition root must be 200 lines or fewer (found ${lineCount})`,
        );
      }
      const applicationSource = stripStringLiterals(
        stripComments(source),
      ).toLowerCase();
      const forbiddenResponsibilities = [
        [
          "application-imports-forbidden-concern",
          "route planner",
          /\b(?:planroute|routeplanner|routing)\b/,
        ],
        [
          "application-imports-forbidden-concern",
          "csv parser",
          /\bcsv(?:circle)?codec\b/,
        ],
        [
          "application-imports-forbidden-concern",
          "storage key",
          /\bstorage(?:key|schema)\b/,
        ],
        [
          "application-imports-forbidden-concern",
          "gas protocol",
          /\bgas(?:api|outbox|protocol)\b/,
        ],
      ];
      for (const [ruleId, label, pattern] of forbiddenResponsibilities) {
        if (pattern.test(applicationSource)) {
          addViolation(
            violations,
            ruleId,
            importer,
            null,
            `Composition root must not own ${label}`,
          );
        }
      }
    }

    if (importerIsDomain) {
      const domainSource = stripStringLiterals(
        stripComments(source),
      ).toLowerCase();
      if (
        /\b(document|window|localstorage|fetch|worker|htmlelement|customevent)\b/.test(
          domainSource,
        )
      ) {
        addViolation(
          violations,
          "domain-imports-browser",
          importer,
          null,
          "Domain code cannot depend on browser or infrastructure APIs",
        );
      }
    }

    const vagueParts = fileBase.replace(/\.[^.]+$/, "").split("-");
    for (const part of vagueParts) {
      if (VAGUE_NAME_PARTS.has(part) && !isLegacy) {
        addViolation(
          violations,
          "vague-name",
          importer,
          null,
          `Vague filename segment: ${part}`,
        );
      }
    }
    for (const match of source.matchAll(
      /\b(?:class|interface)\s+([A-Za-z_$][\w$]*)/g,
    )) {
      const name = match[1];
      if (
        [...VAGUE_NAME_PARTS].some((part) =>
          name.toLowerCase().endsWith(part),
        ) &&
        !isLegacy
      ) {
        addViolation(
          violations,
          "vague-name",
          importer,
          null,
          `Vague declaration name: ${name}`,
        );
      }
    }

    for (const item of importsInFile) {
      const imported = item.specifier;
      imports.push({ importer, imported, kind: item.kind });
      if (item.kind === "dynamic-non-literal") {
        addViolation(
          violations,
          "non-literal-dynamic-import",
          importer,
          null,
          "Dynamic import must use a literal module specifier",
        );
        continue;
      }
      const resolvedImport = resolveImportPath(filePath, imported, sourceRoot);
      const importedFeature = featureName(resolvedImport ?? "");
      if (
        feature &&
        importedFeature &&
        feature !== importedFeature &&
        !resolvedImport.endsWith("/public-api.ts") &&
        !resolvedImport.endsWith("/public-api")
      ) {
        addViolation(
          violations,
          "cross-feature-deep-import",
          importer,
          imported,
          "Cross-feature imports must target public-api.ts",
        );
      }
      const importedPath = resolvedImport ?? imported;
      const dependencyPath = `${importedPath} ${imported ?? ""}`;
      const lowerImport = importedPath.toLowerCase();
      if (
        importerIsDomain &&
        /(^|\/)(infrastructure|ui|components)(\/|$)|(^|\/)shared\/(browser|ui)(\/|$)/.test(
          dependencyPath,
        )
      ) {
        addViolation(
          violations,
          "domain-imports-browser",
          importer,
          imported,
          "Domain code cannot depend on browser or infrastructure APIs",
        );
      }
      if (
        importerIsUseCase &&
        !isAllowedUseCaseDependency(importer, resolvedImport, importedFeature)
      ) {
        const ruleId = /(^|\/)ui(\/|$)|(^|\/)components(\/|$)/.test(
          dependencyPath,
        )
          ? "use-case-imports-ui"
          : /(^|\/)infrastructure(\/|$)/.test(dependencyPath)
            ? "use-case-imports-infrastructure"
            : "use-case-imports-concrete-module";
        addViolation(
          violations,
          ruleId,
          importer,
          imported,
          "Use cases depend on contracts, not UI or concrete infrastructure",
        );
      }
      if (
        importer.endsWith("/public-api.ts") &&
        /(^|\/)infrastructure(\/|$)|(?:local-storage|gas-pending-update-delivery|http-|web-worker-)/.test(
          lowerImport,
        )
      ) {
        addViolation(
          violations,
          "public-api-exports-concrete-infrastructure",
          importer,
          imported,
          "Public API cannot export concrete infrastructure",
        );
      }
      if (
        importerIsComponent &&
        /(^|\/)(infrastructure|repository|client|loader|optimizer)(\/|$)|(?:repository|client|loader|optimizer)(?:\.|-)/.test(
          lowerImport,
        )
      ) {
        addViolation(
          violations,
          "component-imports-infrastructure",
          importer,
          imported,
          "Components cannot import repositories, clients, loaders, or optimizers",
        );
      }
      if (
        importerIsApp &&
        !importer.endsWith("/assemble-comipath-application.ts") &&
        /(^|\/)(infrastructure|repository|client|loader|optimizer)(\/|$)|(?:local-storage|gas-|http-|web-worker-|browser-)/.test(
          lowerImport,
        )
      ) {
        addViolation(
          violations,
          "application-imports-concrete-infrastructure",
          importer,
          imported,
          "Only the composition root may assemble concrete infrastructure",
        );
      }
      if (
        importer.endsWith("/comipath-application.ts") &&
        APPLICATION_FORBIDDEN_IMPORTS.some((part) => lowerImport.includes(part))
      ) {
        addViolation(
          violations,
          "application-imports-forbidden-concern",
          importer,
          imported,
          "Application wiring must not import feature implementation details",
        );
      }
      if (
        /legacy|(?:^|\/)app\.js$|(?:^|\/)data-manager(?:\.js|\.ts)?$|(?:^|\/)ui-manager(?:\.js|\.ts)?$|(?:^|\/)config(?:\.js|\.ts)?$|types\/(?:domain|boundary-parsers)(?:\.js|\.ts)?$/.test(
          lowerImport,
        ) ||
        [...LEGACY_FILES].some((legacy) => lowerImport.endsWith(`/${legacy}`))
      ) {
        addViolation(
          violations,
          "deleted-legacy-import",
          importer,
          imported,
          "Deleted legacy module must not be imported",
        );
      }
    }
  }

  const allowlist = loadAllowlist(rootDir, options.allowlistPath);
  violations.push(...validateAllowlist(allowlist, violations));
  const filteredViolations = violations.filter(
    (violation) => !isAllowed(violation, allowlist),
  );
  return {
    files: files.map((file) => relativeName(rootDir, file)),
    imports,
    violations: filteredViolations,
  };
}

export function formatArchitectureViolations(violations) {
  return violations
    .map(
      (item) =>
        `${item.ruleId}: ${item.importer}${item.imported ? ` -> ${item.imported}` : ""} (${item.message})`,
    )
    .join("\n");
}

export function assertWebappArchitecture(options = {}) {
  const result = scanWebappArchitecture(options);
  if (result.violations.length > 0) {
    throw new Error(formatArchitectureViolations(result.violations));
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = assertWebappArchitecture();
    process.stdout.write(
      `Webapp architecture check passed (${result.files.length} files).\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
