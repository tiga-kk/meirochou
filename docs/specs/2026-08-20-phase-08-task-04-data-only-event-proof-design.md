# Phase 8 Task 4: Data-only Event Addition Proof Design

## Goal

Phase 8 Task 1〜3で分離したcontractを実際につなぎ、**production application codeを変更せず、event registry entryとstrict map bundleのデータだけで第二のeventを既存runtimeへ投入できること**を、架空event fixtureで証明する。

このTaskはC109等の実イベント追加ではない。実サイトへ架空eventを表示せず、production registryとproduction public map bundle treeを変更しない。

## Verified dependency state

Task 4の設計時点で次をGitHub上のcurrent stateから確認した。

- `tiga-kk/meirochou/main` は Phase 8 Task 1 generic strict event map contractを含む。
- production `apps/webapp/events/manifest.json` はC108のみを登録している。
- strict event manifestは任意のnon-empty area数、`prefixes`、`labels`、strict relative asset pathsを受理する。
- missing / `mapBundleContract: "event"` はstrict contract、`"legacy"`のみlegacy contractとして扱われる。
- `vite.config.ts` はnormal modeで `apps/webapp/map-bundles/` 以下を自動探索する。そのため架空fixtureをpublic bundle treeへ置くと、registry未登録でもproduction build artifactへ混入する。
- `tiga-kk/meirochou_wrapper/main` は Phase 8 Task 3 `build-event` とreview correctionを含み、staging packageとして `event-registry-entry.json` と `map-bundle/` を生成できる。

Task 4はTask 3のgeneratorを再実装しない。Task 3が「staging packageを正しく生成できる」を証明し、Task 4は「そのcontract形の第二eventをmeirochou runtimeがapplication code変更なしで消費できる」を証明する。

## Chosen design

### 1. Fixtureはtest-only staging packageとして置く

架空event IDは `C999` とする。

配置先:

```text
tests/fixtures/phase-08-data-only-event/C999/
  event-registry-entry.json
  map-bundle/
    manifest.json
    east/
      map.svg
      points.json
      grid-meta.json
      grid.bin
```

これはTask 3 staging outputと同じ外形である。

fixtureを次へは置かない。

```text
apps/webapp/events/manifest.json
apps/webapp/map-bundles/C999/
```

理由:

- production registryへ入れると実サイトのevent選択肢に架空eventが出る。
- public map-bundle treeへ置くだけでもViteがproduction artifactへコピーする。
- Task 4の目的はruntime contract proofであり、架空dataをproduction artifactへ混ぜることではない。

### 2. Fixture metadata

`event-registry-entry.json`:

```json
{
  "eventId": "C999",
  "displayName": "Fixture Event C999",
  "mapBundle": "../maps/C999/manifest.json",
  "mapBundleContract": "event",
  "days": [
    {
      "dayId": "day1",
      "displayName": "Fixture Day 1",
      "date": "2099-01-01"
    }
  ]
}
```

`map-bundle/manifest.json`:

```json
{
  "schemaVersion": 1,
  "eventId": "C999",
  "bundleVersion": "fixture-c999-v1",
  "areas": [
    {
      "areaId": "east",
      "displayName": "Fixture East",
      "metersPerPixel": 0.125,
      "prefixes": ["東"],
      "labels": ["A", "B"],
      "assets": {
        "svg": "./east/map.svg",
        "points": "./east/points.json",
        "gridMeta": "./east/grid-meta.json",
        "grid": "./east/grid.bin"
      }
    }
  ]
}
```

Web `areaId` とpathdata/OCR internal `map_id` が別概念であることを維持するため、fixture route assetsのinternal map IDは `fixture-map` とする。

```text
strict web areaId = east
route asset map_id = fixture-map
```

### 3. Route asset fixtureは小さく、strict contractだけを表現する

fixture image dimensionsは48x32 pixel相当、cell sizeは8、gridは6x4 = 24 bytesとする。

`points.json`はTask 3 publication後のshapeを使う。

- `schema_version: 1`
- `map_id: "fixture-map"`
- `image: {"width": 48, "height": 32}`
- `image.path`は存在しない。
- `grid.cell_size = 8`, `cols = 6`, `rows = 4`
- identifier `A`, number `01` のpointを1件以上含む。
- identifier `B`, number `02` のpointを含めてもよいが、fixtureは必要最小限にする。
- 全published point identifierはnon-empty string。
- portalはgrid bounds内に置く。

