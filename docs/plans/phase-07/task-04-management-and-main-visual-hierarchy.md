# Phase 7 Task 4: main/managementのvisual hierarchyを再構成

## 目標

旧`設定`の縦積みUIをmain navigationから取り除き、独立管理surfaceへ集約する。同時に、Phase 6で残った「カード・border・shadow・fontが多くAI生成UIのように見える」問題を、情報階層の整理として修正する。

## やってはいけないこと

- decorative cardを増やさない。
- すべての要素へborder/shadowを付けない。
- UI frameworkやdesign system libraryを追加しない。
- main map/catalogの表示面積を管理導線のために減らさない。
- icon-only actionへしてtext labelを失わない。
- 既存feature stateをvisual componentへ移さない。

## Files

**Modify:**
- `apps/webapp/index.html`
- `apps/webapp/css/tokens.css`
- `apps/webapp/css/base.css`
- `apps/webapp/css/target.css`
- `apps/webapp/css/forms.css`
- `apps/webapp/css/sheets.css`またはmanagement責務のCSS
- `apps/webapp/js/components/comipath-settings.ts`
- `apps/webapp/js/components/event-day-management-view.ts`
- header/focus管理の既存component/controller

**Test:**
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/management.spec.ts`
- visual snapshots

## Layout contract

### Main navigation

- header actionは`一覧`、`予定`、`使い方`、`管理`。
- 旧gear clickでmain内に`<comipath-settings class="card">`を展開する構造を廃止する。
- current locationはcompact control。
- route summary → map → catalog → purchase/holdを主要順序とする。
- progress/statisticsはsecondary disclosureへ寄せ、地図/catalogより上に大きく置かない。

### Management

full-screen mobile surfaceまたはlarge dialogとする。第一層はevent/day rows。source editor/outbox/deleteは選択row detailに置く。

```text
管理
C108 1日目  [使用中]
GAS / sheet1
532件    GAS 3件待ち    Offline 521/532
[開く] [再読込] [Offline] [編集] [削除]

C108 2日目
未設定
[設定する]
```

## Visual rules

- body/background/cardの階層は3段以内。
- default surfaceのborderは1px以下を基本とし、danger/selected/focusだけ強調する。
- default box-shadowを主要情報cardへ多用しない。
- mono fontはspace、distance、count、status value等のmachine-like valueだけ。
- prose/label/buttonはUI sansを基本とする。
- status色はsuccess/warning/danger/infoの4種へ寄せる。
- primary actionを同一surfaceに複数乱立させない。
- 44px touch targetとvisible focus ringを維持する。

## Steps

- [ ] **Step 1: 現行visual snapshotをbaselineとして固定する**

main navigation、management、Galleryの3画面を対象とし、変更前snapshotを保存する。Task 4では差分理由を画面ごとに説明できる状態にする。

- [ ] **Step 2: mainからinline settingsを外すRED E2Eを書く**

```ts
await page.getByRole("button", { name: "管理" }).click();
await expect(page.locator("event-day-management-view")).toBeVisible();
await expect(page.locator(".container > comipath-settings.card")).toHaveCount(0);
```

実装に合わせselectorは調整してよいが、「main flow内に設定cardを縦積みしない」契約を固定する。

- [ ] **Step 3: management focus/closeのRED testを書く**

管理を開くとdialog/surface内へfocus、Escape/closeで元の管理buttonへfocus restore。200% zoomでもheader/actionが操作できることをE2Eへ追加する。

- [ ] **Step 4: header導線を`管理`へ変更する**

gear icon単独ではなく文字labelを持つ。既存settings open stateはmanagement surface open stateへ置き換える。

- [ ] **Step 5: event overviewを第一層へ配置する**

Task 2のrow componentをmanagement rootへ置く。source editor/outbox/deleteはrow detailのsecondary surfaceにする。

- [ ] **Step 6: tokensを整理する**

既存tokenを優先して再利用し、同義色/同義shadowを増やさない。新tokenが必要なら`--status-success`, `--status-warning`, `--status-danger`, `--status-info`等、意味で命名する。

- [ ] **Step 7: main surfaceの装飾を削減する**

map/catalog/actionの優先順位を保ちながら、不要なheavy border、shadow、nested card appearanceを減らす。route stateの識別（current/candidate/danger）は削らない。

- [ ] **Step 8: managementを高密度listへ整える**

mobileではrow内情報を2〜3行にwrapし、desktopではcolumnsを使ってよい。横scroll必須tableにはしない。

- [ ] **Step 9: visual/a11y E2Eを更新する**

- main map/catalogがfirst viewportで優先される。
- management row statusがtextでも読める。
- 200% zoom。
- keyboard focus。
- safe-area。
- reduced-motion。

- [ ] **Step 10: snapshotを意図確認して更新する**

animationは停止した状態でsnapshotを取る。管理、main、Galleryの意図しない大幅差分がないか確認する。

- [ ] **Step 11: verification**

```bash
npm run test:webapp
npm run test:e2e:ci
npm run check:webapp
node scripts/audit-public-tree.mjs
git diff --check
```

- [ ] **Step 12: commit**

```bash
git add apps/webapp/index.html apps/webapp/css apps/webapp/js/components tests/e2e
git commit -m "refactor(ui): separate management from navigation surfaces"
```

## 受入条件

- main navigationに旧inline settings cardがない。
- 管理は独立surfaceで、最初にevent/day一覧が見える。
- map/catalog/actionがmainの視覚的主役。
- 管理rowは情報密度が高いがmobile横scrollを必須にしない。
- heavy border/shadowの無差別使用が減る。
- focus/zoom/safe-areaを維持する。
