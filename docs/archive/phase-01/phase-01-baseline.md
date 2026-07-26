# Public Baseline Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 動作中のComiPath Webappを、旧履歴・Python・実地図・カタログ機能・個人設定を含まない独立ローカル公開候補へ移す。

**Architecture:** WebappのHTML/CSS/JS/TSは挙動を変えず許可リストで移し、通常Viteモードはfictional `demo-v1` だけを配信する。既存テストはカタログ依存だけを除去して復元し、公開GASはactive spreadsheetだけを使う分割ソースと決定的な単一 `Code.gs` で提供する。

**Tech Stack:** Node.js 22.14.0、npm 10.9.2、Vite 8、TypeScript 7、Vitest 4、Playwright 1.61、Lit 3、Google Apps Script V8。

## Global Constraints

- Global constraints and commit protocol are defined in [ComiPath Public Candidate Roadmap](./roadmap.md).
- Preserve current UI behavior and image snapshots; do not implement event/day, CSV, or new management UI in this phase.
- Source snapshot is `/home/tiga/projects/comiket_helper` at `6c1382d2db4189dabe526e4abbb65745d23d86a7`.
- Destination is `/home/tiga/projects/comiket_helper/comipath-web` and is ignored by the parent repository.
- Commit 1 is complete: `5e02231 chore(repo): initialize public webapp workspace`.
- Every remaining commit requires explicit user approval immediately before `git commit`.

---

## Target File Map

```text
comipath-web/
├── .env.example
├── .github/workflows/webapp-ci.yml
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
├── playwright.config.ts
├── vite.config.ts
├── apps/webapp/
│   ├── index.html
│   ├── tsconfig.json
│   ├── css/*.css
│   ├── js/**
│   └── map-bundles/demo-v1/**
├── integrations/gas-spreadsheet/
│   ├── src/config.js
│   ├── src/response.js
│   ├── src/web-api.js
│   ├── src/post-router.js
│   ├── appsscript.json
│   ├── Code.gs
│   └── README.md
├── scripts/
│   ├── audit-public-tree.mjs
│   ├── build-public-gas.mjs
│   └── verify-webapp-build.mjs
└── tests/
    ├── boundary-parsers.test.ts
    ├── map-bundle-selection.test.ts
    ├── map-manifest-loader.test.ts
    ├── settings-component.test.ts
    ├── sync-queue.test.ts
    ├── webapp-contracts.test.mjs
    ├── public-boundary.test.mjs
    ├── gas-contract.test.mjs
    ├── gas-build.test.mjs
    └── e2e/**
```

## Explicit Exclusions

Never copy these paths:

```text
.git/
.clasp.json
.vscode/
CODEX.md
.local-docs/
.superpowers/
apps/catalog-extension/
apps/pebble/
apps/webapp/AGENT.md
apps/webapp/README.md
apps/webapp/assets/maps/
docs/ from comiket_helper
integrations/gas-spreadsheet/catalog-api.js
integrations/gas-spreadsheet/space-normalizer.js
integrations/gas-spreadsheet/config.js
node_modules/
dist/
python/
report/
test-results/
```

### Task 1: Initialize the independent workspace

**Status:** Complete in commit `5e02231`.

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `package-lock.json`

**Interfaces:**
- Produces: a remote-free repository on `feature/public-baseline` with Node dependencies but no application files.

- [x] **Step 1: Initialize an empty Git repository**
- [x] **Step 2: Add public-candidate ignore rules and a clasp-free package manifest**
- [x] **Step 3: Generate the lockfile and run `npm ci --ignore-scripts`**
- [x] **Step 4: Obtain approval and commit `chore(repo): initialize public webapp workspace`**

### Task 2: Import the working Webapp and fictional map bundle

**Files:**
- Create: `apps/webapp/index.html`
- Create: `apps/webapp/tsconfig.json`
- Create: `apps/webapp/css/base.css`
- Create: `apps/webapp/css/buttons.css`
- Create: `apps/webapp/css/forms.css`
- Create: `apps/webapp/css/gallery.css`
- Create: `apps/webapp/css/maps.css`
- Create: `apps/webapp/css/modals.css`
- Create: `apps/webapp/css/sheets.css`
- Create: `apps/webapp/css/stats.css`
- Create: `apps/webapp/css/target.css`
- Create: `apps/webapp/css/tokens.css`
- Create: every tracked file below `/home/tiga/projects/comiket_helper/apps/webapp/js/` at the same destination-relative path.
- Create: `apps/webapp/map-bundles/demo-v1/manifest.json`
- Create: `apps/webapp/map-bundles/demo-v1/demo-east/{source.png,points.json,grid-meta.json,grid.bin}`
- Create: `apps/webapp/map-bundles/demo-v1/demo-west/{source.png,points.json,grid-meta.json,grid.bin}`
- Create: `vite.config.ts`
- Create: `.env.example`
- Create: `scripts/verify-webapp-build.mjs`
- Modify: `package.json`
- Regenerate: `package-lock.json`

