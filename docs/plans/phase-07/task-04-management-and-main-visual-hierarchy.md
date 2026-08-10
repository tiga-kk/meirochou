# Phase 7 Task 4: main/managementのvisual hierarchyを再構成

## 目標

旧`設定`の縦積みUIをmain navigationから取り除き、独立管理surfaceへ集約する。同時に、Phase 6で残ったカード・border・shadow・fontが多く情報階層を把握しづらい問題を、装飾追加ではなく整理によって修正する。

## やってはいけないこと

- decorative cardを増やさない。
- すべての要素へborder/shadowを付けない。
- UI frameworkやdesign system libraryを追加しない。
- main map/catalogの表示面積を管理導線のために減らさない。
- icon-only actionへしてtext labelを失わない。
- 既存feature stateをvisual componentへ移さない。
- visual redesignだけのために同義の色token、shadow token、spacing scaleを新設しない。
- 変更前比較用として別名snapshotを大量作成しない。既存tracked snapshotとTask開始時のGit差分をbaselineにする。

## 対象ファイル

**変更:**
- `apps/webapp/index.html`
- `apps/webapp/css/tokens.css`（既存tokenだけでは要求を表せない場合のみ）
- `apps/webapp/css/base.css`
- `apps/webapp/css/target.css`
- `apps/webapp/css/forms.css`
- `apps/webapp/css/sheets.css`またはmanagement責務の既存CSS
- `apps/webapp/js/components/comipath-settings.ts`
- `apps/webapp/js/components/event-day-management-view.ts`
- header/focus管理の既存component/controller
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/management.spec.ts`
- 意図して変化する既存visual snapshotのみ

## レイアウト契約

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
[開く] [再読込] [オフライン準備] [編集] [削除]

C108 2日目
未設定
[設定する]
```

## 見た目の規則

- body/background/cardの階層は3段以内を目安にし、意味のない入れ子surfaceを増やさない。
- default surfaceのborderは1px以下を基本とし、danger/selected/focusだけ強調する。
- default box-shadowを主要情報cardへ多用しない。
- mono fontはspace、distance、count、status value等のmachine-like valueだけ。
- prose/label/buttonはUI sansを基本とする。
- status色はまず既存`--success`、`--warning`、`--danger`、`--primary`等を再利用する。新しい`--status-*` tokenは既存tokenでは意味を表せず、実際に複数箇所で共有する必要がある場合だけ追加する。
- primary actionを同一surfaceに複数乱立させない。
- 44px touch targetとvisible focus ringを維持する。

## 手順

- [ ] **Step 1: 現行snapshotとDOMをbaselineとして確認する**

main navigation、management、Galleryの既存tracked snapshotとTask開始時DOMを確認する。比較用の別snapshotファイルは作らない。Task 4の各snapshot差分は、画面ごとに理由を説明できる状態にする。

- [ ] **Step 2: mainからinline settingsを外すRED E2Eを書く**

```ts
await page.getByRole("button", { name: "管理" }).click();
await expect(page.locator("event-day-management-view")).toBeVisible();
await expect(page.locator(".container > comipath-settings.card")).toHaveCount(0);
```

実装に合わせselectorは調整してよいが、「main flow内に設定cardを縦積みしない」契約を固定する。

- [ ] **Step 3: management focus/closeのRED testを書く**

管理を開くとmanagement surface内へfocusを移し、Escapeまたはcloseで元の`管理`buttonへfocusを戻す。surfaceを`dialog`として実装する場合はmodal focus containmentも確認する。単なるfull-screen regionとして実装する場合は、dialog専用のfocus trapを形だけ追加せず、そのsurface外の到達可能UIを適切に無効化・非表示化する既存構造に合わせる。

200% zoomでもheader/actionが操作できることをE2Eへ追加する。

- [ ] **Step 4: header導線を`管理`へ変更する**

gear icon単独ではなく文字labelを持つ。既存settings open stateはmanagement surface open stateへ置き換える。

- [ ] **Step 5: event overviewを第一層へ配置する**

Task 2のrow componentをmanagement rootへ置く。source editor/outbox/deleteはrow detailのsecondary surfaceにする。

- [ ] **Step 6: 既存tokenを整理・再利用する**

`tokens.css`にはすでに`--success`、`--warning`、`--danger`、`--primary`、`--shadow:none`等がある。まずこれらを再利用する。同義色/同義shadowを増やさない。

新tokenが必要な場合は、少なくとも2つ以上の実consumerがあり、既存tokenでは意味またはcontrast要件を満たせないことを確認してから追加する。1 componentだけの値なら、そのcomponent責務のCSSに置く方を優先する。

- [ ] **Step 7: main surfaceの装飾を削減する**

map/catalog/actionの優先順位を保ちながら、不要なheavy border、shadow、nested card appearanceを減らす。route stateの識別（current/candidate/danger）は削らない。

- [ ] **Step 8: managementを高密度listへ整える**

mobileではrow内情報を2〜3行にwrapし、desktopではcolumnsを使ってよい。横scroll必須tableにはしない。

Task 2の`cached:null`状態は色だけに頼らず、`保存状況を確認できません`等のtextで判別できるようにする。

- [ ] **Step 9: visual/a11y E2Eを更新する**

- main map/catalogがfirst viewportで優先される。
- management row statusがtextでも読める。
- offline status unknownと0件保存済みが見分けられる。
- 200% zoom。
- keyboard focus。
- safe-area。
- reduced-motion。

- [ ] **Step 10: snapshotを意図確認して更新する**

animationは停止した状態でsnapshotを取る。管理、main、Galleryの意図しない大幅差分がないか確認する。

既存snapshotのうち実際に意図した表示が変わるものだけ個別更新する。一括更新で未説明差分を受け入れない。

- [ ] **Step 11: verification**

```bash
npm run test:webapp
npm run test:e2e:ci
npm run check:webapp
node scripts/audit-public-tree.mjs
git diff --check
```

- [ ] **Step 12: commit**

`git add apps/webapp/css`や`git add apps/webapp/js/components`のような広いdirectory addを既定にしない。Taskで実際に変更したファイルだけを`git status --short`で確認してstageする。

```bash
git status --short
git add <Task 4で実際に変更したファイルだけ>
git diff --cached --name-status
git diff --cached --check
git commit -m "refactor(ui): separate management from navigation surfaces"
```

## 受入条件

- main navigationに旧inline settings cardがない。
- 管理は独立surfaceで、最初にevent/day一覧が見える。
- map/catalog/actionがmainの視覚的主役。
- 管理rowは情報密度が高いがmobile横scrollを必須にしない。
- heavy border/shadowの無差別使用が減る。
- 既存tokenを再利用し、同義tokenを不要に増やさない。
- focus/zoom/safe-areaを維持する。
