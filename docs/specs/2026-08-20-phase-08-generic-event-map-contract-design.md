# Phase 8 Task 1: Generic Event Map Contract Design

## Goal

production event map bundleからC108固有runtime metadataとevent判定を除去し、任意eventのmanifestだけからruntime map areaを構築できるようにする。

このTaskはbundle生成pipelineや複数event registry統合検証までは行わない。それらは後続Taskで扱う。

## Current problem

現在のproduction contractには二つのC108依存がある。

1. `http-map-manifest-loader.ts` が `C108_AREA_METADATA` に `prefixes` / `labels` を保持する。
2. `loadRuntimeMapBundleManifestFromUrl()` が `eventId === "C108"` の場合だけstrict production manifestを使い、それ以外をlegacy fixture contractへ送る。

さらに `parseEventMapBundleManifest()` はareasをexactly 4件に固定しており、C108以外のeventを表現できない。

## Chosen design

### Production event bundle

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

### Event display name

production map bundleへ新しいtop-level `displayName`は追加しない。eventの表示名は既にevent registryの責務であるため、runtime adapterへregistry entryの`displayName`を渡す。

これによりmap asset bundleとevent registryで同じ表示名を二重管理しない。

### Strict production vs legacy demo

production eventとdev demoをschema自動判別しない。malformed production payloadをlegacyとして誤受理する余地を作らないためである。

- normal registry event: generic strict event bundle loader
- `isDevDemoEnabled(...) === true`: existing legacy `MapBundleManifestV1` loader

この分岐はcomposition rootで明示する。loader内部の`eventId === "C108"`分岐は削除する。

### Runtime adapter

strict production loaderはregistry entryの`eventId` / `displayName`を受け取る。

- parsed bundle `eventId` とregistry `eventId` が一致しなければthrowする。
- runtime `displayName` はregistry `displayName`を使う。
- areaの`prefixes` / `labels`はmanifestからそのまま渡す。
- asset URLは現在と同じくmanifest URL基準でabsolute URLへ解決する。

### C108 migration

`apps/webapp/map-bundles/C108/manifest.json`へ現在`C108_AREA_METADATA`にある同一`prefixes` / `labels`を移す。

route semantics、asset file、metersPerPixelは変更しないため`bundleVersion: "c108-v1"`は維持する。navigation snapshotをmetadata移動だけで不要にinvalidateしない。

### Legacy demo

`apps/webapp/map-bundles/demo-v1/manifest.json`はこのTaskで変更しない。legacy contract統一はYAGNIとして扱う。

## Non-goals

- wrapperでのmanifest生成
- C109等のproduction bundle追加
- registryへ二つ目のproduction event追加
- cross-file bundle integrity command
- schemaVersion bump
- route algorithm / ALNS / map asset parser変更
- `event-day-contracts.ts`と`application-contract-types.ts`の広範囲統合

## Acceptance

- production strict parserが1件以上の任意area数を受理する。
- missing/empty/duplicate `prefixes` / `labels`を拒否する。
- C108 runtime loaderにC108固有metadata constantが存在しない。
- fictitious `C999` + non-C108 areaをstrict loaderでruntime manifestへ変換できる。
- registry eventIdとbundle eventId mismatchを拒否する。
- dev demoはlegacy manifestのまま起動経路を維持する。
- current C108 asset testsが新manifestで通る。
- production TypeScriptにevent固有area identifier/label listを新規ハードコードしない。
