# Phase 5B Task 3: Public C108 Assets and Validation

**Status:** Complete (C108 assets and Task 3 validation passed; existing UI visual snapshot maintenance is separate)
**Depends on:** Phase 5B Task 2  
**Commit candidate:** `feat(maps): add validated c108 map assets`

## Goal

Task 1で確定した4地図の完成成果物を公開bundleへ配置し、SVG安全性、points、grid metadata、grid binary、座標対応を自動検査する。

## User-visible result

C108の4地図assetがproduction buildに含められる状態になる。event registryへはまだ登録しないため、通常画面には表示されない。

## Required reads

- `docs/plans/phase-05b/c108-input-inventory.md`
- Task 2のmanifest contract
- 既存`points.json` parser
- 既存`grid-meta.json` parser
- 既存route plannerのgrid value contract
- `scripts/verify-webapp-build.mjs`
- `scripts/audit-public-tree.mjs`
- `tests/deployment-build.test.mjs`
- `tests/public-boundary.test.mjs`

## Files allowed to change

- `apps/webapp/map-bundles/C108/**`
- `vite.config.ts`
- `biome.json`（公開地図バイナリ・生成SVG/JSONをformatter対象外にする最小設定）
- `scripts/verify-webapp-build.mjs`
- `scripts/audit-public-tree.mjs`
- `tests/c108-map-assets.test.ts`
- `tests/public-boundary.test.mjs`
- `tests/deployment-build.test.mjs`
- `tests/map-bundle-selection.test.ts`
- `docs/architecture/public-boundary.md`
- `package.json`の既存script列への検証command追加
- Task実績欄
- `docs/status/progress.md`

## Files forbidden to change

- `/maps/C108/**`
- event registry
- app UI
- route optimization
- storage schema
- package dependencies
- Python

## Public directory contract

```text
apps/webapp/map-bundles/C108/
├── manifest.json
├── <areaId-1>/
│   ├── map.svg
│   ├── points.json
│   ├── grid-meta.json
│   └── grid.bin
├── <areaId-2>/...
├── <areaId-3>/...
└── <areaId-4>/...
```

`manifest.json`:

```json
{
  "schemaVersion": 1,
  "eventId": "C108",
  "bundleVersion": "<content-derived-version>",
  "areas": []
}
```

`bundleVersion`は4地図の公開成果物が変わったときに変更する固定文字列とする。timestampを自動生成しない。

## TDD procedure

- [x] **Step 1: asset欠落で失敗するtestを書く**

`tests/c108-map-assets.test.ts`を作り、inventoryの4 areaについて次の4ファイルが存在することを期待する。

```ts
expect(await fileExists(`${root}/${areaId}/map.svg`)).toBe(true);
expect(await fileExists(`${root}/${areaId}/points.json`)).toBe(true);
expect(await fileExists(`${root}/${areaId}/grid-meta.json`)).toBe(true);
expect(await fileExists(`${root}/${areaId}/grid.bin`)).toBe(true);
```

- [x] **Step 2: REDを確認する**

```bash
npx vitest run tests/c108-map-assets.test.ts
```

Expected: public assetが未配置でFAIL。

- [x] **Step 3: 完成成果物をコピーする**

Task 1 inventoryのprivate pathからpublic directoryへ、次の名前でコピーする。

```text
map.svg
points.json
grid-meta.json
grid.bin
```

コピー後、public fileだけを変更する。private sourceを編集しない。

- [x] **Step 4: manifestを作る**

Task 2 parserを満たす4 area manifestを作る。
area順はTask 1 inventoryの`order`に一致させる。

- [x] **Step 5: SVG安全性testを書く**

各`map.svg`について次を拒否する検査を実装する。

- `<script`
- `<foreignObject`
- `onload=`, `onclick=`など`on*` event attribute
- `javascript:`
- `data:` URL
- `http://`, `https://`, protocol-relative `//`
- 外部fileを指す`href`または`xlink:href`
- XML external entity宣言
- `<iframe`, `<object`, `<embed`
- repository外絶対path文字列

SVGは静的形状、text、style、内部fragment参照だけを許可する。
style内の外部`url(...)`を拒否する。

- [x] **Step 6: pointsとgrid metadataの構造testを書く**

4 areaすべてについて次を検証する。

