# Phase 8 Task 1: Generic Event Map Contract Design

## Goal

production event map bundleからC108固有runtime metadataとevent判定を除去し、任意eventのmanifestとevent registry entryだけからruntime map areaを構築できるようにする。

このTaskはbundle生成pipelineや複数production eventのregistry統合検証までは行わない。それらは後続Taskで扱う。

## Current problem

現在のproduction contractには三つのC108依存がある。

1. `http-map-manifest-loader.ts` が `C108_AREA_METADATA` に `prefixes` / `labels` を保持する。
2. `loadRuntimeMapBundleManifestFromUrl()` が `eventId === "C108"` の場合だけstrict production manifestを使い、それ以外をlegacy contractへ送る。
3. `parseEventMapBundleManifest()` がareasをexactly 4件に固定する。

一方、既存dev/E2Eは`demo-v1`のlegacy bundleを継続利用している。E2Eでは`isDevDemoEnabled()`ではない通常起動でもevent registryだけをdemoへ差し替えるため、`demoEnabled`だけをlegacy判定に使うと既存fixtureを壊す。

## Chosen design

### 1. Production event bundleをgeneric strict contractにする

`EventMapAreaManifest`へ次を必須追加する。

```ts
readonly prefixes: readonly string[];
readonly labels: readonly string[];
```

production manifest例:

```json
{
  "schemaVersion": 1,
  "eventId": "C999",
  "bundleVersion": "c999-v1",
  "areas": [
    {
      "areaId": "east",
      "displayName": "東ホール",
      "metersPerPixel": 0.1,
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

`areas`は1件以上であればよく、4件固定を廃止する。`areaId` unique、positive `metersPerPixel`、non-empty unique `prefixes` / `labels`、strict asset path規則は維持する。

### 2. Event display nameはregistryを正本にする

production map bundleへtop-level `displayName`は追加しない。eventの表示名は既にevent registryの責務なので、strict runtime adapterへregistry entryの`displayName`を渡す。

これによりmap asset bundleとevent registryで同じ表示名を二重管理しない。

### 3. strict/legacy契約種別をevent名ではなくregistry metadataで明示する

`EventRegistryEntryV1`へtransition用のoptional fieldを追加する。

```ts
readonly mapBundleContract?: "event" | "legacy";
```

意味:

- 未指定または`"event"`: generic strict production event bundle
- `"legacy"`: 既存demo fixture contract

`parseEventRegistry()`は上記2値以外をrejectする。production `apps/webapp/events/manifest.json` のC108 entryにはfieldを追加しない。未指定=event strictをdefaultとする。

既存legacy demoだけ次へ`mapBundleContract: "legacy"`を付ける。

- `assemble-comipath-application.ts`内のbuilt-in demo registry entry
- `tests/e2e/fixture-registry.ts`の`DEMO_EVENT_REGISTRY`

これにより`eventId === "C108"`、`eventId === "demo-v1"`、URL文字列判定、payload shape自動判別のいずれも不要になる。

### 4. Runtime loader

`loadRuntimeMapBundleManifestFromUrl()`はmanifest URLとregistry event entryを受け取る。

```ts
loadRuntimeMapBundleManifestFromUrl(
  manifestUrl,
  event,
  options,
)
```

分岐は`event.mapBundleContract`だけで行う。

- `legacy`: existing `loadMapBundleManifestFromUrl()`
- otherwise: `loadEventMapBundleManifestFromUrl()` → generic adapter

strict pathではparsed bundle `eventId` とregistry `eventId` が一致しなければthrowする。

strict runtime manifestは:

- `eventId`: bundle eventId
- `displayName`: registry displayName
- `bundleVersion`: bundle bundleVersion
- area `prefixes` / `labels`: bundle area metadata
- asset URL: manifest URL基準のabsolute URL

legacy pathは既存demo contractをそのまま読み、schema fallbackは行わない。

### 5. C108 migration

`apps/webapp/map-bundles/C108/manifest.json`へ現在`C108_AREA_METADATA`にある同一`prefixes` / `labels`を移す。

route semantics、asset file、metersPerPixelは変更しないため`bundleVersion: "c108-v1"`は維持する。navigation snapshotをmetadata移動だけで不要にinvalidateしない。

### 6. Legacy demo

`apps/webapp/map-bundles/demo-v1/manifest.json`は変更しない。legacy contract統一はこのTaskではYAGNIとする。

E2E fixtureはmanifestをstrictへ偽装せず、registry entryへ`mapBundleContract: "legacy"`を明示して既存assetをそのまま使う。

## Non-goals

- wrapperでのmanifest生成
- C109等のproduction bundle追加
- production registryへ二つ目のevent追加
- cross-file bundle integrity command
- schemaVersion bump
- route algorithm / ALNS / map asset parser変更
- demo-v1 bundle format変換
- `event-day-contracts.ts`と`application-contract-types.ts`の広範囲統合

## Acceptance

- production strict parserが1件以上の任意area数を受理する。
- missing/empty/duplicate `prefixes` / `labels`を拒否する。
- registry parserが`mapBundleContract`の`event`/`legacy`だけを受理し、未指定をstrict扱いできる。
- C108 runtime loaderにC108固有metadata constant/eventId special caseが存在しない。
- fictitious `C999` + non-C108 areaをstrict loaderでruntime manifestへ変換できる。
- registry eventIdとstrict bundle eventId mismatchを拒否する。
- production C108 registryはfield未指定のままstrict contractを使う。
- built-in demoとE2E demo registryだけが`legacy`を明示し、既存demo manifestは変更しない。
- current C108 asset testsが新manifestで通る。
- production TypeScriptにevent固有area identifier/label listを新規ハードコードしない。
