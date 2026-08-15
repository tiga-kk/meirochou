# Phase 7.6 Task 7: `W_*`壁分類を共通化しoptimizationへ接続

## 目的

既存`points.json`の`group_id`が`W_`で始まるpointを壁分類の正本とし、その分類を既存optimizationの`queueClass`へproduction接続する。CSV/GASへwall列を追加せず、C108固有identifierをruntimeへハードコードしない。

このTaskではgallery UIをまだ変更しない。Task 8が同じpure helperを再利用する。

## 対象外

- CSV/GAS schema変更。
- LocalStorage schema migration。
- C108 wall identifierのruntime constant化。
- map bundle generator/OCR変更。
- ALNS objective/operator変更。
- service time値そのものの変更。
- distance matrix / Dijkstra / route graph変更。
- gallery表示変更。
- `CircleRecord`入力objectの破壊的mutation。

## 対象ファイル

### 新規作成

- `apps/webapp/js/shared/domain/wall-circle-classification.ts`
- `tests/wall-circle-classification.test.ts`

### 変更

- `apps/webapp/js/features/route-guidance/use-cases/prepare-route-optimization.ts`
- `tests/prepare-route-optimization.test.ts`
- `tests/optimization-input-adapter.test.ts`
- `tests/c108-map-assets.test.ts`

### 変更しない

- `apps/webapp/js/features/circle-data-source/domain/csv-circle-codec.ts`
- `apps/webapp/js/features/circle-data-source/infrastructure/gas-google-sheet-circle-client.ts`
- `apps/webapp/js/features/event-day/domain/event-day-types.ts`
- `apps/webapp/js/features/route-guidance/domain/optimization/time-decayed-objective.ts`

`CircleRecord.queueClass`と既存service time contractはそのまま使う。

## Interfaces

### shared wall classification

`apps/webapp/js/shared/domain/wall-circle-classification.ts`:

```ts
import { parseSpace } from "./space-parser";

export interface WallClassifiablePoint {
  readonly group_id?: unknown;
  readonly identifier?: unknown;
}

export function collectWallIdentifiers(
  points: readonly WallClassifiablePoint[],
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const point of points) {
    if (
      typeof point.group_id === "string" &&
      point.group_id.startsWith("W_") &&
      typeof point.identifier === "string" &&
      point.identifier.trim()
    ) {
      result.add(point.identifier.trim());
    }
  }
  return result;
}

export function resolveCircleQueueClass(
  space: string,
  wallIdentifiers: ReadonlySet<string>,
): "normal" | "wall" {
  const [, identifier] = parseSpace(space);
  return identifier && wallIdentifiers.has(identifier) ? "wall" : "normal";
}
```

このhelperはmap areaを跨いだglobal setを作らない。呼び出し側が**1 area分のpoints**だけを渡す。

### optimization準備

`PrepareRouteOptimizationUseCase.execute()`内で既存:

```ts
const assets = await this.assetsLoader.loadMapAssets(area);
```

の直後に:

```ts
const wallIdentifiers = collectWallIdentifiers(assets.points.points);
const pendingCircles = input.pendingCircles.map((circle) => ({
  ...circle,
  queueClass: resolveCircleQueueClass(circle.space, wallIdentifiers),
}));
```

相当のderived copyを作る。

以後、endpoint/cache key/matrix順序のspace集合は同じなので、`pendingCircles`を一貫して使う。返り値:

```ts
return {
  ...,
  pendingCircles,
  ...
};
```

とし、元`input.pendingCircles`のobjectへ代入しない。

`buildOptimizationProblem()` / `resolveServiceTimeSec()`は既存実装を変更しない。既存:

```ts
circle.queueClass === "wall"
  ? profile.wallServiceTimeSec
  : profile.defaultServiceTimeSec
```

へ自然に流す。

## C108 asset evidence

現行assetから次をtestで確認する。

```text
e456: W_all   -> ア
e7:   W_all   -> A
s12:  W_all   -> a
w12:  W_left  -> め
w12:  W_right -> あ
```

この対応をproduction codeへcopy/pasteしない。

`tests/c108-map-assets.test.ts`でareaごとに:

```ts
const wallIdentifiers = new Set(
  points
    .filter((point) => point.group_id?.startsWith("W_"))
    .map((point) => point.identifier),
);
const nonWallIdentifiers = new Set(
  points
    .filter((point) => !point.group_id?.startsWith("W_"))
    .map((point) => point.identifier),
);

expect(
  [...wallIdentifiers].filter((identifier) =>
    nonWallIdentifiers.has(identifier),
  ),
).toEqual([]);
```

相当を入れ、identifier単位分類が現在assetで曖昧でないことを証明する。

## 実装手順

- [ ] **Step 1: shared helperのREDを書く**

`tests/wall-circle-classification.test.ts`へ最低限:

