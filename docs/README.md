# 実装文書

この`docs/`は、現在の実装状態を基に次の実装を進めるための正本である。

Phase 5Dの責務整理とPhase 6のユーザー体験改善は完了し、Phase 6はPR #9で`main`へmerge済みである。次は本番実機確認で判明した具体的な操作性問題をPhase 6.1で修正し、その後Phase 7でcatalog offline準備、event/day管理画面、visual hierarchyの再設計を行う。

古いPhase、archive、完了済み計画は履歴として参照してよいが、現在の要求を補完する正本ではない。

## 正本

| 目的 | 文書 |
|---|---|
| 現在の進捗と次に着手するタスク | `docs/status/progress.md` |
| Phase 6.1の確定設計 | `docs/specs/2026-08-10-phase-06-1-field-ux-followups-design.md` |
| Phase 6.1の目的・順序 | `docs/plans/phase-06-1/README.md` |
| Phase 6.1各Taskの実装契約 | `docs/plans/phase-06-1/task-*.md` |
| Phase 7の確定設計 | `docs/specs/2026-08-10-phase-07-offline-event-management-and-visual-system-design.md` |
| Phase 7の目的・順序 | `docs/plans/phase-07/README.md` |
| Phase 7各Taskの実装契約 | `docs/plans/phase-07/task-*.md` |
| Phase 6完了記録 | `docs/plans/phase-06/README.md` |
| Phase 5D完了記録 | `docs/plans/phase-05d/README.md` |

## 読む順序

### Phase 6.1を実装する場合

1. `README.md`
2. `docs/README.md`
3. `docs/status/progress.md`
4. `docs/specs/2026-08-10-phase-06-1-field-ux-followups-design.md`
5. `docs/plans/phase-06-1/README.md`
6. 次に着手可能なTask文書
7. Task文書に列挙された既存実装とテスト

### Phase 7を実装する場合

Phase 6.1完了後に、次の順で読む。

1. `docs/specs/2026-08-10-phase-07-offline-event-management-and-visual-system-design.md`
2. `docs/plans/phase-07/README.md`
3. 次に着手可能なTask文書
4. Task文書に列挙された既存実装とテスト

実装担当は一度に一Taskだけを扱う。各Taskの差分を関連テストで確認し、Taskごとに独立してレビュー可能なcommitへする。

## 共通原則

- Phase 5D/6で整理したfeature境界を無関係に再構築しない。
- 新しいFacade、Manager、DI container、UI frameworkを追加しない。
- Route Guidanceの状態は既存Session/NavigationStateを正本にする。
- LocalStorageへcommit済みの購入結果をGAS配送失敗やcatalog cache失敗で取り消さない。
- 地図とお品書きを主要情報として扱う。
- animationはCSS/SVGで表現できるものをJavaScriptのframe loopへしない。
- mobile操作、44px以上の主要touch領域、keyboard focus、safe-area、200% text zoom、reduced-motionを維持する。
- visual snapshotは意図を確認してから更新する。
- Phase 7のService Workerはcatalog offline保存に限定し、full PWAへscopeを広げない。
