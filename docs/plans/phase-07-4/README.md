# Phase 7.4: 経路表示信頼性・周辺地図・優先度フィルター

## 目的

Phase 7.3の残件を閉じながら、優先度で巡回対象を限定できる経路案内と、任意地点を基準に近いサークルのお品書きを重ねて表示する独立地図モードを追加する。

## 正本

- 現在状態: `docs/status/progress.md`
- 設計仕様: `docs/specs/2026-08-13-phase-07-4-route-visual-nearby-map-and-priority-filter-design.md`
- animation診断: `docs/reviews/phase-07-4-route-animation-diagnosis.md`
- このPhaseの実装順: 本文と各Task文書

Task開始時の基準コミットは、実装開始直前の対象ブランチの最新リモートHEADから取得する。計画作成時に確認した`main`の`2995bdac249efc6f393420e4a312c6ba6426ac9f`は調査基準であり、実装開始SHAとして固定しない。

## 共通制約

- 新しい地図library、motion library、state management library、UI frameworkを追加しない。
- Route GuidanceのDijkstra / ALNS / snapshot契約を、今回のUI都合だけで別実装へ置換しない。
- animationのための`setInterval`、常駐JavaScript timer、毎frameのroute再計算、毎frameのSVG再生成を追加しない。
- priorityは完全一致の複数選択とし、Gallery・周辺地図・経路案内で意味を一致させる。
- 周辺の「近い」はwalkable grid距離で判定し、ユークリッド距離を代用しない。
- 地図閲覧の検索基準地点はRoute Guidanceの現在地を変更しない。
- 周辺地図では通常は保留を除外し、明示的な「保留も表示」でのみ含める。
- 経路案内では保留を常に巡回対象外とする。
- お品書きカード配置のためにphysics simulationや外部layout engineを導入しない。
- 一覧以外の購入Undoは最新1件だけとし、複数段Undoへ広げない。
- visual snapshotはheaded確認前に一括更新しない。
- 390px、200% text zoom、keyboard focus、44px touch target、safe-area、`prefers-reduced-motion`を維持する。

## タスク順序

| Task | 内容 | 主な依存 |
|---|---|---|
| 1 | 経路animationのscreen-space診断と確実な修正 | なし |
| 2 | priority判定規則の共通化 | なし |
| 3 | priority条件を通常の経路案内へ適用 | Task 2 |
| 4 | 独立した地図閲覧surfaceの追加 | Task 1と独立 |
| 5 | 任意検索基準地点とgrid origin解決 | Task 4 |
| 6 | grid距離による周辺サークルランキング | Task 2, 5 |
| 7 | 地図上のお品書きカード・leader line・重なり回避 | Task 6 |
| 8 | 一覧以外の購入経路へ最新1件Undoを拡張 | Task 3と独立 |
| 9 | 総合回帰・実機visual・実GAS残件の終了判定 | Task 1〜8 |

Task 1は他のUI変更と混ぜない。過去の失敗原因を分類し、screen-spaceのREDを作ってから最小修正する。

Task 2〜3はフィルター意味を先に固定し、その後Route Guidanceへ接続する。ALNS内部をpriority filterのために変更しない。

Task 4〜7は地図表示、検索起点、距離ランキング、カード描画を段階的に分ける。最初から一つの巨大なmap controllerへまとめない。

Task 8は既存Gallery Undoの契約を再利用するが、Gallery専用DOMを通常画面から直接操作する形にはしない。

## Phase受入条件

- 390px幅のC108地図でcurrent routeの進行方向を実機/headed browserで認識できる。
- current routeだけがmoving cueを持ち、candidate routeは青系の静的表示になる。
- reduced motionでもcurrent routeのbaseと静的方向cueが残る。
- priority複数選択がGallery、周辺地図、経路案内で同じ意味になる。
- priority条件から外れたcircleが初期経路とALNS入力へ混入しない。
- ヘッダーの「地図」からRoute Guidanceを開始せず地図を閲覧できる。
- 現在地または地図上の任意地点を検索基準にできる。
- blocked cell指定時は最寄りwalkable cellへ補正されるか、安全に拒否される。
- 周辺表示はpriority / hold条件で絞った後にwalkable grid距離順となり、5 / 10 / 15 / 20件上限を守る。
- お品書きカードがspace / priorityとともに地図上へ表示され、leader lineでanchorとの対応が分かる。
- 地図閲覧でRoute Guidanceのcurrent position / target / snapshotが変更されない。
- 通常の目的地画面からの購入でも最新1件Undoができ、status / route / GAS outboxが戻る。
- `npm run verify`
- `npm run test:e2e:ci`
- `node scripts/audit-public-tree.mjs`
- `git diff --check`

## Phase終端で残してよい外部事項

実GAS資格情報や実機が利用できず確認できない場合は、コード欠陥と混同せず`docs/reviews/phase-07-4-field-verification.md`と`docs/status/progress.md`へ「未確認」と記録する。確認不能を自動PASSへ読み替えない。
