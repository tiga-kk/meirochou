# Phase 7.4: 経路表示信頼性・周辺地図・優先度フィルター

## 目的

Phase 7.3の残件を閉じながら、priorityで巡回対象を限定できる経路案内と任意地点の周辺サークルを探す独立地図を追加する。

Task 1〜18で主要機能と最初の人間受入follow-upを実装した。その後の2026-08-14第二回人間確認で、残件は**経路アニメーション**と**独立「地図」画面のworkspace設計**の二テーマに限定されたため、Phase 7.4をTask 23〜27で再度開く。

Task 19〜22は第二回人間確認より前に作成した未実装の暫定計画であり、**実装しない**。Task 23〜27が後続の正本である。

## 正本

- 現在状態: `docs/status/progress.md`
- 初期設計: `docs/specs/2026-08-13-phase-07-4-route-visual-nearby-map-and-priority-filter-design.md`
- 第一回follow-up: `docs/specs/2026-08-13-phase-07-4-human-acceptance-followups-design.md`
- 第二回follow-up設計: `docs/specs/2026-08-14-phase-07-4-motion-and-map-workspace-redesign.md`
- 第一回人間受入FAIL: `docs/reviews/phase-07-4-human-acceptance-failures.md`
- 第二回人間受入FAIL: `docs/reviews/phase-07-4-second-human-acceptance-failures.md`
- 自動/外部検証: `docs/reviews/phase-07-4-field-verification.md`

後発仕様が競合する場合は、今回の第二回follow-up設計を優先する。

## 今回のスコープ制約

- Task 23〜27ではanimationと独立地図workspace以外へ機能を広げない。
- AndroidのAnimator設定変更を正常運用条件にしない。
- current motionの既定値は端末のreduced-motionを尊重し、明示`always`だけをoverrideとする。
- moving cueはfull-path repaintを増やすのではなく、5個程度の軽量markerへ分離する。
- candidate routeは静的青線を維持する。
- gesture中は地図操作をmotionより優先する。
- nearby ranking、priority、origin、route optimizer、Undo、GASの意味論を変えない。
- catalog cardをmap上へ重ねない。
- narrow/mediumのcatalog panelを横一列stripにしない。
- card画像を一律aspect ratioへ強制しない。
- catalog detail viewerを二重実装せず、既存viewerをnearby mapより前面で再利用する。
- 新規framework/libraryを追加しない。
- visual snapshotを人間確認前に一括更新しない。

## タスク順序

| Task | 内容 | 状態 | 主な依存 |
|---|---|---|---|
| 1〜18 | 初期実装・第一回人間受入follow-up | 履歴上完了 | 各Task参照 |
| 19〜22 | 第二回確認前の暫定follow-up案 | **置換済み・実装禁止** | - |
| 23 | 経路アニメーション設定をアプリ内へ追加 | 未着手 | Task 18 |
| 24 | 軽量な複数経路cueへ置換 | 未着手 | Task 23 |
| 25 | 独立地図をレスポンシブなworkspaceへ再設計 | 未着手 | Task 24後推奨 |
| 26 | お品書き詳細を地図より前面に表示 | 未着手 | Task 25 |
| 27 | 経路motion・地図workspaceの最終人間受入 | 未着手 | Task 23〜26 |

一度に一Taskだけ実装し、RED → 最小実装 → focused verification → 差分レビュー → commitの順を守る。

## Phase 7.4 最終受入条件

### 経路motion

- Motorola AndroidでAnimator=0を維持したまま、アプリ設定`always`でcurrent motionを視認できる。
- `system`はOS reduced-motionへ従い、`off`は常に停止する。
- 白いmoving cueが5個程度あり、start→goalへ現状より速く流れる。
- animation ONでもmap pan/dragがOFF時より明確に重くならない。
- candidateは静的青線のまま。

### 独立地図workspace

- 地図が第二回人間確認時より明確に大きく、余白を有効利用する。
- 390px、644x886級、900px以上でresponsive layoutが成立する。
- cardはmap外へ表示され、narrow/mediumで横一列stripにならない。
- card画像は自然aspect ratioを維持する。
- leader lineをmap anchorからcardまで追える。
- `お品書きを見る`でnearby mapを閉じず、detailが前面表示される。
- detail close後に元cardへfocusが戻り、map stateが保持される。

### 回帰

- `npm run verify`
- `npm run test:e2e:ci`
- `node scripts/audit-public-tree.mjs`
- `git diff --check`
- Task 27のMotorola実機・人間visual/interaction受入

実GASの既存外部確認残件は今回の二テーマと独立しており、Task 23〜27へ混ぜない。
