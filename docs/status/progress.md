# 進捗

更新日: 2026-08-09

## 現在の対象

- リポジトリ: `tiga-kk/meirochou`
- 読み取り元: `main`
- Phase 6計画作成時の`main` HEAD: `3322c31cf8c8413ecc6a5d5d2e7abaefea7aa318`
- 計画文書ブランチ: `docs/phase-06-user-experience-plan`
- 現在のフェーズ: Phase 6 ユーザー体験と経路案内の改善
- 次に着手するタスク: Task 1 `docs/plans/phase-06/task-01-fix-route-selection-state.md`

## Phase 5D

Phase 5Dの責務整理は完了し、PR #7として`main`へmerge済みである。現在の実装はPhase 5D完了後の`main`を基準とする。

Phase 5Dの履歴、完了条件、各Taskの詳細は`docs/plans/phase-05d/`とGit履歴を参照する。Phase 6ではPhase 5Dの旧WIP状態や固定SHAを実装開始条件として再利用しない。

## Phase 6

設計:
`docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`

Phase計画:
`docs/plans/phase-06/README.md`

実装順:
1. Task 1 Route Guidanceの候補・確定状態を修正
2. Task 2 GAS配送を購入後進行から完全に分離
3. Task 3 地図ジェスチャーの操作性能を改善
4. Task 4 地図とお品書きを主役にメイン画面を再構成
5. Task 5 地図上の候補サークル選択を明確化
6. Task 6 今後の巡回予定を一覧と地図で表示
7. Task 7 お品書き一覧を2列化しスワイプ操作を改善
8. Task 8 常設の使い方画面と初見ユーザー向け導線を追加
9. Task 9 Phase 6全体を最終検証

## 現状調査で確認済みの重要事項

- 通常購入後の`FinishCurrentCircleUseCase`が`selectedRoute === currentRoute`の状態で`selectionStatus: "ready"`を作り、地図Viewが`ready`でもcandidate overlayを描画するため、赤線と青線が同一経路へ重なり得る。
- 経路変更confirmは表示中destination/routeを変更する一方、`NavigationState.targetSpace`と`lockedFirstLeg`を同時更新しておらず、その後の購入が`FinishCurrentCircleUseCase`で`ignored`になり得る。
- Circle Statusはrepository saveとoutbox追加を先に行うlocal-first設計になっている。
- ただしrepository save後の`backgroundProcess.requestSend()`はbest-effort副作用として隔離されておらず、同期例外が上位へ漏れる余地がある。
- 購入直後はbackground send要求に加え`BrowserApplication`から診断用flushも呼び、automatic deliveryの所有が重複している。
- 現行テストはGAS失敗時のlocal purchase/outbox保持を確認しているが、GAS失敗時もRoute Guidanceが次の目的地へ進み次のお品書きを描画するproduction integrationを固定していない。
- 地図ジェスチャーはtouch/mouseの別実装で、慣性frame内にlayout readが残っている。
- 一覧はCSS上1列で、横長だけ`wide`判定する既存構造である。

## 実装開始時の確認

Task 1開始時は最新remote `main`を取得する。計画作成HEAD以降にproduction/test差分が進んでいる場合、Task文書のファイル名や公開契約を現在コードへ照合してから着手する。

ユーザー向け外部挙動を変える未決事項は現在ない。内部実装はPhase 6設計と既存feature境界の範囲で必要最小限に決める。
