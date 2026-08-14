# Phase 7.4 経路アニメーション・地図ワークスペース再設計

## 背景

Task 10〜18の実装後、Motorola Android実機と公開画面を人間が再確認した。その結果、経路アニメーションと独立「地図」画面の二点だけがPhase 7.4の終了を妨げる残件として残った。

経路アニメーションについては、Androidの「Animator 再生時間スケール」が0xのときcurrent routeのmoving cueが表示されず、同設定だけを1xへ変更するとmoving cueが表示された。一方で1xへすると地図のpan/dragも明確に重くなり、通常アプリのシステムアニメーションまで復活した。したがって、利用者にOS全体のアニメーション設定変更を要求する設計は採用しない。

独立「地図」画面については、leader lineや非重複化は改善した一方、地図本体が小さく、上部・左右の余白を活用できていない。お品書きカードは横一列のため5件でも横スクロールが必要で、画像の縦横比も一律に見える。また「お品書きを見る」で既存画像モーダルを開いてもnearby map surfaceの背面へ入り、一度地図を閉じないと見られない。

## 今回のスコープ

今回のfollow-upは次の二テーマだけを扱う。

1. Android端末全体のアニメーション設定を変更させず、meirochou内だけで選択可能かつ軽量なcurrent route motionを実現する。
2. 独立「地図」画面を地図中心のレスポンシブなワークスペースへ再設計し、お品書きを地図外へ自然な比率で配置し、詳細を地図を閉じず前面表示できるようにする。

priority、近傍距離計算、route optimizer、購入Undo、GAS、通常経路案内の意味論は変更しない。

## 1. 経路アニメーションの契約

### 1.1 ユーザー設定

アプリ内に `経路アニメーション` 設定を追加し、値を次の三つに限定する。

- `system`: 端末設定に従う。`prefers-reduced-motion: reduce`なら動かさない。
- `always`: meirochou内のcurrent route motionを明示的に有効化する。
- `off`: 端末設定に関係なく動かさない。

初期値は`system`とする。設定は既存local stateの規約に従って永続化する。

`always`はアクセシビリティ設定を無視する既定値にしてはならない。利用者が明示的に選んだ場合だけ使う。

### 1.2 描画方式

現在の長いSVG path全体へ`stroke-dashoffset`を連続適用する方式をmoving cueの主方式として残さない。current routeの赤いbase path、S/G、静的方向情報は残し、motionは小数個の独立cueへ分離する。

初期契約は次の通り。

- 白いmoving cue: 5個。
- cueはstart→goal方向へ等間隔で流れる。
- 目標画面速度: 約160px/s。現行約96px/sより明確に速くする。
- cueは経路変更時に一度だけgeometryをsampleし、frameごとにroute探索・SVG path再生成・DOM再生成をしない。
- frame更新は5個のcue位置だけに限定する。
- `setInterval`は使わない。
- candidate routeは青い静的経路のままにする。

`always`をAnimator=0のMotorola Androidで成立させるため、CSS animation/WAAPIがOS設定で停止する場合は、アプリ所有の単一`requestAnimationFrame` controllerでcue位置を更新する。これは5個のmarker transformに限定し、route再計算やSVG再構築を行わない。

### 1.3 地図操作との競合防止

地図のpointer drag、pinch、慣性開始中はmotion cue更新を一時停止または非表示化し、map transformを最優先する。gesture終了後に同じroute phaseから再開してよい。

既存`GestureZoomController`へ最小のactivity callbackを追加する場合は、第二のgesture state machineを作らない。

### 1.4 受入

Motorola AndroidでAnimator=0のまま、アプリ設定`always`によりmotionが見えることを実機確認する。成立しない場合はPhaseを終了せず、ブラウザ制約として再診断する。

またmotion ON時のpan/drag体感がOFF時から明確に悪化しないことを人間が確認する。自動テストのframe timeだけで代替しない。

## 2. 独立「地図」ワークスペース

### 2.1 基本方針

地図を主役にする。カードをmap viewportへ重ねず、地図外の専用catalog panelへ置く。上部controlの縦占有を減らし、`100dvh`相当の利用可能領域を使い切る。

地図画像の元aspect ratioは保持するが、「全体を必ず初期containして極端に小さくする」ことは要求しない。横長mapは操作可能な十分な高さを確保し、必要なら初期状態で左右をcropしてpanできるほうを優先する。

### 2.2 レスポンシブ構成

レイアウトは純粋なgeometry helperで次のmodeへ分ける。CSSだけの偶然の折り返しに依存せず、テストで390x844、644x886、900px以上を固定ケースとして検証する。

- narrow: 地図を上、catalog panelを下。panelは2列を基本とする折り返しgrid。横一列stripにしない。panelは縦scroll/折りたたみ可。
- medium: 地図を上、catalog panelを下。644x886級では2〜3列で5件を2〜3行以内に配置し、水平scrollを要求しない。
- wide: 地図を左、catalog panelを右。panel幅は概ね280〜340px、残りを地図へ使う。

カード数が多い場合のpanel内縦scrollは許容する。狭い画面で「大きな地図と全5件を同時に無scroll表示」を無理に要求しない。

### 2.3 お品書きカード

カード自体の一律高さ・一律aspect ratioを廃止する。画像は`width:100%`と自然高さを基本にし、必要な上限だけを設ける。既存`catalog-orientation.ts`をorientation classの補助に使ってよいが、縦長/横長を同じ比率へ押し込めない。

space、priority、「お品書きを見る」「目的地にする」の操作領域は44px以上を維持する。

### 2.4 leader line

現在の高コントラスト二重leader lineは維持する。leader SVGはmapとcatalog panelを含むworkspace全体のoverlayとし、map anchorから該当cardの最寄り辺へ引く。

pan/zoom/panel scroll時には既存card DOMを作り直さず、line端点と必要な座標だけ更新する。

### 2.5 お品書き詳細のlayer契約

既存の`DomCircleGalleryView.showPdfModal()`を再利用し、第二の画像viewerを作らない。

nearby mapとcatalog detailをnested dialogとして扱う。

- detailはnearby mapより必ず前面に出る。
- detailを開いてもnearby mapのarea、priority、件数、hold、origin、zoom/pan、selected cardを保持する。
- Escape/戻る操作はdetailを先に閉じ、nearby mapは残す。
- detailを閉じたら「お品書きを見る」を押した元card/buttonへfocusを戻す。
- もう一度Escapeしたときにnearby mapを閉じる。

z-indexの数値を場当たり的に増やすだけではなく、nearby map < catalog detailというnamed layer契約をCSS/DOM testで固定する。

## 3. 対象外

- route optimizer、Dijkstra、ALNSの変更。
- priority semanticsやnearby rankingの変更。
- 新しいUI framework、map library、motion libraryの追加。
- catalog detail viewerの二重実装。
- OSのAnimator設定を利用者へ変更させることを正常運用条件にすること。
- GAS残件の解消。

## 4. 実装順

Task 23でmotion preferenceを確立し、Task 24で軽量cueへ置換する。Task 25で地図workspaceを再構成し、Task 26でdetail layer/focusを修正する。Task 27でMotorola実機と実画面を人間が確認してPhase 7.4を終了する。
