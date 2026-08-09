# Phase 6 ユーザー体験改善 設計

## 目的

Phase 5Dで整理した責務境界を維持したまま、実際のデプロイ環境で確認された操作性、情報設計、初見時の分かりにくさ、経路案内の状態不整合を改善する。

このPhaseで最も重要な表示は「地図」と「お品書き」である。次の目的地、距離、優先度、アカウント等の補助情報は、判断に必要な範囲を保ちつつ縦方向の占有を最小化する。

## 確定したユーザー要求

1. 一覧では縦長のお品書きを2列、横長画像を全幅で表示する。
2. 2列の縦長カードは、左列なら左、右列なら右にだけスワイプできるようにする。スワイプは指には追従するが、現在より抵抗感を持たせる。
3. 一覧を初めて開いたとき、スワイプで購入済みにできることを短いアニメーションで示す。
4. 初見ユーザー向けに、CSV/GASの準備方法、必須・任意カラム、基本操作を確認できる常設の使い方画面を設ける。
5. 地図上へ重ねている`NEXT`、`FROM`、`ROUTE`等の大きな情報表示を地図から外し、地図の可視領域を優先する。
6. 地図のパン・ピンチ操作のもっさり感を解消する。
7. 通常経路と候補経路の状態を明確に分離し、経路変更をしていない通常状態で青い候補経路を表示しない。
8. 経路変更を確定した後に購入済みを押しても、NavigationStateと表示中の目的地が一致し、次のサークルへ進む。
9. 地図上の別サークルを選択した際は、通常案内と明確に区別できる候補用の下部パネルを表示する。青い候補経路は「経路を比較」を明示的に開始した場合だけ表示する。
10. 今後の巡回順を一覧で確認できる「予定」導線を設け、地図上でも番号付きピンで順序を確認できるようにする。
11. 全体の見た目を、装飾やカードの重ね合わせを増やす方向ではなく、地図とお品書きを主役にした実用的なナビゲーションUIへ整理する。
12. 購入済みのローカル保存と次の経路への進行は、GAS送信の成否に依存させない。GAS失敗時も購入状態と未送信outboxを端末に保持し、次のお品書きへ進む。

## 現状調査で確認した問題

### 通常状態で候補経路が重なる

`FinishCurrentCircleUseCase`は次の目的地へ進んだ後、`currentRoute`と`selectedRoute`へ同じ経路を入れながら`selectionStatus`を`ready`にしている。さらに`StartRouteGuidanceUseCase`も通常案内の初回目的地を確定するとき同じ組み合わせを作る。地図Viewは`ready`でも候補経路を描画するため、案内開始直後や購入後進行直後に赤い通常経路と青い候補経路が同一位置へ重なり得る。

通常案内ではcurrent/selectedが同じ値でも候補選択中とは扱わず`idle`とする。青線は`comparing`だけで描画する。

### 経路変更後の購入で進行できない

`ChangeDestinationUseCase.confirm()`は表示用の`currentDestination`と`currentRoute`を候補へ昇格させるが、`navigationState.targetSpace`と`lockedFirstLeg`を同じ目的地へ更新していない。一方、`FinishCurrentCircleUseCase`は`navigationState.targetSpace`と購入対象の一致を前提にする。この不一致により、経路変更後の購入が`ignored`になり得る。

### GASと購入後進行の結合が弱い

ローカル購入とoutbox追加は同一のrepository saveで先に確定しており、基本設計はlocal-firstになっている。一方、購入直後は`ChangeCircleStatusUseCase`からbackground sendを要求した後、`BrowserApplication.handleAction()`からも診断用flushを起動している。

さらに`ChangeCircleStatusUseCase`はrepository save後の`backgroundProcess.requestSend()`を通常の同期呼び出しとして実行するため、このbest-effort通知が同期例外を投げた場合、ローカル保存済みでも上位には購入処理失敗として見える余地がある。送信経路はローカルmutation完了後の副作用として明確に隔離する。

現行テストは「GAS失敗時にも購入状態とoutboxが残る」ことは証明しているが、「GAS失敗と無関係にRoute Guidanceが次へ進み、次のお品書きを描画する」結合契約までは固定していない。

### 一覧購入が非同期保存とRoute Guidanceへ正しく接続されていない

`DomCircleGalleryView.handleGalleryPurchase()`は本番では非同期の`BrowserApplication.addPurchased()`を呼ぶが、現行実装はPromiseを待たず、先に購入成功toast、カード除外、件数更新を行う。そのため端末保存が失敗しても一覧だけ成功表示になる余地がある。

また、一覧から現在target以外のサークルを購入すると`FinishCurrentCircleUseCase`は`ignored`になり、ローカル購入状態だけが進んでも`NavigationState.bestOrder`/`provisionalOrder`へそのspaceが残り得る。その後に現在targetを購入した際、すでに購入済みのspaceを次targetとして選び`next-target-missing`へ到達しないよう、一覧購入時に将来順序から除外する必要がある。現在targetと`lockedFirstLeg`は非現在targetの購入では変更しない。

## UI方針

### メイン画面