**Interfaces:**
- Consumes: current map manifest/parser contracts and exact Webapp source bytes from the source snapshot.
- Produces: `npm run dev:webapp`, `npm run build:webapp`, `npm run verify:webapp:build`, and explicit private-mode commands.

- [ ] **Step 1: Copy the Webapp allowlist without tests or legacy maps**

Copy only the files listed above. Do not recursively copy `apps/webapp` because it also contains `assets/maps`, `AGENT.md`, and Python-dependent documentation.

- [ ] **Step 2: Verify source parity before configuration edits**

Run:

```bash
diff -qr ../apps/webapp/css apps/webapp/css
diff -qr ../apps/webapp/js apps/webapp/js
cmp ../apps/webapp/index.html apps/webapp/index.html
cmp ../apps/webapp/tsconfig.json apps/webapp/tsconfig.json
diff -qr ../apps/webapp/map-bundles/demo-v1 apps/webapp/map-bundles/demo-v1
```

Expected: no output and exit 0.

- [ ] **Step 3: Add the Webapp scripts to `package.json`**

Set `scripts` to:

```json
{
  "typecheck:webapp": "tsc -p apps/webapp/tsconfig.json --noEmit",
  "check:webapp": "node --check apps/webapp/js/app.js && npm run typecheck:webapp",
  "dev:webapp": "vite --host 127.0.0.1",
  "dev:webapp:private": "vite --mode private --host 127.0.0.1",
  "build:webapp": "vite build",
  "build:webapp:private": "vite build --mode private",
  "preview:webapp": "vite preview --host 127.0.0.1",
  "serve:webapp:e2e": "vite --host 127.0.0.1 --port 4173",
  "verify:webapp:build": "node scripts/verify-webapp-build.mjs"
}
```

Regenerate the lockfile with `npm install --package-lock-only --ignore-scripts`.

- [ ] **Step 4: Verify normal and private map selection**

Run:

```bash
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npm run build:webapp:private
```

Expected:

- first three commands exit 0;
- private build exits non-zero with `COMIPATH_PRIVATE_MAP_BUNDLE_DIR is required in private mode`;
- normal `dist/webapp/assets/maps` contains exactly the nine `demo-v1` files.

- [ ] **Step 5: Audit the imported tree**

Run:

```bash
test ! -e apps/webapp/assets/maps
test ! -e python
test ! -e apps/catalog-extension
test ! -e .clasp.json
git diff --check
```

Expected: all exit 0.

- [ ] **Step 6: Stage and request Commit 2 approval**

Proposed message:

```text
feat(webapp): import map bundle based application
```

Do not commit until the user approves the staged diff and verification report.

### Task 3: Restore tests and add a public-boundary audit

