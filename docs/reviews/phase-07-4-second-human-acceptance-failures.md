# Phase 7.4 第二回人間受入FAIL記録

確認日: 2026-08-14

## 結論

Task 18後の公開画面をMotorola Androidと実画面で再確認した。Task 10〜18で近接pin、青線、Undo、leader line等は大幅に改善したが、Phase 7.4はまだ終了できない。

今回の残件は経路アニメーションと独立「地図」画面の二テーマに限定する。Task 19〜22はこの実機結果を得る前に作成した未実装の暫定計画であり、実装せずTask 23〜27へ置換する。

## 1. Androidでの経路アニメーション

### 実機事実

Motorola Androidでは、確認開始時に「アニメーションを無効化」が有効で、開発者向けオプションの三つのanimation scaleも0xだった。

その後、`Animator 再生時間スケール`だけを1xへ変更すると、meirochouのcurrent route animationは即座に視認できるようになった。同時に地図のpan/dragが以前のように重くなった。また通常のAndroidアプリのanimationも復活した。

したがって次が確認できた。

- current route motionが見えなかった主要因の一つはAndroidのreduced-motion/Animator設定である。
- 利用者へAnimator=1xを要求すると、meirochou以外の通常アプリの挙動まで変わるため採用できない。
- motionが有効な時だけ地図操作が重くなる強い相関があり、現行のfull-path motion描画は性能面でも再設計対象である。

### 追加要望

moving cueとして見える白い物体を現状より増やし、流れる速度も上げる。単に現行`stroke-dashoffset`の頻度を上げてpaint負荷を増やす実装は禁止し、軽量方式で実現する。

## 2. 独立「地図」画面

### 実画面事実

2026-08-14のスクリーンショットでは、上部controlと左右に余白が残る一方、肝心のmap viewportが小さい。地図外へ移したお品書きカードは重ならなくなったが、横一列stripになったため、5件でも横方向へslideしないと全件を確認できない。

またカードの縦横比がほぼ一律になり、元画像が縦長/横長であることを活かせていない。

`お品書きを見る`を押すと既存の画像detailがnearby map surfaceより背面へ表示され、利用者は一度地図画面を閉じないと詳細を確認できない。

### 今回維持する改善点

- priority、件数、hold controls。
- 任意origin/current location。
- card選択と「目的地にする」。
- card非重複。
- 高コントラストleader line。
- 表示中心ラベル。

これらを壊してレイアウトを作り直さない。

## 3. 設計への帰結

- motionはOS全体の設定変更を前提にせず、アプリ内`system / always / off`設定を持つ。
- motion描画は静的routeと独立した5個程度の軽量cueへ変更する。
- gesture中はmotion負荷を抑える。
- nearby mapはfull-height workspaceへ変え、余白をmapまたはside panelへ割り当てる。
- narrow/mediumでは横一列stripを廃止し、折り返しgridを使う。
- wideではright side panelを使う。
- card imageは自然aspect ratioを尊重する。
- catalog detailはnearby mapより前面のnested layerとして開き、map stateを維持する。

詳細な実装契約は`docs/specs/2026-08-14-phase-07-4-motion-and-map-workspace-redesign.md`を正本とする。
