# Phase 6.1 Task 6: 最終検証

## 目標

Task 1〜5の個別GREENだけで完了扱いせず、本番DOM wiring、実map asset比率、GAS遅延、gesture、reduced-motion、既存Phase 6機能との回帰をまとめて検証する。

## やってはいけないこと

- unit testだけで操作感を証明したことにしない。
- visual snapshotを無差別に更新しない。
- repo-wide既存Biome debtをPhase 6.1へ持ち込んで大量修正しない。
- physical scale evidenceが欠けたままPhase完了にしない。
- Task 5のscale依存部分が保留中でも、完了済みのscale非依存部分まで未実装扱いに戻さない。
- Phase 6.1開始後に`origin/main`が進んだ場合、現在の`origin/main`だけをbaselineとして既存debt判定を変えない。

## 対象ファイル

**変更:**
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/management.spec.ts`
- `tests/e2e/webapp.spec.ts-snapshots/navigation-map-catalog-mobile-chromium-linux.png`（意図したmap viewport/S/G差分が出る場合）
- `tests/e2e/webapp.spec.ts-snapshots/route-comparison-mobile-chromium-linux.png`（意図したcurrent route endpoint差分が出る場合）
- `tests/e2e/management.spec.ts-snapshots/scoped-deletion-dialog-mobile-chromium-linux.png`（pending破棄warningの意図した差分が出る場合）
- `docs/status/progress.md`（全検証GREEN後のみ）

## 必須E2Eフロー

### Flow A: pending GAS付き全削除

1. pending GAS outboxをseedする。
2. settingsを開く。
3. 全日程削除buttonがenabled。
4. 本番confirmationにpending破棄件数が表示される。
5. cancelでstate維持。
6. 再度confirm。
7. event/day state、outbox、navigation snapshotが削除される。
8. GAS POSTは発生しない。

### Flow B: 非同期処理表示

GAS requestをdelayし、次を確認する。

1. request開始後、右下に`GASからデータを読み込み中…`。
2. response前は消えない。
3. response/apply後にsuccessへ変わる。
4. success表示後にidleへ戻る。
5. cancelまたはstale responseから偽successを表示しない。

CSV previewとapply previewはTask 2のcontroller/integration testで実path到達を証明する。最終E2Eへ同じケースを重複追加する必要はないが、Task 2の該当testが存在しGREENであることを確認する。

### Flow C: responsive map viewer

1. E456相当の横長assetを表示し、viewport height >= 220pxかつ旧固定360pxではないことを確認する。
2. 横長stageのaspect ratioが画像と一致し、stageWidth > viewportWidth、初期Xが中央寄せであることを確認する。
3. W12相当の自然比率caseでviewportが画像自然heightへ追従することを確認する。
4. test用の縦長fixtureでstageHeight > viewportHeight、stageWidth == viewportWidth、初期Yが中央寄せであることを確認する。
5. いずれの初期表示にも不要なletterboxがないことを確認する。
6. 横長・縦長の双方でpan/zoom後にresetし、scale 1かつ元のbase中央位置へ戻る。
7. area変更後は旧areaのtransformを持ち越さず、新areaのbase transformになる。

### Flow D: map rubber-band

1. mapを端までpan。
2. さらに外へdrag。
3. visible overscrollが約32pxを大きく超えない。
4. release後にbounds内へ戻る。
5. pointercancel後も再panできる。

### Flow E: Gallery progressive swipe

左右それぞれの正しい外向きswipeで購入が成立し、内向きでは成立しない。

加えて、Phase 6で購入しなかった短いraw movementがPhase 6.1だけ購入成立しないこと、旧実効閾値`visualThreshold / 0.6`を少し超えたときに成立することを確認する。表示追従の非線形性はunit testで開始/中盤/trigger付近のratioが連続的に増える性質を固定する。

### Flow F: m距離と方向表示

1. current routeの距離が`距離 N m`。
2. circle start routeとmanual grid start routeの双方でSVG endpoint marker `S`/`G`が見える。
3. current routeにflow polylineがある。
4. candidate route comparisonの青線契約を維持する。
5. reduced-motionではflow animationなし。
6. endpoint markerがmap pin clickを妨げない。
7. routing costと`physicalPixelLength`が別propertyとして維持される。

### Flow G: Phase 6回帰

- route change → confirm → purchase → next circle。
- GAS送信失敗でもlocal purchase/next target維持。
- itinerary番号pin。
- Gallery 2列/wide。
- user guide。
- local save failureで偽successなし。

## 手順

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

Task 2のCSV preview/apply preview operation到達、Task 4の実効finger travel、Task 5のweighted costとphysical length分離を証明するfocused testが`npm run verify`へ含まれるか、直前に個別実行済みであることを確認する。

- [ ] **Step 4: public treeとdiff hygieneを確認する**

```bash
node scripts/audit-public-tree.mjs
git diff --check
git status --short
```

- [ ] **Step 5: Phase 6.1変更コードだけBiomeを確認する**

実装開始直前に基準commitを記録する。以下の`$PHASE_6_1_BASE`はそのcommitを使い、実装中に`origin/main`が進んでも置き換えない。

```bash
git diff --name-only --diff-filter=ACMR "$PHASE_6_1_BASE"...HEAD -- '*.ts' '*.js' '*.css' \
  | xargs -r npx biome check
