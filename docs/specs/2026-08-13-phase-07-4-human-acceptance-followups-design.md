# Phase 7.4 人間受入follow-up設計

## この文書の位置づけ

この文書は、Task 1〜9実装後の2026-08-13人間確認で判明した不具合・不足を反映するPhase 7.4の追加設計である。

`docs/specs/2026-08-13-phase-07-4-route-visual-nearby-map-and-priority-filter-design.md`と矛盾する場合は、この文書を優先する。Task 1〜9を履歴上なかったことにはせず、人間受入FAILを受けたTask 10以降で修正する。

## 地図上の候補地点選択

現在の地図ピンは主要touch targetとして44pxの操作領域を持つ。この操作性は維持するが、近接する複数ピンの操作領域が重なったときにDOMの重なり順だけで候補が決まってはならない。

pointer/tap位置と候補ピン中心の画面上距離を比較し、操作地点に最も近い候補を選ぶ。見た目のピンを極端に小さなclick targetへ戻して問題を隠さない。keyboard操作は既存buttonのfocus/activationを維持する。

## 現在経路・候補経路の線

候補経路は青系の**連続した実線**とする。`stroke-dasharray`による破線は、経路が途切れているように見えるため使用しない。

現在経路は赤、候補経路は青という意味を維持する。

経路線はズーム倍率1付近では現在の視認性を維持し、拡大時は画面上の線幅を単調に細くする。小さくしすぎない下限を持ち、current/candidateで同じズーム規則を使う。ルート点列、Dijkstra、ALNSをズーム操作のたびに再計算しない。

`GestureZoomController`の既存`scale/x/y`を唯一のズーム情報として使う。必要ならtransform変更通知を最小限追加し、地図viewが表示だけを更新する。

## 経路アニメーション

Task 1のheadless検証だけでは人間受入を満たさなかった。人間確認ではcurrent routeのmoving cueを視認できなかったため、Phase 7.4を再オープンする。

Task 12では次を別々に切り分ける。

1. `prefers-reduced-motion`が実行環境でanimationを無効化していないか。
2. `stroke-dashoffset`のcomputed valueが時間変化しているか。
3. その時間変化が実際のrasterized pixelsの差として現れているか。
4. pixelsが変化していても、人間が方向として認識できるコントラスト・長さ・速度か。

自動受入では`no-preference`を明示したC108経路overlayを使い、通常再生でcomputed valueが時間変化することを確認する。その上で同じanimationを異なる二つの位相へ固定して同一cropを取得し、PNGをpixelとして比較する。raw bufferの単純な不一致や`changedPixels > 0`だけを合格条件にせず、微小な描画ノイズを超える意味のある差分量を固定fixtureでassertする。同じ位相を二度比較する負の対照も置く。computed styleだけを証拠にせず、新しい画像比較依存やproductionのテスト専用分岐も追加しない。

`reduce`時はanimationを無効化する既存アクセシビリティ契約を維持する。その場合でも静的な方向cueは残す。

## 周辺地図の操作UI

Phase 7.4初期実装には内部状態としてpriority・件数・hold filterがあるが、人間が操作できるUIが不足している。地図surface内へ次を常設する。

- 優先度: 既存Gallery/経路案内と同じ完全一致・複数選択。未選択は「すべて」。
- 件数: 5 / 10 / 15 / 20。
- 「保留も表示」切替。

処理順はstatus/hold/priorityで絞り、walkable grid距離順に並べ、最後に件数上限を適用する。

## 周辺カードの選択と目的地変更

従来設計の「カードタップはお品書き拡大のみ」「周辺地図から目的地変更しない」は変更する。

カードを選択すると、そのカードを選択状態として前面へ出し、少なくとも次の明示actionを表示する。

- お品書きを見る
- 目的地にする

「目的地にする」は新しいrouting処理を作らず、`BrowserApplication.handleSetNextTarget()`から既存`RouteGuidanceController.setManualDestination()`へ接続する。

