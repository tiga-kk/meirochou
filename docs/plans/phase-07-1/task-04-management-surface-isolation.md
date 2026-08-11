# Phase 7.1 Task 4: management surfaceの遮蔽とbackground scroll isolation

## 目標

管理画面を開いている間、下層mainの地図・お品書き・headerがviewport端やoverscroll時にも見えず、background documentも動かない状態にする。別URL/pageへ分離せず、Phase 7のfull-screen management surfaceを必要最小限だけ堅牢化する。

## 現行実装から確認できること

`#settings-area`はすでに次を持つ。

```css
position: fixed;
inset: 0;
z-index: 1000;
overflow-y: auto;
background: var(--bg-body);
```

したがってPhase 7.1で新しいfull-screen overlayを作り直す必要はない。まず本番で報告された「下層が見える」「backgroundが動く」をE2Eで再現し、既存surfaceで不足しているscroll lock、scroll chaining、viewport/safe-area周辺だけを修正する。

## やってはいけないこと

- managementを別router/pageへ移さない。
- 既存`#settings-area`と重複する新overlayを追加しない。
- 原因再現前に`100dvh`、wrapper、body style一式を形式的に追加しない。
- `overflow:hidden`等をbodyへ永続設定しない。
- open前のscroll位置を失わない。
- close時にmanagement以外が持っていたinline styleを破壊しない。
- nested source diff/delete/outbox dialogのfocus containmentを壊さない。
- scroll lock専用public interface/moduleを一利用者のためだけに必須化しない。

## 対象ファイル

**まず変更候補:**
- `apps/webapp/js/components/comipath-settings.ts`
- `apps/webapp/css/forms.css`
- `tests/e2e/management.spec.ts`
- `tests/comipath-settings.test.ts`等の既存settings component test

**必要な場合のみ:**
- `apps/webapp/css/base.css`
- small private helperまたは`apps/webapp/js/ui/page-scroll-lock.ts`

scroll位置とinline styleの保存・復元が`ComipathSettings`内で十分明確に書けるなら、専用`PageScrollLock` interface/moduleを追加しない。複数箇所で再利用する、またはcomponent testから切り離した方が明らかに安全な場合だけ抽出する。

## scroll lock契約

managementの`open: false → true`で一度だけlockし、`true → false`または`disconnectedCallback()`で一度だけreleaseする。

lock時に必要な状態だけ保存する。

- `scrollX` / `scrollY`
- 実際に変更するbody inline styleの元値
- 必要ならroot/bodyへ付けるclassの既存状態

body fixed方式を使う場合は、少なくとも`position`、`top`、`left/right`またはwidth、`overflow`のうち実際に変更したpropertyを元値へ戻す。releaseは二重実行しても壊れないようにする。

scroll復元は互換性の高い`window.scrollTo(savedX, savedY)`でよい。`behavior: "instant"`を外部契約にしない。

## CSS契約

- `#settings-area`はopen直後からopaqueである。
- `position: fixed; inset: 0`を維持する。
- management自身のscrollは許可する。
- `overscroll-behavior`で可能な範囲のscroll chainingを抑止し、background document側のlockと併用する。
- safe-areaの既存paddingを維持する。
- `100dvh`等を追加するのは、再現したviewport height問題を解消する場合だけとする。
- Task 5でentry motionを追加しても、surface background自体のopacityはanimateしない。

## 手順

- [ ] **Step 1: production pathのRED E2Eを先に追加する**

managementを実際の`#toggle-settings`から開き、次を再現する。

1. mainを途中までscrollする。
2. managementを開く。
3. management内を上端/下端までscrollし、さらにwheel/touch相当入力を行う。
4. background documentの論理scroll位置が変わらないことを確認する。
5. managementを閉じる。
6. open前のscroll位置へ戻ることを確認する。

四隅について`elementFromPoint()`等で`#settings-area`またはその子孫が最上位にあることを確認してよいが、色だけのsnapshotを唯一の証明にしない。

- [ ] **Step 2: 現行CSSだけで足りる箇所を分類する**

`position: fixed; inset:0; background`は既存なので重複実装しない。失敗原因を次のように分ける。

- background documentがscrollする。
- scroll chainingが起きる。
- viewport/safe-area端でsurface自体が不足する。
- nested dialogのstacking/focusが原因で下層が露出する。

原因に対応する変更だけを行う。

- [ ] **Step 3: 最小scroll lockを`ComipathSettings` lifecycleへ接続する**

`updated()`のopen transitionと`disconnectedCallback()`を既存`DialogFocusController`と同じlifecycleで扱う。ただしfocus controllerへscroll責務を混ぜない。

private field/helperで十分ならそのまま実装する。抽出する場合も、APIを将来用途向けに広げない。

- [ ] **Step 4: style/scroll復元のunit testを追加する**

最低限:

- scroll位置を保存する。
- lock中にbackgroundが動かないためのbody stateになる。
- close/disconnectで元styleとscroll位置を復元する。
- release相当処理を二度走らせても元styleを壊さない。
- 元からinline styleがあるcaseを復元する。

実装をprivate helperのままにした場合はcomponent lifecycle経由でtestする。

- [ ] **Step 5: nested modal regressionを確認する**

management→編集→source diff、management→削除→delete dialog、outbox discard dialogで、nested modalがmanagement上に表示され、Escape/focus returnが既存契約どおりであることを確認する。

- [ ] **Step 6: safe-area / 200% zoomを確認する**

管理headerの「閉じる」が到達可能で、四辺の背景切れがないことを確認する。問題が再現しなければ不要なviewport CSSを追加しない。

- [ ] **Step 7: verification**

```bash
npm run test:webapp
npx playwright test tests/e2e/management.spec.ts --grep "管理|scroll|遮蔽|200%"
npm run check:webapp
git diff --check
```

抽出helper testを作った場合だけfocused commandへ追加する。

- [ ] **Step 8: commit**

実際に変更したsettings/CSS/testだけをstageする。

## 受入条件

- management表示中、viewport端からmain contentが露出しない。
- managementの上端/下端からbackground documentへscroll chainしない。
- open前scroll位置をclose後に復元する。
- 元のinline styleを破壊しない。
- disconnect/closeのどちらでもlockが残らない。
- nested modal、focus、Escape、close buttonが回帰しない。
- safe-area、200% zoomでもsurface切れがない。
- 既存full-screen surfaceを重複実装しない。
