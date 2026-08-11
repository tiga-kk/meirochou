# Phase 7.1 Task 5: 必要なmotion feedbackの分離実装

## 目標

Phase 7.1で実際に確認された「Gallery初回swipe hintが操作方向を十分に示さない」と、管理画面の短い状態遷移を補助するmotionだけを追加する。非必須animationを`motion.css`へ分離し、好みに合わなければ個別に削除できる状態にする。

このTaskは「動く箇所を増やす」Taskではない。

## 今回の必須範囲

1. Gallery初回swipe hint
   - 現行の`comipath:ui:v1:gallery-swipe-hint-seen`と3.5秒前後のhint lifecycleを再利用する。
   - `← →`の文字間隔pulse中心ではなく、実際の横swipeを短いtranslate motionで示す。
   - hint textだけでも操作内容が分かる。
2. management entry
   - Task 4でopaqueになっているsurface自体は即時表示する。
   - 必要ならsurface内contentだけを短く`opacity/transform`で入れる。
3. Task 6のmobile list/detail transitionで使えるCSS分離方針
   - Task 6側のDOMを先回りして固定しない。
   - Task 6で必要になったclass/keyframesを`motion.css`へ追記できる構成だけ維持する。

## 今回は追加しないもの

次はユーザーが確認した具体的な不具合の解消に必須ではなく、別箇所の状態管理・再renderへ影響するためPhase 7.1の必須実装から外す。

- purchase/hold cardの追加animation
- route endpoint S/Gのone-shot emphasis
- async operation indicatorのexit animation

特にcurrent route overlayは`DomRouteMapView.renderNavigation()`のたびに再生成されるため、`.route-endpoint`へ単純なone-shot CSS animationを付けると「route変更時だけ」ではなく別の再renderでも再生され得る。必要なら別Taskでroute identityに基づく再生条件を設計する。

## やってはいけないこと

- motion libraryを追加しない。
- animationのためだけにglobal stateやtimerを追加しない。
- `width`、`height`、`top`、`left`等を毎frame animateしない。
- 購入/保留等の操作完了をanimation待ちにしない。
- reduced motion時に大きなtranslate/scaleやloopを残さない。
- `motion.css`というfileの存在だけをRED testにしない。利用者向け挙動をtestする。
- Task 1のroute flowを`motion.css`へ移さない。route flowは案内表現として`target.css`に残す。

## 対象ファイル

**作成:**
- `apps/webapp/css/motion.css`

**変更候補:**
- `apps/webapp/index.html`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/components/comipath-settings.ts`（Task 4のwrapper/classが必要な場合のみ）
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/management.spec.ts`
- Gallery/settingsの既存testのうち必要なもの

`async-operation-indicator.ts`、route overlay、purchase lifecycleは今回の対象にしない。

## CSS分離契約

`motion.css`は既存CSSの後に読み込む。内容は少数の機能単位で分ける。

```css
/* Gallery swipe hint */
/* Management entry */
/* Task 6で必要ならmanagement detail transition */
/* Reduced motion overrides */
```

各motionは専用class/selectorで独立させる。JavaScriptは状態遷移を即時完了し、animation終了eventを業務処理の条件にしない。

## Gallery swipe hint契約

現行`showSwipeHintIfNeeded()`の次を維持する。

- localStorage keyは変更しない。
- 初回だけ自動表示する。
- tapで即dismissできる。
- storage unavailableならhint自体を必須機能にしない。
- 自動dismissの既存時間を大きく変えない。

markupは現行要素を最小変更し、`aria-hidden`の小さなdemo要素を追加してよい。card/arrow等は左右へ10〜16px程度動く短い例示に留め、長時間loopしない。

具体的なduration/distanceは初期候補であり、受入条件の固定値ではない。

## management entry契約

- `#settings-area`のbackgroundはopen直後からopaque。
- animateする場合は内側contentだけ。
- 200ms前後の短い`opacity + translate`程度に留める。
- open/close、focus activation、scroll lockの実処理はanimationを待たない。

Task 4で内側wrapperが不要だった場合、motionだけのために大きなcomponent再構成をしない。既存子要素へ適用できるclass構造を優先する。

## 手順

- [ ] **Step 1: Gallery hintの挙動RED testを追加する**

no-preference:

- 初回openでhint textとdemoが見える。
- demoのcomputed transform/animationが実時間で変化する。
- dismiss後または再訪で自動表示しない。

reduced motion:

- hint textは読める。
- demoの移動animationは停止する。

CSS assetの存在だけをassertする専用testは追加しない。build/public tree検証で配布漏れを確認する。

- [ ] **Step 2: Gallery hint markupを最小変更する**

既存`showSwipeHintIfNeeded()`のstorage/timer lifecycleを再利用し、motion用DOMだけを追加する。新しいstate storeや追加timerを作らない。

- [ ] **Step 3: `motion.css`へGallery motionを実装する**

`transform`中心にし、1〜2回程度で停止する。letter-spacingを主motionにしない。

- [ ] **Step 4: management entryを必要最小限追加する**

Task 4 E2Eでopen直後の四辺遮蔽が維持されることを確認する。entry motionがなくても管理操作は同じ順序で成立する。

- [ ] **Step 5: reduced motionを一括確認する**

Gallery hintとmanagement entryの非必須motionを停止/縮小し、text、focus、button、status等の情報は残す。

- [ ] **Step 6: verification**

```bash
npm run test:webapp
npx playwright test tests/e2e/webapp.spec.ts tests/e2e/management.spec.ts --grep "swipe|管理|motion|reduced"
npm run build:webapp
node scripts/audit-public-tree.mjs
npm run check:webapp
git diff --check
```

- [ ] **Step 7: commit**

実際に変更した`motion.css`、Gallery/settings、E2E/testだけをstageする。

## 受入条件

- Gallery初回hintが実際の横swipeを短いmotionで示す。
- hintは一度だけ自動表示され、既存storage keyを維持する。
- management backgroundはmotion中も完全にopaque。
- 非必須animationは`motion.css`へ分離する。
- reduced motionでは移動animationが停止/縮小し、必要情報が失われない。
- animationのために業務操作やstatus timerを変更しない。
- 未観測のpurchase/route marker/async indicator演出を追加しない。
