# Phase 7.4 Task 23: 経路アニメーション設定をアプリ内へ追加

## 目的

AndroidのAnimator設定を利用者へ変更させず、meirochou内でcurrent route motionの扱いを`端末設定に従う / 常に表示 / 表示しない`から明示的に選べる土台を作る。

## 対象外

- moving cueの描画方式変更。Task 24で行う。
- candidate routeのanimation追加。
- AndroidのOS設定を書き換える処理。
- route計算や保存snapshotの変更。

## 前提と依存関係

Task 18までの実装を基準とする。Task 19〜22は未実装の暫定計画として実行せず、Task 23以降を正本とする。

## 読むべき文書と既存実装

- `docs/specs/2026-08-14-phase-07-4-motion-and-map-workspace-redesign.md`
- `docs/reviews/phase-07-4-second-human-acceptance-failures.md`
- `apps/webapp/js/components/comipath-settings.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/data/local-state-adapters.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `tests/settings-component.test.ts`
- `tests/webapp-contracts.test.mjs`

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/route-guidance/ui/route-motion-preference.ts`
- `tests/route-motion-preference.test.ts`

### 変更

- `apps/webapp/js/components/comipath-settings.ts`
- `apps/webapp/js/data/local-state-adapters.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `tests/settings-component.test.ts`
- `tests/webapp-contracts.test.mjs`

### 削除

なし。

## 追加するインターフェース

`route-motion-preference.ts`に次を定義する。

```ts
export type RouteMotionPreference = "system" | "always" | "off";

export function normalizeRouteMotionPreference(
  value: unknown,
): RouteMotionPreference;

export function resolveRouteMotionEnabled(input: {
  preference: RouteMotionPreference;
  prefersReducedMotion: boolean;
}): boolean;
```

`system`は`!prefersReducedMotion`、`always`は`true`、`off`は`false`を返す。

既存`local-state-adapters.ts`へ次のread/writeを追加する。保存不能・不正値は`system`へ縮退し、このUI preferenceだけのためにstorage schema全体のmigrationを増やさない。

```ts
readRouteMotionPreference(): RouteMotionPreference
writeRouteMotionPreference(value: RouteMotionPreference): void
```

`DomRouteMapView`へ次を追加する。

```ts
setRouteMotionPreference(preference: RouteMotionPreference): void
```

このTaskでは有効/無効状態を伝えるところまでとし、現行motion実装自体はTask 24まで維持する。

## 実装手順

1. `route-motion-preference.test.ts`へ三値のnormalizeと`system/always/off`解決を先に書き、未実装でREDを確認する。
2. `settings-component.test.ts`へ`経路アニメーション`三択が表示され、変更eventが`system|always|off`を持つassertionを追加してREDを確認する。
3. `webapp-contracts.test.mjs`へBrowserApplication→viewへの設定配線とlocal-state read/writeの存在を確認するcontractを追加してREDを確認する。
4. pure resolverを最小実装する。
5. `local-state-adapters.ts`へ三値のread/writeを追加し、不正値は`system`へ戻す。
6. `comipath-settings.ts`へ三択controlを追加する。初期値は`system`。
7. `BrowserApplication`で起動時に保存値を読み、settings変更時に保存し、`DomRouteMapView.setRouteMotionPreference()`へ渡す。
8. `matchMedia("(prefers-reduced-motion: reduce)")`のchange listenerを一つだけ持ち、`system`時だけmotion enablementを再評価する。`always/off`ではOS値で勝手に切り替えない。
9. focused testsを通し、差分にroute計算・optimizer変更がないことをレビューする。

## テスト方針

旧実装がREDになる証拠は「設定が存在しない」だけでは不十分で、`reduce=true + always => enabled`、`reduce=false + off => disabled`、保存後reloadで値が復元される意味的assertionを含める。

Task 23だけではMotorola Animator=0で実際に動くことを合格条件にしない。Task 24のrAF cue実装後、Task 27で実機証明する。

## 検証コマンド

```bash
npx vitest run --root . tests/route-motion-preference.test.ts tests/settings-component.test.ts
node --test tests/webapp-contracts.test.mjs
npm run check:webapp
npm run test:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- `system / always / off`以外の状態を持たない。
- 既定値は`system`。
- `system`だけが`prefers-reduced-motion`へ追従する。
- `always/off`は明示的なユーザー選択として永続化される。
- OS設定変更を要求する文言や処理を追加しない。
- Task 24が同じ設定値だけを見てmotion controllerを開始/停止できる。

## 予定コミットメッセージ

```text
feat(webapp): add route motion preference
```
