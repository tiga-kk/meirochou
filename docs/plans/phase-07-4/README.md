# Phase 7.4: 経路表示信頼性・周辺地図・優先度フィルター

## 目的

Phase 7.3の残件を閉じながら、優先度で巡回対象を限定できる経路案内と、任意地点を基準に近いサークルのお品書きを重ねて表示する独立地図モードを追加する。

Task 1〜9の実装・自動検証後、2026-08-13の人間確認でvisual/interaction上の複数FAILが判明したため、Phase 7.4はTask 10以降で再オープンした。Task 1〜9の履歴は保持し、終了判定だけを失効させる。

## 正本

- 現在状態: `docs/status/progress.md`
- 初期設計仕様: `docs/specs/2026-08-13-phase-07-4-route-visual-nearby-map-and-priority-filter-design.md`
- 人間受入follow-up設計: `docs/specs/2026-08-13-phase-07-4-human-acceptance-followups-design.md`
- animation初期診断: `docs/reviews/phase-07-4-route-animation-diagnosis.md`
- 人間受入FAIL記録: `docs/reviews/phase-07-4-human-acceptance-failures.md`
- 自動/外部検証記録: `docs/reviews/phase-07-4-field-verification.md`

外部挙動が初期設計とfollow-up設計で競合する場合はfollow-up設計を優先する。

Task開始時の基準commitは、実装開始直前の対象branchの最新remote HEADから取得する。文書中の過去SHAを実装開始SHAとして固定しない。

## 共通制約

- 新しい地図library、motion library、state management library、UI frameworkを追加しない。
- Route GuidanceのDijkstra / ALNS / snapshot契約をUI都合だけで別実装へ置換しない。
- animationのための`setInterval`、毎frameのroute再計算、毎frameのSVG再生成を追加しない。
- priorityは完全一致の複数選択とし、Gallery・周辺地図・経路案内で意味を一致させる。
- 周辺の「近い」はwalkable grid距離で判定し、ユークリッド距離を代用しない。
- 周辺地図の検索基準地点はRoute Guidanceの現在地を変更しない。
- 経路案内では保留を巡回対象外とする。
- お品書き配置のためにphysics simulationや外部layout engineを導入しない。
- 購入Undoは最新1件だけとし、複数段Undoへ広げない。
- visual snapshotは人間確認前に一括更新しない。
- 390px、200% text zoom、keyboard focus、44px主要touch target、safe-area、`prefers-reduced-motion`を維持する。

## タスク順序

| Task | 内容 | 主な依存 |
|---|---|---|
| 1 | 経路animationのscreen-space診断と修正 | なし |
| 2 | priority判定規則の共通化 | なし |
| 3 | priority条件を通常の経路案内へ適用 | Task 2 |
| 4 | 独立した地図閲覧surfaceの追加 | なし |
| 5 | 任意検索基準地点とgrid origin解決 | Task 4 |
| 6 | grid距離による周辺サークルランキング | Task 2, 5 |
| 7 | 地図上のお品書きカード・leader line・配置 | Task 6 |
| 8 | 一覧以外の購入経路へ最新1件Undoを拡張 | なし |
| 9 | 初回の総合回帰・外部確認記録 | Task 1〜8 |
| 10 | 近接地図ピンの選択曖昧性を解消 | なし |
| 11 | 候補経路の連続表示とズーム連動線幅 | Task 10後推奨 |
| 12 | 経路animationを実描画基準で再診断 | Task 11 |
| 13 | 周辺地図の絞り込みcontrolsとcard actionを接続 | なし |
| 14 | 独立地図を元の縦横比で初期表示 | Task 13 |
| 15 | 周辺カードを画面座標で非重複配置 | Task 13, 14 |
| 16 | 購入Undoで現在地入力も復元 | なし |
| 17 | 地図viewport中心の配置位置を常時表示 | Task 11, 14 |
| 18 | 人間受入と回帰検証でPhaseを再終了 | Task 10〜17 |

Task 10〜17は一度に一Taskずつ実装する。同じファイルを触るTaskは上表の順で進め、後続Taskが先行Taskの未commit差分を前提にしない。

Task 12はTask 1の再試行ではなく、Task 1の自動証拠で閉じられなかった「実際に人間へ見えるか」をrasterized pixelsまで下げて診断する。

Task 15ではカードをmap transform layerの外へ出すため、Task 14のviewport geometry確定後に行う。

Task 18だけはheadless自動検証だけで完了にしない。

## Phase 7.4再受入条件

- 近接する二つの候補pinを別々に選べる。
- candidate routeは青い連続実線で、経路が途切れて見えない。
- current/candidate線は縮小時に読みやすく、拡大時は細くなって通路を覆わない。
- `no-preference`環境でcurrent moving cueを人間が視認できる。
- `reduce`ではanimationが停止しても静的方向情報が残る。
- 周辺地図でpriority、5/10/15/20、holdを操作できる。
- 周辺cardを選択し、お品書き表示と「目的地にする」を実行できる。
- 5件程度の周辺cardが通常viewportで重ならず、選択cardを前面化できる。
- leader lineを情報量の多い地図上で追える。
- standalone mapはarea画像のaspect ratioを保ち、初期状態で全体が見える。
- 購入Undo後に現在地フォームも購入直前の有効状態へ戻る。
- 通常route mapとnearby mapの双方で「表示中心: <area> <space>付近」がpan/zoomへ追従する。
- priority filter、nearby grid距離、Route Guidance、GAS outbox等の既存意味的回帰がない。
- `npm run verify`
- `npm run test:e2e:ci`
- `node scripts/audit-public-tree.mjs`
- `git diff --check`
- Task 18の人間visual/interaction受入

## Phase終端で残してよい外部事項

実GAS資格情報やphysical deviceが利用できず確認できない事項は、理由付きでfield verification/progressへ「未確認」と記録できる。ただし今回人間が既にFAILを確認したvisual/interaction項目は、環境不足を理由に未確認へ戻して終了してはならない。