- sticky headerは薄くし、「一覧」「予定」「使い方」「設定」への導線を横方向へ配置する。
- 現在地入力は一行のコンパクトな操作領域へまとめる。
- 地図上へ大きな情報カードを重ねない。
- 地図直前または直後に、現在の目的地と距離を一行中心で示すコンパクトな案内バーを置く。
- 地図直下はお品書きを優先する。
- Twitter/Xアカウント、優先度、次の目的地等は小さな補助情報として横方向へまとめる。
- 購入済み・保留は常に押しやすい44px以上のタッチ領域を維持する。
- 候補サークル選択時だけ候補用の下部パネルを表示する。
- ページ全体のユーザー拡大をviewport設定で禁止しない。地図操作との競合は地図操作領域だけの`touch-action`で扱う。
- 地図上の旧overlayから表示要素を移す場合、`DomRouteGuidanceView`が参照するDOM idを参照切れにしない。

### 巡回予定

`NavigationState.bestOrder`を基本の表示順とする。最適化結果の更新中など`bestOrder`がまだ利用できない場合だけ`provisionalOrder`を使用する。

予定画面では順序リストと番号付き地図ピンを表示する。将来区間すべてのポリラインを新規計算する機能はPhase 6では追加しない。通常案内に必要な現在区間の経路計算へ負荷を追加しないためである。

### 一覧

- `.gallery-grid`を2列へする。
- 横長画像は既存の`wide`判定を使って2列占有にする。
- 既存の優先度順/スペース順はDOM順として維持し、`dense`配置やJSでの見た目優先再配列を行わない。
- 縦長カードのスワイプ可能方向は、ジェスチャー開始時の実配置から左列/右列を判定する。
- 横長カードは従来どおり左右どちらにもスワイプ可能とする。
- スワイプ中は指の水平移動量をそのまま1:1でカードへ適用せず、係数を掛けて抵抗感を出す。
- 閾値未満では自然に元位置へ戻す。
- 閾値を超えても端末保存成功前にカードを恒久的に除去しない。同じspaceの購入を処理中に二重開始しない。
- 現在target以外を一覧購入した場合は現在経路を維持し、購入済みspaceだけを将来のRoute Guidance順序から除外する。全経路再計算は行わない。
- 初回ヒントは実カードへ購入操作を発生させず、説明用のCSSアニメーションだけを表示する。
- 初回ヒントは同じブラウザで最初の一覧表示時だけ表示し、表示済みをUI専用のLocalStorage keyで保持する。event/dayの保存schemaには追加しない。

## JavaScript / TypeScriptとCSSの責務

CSSへ移すこと自体を性能改善の目的にしない。

CSSが担当するもの:
- Grid/Flexboxによる配置
- 色、余白、境界、文字階層
- transform/opacityの見た目
- transition/animation
- `touch-action`等のブラウザ既定ジェスチャー宣言

TypeScript/JavaScriptが担当するもの:
- Route Guidanceの状態遷移
- スワイプ方向と閾値の判定
- 一覧購入の非同期成功/失敗判定と二重開始防止
- Pointer Eventsからのパン・ピンチ状態
- requestAnimationFrameへまとめる描画更新
- GAS outboxの配送
- 巡回順のViewModel

新しいUIフレームワーク、ジェスチャーライブラリ、アニメーションライブラリは追加しない。

## 地図ジェスチャー方針

現行のtouch/mouse二重実装をPointer Events中心へ整理する。DOM transform自体はCSS transformを使用し、状態更新はTypeScript/JavaScriptで行う。

- 1描画フレームにつきtransform反映は最大1回にまとめる。
- 慣性アニメーションの各フレームで`getBoundingClientRect()`を繰り返さない。
- 操作開始時、画像ロード時、コンテナサイズ変更時等に必要な境界値を更新する。
- ピンチ中も同じtransform stateを正本にする。
- ホイールズームとマウス/タッチの入力を同じ内部状態へ収束させる。
- `pointercancel`/`lostpointercapture`後にactive pointerを残さず、次の操作を開始できる状態へ戻す。
- `touch-action: none`は地図操作領域だけへ限定する。

## GAS local-first方針

- Circle Statusのrepository save成功を購入操作のcommit pointとする。
- Route Guidanceの進行はそのローカルcommit成功後に行う。
- outbox送信要求はbest-effortとし、同期例外や非同期通信失敗を購入操作の失敗へ昇格させない。
- 通常の購入操作からforeground retryを重ねて呼ばない。
- 自動送信は既存background processを所有者とする。
- 一時的な通信失敗はoutboxへ残し、現在のonlineイベント、新しいoutbox追加、手動再送の経路で再試行できる状態を維持する。
- Phase 6では新しい常時ポーリングや無制限の指数バックオフ基盤を追加しない。
- 手動再送の結果は設定画面で確認できる。
- 自動送信失敗は次の地図・お品書き表示を妨げない。

## 対象外

- ALNS、Dijkstra、距離行列の計算方式変更
- GAS/CSVの外部データ形式変更
- LocalStorageのevent/day schema移行
- 全区間の経路線を一括計算する新機能
- 新しいUIフレームワークの導入
- デスクトップ専用の別UI
- Phase 5Dで完了した責務分離の作り直し
