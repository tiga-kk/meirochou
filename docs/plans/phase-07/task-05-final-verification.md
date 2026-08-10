# Phase 7 Task 5: offline/management/visual最終検証

## 目標

Service Worker/Cache Storage、event/day management、source action、visual redesignを本番相当条件でまとめて検証し、会場で通信が不安定でも主要操作が成立することを確認する。

## やってはいけないこと

- Service Worker unit testだけでoffline動作を完了扱いしない。
- online状態だけでcatalog cacheを検証しない。
- visual snapshotだけでmanagement actionを検証しない。
- full PWA機能を受入条件へ追加しない。
- external image失敗を0件にするためserver proxy等を追加しない。
- cache status取得失敗を`0/N 保存済み`と誤表示したまま完了扱いしない。
- 共有catalog URLを片方のevent/day削除で失うcaseを見落とさない。

## 対象ファイル

**変更:**
- `tests/e2e/catalog-offline.spec.ts`
- `tests/e2e/management.spec.ts`
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/management.spec.ts-snapshots/settings-shell-source-manager-mobile-chromium-linux.png`（旧settings shellからmanagement overviewへの意図した差分がある場合）
- `tests/e2e/webapp.spec.ts-snapshots/navigation-map-catalog-mobile-chromium-linux.png`（main visual hierarchyの意図した差分がある場合）
- `tests/e2e/webapp.spec.ts-snapshots/catalog-gallery-mobile-chromium-linux.png`（Gallery visual hierarchyの意図した差分がある場合）
- `docs/status/progress.md`（全GREEN後のみ）
- `README.md`
- `guides/user-data-management.md`
- `guides/gas-sync.md`

## 必須フロー

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
- Cache Storage status取得失敗時もrow自体は残り、`0件`ではなく`確認できません`相当になる。

### Flow E: management actions

- 開く。
- GAS再読込。
- CSV再読込のfile picker導線。
- source編集。
- pending queueがあるsource変更の明示処理。
- 削除。
- `circle-source`/`event-day`/`all-event-days`削除後、他dayから参照されていないcatalog cacheだけをcleanup。
- dayA/dayBが同じcatalog URLを共有するfixtureでdayAだけ削除し、dayBの共有URLがcacheに残る。
- cache cleanup failure時もlocal deletion結果を維持。
- local deletion後の残存参照確認に失敗した場合も、共有cacheを推測削除せずlocal deletion結果を維持。

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
- progressive Gallery swipe。Phase 6と実質同じfinger travelで購入成立し、表示translationだけが非線形化されている。
- m距離/S/G/route flow。
- route change → purchase → next。
- GAS local-first purchase。
- itinerary/user guide。

## 手順

- [ ] **Step 1: missing E2EをREDで追加する**

特にService Worker control/offline request、offline status取得失敗、共有catalog URL cleanupはPlaywrightの実browser contextで証明する。

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

`getStatus()`相当の確認失敗もinjectし、management rowが`cached=null`相当の表示へ落ち、他rowやmain appが壊れないことを確認する。

- [ ] **Step 7: 共有catalog URLのcleanup回帰を確認する**

同じURLを持つ2 event/dayを用意し、片方だけ`circle-source`または`event-day`削除する。削除側専用URLは消え、共有URLは残ることをCache Storageとoffline画像表示の両方で確認する。

`all-event-days`削除では残存参照が0になるため、同じ共有URLも1回だけcleanupされることを確認する。

- [ ] **Step 8: visual snapshotを確認する**

`prefers-reduced-motion: reduce`を固定した状態でmain/management/Galleryを比較する。変更理由を説明できないsnapshot差分は更新しない。対象ファイルに列挙した3 snapshotを基本候補とし、別snapshotが失敗した場合は原因確認後に個別対応する。

- [ ] **Step 9: repo hygiene**

Phase 7実装branchはPhase 7開始時の`origin/main`から切る前提で、変更TS/JS/CSSだけを次で検査する。

```bash
git diff --check
git status --short
git diff --name-only --diff-filter=ACMR origin/main...HEAD -- '*.ts' '*.js' '*.css' \
  | xargs -r npx biome check
npx biome check .
```

repo-wide BiomeはPhase 7開始時main baselineとの差分で評価し、新規error/warningだけを回帰とする。既存debtを一括修正しない。`origin/main`が実装中に進んだ場合、現在のremote結果だけでbaselineを置き換えず、実装branchの分岐点またはTask開始時に記録した基準を使って既存/新規を区別する。

- [ ] **Step 10: docsを実装状態へ合わせる**

`README.md`の`Service Worker/PWA`行は、`Service Worker: catalog offline cacheのみ対応 / installable PWAは非対応`と誤解なく書く。

`guides/user-data-management.md`へ管理画面のevent/day一覧、offline準備、削除時のcache/outbox扱いを反映する。共有catalog URLは他event/dayから参照される限りcache cleanupしないことも記載する。`guides/gas-sync.md`へ新しい管理画面からの再読込/queue表示導線を反映する。実装に存在しない操作名を書かない。

- [ ] **Step 11: progressを完了へ更新する**

Required Flow A〜GがGREENの場合だけ`docs/status/progress.md`へPhase 7完了を記録する。

- [ ] **Step 12: commit**

```bash
git add tests/e2e/catalog-offline.spec.ts \
  tests/e2e/management.spec.ts tests/e2e/webapp.spec.ts \
  tests/e2e/management.spec.ts-snapshots/settings-shell-source-manager-mobile-chromium-linux.png \
  tests/e2e/webapp.spec.ts-snapshots/navigation-map-catalog-mobile-chromium-linux.png \
  tests/e2e/webapp.spec.ts-snapshots/catalog-gallery-mobile-chromium-linux.png \
  README.md guides/user-data-management.md guides/gas-sync.md \
  docs/status/progress.md
git commit -m "test(phase-07): verify offline and management experience"
```

snapshotに意図した差分がなく未変更なら、そのsnapshot pathは`git add`から外す。

## 受入条件

- offline browser contextで保存済みcatalogが表示できる。
- partial cache failureが成功cacheを消さない。
- offline status取得失敗と`0件保存済み`を区別できる。
- management overview/actionがproduction DOM wiringで動く。
- deletion後の不要catalog cache cleanupがbest-effortで動き、他event/dayが参照する共有URLを消さない。
- mainから旧inline settingsが消えている。
- Phase 6.1/6の主要回帰がない。
- `npm run verify`、`npm run test:e2e:ci`、build/public auditがGREEN。
