# Phase 7.1 Task 4: management surfaceの完全遮蔽とbackground scroll lock

## 目標

管理画面を開いている間、下層mainの地図・お品書き・headerが画面端やoverscroll時にも見えず、background scrollも動かない状態にする。別URL/pageへ分離せず、Phase 7のfull-screen management surfaceを堅牢化する。

## やってはいけないこと

- managementを別router/pageへ移し、event/day session lifecycleを二重化しない。
- `overflow:hidden`を永続的にbodyへ設定しない。
- open前のscroll位置を失わない。
- close時に既存inline styleを空文字で上書きして、management以外が設定していたstyleを破壊しない。
- nested source diff/delete/outbox dialogのfocus trapを壊さない。
- transparent/backdropだけで下層を隠し、端末overscrollでmainが見える状態を残さない。

## 対象ファイル

**作成:**
- `apps/webapp/js/ui/page-scroll-lock.ts`
- `tests/page-scroll-lock.test.ts`

**変更:**
- `apps/webapp/js/components/comipath-settings.ts`
- `apps/webapp/css/forms.css`
- `apps/webapp/css/base.css`（root/body background contractが必要な場合のみ）
- `tests/e2e/management.spec.ts`
- `tests/comipath-settings.test.ts`または既存settings component test

## 新規interface

```ts
export interface PageScrollLock {
  release(): void;
}

export function lockPageScroll(
  document: Document,
  window: Window,
): PageScrollLock;
```

`lockPageScroll()`は呼び出し時のscroll位置と、変更するbody inline styleの元値を保存する。同一lock instanceの`release()`は複数回呼ばれても二重復元しない。

最低限保存するproperty:

```text
position
top
left
right
width
overflow
```

open時:

```text
scrollY = window.scrollY
body.position = fixed
body.top = -scrollY px
body.left = 0
body.right = 0
body.width = 100%
body.overflow = hidden
html/bodyへmanagement-open class
```

close時:

1. 保存したinline styleを元値へ戻す。
2. `management-open` classを外す。
3. `window.scrollTo({ top: scrollY, left: originalScrollX, behavior: "instant"相当 })`で元位置へ戻す。test/browser互換のため通常の`scrollTo(x, y)`でもよい。

## CSS contract

```css
#settings-area {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100dvh;
  min-height: 100vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg-body);
}

html.management-open,
body.management-open {
  overscroll-behavior: none;
}
```

`100dvh`非対応環境のfallbackとして既存`inset:0`と`min-height:100vh`を維持する。

management surfaceのbackgroundは完全opaqueにする。opacityをsurface自身へanimationしない。Task 5でentry animationを追加する場合はsurface内contentだけをanimateする。

## 手順

- [ ] **Step 1: scroll lock unit RED testsを書く**

`tests/page-scroll-lock.test.ts`で次を固定する。

- scroll位置1234pxでlockするとbodyがfixed、`top:-1234px`になる。
- releaseで元styleを完全復元する。
- `scrollTo`が元scroll位置で呼ばれる。
- releaseを2回呼んでも2回目にstyleを壊さない。
- 元からbodyにinline `position`や`overflow`があるcaseも復元する。

- [ ] **Step 2: `lockPageScroll()`を実装する**

function内部だけでdocument/windowを扱い、global `window`へ直接依存しない。これによりunit testでstub可能にする。

- [ ] **Step 3: ComipathSettings lifecycleへ接続する**

`open`がfalse→trueになった時だけ1個のlockを作る。true→falseまたは`disconnectedCallback()`でreleaseする。

推奨field:

```ts
private pageScrollLock: PageScrollLock | null = null;
```

既存`DialogFocusController`のactivate/deactivateと同じtransitionで管理するが、focus controller内部へscroll lock責務を追加しない。

- [ ] **Step 4: surface CSSをopaque full viewportへ固定する**

`#settings-area`自身はopen直後からopaque backgroundを持つ。Task 5のfade/translateは`.management-surface-content`等の内部wrapperへ適用する。

必要なら`comipath-settings.ts`のrenderを次のようなwrapperへする。

```html
<div class="management-surface-content">
  ...existing management content...
</div>
```

- [ ] **Step 5: scroll chainingを抑止する**

management内部を最上端/最下端までscrollしてさらにpointer/wheel/touch scrollしてもmain側scroll位置が変わらないことをE2Eで確認する。

`overscroll-behavior`だけに依存せず、body fixed lockと併用する。

- [ ] **Step 6: management 4辺遮蔽E2Eを追加する**

managementを開いた状態でviewport cornerのelement/backgroundを確認する。

```ts
for (const [x, y] of [[1,1], [width - 2,1], [1,height - 2], [width - 2,height - 2]]) {
  const id = await page.evaluate(({x,y}) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest("#settings-area")?.id ?? "";
  }, {x,y});
  expect(id).toBe("settings-area");
}
```

safe-area端末相当viewportでも実行する。

- [ ] **Step 7: background scroll E2Eを追加する**

mainを途中までscrollして管理を開き、management内scroll後もmainの保存scroll位置が変化しないこと、close後に同じ位置へ戻ることを確認する。

- [ ] **Step 8: nested modal regressionを確認する**

management→編集→source diff、management→削除→delete dialog、outbox discard dialogで、nested modalがmanagement上に表示され、Escape/focus returnが既存contract通りであることを確認する。

- [ ] **Step 9: 200% zoom / safe-area確認**

管理headerの`閉じる`が常に到達可能で、surfaceの背景切れがないことを確認する。

- [ ] **Step 10: verification**

```bash
npx vitest run --root . tests/page-scroll-lock.test.ts
npm run test:webapp
npx playwright test tests/e2e/management.spec.ts
npm run check:webapp
git diff --check
```

- [ ] **Step 11: commit**

```bash
git status --short
git add apps/webapp/js/ui/page-scroll-lock.ts apps/webapp/js/components/comipath-settings.ts apps/webapp/css/forms.css tests/page-scroll-lock.test.ts tests/e2e/management.spec.ts <実際に変更したtest/CSS>
git diff --cached --name-status
git diff --cached --check
git commit -m "fix(management): fully isolate the management surface"
```

## 受入条件

- management表示中、viewport四辺でmain contentが見えない。
- managementの上端/下端からbackgroundへscroll chainしない。
- open前scroll位置をclose後に復元する。
- nested modalが回帰しない。
- focus/Escape/close button contractを維持する。
- safe-area、100dvh、200% zoomでもsurface切れがない。