- points JSONが既存parserで読める。
- circle identifier/spaceが空ではない。
- center coordinatesがfinite number。
- 同一area内のspaceが重複しない。
- grid width、height、cell size、originまたは既存metadata fieldが有効。
- `grid.bin`のbyte数が`width * height`と一致する。
- grid valueが許可値だけで構成される。
- circle endpointがgrid範囲内。
- endpointがblocked cellではない。
- SVG viewBoxとpoints/grid座標範囲が矛盾しない。

既存形式が1 byte/cellでない場合は、既存decoderの正確なbyte length契約をtestへ使う。

- [x] **Step 7: 到達可能性testを書く**

各areaでwalkable endpointを1つ選び、weighted 4-neighbor探索により全circle endpointの到達可能性を確認する。
到達不能がある場合はtestを無理に通さず、次のどちらかをTask実績へ記録する。

```text
input defect: endpointまたはgridを再生成する
intentional split: area内で独立componentとして扱う根拠をユーザー確認する
```

ユーザー確認なしにEuclidean distanceへfallbackしない。

- [x] **Step 8: public boundary testを拡張する**

tracked/public/build対象から次を拒否する。

```text
/maps/
/private/
/work/
/output/
.py
.pyc
__pycache__
元地図の既知ファイル名
ローカル絶対path
```

binary assetの中身をtextとしてsnapshotへ出さない。

- [x] **Step 9: build verifierを拡張する**

production build後に次を検査する。

- C108 manifestが存在する。
- 4 area × 4 assetが存在する。
- SVGのcontent typeを静的配信で解決できる拡張子である。
- binaryが0 byteでない。
- private inputがdistへ存在しない。

- [x] **Step 10: focused検証を実行する**

```bash
npx vitest run tests/c108-map-assets.test.ts tests/public-boundary.test.mjs tests/deployment-build.test.mjs
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
node scripts/audit-public-tree.mjs
git diff --check
```

Expected: PASS。

## Acceptance criteria

- public C108 bundleに4 areaがある。
- 各areaに4つの標準fileがある。
- manifestはTask 2 parserを通る。
- SVG危険要素と外部参照を拒否する。
- points、grid metadata、grid byte数、endpoint、座標範囲を検査する。
- 到達不能を黙ってfallbackしない。
- private input、Python、元地図、中間画像を追跡していない。
- production event registryとUIを変更していない。

## Review checklist

- `git ls-files apps/webapp/map-bundles/C108`が期待する17ファイルだけか。
- `git ls-files maps`が空か。
- SVG内にbase64埋め込み画像や外部fontがないか。
- manifestと実directoryのareaIdが一致するか。
- day別asset複製がないか。
- testが実地図の内容全文をsnapshotへ保存していないか。
- grid.binをGit LFS前提にしていないか。

## Completion record

```text
Bundle version: c108-v1
Area IDs: e456, e7, s12, w12
Tracked public files:
- apps/webapp/map-bundles/C108/manifest.json
- apps/webapp/map-bundles/C108/e456/{map.svg, points.json, grid-meta.json, grid.bin}
- apps/webapp/map-bundles/C108/e7/{map.svg, points.json, grid-meta.json, grid.bin}
- apps/webapp/map-bundles/C108/s12/{map.svg, points.json, grid-meta.json, grid.bin}
- apps/webapp/map-bundles/C108/w12/{map.svg, points.json, grid-meta.json, grid.bin}
SVG validation result: Passed (No scripts, foreignObjects, event handlers, external URLs/XXE; SVG MIME image/svg+xml verified).
Grid/points validation result: Passed for all four areas (parser, unique identifier + number, coordinate bounds, grid byte count/value, portal bounds/walkability).
Reachability result per area: Passed for e456, e7, s12, w12.
Build audit result: Passed (production build, 26 byte-identical assets across demo-v1 and unregistered C108, public boundary audit, SVG MIME image/svg+xml).
Map-independent infrastructure result: Passed (runtime event registry selection is separated from build copy for all public map bundles in vite.config.ts, scripts/verify-webapp-build.mjs, and tests).
E2E result: 25/31 passed; 6 existing mobile visual snapshot mismatches remain in demo UI flows (1-2px height or small pixel diffs). Snapshot updates are deferred to a separate UI maintenance change and are not part of Task 3.
Known limitations: C108 is intentionally not registered in the production event registry, so it is directly build-published but not exposed as a production UI event.
Proposed commit message: feat(maps): add validated c108 map assets
```