**Files:**
- Create: `playwright.config.ts`
- Create: `.github/workflows/webapp-ci.yml`
- Create: `tests/boundary-parsers.test.ts`
- Create: `tests/map-bundle-selection.test.ts`
- Create: `tests/map-manifest-loader.test.ts`
- Create: `tests/settings-component.test.ts`
- Create: `tests/sync-queue.test.ts`
- Create: `tests/e2e/webapp.spec.ts`
- Create: `tests/e2e/webapp.spec.ts-snapshots/*.png`
- Create: `tests/webapp-contracts.test.mjs`
- Create: `tests/public-boundary.test.mjs`
- Create: `scripts/audit-public-tree.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the unchanged Webapp and demo bundle from Task 2.
- Produces: `auditPublicTree(root): { files: string[] }`, unit/type/build audit scripts, and 16 mobile Chromium regressions.

- [ ] **Step 1: Copy existing behavioral tests and make them fail on missing scripts**

Copy all listed tests except `contracts.test.mjs`. Add test scripts to `package.json` only after confirming `npm run test:webapp` is absent and exits non-zero.

- [ ] **Step 2: Split the existing cross-repository contract test**

Create `tests/webapp-contracts.test.mjs` from the source `tests/contracts.test.mjs` and remove only tests that read:

```text
apps/catalog-extension/**
integrations/gas-spreadsheet/catalog-api.js
```

Change README assertions to read root `README.md` only in Task 5; until then, move documentation assertions into Task 5 rather than weakening them.

- [ ] **Step 3: Write the failing public-boundary test**

```js
import assert from "node:assert/strict";
import { test } from "vitest";
import { auditPublicTree } from "../scripts/audit-public-tree.mjs";

test("tracked public tree excludes private projects and credentials", () => {
  const result = auditPublicTree(new URL("../", import.meta.url));
  assert.ok(result.files.includes("apps/webapp/index.html"));
  assert.ok(result.files.includes("apps/webapp/map-bundles/demo-v1/manifest.json"));
});
```

Run `npx vitest run tests/public-boundary.test.mjs` and expect failure because `audit-public-tree.mjs` does not exist.

- [ ] **Step 4: Implement the minimal tree auditor**

`auditPublicTree` must recursively inspect the repository excluding `.git`, `node_modules`, `dist`, and Playwright outputs. It must throw when it sees a forbidden path prefix. Content scanning applies to runtime, integration, build, workflow, and user-facing setup files; tests, plan documents, and the auditor's own pattern definitions are excluded to avoid treating test fixtures as credentials. The runtime scan rejects deployed GAS URLs, `catalogSpreadsheetId`, and non-empty `scriptId` values.

Public API:

```js
export function auditPublicTree(rootUrl) {
  return { files: Object.freeze(sortedRelativeFiles) };
}
```

Run `npx vitest run tests/public-boundary.test.mjs` and expect PASS.

- [ ] **Step 5: Restore package verification scripts**

Add:

```json
{
  "test:webapp": "vitest run --root . tests/webapp-contracts.test.mjs tests/public-boundary.test.mjs tests/boundary-parsers.test.ts tests/map-bundle-selection.test.ts tests/map-manifest-loader.test.ts tests/settings-component.test.ts tests/sync-queue.test.ts",
  "verify:webapp": "npm run test:webapp && npm run check:webapp && npm run build:webapp && npm run verify:webapp:build",
  "test:e2e": "playwright test",
  "test:e2e:update": "playwright test --update-snapshots"
}
```

- [ ] **Step 6: Run full Webapp regression**

```bash
npm run verify:webapp
npm run test:e2e
```

Expected: all Vitest tests, typecheck, build contract, and 16 E2E tests pass. Existing snapshots must not be updated to force a pass.

- [ ] **Step 7: Stage and request Commit 3 approval**

```text
test(webapp): restore contract and mobile coverage
```

### Task 4: Add sanitized public GAS and deterministic `Code.gs`

**Files:**
- Create: `integrations/gas-spreadsheet/src/config.js`
- Create: `integrations/gas-spreadsheet/src/response.js`
- Create: `integrations/gas-spreadsheet/src/web-api.js`
- Create: `integrations/gas-spreadsheet/src/post-router.js`
- Create: `integrations/gas-spreadsheet/appsscript.json`
- Create: `integrations/gas-spreadsheet/Code.gs`
- Create: `scripts/build-public-gas.mjs`
- Create: `tests/gas-contract.test.mjs`
- Create: `tests/gas-build.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: current Webapp requests `{ action: "sale", sheetName, space, undo }` and GET query `action=getSheets` or `sheets=a,b`.
- Produces: GAS globals `doGet(e)`, `doPost(e)`, `doPostSale(data)`, `successResponse(payload)`, `errorResponse(message,payload)`, `jsonResponse(value)`.

- [ ] **Step 1: Write failing GAS contract tests**

Use `node:vm` with fake `SpreadsheetApp` and `ContentService`. Cover:

- `getSheets` returns all sheet names and spreadsheet title;
- data GET returns `wantToBuy`, `spreadsheetTitle`, and per-row `sheetName`;
- sale POST updates only the requested `sheetName + space`;
- unknown action returns `{ ok: false, status: "error" }`;
- source contains no `openById`, `catalogSpreadsheetId`, `doPostCatalogSpace`, or `makeCircleClean`.

Run `npx vitest run tests/gas-contract.test.mjs` and expect missing source failures.

- [ ] **Step 2: Implement minimal sanitized GAS sources**

`src/config.js` must contain only:

```js
var spreadsheetConfig = {
  spaceColumnName: "space",
  saleStatusColumnName: "isSale",
  purchasedStatusText: "x",
};
```

`doGet` must use `SpreadsheetApp.getActiveSpreadsheet()`. With no `sheets` parameter it returns an empty `wantToBuy` list instead of guessing a personal default sheet.

- [ ] **Step 3: Write the failing deterministic build test**

The test imports `buildPublicGas()` and asserts that two generated strings are identical and equal to tracked `Code.gs`. Run it before creating the builder and expect a missing module failure.

- [ ] **Step 4: Implement `buildPublicGas`**

```js
export function buildPublicGas({ repositoryRoot }) {
  const order = ["config.js", "response.js", "web-api.js", "post-router.js"];
  return order
    .map((name) => readFileSync(resolve(repositoryRoot, "integrations/gas-spreadsheet/src", name), "utf8").trimEnd())
    .join("\n\n") + "\n";
}
```

CLI behavior:

- no flag: write `integrations/gas-spreadsheet/Code.gs`;
- `--check`: exit non-zero if tracked `Code.gs` differs, without writing.

- [ ] **Step 5: Generate and verify GAS**

Add scripts:

```json
{
  "build:gas": "node scripts/build-public-gas.mjs",
  "test:gas": "vitest run tests/gas-contract.test.mjs tests/gas-build.test.mjs",
  "verify:gas": "node scripts/build-public-gas.mjs --check && npm run test:gas",
  "verify": "npm run verify:webapp && npm run verify:gas"
}
```

Run:

```bash
npm run build:gas
npm run verify:gas
npm run verify
npm run test:e2e
```

- [ ] **Step 6: Stage and request Commit 4 approval**

```text
feat(gas): add single-file spreadsheet integration
```

### Task 5: Write public setup and boundary documentation

**Files:**
- Create: `README.md`
- Create: `integrations/gas-spreadsheet/README.md`
- Modify: `.env.example`
- Modify: `tests/webapp-contracts.test.mjs`
- Modify: `tests/public-boundary.test.mjs`

**Interfaces:**
- Consumes: commands and behavior implemented in Tasks 2–4.
- Produces: setup instructions that do not claim unsupported CSV/event-day behavior.

- [ ] **Step 1: Restore failing README contract tests**

Assert root README documents:

- current GAS sheet columns `space,priority,isSale,account,tweet,memo`;
- partial offline support and no Service Worker guarantee;
- pin preview and route comparison;
- normal demo bundle and external private bundle boundary;
- absence of Python generation and `clasp push` instructions;
- CSV/event-day management is planned, not yet supported in Phase 1.

Run the two contract test files and expect failure because `README.md` does not exist.

- [ ] **Step 2: Write root README and GAS README**

Document exact commands:

```bash
npm ci
npm run dev:webapp
npm run verify
npm run test:e2e
npm run build:gas
```

Explain that users paste the tracked single `Code.gs` into their own active spreadsheet GAS project. Do not document `.clasp.json`, IDs, or deployed URLs.

- [ ] **Step 3: Document the private map environment variable**

`.env.example` must contain only:

```dotenv
# Private mode only: absolute path to an external map bundle.
COMIPATH_PRIVATE_MAP_BUNDLE_DIR=/absolute/path/to/private-map-bundle
```

- [ ] **Step 4: Run final phase verification and audit**

```bash
npm run verify
npm run test:e2e
git diff --check
git remote -v
git ls-files
git grep -n -I -E 'catalogSpreadsheetId|"scriptId"[[:space:]]*:|script\.google\.com/macros/s/[A-Za-z0-9_-]+' -- apps integrations scripts README.md .env.example package.json vite.config.ts .github ':!scripts/audit-public-tree.mjs'
```

Expected: verification passes; remote and grep have no output; tracked paths match the target map.

- [ ] **Step 5: Prove old Git history is absent**

```bash
git cat-file -e 6c1382d2db4189dabe526e4abbb65745d23d86a7^{commit}
```

Expected: non-zero with unknown object.

- [ ] **Step 6: Stage and request Commit 5 approval**

```text
docs(repo): add public setup guidance
```

### Task 6: Phase handoff without remote operations

**Files:** None.

**Interfaces:**
- Produces: a verified local feature branch ready for user review.

- [ ] **Step 1: Run fresh full verification**

```bash
npm ci
npm run verify
npm run test:e2e
git status --short --branch
git log --oneline --decorate --reverse
git remote -v
```

- [ ] **Step 2: Review the five-commit history**

Expected messages in order:

```text
chore(repo): initialize public webapp workspace
feat(webapp): import map bundle based application
test(webapp): restore contract and mobile coverage
feat(gas): add single-file spreadsheet integration
docs(repo): add public setup guidance
```

- [ ] **Step 3: Present user handoff**

Report tests, tracked file audit, absence of remote, and any warnings. Do not create `main`, remote, push, PR, or merge unless the user separately approves the exact operation.
