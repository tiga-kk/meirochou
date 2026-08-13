# ドキュメント案内

## 現在の正本

現在の実装判断は、次の順で読む。

1. `docs/status/progress.md` — 現在フェーズ、現在Task、次Task、外部確認待ちの唯一の正本。
2. `docs/plans/phase-07-4/README.md` — Phase 7.4の実装順、依存関係、共通検証規則。
3. `docs/plans/phase-07-4/task-XX-*.md` — 着手するTaskの具体的な変更範囲と受入条件。
4. `docs/specs/2026-08-13-phase-07-4-human-acceptance-followups-design.md` — Task 1〜9後の人間確認を反映した追加UX仕様。初期Phase 7.4仕様と競合する場合はこちらを優先する。
5. `docs/specs/2026-08-13-phase-07-4-route-visual-nearby-map-and-priority-filter-design.md` — Phase 7.4初期の製品・UX設計仕様。
6. `docs/reviews/phase-07-4-human-acceptance-failures.md` — Task 9後の人間受入FAILと現行コード上の根拠。
7. `docs/reviews/phase-07-4-route-animation-diagnosis.md` — 過去のroute animation修正が実機視認性を閉じられなかった原因分析。
8. `docs/reviews/phase-07-4-field-verification.md` — 自動検証・外部確認と、その後の人間確認による終了判定失効記録。

現在状態をTask文書やreviewから推測せず、必ず`docs/status/progress.md`を優先する。

## 実装計画

- `docs/plans/phase-05d/` — Phase 5D リファクタリング。
- `docs/plans/phase-06/` — Phase 6 UX改善。
- `docs/plans/phase-06-1/` — Phase 6.1 実機UX follow-up。
- `docs/plans/phase-07/` — Phase 7 オフライン/イベント管理。
- `docs/plans/phase-07-1/` — Phase 7.1 navigation/motion/management UX。
- `docs/plans/phase-07-3/` — Phase 7.3 実機follow-up。
- `docs/plans/phase-07-4/` — **現在のPhase 7.4実装計画。Task 10以降で人間受入FAILを修正中。**

## 共通実装原則

- Phase 5D以降で整理したfeature境界を、現在Taskと無関係な都合で再構築しない。
- 新しいFacade、Manager、DI container、UI framework等の横断抽象化は、現在要件に実在する複数利用者がない限り追加しない。
- Route Guidanceの状態は既存Session/NavigationStateの責務を再利用し、同じ意味の第二のstoreを作らない。
- LocalStorageへcommit済みの購入結果を、GAS配送失敗やcatalog cache失敗だけを理由に取り消さない。
- 地図とお品書きを主要情報として扱い、補助UIが不必要に隠さない。
- animationはCSS/SVGで表現できるものをJavaScript frame loopへしない。
- mobile操作、44px以上の主要touch領域、keyboard focus、safe-area、200% text zoom、`prefers-reduced-motion`を維持する。
- visual snapshotは意図した画面であることを人間確認してから更新する。

## 文書更新の原則

- 現在状態・次Task・保留事項は`docs/status/progress.md`だけを更新する。
- Task文書へ未来の開始SHAを固定しない。
- review文書は検証証拠として保存し、現在状態の正本にしない。
- 実装後の人間確認で計画と異なる事実が判明した場合、完了履歴を消さず追加Taskとして正本へ反映する。