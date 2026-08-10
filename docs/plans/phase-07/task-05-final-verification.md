# Phase 7 Task 5: offline/management/visual最終検証

## 目標

Service Worker/Cache Storage、event/day management、source action、visual redesignを本番相当条件でまとめて検証し、会場で通信が不安定でも主要操作が成立することを確認する。

## やってはいけないこと

- Service Worker unit testだけでoffline動作を完了扱いしない。
- online状態だけでcatalog cacheを検証しない。
- visual snapshotだけでmanagement actionを検証しない。
- full PWA機能を受入条件へ追加しない。
- external image失敗を0件にするためserver proxy等を追加しない。

## Files

**Modify:**
- `tests/e2e/catalog-offline.spec.ts`
- `tests/e2e/management.spec.ts`
- `tests/e2e/webapp.spec.ts`
- 必要なvisual snapshots
- `docs/status/progress.md`（全GREEN後のみ）
- `README.md`/guidesのoffline/management説明（実装と一致する範囲）

## Required Flows

### Flow A: 家でoffline準備

1. configured GAS/CSV event/dayに複数catalog URLをseed。
2. 管理→`オフライン準備`。
3. right-bottom indicatorが`1/N`から`N/N`へ進む。
4. rowが`N/N 保存済み`になる。
5. reload後もcache statusが維持される。

### Flow B: partial failure

1. 5画像中2件をnetwork errorにする。
2. 3件はcacheへ残る。
3. 結果が`3/5 保存済み、2件失敗`相当。
4. retry時は既存3件を再downloadせず、不足分中心に処理できることを確認する。

### Flow C: 会場offline

1. 保存済みcacheを作る。
2. service worker controlを確認。
3. networkをoffline/abort。
4. main current catalog表示成功。
5. Gallery保存済みcatalog表示成功。
6. 未保存catalogはfallbackで、app全体は操作可能。
7. purchase/local navigationはoffline cache失敗と独立して動く。

### Flow D: management overview

- registry全dayが並ぶ。
- configured/unconfigured。
- source種別/label。
- data count。
- GAS queue count。
- offline cached/total。
- selected/current day。

### Flow E: management actions

- 開く。
- GAS再読込。
- CSV再読込のfile picker導線。
- source編集。
- pending queueがあるsource変更の明示処理。
- 削除。

### Flow F: visual/a11y

- mainにinline settings cardなし。
- map/catalog/action優先。
- 管理surface focus trap/restore。
- 200% zoom。
- 44px touch target。
- safe-area。
- reduced-motion。

### Flow G: Phase 6.1/6回帰

- map viewport/rubber-band。
- progressive Gallery swipe。
- m距離/S/G/route flow。
- route change → purchase → next。
- GAS local-first purchase。
- itinerary/user guide。

## Steps

- [ ] **Step 1: missing E2EをREDで追加する**

特にService Worker control/offline requestはPlaywrightの実browser contextで証明する。

- [ ] **Step 2: Service Worker build assetを確認する**

```bash
npm run build:webapp
npm run verify:webapp:build
node scripts/audit-public-tree.mjs
```

`dist/webapp/catalog-service-worker.js`が存在し、source map/private bundle等を誤配信しないことを確認する。

- [ ] **Step 3: unit/integration/full verification**

```bash
npm run verify
```

- [ ] **Step 4: CI相当E2E**

```bash
npm run test:e2e:ci
```

- [ ] **Step 5: Service Worker更新/reload scenarioを確認する**

新version workerがinstall/activateしても既存app dataを消さないこと、catalog cache version cleanupが`comipath-catalog-*`だけへ限定されることを確認する。

- [ ] **Step 6: Cache Storage quota/error回帰を確認する**

cache put rejectionをinjectし、circle state/source data/navigationが変化しないこと、indicatorがerror/partial failureを表示することを確認する。

- [ ] **Step 7: visual snapshotを確認する**

animation/reduced-motionを固定した状態でmain/management/Galleryを比較する。変更理由を説明できないsnapshot差分は更新しない。

- [ ] **Step 8: repo hygiene**

```bash
git diff --check
git status --short
npx biome check <Phase-7 changed files>
```

repo-wide Biomeはmain baselineとの差分で評価し、既存debtを一括修正しない。

- [ ] **Step 9: docsを実装状態へ合わせる**

READMEの`Service Worker/PWA`行は、`Service Worker: catalog offline cacheのみ対応 / installable PWAは非対応`と誤解なく書く。user guide/management guideも実UI名へ合わせる。

- [ ] **Step 10: progressを完了へ更新する**

Required Flow A〜GがGREENの場合だけ`docs/status/progress.md`へPhase 7完了を記録する。

- [ ] **Step 11: commit**

```bash
git add tests README.md guides docs/status/progress.md
git commit -m "test(phase-07): verify offline and management experience"
```

## 受入条件

- offline browser contextで保存済みcatalogが表示できる。
- partial cache failureが成功cacheを消さない。
- management overview/actionがproduction DOM wiringで動く。
- mainから旧inline settingsが消えている。
- Phase 6.1/6の主要回帰がない。
- `npm run verify`、`npm run test:e2e:ci`、build/public auditがGREEN。
