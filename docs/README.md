# ドキュメント案内

## 現在の正本

現在の実装判断は、次の順で読む。

1. `docs/status/progress.md` — 現在フェーズ、現在Task、次Task、外部確認待ちの唯一の正本。
2. `docs/plans/phase-07-5/README.md` — Phase 7.5の実装順、依存関係、共通検証規則。
3. `docs/plans/phase-07-5/task-XX-*.md` — 着手するTaskの具体的な変更範囲と受入条件。
4. `docs/specs/2026-08-14-phase-07-5-map-first-ui-and-alns-visualization-design.md` — map-first UIとALNS live previewの製品・技術設計。
5. `docs/reviews/phase-07-5-planning-basis.md` — Phase開始時の現行コード事実と過剰実装防止。

現在状態を過去PhaseのTask/reviewや将来Phaseの計画から推測せず、必ず`docs/status/progress.md`を優先する。

## 実装計画

- `docs/plans/phase-05d/` — Phase 5D リファクタリング。
- `docs/plans/phase-06/` — Phase 6 UX改善。
- `docs/plans/phase-06-1/` — Phase 6.1 実機UX follow-up。
- `docs/plans/phase-07/` — Phase 7 オフライン/イベント管理。
- `docs/plans/phase-07-1/` — Phase 7.1 navigation/motion/management UX。
- `docs/plans/phase-07-3/` — Phase 7.3 実機follow-up。
- `docs/plans/phase-07-4/` — Phase 7.4 経路motion・周辺地図・人間受入follow-up。完了履歴。
- `docs/plans/phase-07-5/` — **現在のPhase。map-first UI polish・周辺card perimeter・ALNS live preview。**
- `docs/plans/phase-07-6/` — **計画済みの次Phase。X投稿の簡素表示・イベント当日scan・完売関連warningに加え、`W_*`壁分類のoptimization接続とgallery位置順整理。Phase 7.5 closure確認後に着手する。**

## 共通実装原則

- Phase 5D以降で整理したfeature境界を、現在Taskと無関係な都合で再構築しない。
- 新しいFacade、Manager、DI container、UI framework等の横断抽象化は、現在要件に実在する複数利用者がない限り追加しない。
- Route Guidanceの正式状態は既存Session/NavigationStateを使い、同じ意味の第二storeを作らない。
- optimization previewのような一時表示は正式NavigationState/LocalStorageへ混ぜない。
- X投稿や完売関連warningのような再取得可能な外部補助情報も、正式LocalStorage business stateへ混ぜない。
- map asset由来のwall分類はsource/business stateへ永続化せず、表示/optimization準備時のderived metadataとして扱う。
- LocalStorageへcommit済みの購入結果を、GAS配送失敗、catalog cache失敗、X/Yahoo取得失敗だけを理由に取り消さない。
- 地図とお品書きを主要情報として扱い、補助UIが不必要に隠さない。
- map viewportのclipを外すのではなく、viewport自体を適切に大きくする。
- mobile操作、44px以上の主要touch領域、keyboard focus、safe-area、200% text zoom、`prefers-reduced-motion`を維持する。
- 外部API failureは可能な限りそのfeatureだけを縮退させ、独立したroute/purchase/catalog機能を停止しない。
- visual snapshotは意図した画面であることを人間確認してから更新する。

## 文書更新の原則

- 現在状態・次Task・保留事項は`docs/status/progress.md`だけを更新する。
- 将来Phaseのplanを作成しても、`progress.md`が示すcurrent phaseを先行して変更しない。
- Task文書へ未来の開始SHAを固定しない。
- review文書は検証証拠として保存し、現在状態の正本にしない。
- 実装後の人間確認で計画と異なる事実が判明した場合、完了履歴を消さず追加Taskとして正本へ反映する。
