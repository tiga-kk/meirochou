# Phase 7.3 Task 4: 地図ドラッグ遅延の計測と最小改善

## 目標

実機で感じる約100ms級のドラッグ追従遅延を、推測ではなく同一条件のtraceで切り分け、効果が確認できる最小の変更だけを採用する。

## 現状を前提にする

`gesture-zoom-controller.js` は既にpointer stateを更新し、transformのDOM writeを `requestAnimationFrame` へ集約している。このTaskで単に「RAFを追加する」ことを解決策にしない。

pointermove hot path、style write、map/pin DOM量、paint/composite、long taskを測る。pointerdown時のlayout readとpointermove時の処理を混同しない。

## 計測条件

同じC108 map、同じpin数、同じviewport、同じ操作でbefore/afterを比較する。最低限次を記録する。

- pointer eventから次のvisual updateまでの遅延。
- pointermove handlerの実行時間。
- RAF callbackの実行時間。
- long taskの有無。
- style/layout/paint/compositeの偏り。
- map上のpin/overlay数。

可能ならDevTools Performance traceを使い、単発の体感だけを採用根拠にしない。

## 比較する最小候補

1. A: 現行実装。
2. B: drag中だけcompositor hint用classを付与し、終了時に外す。
3. C: 計測上RAF待ちが支配的な場合のみ、pointermoveでtransformを直接writeする実験。

`getCoalescedEvents()` が利用可能なら最新pointを採用する実験はしてよい。`pointerrawupdate`、predicted event、新しいgesture libraryは、A〜Cで原因を説明できない証拠がある場合だけ検討する。

## 対象ファイル

**変更候補:**

- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/css/maps.css`
- 必要な場合のみ `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `tests/gesture-zoom-controller.test.ts`
- `tests/e2e/map-render-quality.spec.ts`

## テスト方針

自動テストではwall-clockの「100ms未満」を直接assertしない。CIの負荷で不安定になるため、次の構造を固定する。

- pointermove hot pathへ新しいlayout readを追加しない。
- `getCoalescedEvents()` を使う場合は最新座標が採用される。
- drag開始/終了classが確実に解除される。
- pointer cancelでも状態が残らない。
- pinch/zoomの既存契約を壊さない。

性能改善の採否は同条件traceを証拠とし、構造テストだけで「高速化完了」としない。

## やってはいけないこと

- 既にあるRAF集約を未実装と誤認しない。
- 新しいgesture frameworkを導入しない。
- paint問題をevent頻度だけで解決したことにしない。
- 不安定な時間閾値をunit testへ入れない。
- traceで悪化する実験を残さない。

## 完了条件

- before/afterで同条件の性能証拠がある。
- 採用変更が遅延要因へ対応している。
- 既存drag/pinch/cancel behaviorがfocused testとE2Eで維持される。
- 改善が確認できない場合は無理に複雑化せず、計測結果と残る原因をTask 8向けに記録する。