# Phase 6.1 Task 6: 最終検証

## 目標

Task 1〜5の個別GREENだけで完了扱いせず、本番DOM wiring、実map asset比率、GAS遅延、gesture、reduced-motion、既存Phase 6機能との回帰をまとめて検証する。

## やってはいけないこと

- unit testだけで操作感を証明したことにしない。
- visual snapshotを無差別に更新しない。
- repo-wide既存Biome debtをPhase 6.1へ持ち込んで大量修正しない。
- physical scale evidenceが欠けたままPhase完了にしない。

## Files

**Modify:**
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/management.spec.ts`
- 必要な既存snapshotのみ
- `docs/status/progress.md`（全検証GREEN後のみ）

## Required E2E Flows

### Flow A: pending GAS付き全削除

1. pending GAS outboxをseedする。
2. settingsを開く。
3. 全日程削除buttonがenabled。
4. confirmationにpending破棄件数が表示される。
5. cancelでstate維持。
6. 再度confirm。
7. event/day state、outbox、navigation snapshotが削除される。

### Flow B: GAS loading indicator

1. GAS responseをdelayする。
2. request開始後、右下に`GASからデータを読み込み中…`。
3. response前は消えない。
4. response/apply後にsuccessへ変わる。
5. success表示後にidleへ戻る。

### Flow C: 横長map viewer

E456相当の横長assetを表示し、viewport height >= 220px、旧固定360pxではないことを確認する。stageのaspect ratioが画像と一致し、初期横positionが中央寄せであることを確認する。

### Flow D: map rubber-band

1. mapを端までpan。
2. さらに外へdrag。
3. visible overscrollが約32pxを大きく超えない。
4. release後にbounds内へ戻る。
5. pointercancel後も再panできる。

### Flow E: Gallery progressive swipe

左右それぞれの正しい外向きswipeで購入が成立し、内向きでは成立しない。unit testで開始/中盤/閾値付近の追従率が段階的に増える性質も固定する。

### Flow F: m距離と方向表示

1. current routeの距離が`距離 N m`。
2. start pinにS、goalにG。
3. current routeにflow polyline。
4. candidate route comparisonの青線契約を維持。
5. reduced-motionではflow animationなし。

### Flow G: Phase 6回帰

- route change → confirm → purchase → next circle。
- GAS送信失敗でもlocal purchase/next target維持。
- itinerary番号pin。
- Gallery 2列/wide。
- user guide。
- local save failureで偽successなし。

## Steps

- [ ] **Step 1: 不足E2Eを先にREDで追加する**

Task 1〜5の個別testで既に十分なFlowは重複させず、本番結合が未証明の箇所だけ追加する。

- [ ] **Step 2: CI相当E2Eを実行する**

```bash
npm run test:e2e:ci
```

- [ ] **Step 3: unit/integration/type/buildを実行する**

```bash
npm run verify
```

- [ ] **Step 4: public treeとdiff hygieneを確認する**

```bash
node scripts/audit-public-tree.mjs
git diff --check
git status --short
```

- [ ] **Step 5: changed filesだけBiomeを確認する**

```bash
npx biome check <Phase-6.1で変更したts/js/cssの対象>
```

repo-wide `npx biome check`も実行し、main baselineとの差分だけを回帰判定に使う。既存debtをPhase 6.1で一括修正しない。

- [ ] **Step 6: physical scale evidenceを再確認する**

C108 `e456/e7/s12/w12`の全areaに、Task 5で記録したscale根拠が存在することを確認する。1つでも根拠不明ならPhase 6.1完了へ進めない。

- [ ] **Step 7: visual snapshotを確認する**

地図viewport、S/G、route flowの静止frame、右下indicator、削除確認の意図した差分だけ更新する。flow animationの瞬間差分でsnapshotを不安定にしないよう、snapshot時はanimationを一時停止するtest CSSまたはreduced-motionを使う。

- [ ] **Step 8: progressを更新する**

全必須検証がGREENになった場合だけ`docs/status/progress.md`へPhase 6.1完了を記録し、Phase 7 Task 1を次タスクとする。

- [ ] **Step 9: commit**

```bash
git add tests docs/status/progress.md
git commit -m "test(phase-06-1): verify field UX follow-ups"
```

## 受入条件

- Required Flow A〜Gが通る。
- `npm run verify` GREEN。
- `npm run test:e2e:ci` GREEN。
- public tree audit/diff check GREEN。
- main baseline比で新しいBiome errorを増やさない。
- physical scale evidenceが全area分ある。
- progressは上記成立後だけPhase 6.1完了になる。
