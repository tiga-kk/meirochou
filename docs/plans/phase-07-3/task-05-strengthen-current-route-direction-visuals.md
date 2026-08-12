# Phase 7.3 Task 5: 現在経路の方向表示強化

## 目標

現在歩いている経路が、候補経路と混同せず、実機で進行方向まで認識できる表示にする。

既存 `route-overlay-svg.ts` にはcurrent routeのbase line、comet、direction marker、start/goal表現が既にある。新しいanimation engineやJS frame loopを作らず、既存SVG/CSS契約を調整する。

## 表示契約

現在経路は少なくとも次を持つ。

- 常時見える赤系のsolid base path。
- base path上を進む、より明るいcometまたはdash cue。
- 進行方向を静的にも読めるarrow/direction marker。
- start/goalの識別。

候補経路は既存の青系表示を維持し、現在経路の赤と同じ意味にしない。

`prefers-reduced-motion: reduce` ではmoving cometを止めてよいが、base pathと静的direction cueは残す。

## 対象ファイル

**変更候補:**

- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/css/target.css`
- `apps/webapp/css/motion.css`
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

既存styleの実際の所有ファイルを確認し、同じruleを複数CSSへ重複させない。

## テスト方針

最初に次のREDを作る。

- current route SVGにsolid baseと方向cueが同時に存在する。
- candidate routeはcurrent routeの赤いclass/markerを使わない。
- reduced motionでもbase pathと静的direction cueが残る。
- current routeがない状態では不要なanimation要素を表示しない。

visual snapshotは補助として利用してよいが、classやSVG構造の意味的assertionも持つ。snapshot更新だけで完了しない。

## やってはいけないこと

- `requestAnimationFrame`でdash offsetを更新するJS animationを追加しない。
- current/candidateの色意味を統合しない。
- reduced motionで経路自体を非表示にしない。
- 新しいroute stateを作らない。

## 完了条件

- current routeが静止画でも識別でき、motion有効時は進行方向がより分かりやすい。
- candidate routeとの意味が分離されている。
- reduced-motion contractを満たす。
- Task 8でheaded visualを確認できる状態になっている。