```

続いてrepo-wide baselineも確認する。

```bash
npx biome check .
```

repo-wide結果は`$PHASE_6_1_BASE`時点で記録した結果と比較し、新規error/warningだけを回帰として扱う。既存debtをPhase 6.1で一括修正しない。

基準commitを永続文書へ実SHAで固定しない。Task開始時に現在の実装branch分岐点または開始直前HEADから取得する。

- [ ] **Step 6: physical scale evidenceを再確認する**

C108 `e456/e7/s12/w12`の全areaに、Task 5で記録したscale根拠が存在することを確認する。1つでも根拠不明ならPhase 6.1完了へ進めない。

この場合でもTask 5で既に完了したS/G、route flow、`physicalPixelLength`を巻き戻さず、m距離部分だけ未完了として進捗へ記録する。

- [ ] **Step 7: visual snapshotを確認する**

地図viewport、S/G、route flowの静止frame、右下indicator、削除確認の意図した差分だけ更新する。flow animationの瞬間差分でsnapshotを不安定にしないよう、snapshot時は`prefers-reduced-motion: reduce`を指定する。

更新候補は対象ファイルに列挙した3 snapshotだけを基本とし、別snapshotが失敗した場合は差分原因を確認してから個別に追加する。一括`--update-snapshots`で原因確認を飛ばさない。

- [ ] **Step 8: progressを更新する**

全必須検証がGREENになった場合だけ`docs/status/progress.md`へPhase 6.1完了を記録し、Phase 7 Task 1を次タスクとする。

scale evidenceだけが不足している場合は、Task 5のscale非依存部分が完了済みであることと、残る阻害要因がscale依存部分だけであることを正確に記録する。

- [ ] **Step 9: commit**

```bash
git add tests/e2e/webapp.spec.ts tests/e2e/management.spec.ts \
  tests/e2e/webapp.spec.ts-snapshots/navigation-map-catalog-mobile-chromium-linux.png \
  tests/e2e/webapp.spec.ts-snapshots/route-comparison-mobile-chromium-linux.png \
  tests/e2e/management.spec.ts-snapshots/scoped-deletion-dialog-mobile-chromium-linux.png \
  docs/status/progress.md
git commit -m "test(phase-06-1): verify field UX follow-ups"
```

snapshotに意図した差分がなくファイルが未変更なら、そのsnapshot pathは`git add`から外す。

## 受入条件

- Required Flow A〜Gが通る。
- `npm run verify` GREEN。
- `npm run test:e2e:ci` GREEN。
- public tree audit/diff check GREEN。
- Phase 6.1開始時baseline比で新しいBiome error/warningを増やさない。
- physical scale evidenceが全area分ある。
- progressは上記成立後だけPhase 6.1完了になる。
