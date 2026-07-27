# Phase 5C Task 4: Arbitrary Start and Per-map Session

**Status:** Complete（pure foundation・レビュー修正済み。map UI wiringはTask 7/9で実施）
**Depends on:** Phase 5C Tasks 2-3  
**Commit candidate:** `feat(navigation): add manual start per map`

## Goal

地図tapから任意始点を設定し、最寄りwalkable cellへsnapする。4地図を独立sessionとして扱い、戻った地図では始点を設定し直しつつ計算資産を再利用できる状態境界を作る。

## Required interfaces

```ts
export interface StartSelection {
  readonly svgX: number;
  readonly svgY: number;
}

export interface SnappedStart {
  readonly gridIndex: number;
  readonly svgX: number;
  readonly svgY: number;
  readonly snapDistancePx: number;
}

export function snapStartToWalkableCell(
  selection: StartSelection,
  grid: GridMap,
  meta: GridMeta,
  maxSnapDistancePx: number,
): SnappedStart | null;
```

`maxSnapDistancePx`は既存grid scaleから決まる固定値として1か所に定義し、Task内で実地図を見て勝手にarea別調整しない。

## TDD procedure

- [ ] client座標→SVG座標変換testを書く（client/map UI wiringと同時にTask 7/9で実施）。
- [x] walkable cell上のtapが同cellになるtestを書く。
- [x] blocked cell近傍が最寄walkableへsnapするtestを書く。
- [x] 閾値外がnullになるtestを書く。
- [x] tie時の選択順が決定的なtestを書く。
- [x] area切替時にcurrent position/targetを破棄するtestを書く。
- [x] matrix/best order identityは保持するtestを書く。
- [x] 戻ったareaで始点設定を要求するtestを書く。
- [x] REDを確認する。

```bash
npx vitest run --root . tests/start-selection.test.ts tests/map-session.test.ts
```

- [x] pure coordinate/snap helperを実装する。
- [ ] 始点設定modeとcancelをmap UIへ追加する（Task 7/9へ繰越）。
- [ ] 確定前previewと確定後markerを区別する（Task 7/9へ繰越）。
- [x] area session repositoryまたはmanagerを追加する。
- [x] area switchでnavigationだけをclearする。
- [x] 始点再設定後に再利用可能なmatrix/best order referenceを返す。
- [ ] keyboard代替として、候補circleまたは入口候補から始点を選べるcontrolを用意する（Task 7/9へ繰越）。
- [x] GREENを確認する。

```bash
npx vitest run --root . tests/start-selection.test.ts tests/map-session.test.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

## 実績

- `snapStartToWalkableCell` と `MapSession` 系のpure foundationを実装し、有限値・grid buffer長・閾値・blocked cell・tie-breakingを検証した。
- 同一area復帰時のcache引き継ぎは、配列のcloneとfreezeを行い、呼び出し側からの参照共有による変更を防止した。
- focused testは12件、webapp testは39ファイル408件すべてPASS。型チェック、build、build検証、Biome、`git diff --check`もPASSした。
- E2Eはsandbox外で実行し25 PASS・8 skipped・6 failed。失敗は既存のmobile visual snapshot差分で、Task4のpure helper/sessionとは無関係だった。map tapからのclient座標変換、UIのmode/cancel、preview/marker、keyboard control、App/Worker wiringはTask 7/9へ繰り越す。

## Acceptance criteria

- map tapで始点を設定できる。
- blocked/遠距離tapを安全に扱う。
- current positionはareaごとに持ち越さない。
- matrixと以前のbest orderをareaごとに保持できる。
- 戻ったareaでは始点再設定が必要である。
- 距離行列生成はまだ実装しない。