`grid-meta.json`はTask 3 / existing C108 web-export contractと同じmetadata名を使う。

```json
{
  "schema_version": 1,
  "map_id": "fixture-map",
  "width": 48,
  "height": 32,
  "cell_size": 8,
  "cols": 6,
  "rows": 4,
  "cell_values": {
    "blocked": 0,
    "normal": 1,
    "crowded": 2
  },
  "byte_order": "unsigned_uint8",
  "layout": "row-major",
  "grid_file": "grid.bin"
}
```

`grid.bin`は24 bytes exactlyで、各byteは0/1/2のいずれか。fixtureを単純化するためall-normal (`1`) でもよい。

`map.svg`はvalid standalone SVGでviewBox `0 0 48 32`を持ち、外部image/referenceを使わない。Task 4はSVG renderer再検証Taskではないため、renderer algorithmやvisual snapshotを再実装しない。

### 4. Integration proofは既存production adaptersを通す

新規test:

```text
tests/phase-08-data-only-event-addition.test.ts
```

このtestだけがfixture-specific glueを持つ。application側へC999分岐を追加してはいけない。

Test flow:

1. actual production `apps/webapp/events/manifest.json` を読み込む。
2. fixture `event-registry-entry.json` を読み込む。
3. test内でのみ `events: [...production.events, fixtureEntry]` を作る。
4. `parseEventRegistry()` で合成registryを検証する。
5. C999 entryを取得し、`resolveEventMapManifestUrl()` で `http://fixture.test/assets/maps/C999/manifest.json` を得る。
6. filesystem-backed test fetcherでfixture manifestを返し、`loadRuntimeMapBundleManifestFromUrl()` を呼ぶ。
7. runtime manifestが既存generic adapterだけでC999を構築したことをassertする。
8. `runtimeMapAreaCatalog.replaceMapAreas(runtimeManifest.areas)` を使ってproduction normalizationを通す。
9. catalogから `east` を取得し、`HttpRouteMapAssetsLoader` に同じfilesystem-backed fetcherを渡す。
10. actual fixture `points.json`, `grid-meta.json`, `grid.bin` をHTTP responseとして読み、production route asset parser/loaderを通す。
11. finally / afterEachで `runtimeMapAreaCatalog.replaceMapAreas([])` に戻す。

Assertions:

- composed registry contains existing C108 and C999.
- C999 uses `mapBundleContract === "event"`.
- manifest URL is exactly `http://fixture.test/assets/maps/C999/manifest.json`.
- runtime `eventId === "C999"`, `displayName === "Fixture Event C999"`, `bundleVersion === "fixture-c999-v1"`.
- exactly one runtime area `east`.
- prefixes `東`, labels `A/B`, metersPerPixel `0.125` survive.
- runtime SVG/points/grid URLs are rooted under `/assets/maps/C999/east/`.
- raw fixture strict manifest area ID is `east` while raw `points.json` / `grid-meta.json` map_id is `fixture-map`.
- `points.json.image.path` is absent.
- route loader returns at least one point.
- grid metadata is48x32, cell size8, 6x4.
- `gridBytes.length === cols * rows === 24`.
- every grid byte is one of0/1/2.
- all referenced fixture files exist.

### 5. File-backed fetcher is test code only

Do not add a reusable production fetch abstraction.

The test helper maps these URLs only:

```text
/assets/maps/C999/manifest.json
/assets/maps/C999/east/points.json
/assets/maps/C999/east/grid-meta.json
/assets/maps/C999/east/grid.bin
```

For JSON files it returns `new Response(fileBytes, {status: 200, headers: {"Content-Type": "application/json"}})`; for `grid.bin`, `application/octet-stream`。

Unknown URLは404 responseにする。これによりtestが誤ったasset URLを生成してもfixture lookupのfallbackで誤魔化さない。

SVGは`HttpRouteMapAssetsLoader`の入力ではないためfetcherへ特別接続しない。fixture file existenceとmanifest URLをassertすればよい。

