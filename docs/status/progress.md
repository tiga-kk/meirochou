# 進捗

更新日: 2026-08-10

## Phase 6 Task 9 の状態

Phase 6 Task 9（ユーザー体験の最終検証）は完了した。経路変更確定後のsnapshot保存、resume中の古いALNS進捗によるsnapshot上書き、低速・範囲外パンのsettle、ギャラリー購入ボタンの44pxタッチターゲット、予定pinのaccessible nameを修正し、計画書が要求する統合検証を追加した。

追加・更新した検証:

- 経路変更→確定→購入→次のお品書き表示
- 経路変更確定→LocalStorage snapshot→reload→変更後目的地で再開
- GAS delivery失敗後の次目的地表示と候補経路非表示
- ギャラリーの左右実スワイプによる購入と端末保存
- CSV/GAS guideのvalidation差分
- 予定一覧と地図pinの番号・accessible name整合
- 44px購入ボタン、200%表示、地図操作、既存のlocal save failure回帰

検証結果:

- `npm run verify`: 成功（webapp 647 tests、Route Guidance 35 tests、Phase 5D回帰4 tests、architecture/typecheck/build/GASを含む）
- `npm run test:e2e:ci`: 成功（43 passed / 8 skipped）
- `npx biome check`: repo-wideでは89 errors / 116 warnings / 8 infos。mainでも同じ結果を再現し、Phase 6で追加したコードによる新規errorではない。変更箇所の機械的な既存format debtは修正せず、Phase 6の回帰とは分離して記録する。
- `node scripts/audit-public-tree.mjs`と`git diff --check`: 成功

次に着手するPhase 6タスクはない。外部公開や不可逆変更を伴う次フェーズは自動開始しない。

## 現在の対象

- リポジトリ: `tiga-kk/meirochou`
- ブランチ: `feature/phase-06-task-01`
- production確認元: `main`
- Phase 6計画作成時の`main` HEAD: `3322c31cf8c8413ecc6a5d5d2e7abaefea7aa318`
- 計画文書ブランチ: `docs/phase-06-user-experience-plan`
- 現在のフェーズ: Phase 6 Task 9 完了
- 次に着手するタスク: なし（Phase 6完了。次Phaseは自動開始しない）

## Phase 5D

Phase 5Dの責務整理は完了し、PR #7として`main`へmerge済みである。現在のproduction実装はPhase 5D完了後の`main`を基準とする。

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

- 通常購入後の`FinishCurrentCircleUseCase`だけでなく、初回案内を作る`StartRouteGuidanceUseCase`も`selectedRoute === currentRoute`かつ`selectionStatus: "ready"`を作る。地図Viewは`ready`でもcandidate overlayを描画するため、初回案内と購入後進行の両方で赤線と青線が重なり得る。
- `ResumeRouteGuidanceUseCase`は通常再開時に`selectionStatus: "idle"`を作っている。Task 1では開始・再開・購入後進行の通常案内を`idle`へ統一し、青線を`comparing`だけへ限定する。
- 経路変更confirmは表示中destination/routeを変更する一方、`NavigationState.targetSpace`と`lockedFirstLeg`を同時更新しておらず、その後の購入が`FinishCurrentCircleUseCase`で`ignored`になり得る。
- Circle Statusはrepository saveとoutbox追加を先に行うlocal-first設計になっている。
- ただしrepository save後の`backgroundProcess.requestSend()`はbest-effort副作用として隔離されておらず、同期例外が上位へ漏れる余地がある。
- 購入直後はbackground send要求に加え`BrowserApplication`から診断用flushも呼び、automatic deliveryの所有が重複している。
- 現行テストはGAS失敗時のlocal purchase/outbox保持を確認しているが、GAS失敗時もRoute Guidanceが次の目的地へ進み次のお品書きを描画するproduction integrationを固定していない。
- 地図ジェスチャーはtouch/mouseの別実装で、慣性frame内にlayout readが残っている。Pointer Events化では`pointercancel`/capture喪失時の復帰も契約へ含める。
- 現行`index.html`はviewportで`maximum-scale=1.0, user-scalable=no`を指定しており、Phase 6の200%拡大受入条件と矛盾する。
- 地図上の`.route-card`/`.map-log`を単に削除すると、`DomRouteGuidanceView`が直接参照する`#target-space-heading`、`#target-start-space`、`#target-route-log`を失ってruntime errorになり得る。Task 4では表示先を移すかView参照も同時に整理する。
- Task 5で必要な「候補を閉じる」公開操作は現行`ChangeDestinationUseCase`/`RouteGuidanceController`に存在しない。既存責務方向の中で最小の取消操作を追加する必要がある。
- 一覧はCSS上1列で、横長だけ`wide`判定する既存構造である。既存`sortTargets()`の優先度順/スペース順は2列化後もDOM順として維持する。
- `DomCircleGalleryView.handleGalleryPurchase()`は非同期の`BrowserApplication.addPurchased()`を待たずに成功toastとカード削除を行っており、端末保存失敗を一覧だけ成功扱いする余地がある。
- 一覧で現在target以外を購入するとlocal stateは進む一方、購入済みspaceが`NavigationState.bestOrder`/`provisionalOrder`へ残り得る。その後の通常購入で`next-target-missing`へ進まないよう、現在経路を維持したまま将来順序から除外する必要がある。
- CSV parserとGAS sheetはカラム名自体は同系統だがvalidationが完全には同一ではない。特にGASはrecognized header重複を拒否する一方、現行CSV parserには同じheader重複validationを持たないため、Task 8のガイドで共通規則として誤記しない。

## 実装開始時の確認

Phase 6のproduction実装は、計画文書ブランチのレビュー済み内容が`main`へ反映された後の最新remote `main`から開始する。`docs/phase-06-user-experience-plan`へproduction codeを追加しない。

Task 1開始直前に最新remote `main`を取得し、その時点のHEADをTaskの基準コミットとして扱う。計画作成時HEADやこの文書の履歴上のSHAを実装開始SHAとして固定しない。

計画作成以降にproduction/test差分が進んでいる場合は、Task文書のファイル名、公開契約、検証コマンドを現在コードへ照合してから着手する。安全に一意に追従できるprivate実装差分はその場で調整し、外部挙動が変わる場合だけ判断を分離する。

ユーザー向け外部挙動を変える未決事項は現在ない。内部実装はPhase 6設計と既存feature境界の範囲で必要最小限に決める。