Route Guidanceのcurrent positionが未確定で目的地変更できない場合は既存と同じエラー契約を使う。周辺地図の検索基準地点をRoute Guidanceの現在地へ勝手に昇格させない。

## 周辺カード配置

カードは地図transform layerと一緒に拡大縮小しない。地図上のanchorはmap-spaceに保持し、カードはviewport上のscreen-space overlayへ配置する。

表示件数が5件程度なら、利用可能なscreen-spaceがある限りカード同士を重ねないことを優先する。

- 既配置カードと交差する候補位置は原則不採用。
- 複数の候補slotからanchorに近い位置を選ぶ。
- 画面端からはみ出さない。
- どうしても非重複配置できない狭いviewportだけ、最小重なりをfallbackとする。
- 選択カードは最前面にできる。
- physics simulationや外部layout engineは追加しない。

## leader line

leader lineは情報量の多い会場地図上でもanchorとの対応を追える必要がある。

単純な2px線だけではなく、画面上で十分な視認性を持たせる。推奨は太い明色の下線と、その上の濃色本線の二重線である。

カードがscreen-space overlayになった後も、anchorのmap座標をcurrent transformでviewport座標へ変換して線の端点を更新する。

## 独立地図の縦横比

独立した「地図」surfaceでは、経路画面向けの固定`minimumInteractiveHeight` / `viewportMaxHeight`によって一律の横長窓へ切り取らない。

初期表示は、controlsを除いた利用可能領域へ地図全体をaspect ratioを保ってcontainする。

- 横長地図は横幅基準。
- 縦長地図は高さ基準。
- 必要なら上下または左右に余白ができてよい。
- 初期状態で地図の一部をcropしない。
- その後のzoom/panは既存`GestureZoomController`を使う。

通常のRoute Guidance mapまでこのlayout規則へ巻き込まない。

## 購入Undoと現在地

購入Undoはstatus / GAS outbox / Route Guidance snapshotだけでなく、購入操作直前の現在地フォームも復元する。

最新Undo情報へ「購入直前にフォームから解決できた現在地space」を保存し、Undo成功後に`ui.updateCurrentLocation()`等の既存入力更新経路で戻す。

直前spaceを取得できない場合は、購入前Route Guidance snapshotのcurrent positionがcircle由来ならその`circleSpace`をfallbackに使う。推測で無関係なspaceを入力しない。

Undo後にroute snapshotは復元済みなのにフォームだけ空欄となり、次操作で「現在地を入力してください」となる状態を禁止する。

## 表示中心の位置表示

通常の経路地図と独立周辺地図の双方で、現在viewport中心が地図上のどこかを常時表示する。

表示例:

```text
表示中心: 東7 J23付近
```

viewport中心を現在のzoom/pan transformから元画像座標へ逆変換し、`points.json`の全配置点から最も近いidentifier/numberを求める。ユーザーが読み込んだサークルだけを探索対象にしない。

- area名 + identifier + numberを表示する。
- map外へoverscroll中は地図内へclampして解決する。
- transform更新ごとに全点探索を同期実行し続けず、表示更新を適切に間引く。
- 数千点規模のC108 pointsに対して新しい空間index libraryは導入しない。単純探索で十分ならそれを使う。

## 人間受入

Task 18は自動テストだけで完了にしない。

C108の実画面で少なくとも次を人間が確認する。

- 近接2ピンを意図どおり別々に選べる。
- candidate blue routeが途切れない。
- `no-preference`環境でcurrent moving cueが実際に見える。
- 拡大時に赤/青線が通路を覆わない。
- 周辺地図でpriority・5/10/15/20・holdを操作できる。
- 5件程度のカードが通常条件で重ならず、選択・前面化・「目的地にする」が動く。
- leader lineを追える。
- 各map bundleの縦横比に応じて地図全体が初期表示される。
- 購入Undo後に現在地入力が実用可能な状態へ戻る。
- pan/zoomに追従して「表示中心: ...付近」が更新される。

人間確認がFAILならTask 18を完了にせず、症状と再現条件をreview/progressへ記録する。