### 6. Data-only guaranteeはdiff gateで証明する

Task 4 implementationではapplication production code変更を禁止する。

必須no-diff paths:

```text
apps/webapp/js/**
vite.config.ts
package.json
package-lock.json
integrations/**
.github/workflows/**
```

production event dataも変更しない。

```text
apps/webapp/events/manifest.json
apps/webapp/map-bundles/C108/**
apps/webapp/map-bundles/demo-v1/**
```

Task 4で許可するproduction外の変更は原則:

```text
A tests/phase-08-data-only-event-addition.test.ts
A tests/fixtures/phase-08-data-only-event/C999/**
```

必要ならTask 4完了記録のdocsだけを追加/更新してよい。

## Alternatives rejected

### A. C999をproduction registryへ登録する

最も直接的だが、架空eventが実サイトへ露出する。Task 4はproduction event追加Taskではないため不採用。

### B. `apps/webapp/map-bundles/C999`だけ追加し、registryには入れない

runtime selectionからは隠せるが、normal Vite buildがpublic bundle treeを全探索するためproduction artifactへfixtureがコピーされる。証明のためだけのpublic artifact汚染になるので不採用。

### C. E2Eで全networkをroute fulfillしてC999画面を起動する

可能だが、GAS/catalog/event-day screen stateまでfixture化する必要があり、Task 1ですでに検証済みのevent transition範囲を重複してテストする。Task 4の目的はmap/event data contractのhandoff proofなので過剰。

## Non-goals

- C109や次回コミケのreal data追加。
- production registry変更。
- production public bundle追加。
- application TypeScript変更。
- Vite/plugin変更。
- wrapper/pathdata/ocr code変更。
- cross-file validator commandの新設。
- schemaVersion bump。
- legacy demo strict化。
- route algorithm / ALNS / grid semantics変更。
- browser visual/E2E acceptance。
- Task 5 application refactor。
- Task 6 onboarding。

## Verification strategy

Focused:

```bash
npx vitest run --root . tests/phase-08-data-only-event-addition.test.ts
npx vitest run --root . tests/event-registry.test.ts tests/boundary-parsers.test.ts tests/map-bundle-selection.test.ts
```

Full automated:

```bash
npm run verify
```

Task 4はproduction runtime/build inputsを変更しないため、通常のfull Playwright E2Eはcompletion gateにしない。もしTask 4実装中にproduction path変更が必要になった場合は設計逸脱として停止し、Task 4を拡張せずbrowser reviewへ戻す。

Scope proof:

```bash
git diff --check
git diff --name-status TASK_START_SHA..HEAD
git diff --name-only TASK_START_SHA..HEAD -- apps/webapp/js vite.config.ts package.json package-lock.json integrations .github/workflows
git diff --name-only TASK_START_SHA..HEAD -- apps/webapp/events/manifest.json apps/webapp/map-bundles/C108 apps/webapp/map-bundles/demo-v1
git grep -n "C999" -- apps/webapp/js || true
```

最後の二つの`git diff --name-only`はempty、production TSの`C999` grepも0件でなければならない。

## Acceptance

Task 4は次をすべて満たした時だけbrowser reviewへ進める。

1. test-only C999 staging fixtureがTask 3 output外形を持つ。
2. fixture registry entryをactual production registryへtest内合成したpayloadが`parseEventRegistry()`を通る。
3. C999 strict manifestがexisting runtime map loaderを通る。
4. runtime map area normalizationがC999の一areaを構築できる。
5. existing `HttpRouteMapAssetsLoader`がfixture points/meta/gridを読み込める。
6. area ID `east` とinternal `map_id = fixture-map` の違いが保たれる。
7. published fixtureに`points.json.image.path`がない。
8. grid byte count / valuesがmetadataと一致する。
9. production registryはC108のみのまま。
10. production public map bundlesは変更されない。
11. `apps/webapp/js/**`、Vite、package、workflow変更が0件。
12. focused testsと`npm run verify`がgreen。
13. C109 / Task 5 / onboardingを先取りしない。

Task 4の意味は「C999をproductionへ追加した」ではなく、**C999を追加するために必要なのはcontract-conforming dataだけであり、application implementation変更は不要であることを現行runtimeで実証した**、である。