```ts
test("collects wall identifiers only from W_ groups", () => {
  const wall = collectWallIdentifiers([
    { group_id: "W_all", identifier: "ア" },
    { group_id: "W_left", identifier: "め" },
    { group_id: "I_01", identifier: "イ" },
    { group_id: undefined, identifier: "ウ" },
  ]);

  expect([...wall].sort()).toEqual(["め", "ア"].sort());
  expect(resolveCircleQueueClass("東ア10", wall)).toBe("wall");
  expect(resolveCircleQueueClass("東イ10", wall)).toBe("normal");
});
```

- [ ] **Step 2: REDを実行する**

```bash
npx vitest run --root . tests/wall-circle-classification.test.ts
```

期待: module未作成でFAIL。

- [ ] **Step 3: pure helperを最小実装する**

上記interface/signatureをそのまま実装する。C108 identifier定数を追加しない。

- [ ] **Step 4: helper testをGREENにする**

```bash
npx vitest run --root . tests/wall-circle-classification.test.ts
```

期待: PASS。

- [ ] **Step 5: C108 asset REDを追加する**

`tests/c108-map-assets.test.ts`へ4areaのwall group/identifier対応とwall/non-wall identifier非交差を追加する。

- [ ] **Step 6: C108 asset testを実行する**

```bash
npx vitest run --root . tests/c108-map-assets.test.ts
```

期待: 現行assetと対応が一致してPASS。もし非交差がFAILしたらruntime推定を複雑化せず、このTaskを止めてassetの意味を再確認する。

- [ ] **Step 7: optimization production wiringのREDを書く**

`tests/prepare-route-optimization.test.ts`のasset fixtureへ:

```ts
points: [
  {
    group_id: "W_all",
    identifier: "ア",
    number: 1,
    center_x: 10,
    center_y: 10,
    portals: [{ col: 0, row: 0, x: 10, y: 10 }],
  },
  {
    group_id: "I_01",
    identifier: "イ",
    number: 2,
    center_x: 20,
    center_y: 10,
    portals: [{ col: 1, row: 0, x: 20, y: 10 }],
  },
],
```

を使い、入力:

```ts
const sourceCircles = [
  { space: "東ア1", priority: 10 },
  { space: "東イ2", priority: 10 },
];
```

に対して:

```ts
expect(result.pendingCircles.map((circle) => circle.queueClass)).toEqual([
  "wall",
  "normal",
]);
expect(sourceCircles.map((circle) => circle.queueClass)).toEqual([
  undefined,
  undefined,
]);
```

を要求する。

- [ ] **Step 8: wiring REDを確認する**

```bash
npx vitest run --root . tests/prepare-route-optimization.test.ts
```

期待: 現行では`queueClass`が付かずFAIL。

- [ ] **Step 9: `PrepareRouteOptimizationUseCase`へderived classificationを接続する**

`loadMapAssets()`後に1area分のwall identifierを作り、pending circleをcopyして`queueClass`を付与する。matrix endpointのspace集合・順序は変えない。

- [ ] **Step 10: preparation testをGREENにする**

```bash
npx vitest run --root . tests/prepare-route-optimization.test.ts
```

期待: PASS。

- [ ] **Step 11: service time契約を再証明する**

`tests/optimization-input-adapter.test.ts`で既存30秒/200秒testを維持し、必要ならtest名を「derived queueClass consumer contract」と分かる名前にする。production `resolveServiceTimeSec()`は変更しない。

```bash
npx vitest run --root . \
  tests/wall-circle-classification.test.ts \
  tests/prepare-route-optimization.test.ts \
  tests/optimization-input-adapter.test.ts \
  tests/c108-map-assets.test.ts
```

期待: 全PASS。

- [ ] **Step 12: webapp type/build回帰を確認する**

```bash
npm run check:webapp
npm run build:webapp
git diff --check
```

期待: 全PASS。

- [ ] **Step 13: commit**

```bash
git add \
  apps/webapp/js/shared/domain/wall-circle-classification.ts \
  apps/webapp/js/features/route-guidance/use-cases/prepare-route-optimization.ts \
  tests/wall-circle-classification.test.ts \
  tests/prepare-route-optimization.test.ts \
  tests/optimization-input-adapter.test.ts \
  tests/c108-map-assets.test.ts
git commit -m "fix(phase-07-6): derive wall queue class from map assets"
```

## 受入条件

- wall classificationのruntime sourceは`group_id.startsWith("W_")`だけ。
- C108 identifierをproduction codeへハードコードしない。
- current C108 4area/5group対応をasset testで確認。
- wall identifierとnon-wall identifierの交差なしをtest。
- `PrepareRouteOptimizationUseCase`が追加fetchなしでclassificationをderive。
- 元`CircleRecord`をmutationしない。
- wallは既存`wallServiceTimeSec`、normalは既存`defaultServiceTimeSec`へ流れる。
- CSV/GAS/EventDay/LocalStorage schema変更なし。
- ALNS objective/operator、route graph、distance matrix semantics変更なし。
- Task 8がimportできるpure helperが完成している。
