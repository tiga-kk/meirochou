# ドキュメント案内

## 現在の正本

現在の実装判断は、次の順で読む。

1. `docs/status/progress.md` — 現在フェーズ、現在Task、次Task、外部確認待ちの唯一の正本。
2. `docs/plans/phase-07-3/README.md` — Phase 7.3の実装順、依存関係、共通検証規則。
3. `docs/plans/phase-07-3/task-XX-*.md` — 着手するTaskの具体的な変更範囲と受入条件。
4. `docs/specs/2026-08-12-phase-07-3-field-followups-design.md` — Phase 7.3の製品・UX設計仕様。
5. `docs/reviews/phase-07-2-field-verification.md` — Phase 7.2から持ち越した実機/visual確認の証拠。

現在状態をTask文書やREADMEから推測せず、必ず `docs/status/progress.md` を優先する。

## 実装計画

- `docs/plans/phase-05d/` — Phase 5D リファクタリング。
- `docs/plans/phase-06/` — Phase 6 UX改善。
- `docs/plans/phase-06-1/` — Phase 6.1 実機UX follow-up。
- `docs/plans/phase-07/` — Phase 7 オフライン/イベント管理。
- `docs/plans/phase-07-1/` — Phase 7.1 navigation/motion/management UX。
- `docs/plans/phase-07-3/` — **現在のPhase 7.3実装計画。**

Phase 7.2の実装計画は履歴上の計画ブランチで管理されており、このブランチの実装判断には `docs/reviews/phase-07-2-field-verification.md` とGit履歴を使う。存在しない相対パスへ依存しない。

## 設計仕様

- `docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`
- `docs/specs/2026-08-10-phase-06-1-field-ux-followups-design.md`
- `docs/specs/2026-08-10-phase-07-offline-event-management-and-visual-system-design.md`
- `docs/specs/2026-08-11-phase-07-1-navigation-motion-and-management-ux-design.md`
- `docs/specs/2026-08-12-phase-07-3-field-followups-design.md`

設計仕様は外部挙動の意図を示す。実装順や現在Taskはplan/progressを優先する。

## 運用ガイド

- `guides/cloudflare-pages-deployment.md` — Cloudflare Pagesのproduction/preview運用。
- `guides/data-contracts.md` — データ契約。
- `guides/gas-sync.md` — GAS同期。
- `guides/user-data-management.md` — ユーザーデータ管理。

Phase 7.3のCloudflare設定作業は `docs/plans/phase-07-3/operations-cloudflare-pages-main-only.md` を参照する。アプリ実装とは独立した運用作業である。

## 共通実装原則

- Phase 5D以降で整理したfeature境界を、Phase 7.3と無関係な都合で再構築しない。
- 新しいFacade、Manager、DI container、UI frameworkなどの横断抽象化は、現在のTaskに実在する複数利用者がない限り追加しない。
- Route Guidanceの状態は既存Session/NavigationStateの責務を再利用し、同じ意味の第二のstoreを作らない。
- LocalStorageへcommit済みの購入結果を、GAS配送失敗やcatalog cache失敗だけを理由に取り消さない。Undoや明示的な失敗rollbackはTask文書の契約に従う。
- 地図とお品書きを主要情報として扱い、補助UIがそれらを不必要に隠さない。
- animationはCSS/SVGで表現できるものをJavaScriptのframe loopへしない。
- mobile操作、44px以上の主要touch領域、keyboard focus、safe-area、200% text zoom、`prefers-reduced-motion`への対応を維持する。
- visual snapshotは意図した画面であることを確認してから更新する。
- 既存Service Workerの責務を、Phase 7.3の都合だけでfull PWAや別のoffline基盤へ広げない。

## 文書更新の原則

- 現在状態・次Task・保留事項は `docs/status/progress.md` だけを更新する。
- Task文書へ未来の開始SHAを固定しない。
- review文書は検証証拠として保存し、現在状態の正本にしない。
- 実装後に計画と異なる事実が判明した場合は、外部挙動を変えない範囲でplan/progressを整合させる。
