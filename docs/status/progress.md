# Current Progress

**更新日:** 2026-07-28
**現在の段階:** Phase 5C完了。Phase 5D architecture refactor設計・実装計画作成済み、実装未着手。

## 現在の正本

- Phase 5C plan: `docs/plans/phase-05c/README.md`
- Phase 5C handoff: `docs/reviews/phase-05c-handoff.md`
- Phase 5D design: `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md`
- Phase 5D architecture rules: `docs/architecture/webapp-module-boundaries.md`
- Phase 5D plan: `docs/plans/phase-05d/README.md`

## Phase 5C完了状態

Phase 5Cでは次をproduction Appへ統合した。

- 排他的circle state
- 任意始点と地図別session
- weighted distance matrix WorkerとLocalStorage cache
- distance-to-time adapter
- 30/60/120分の時間減衰価値を最大化するALNS
- search time 5/10/15秒、default 10秒
- current leg固定、warm start、progress、cancel
- 到着、購入、保留、manual target変更
- navigation snapshot、reload resume、始点再設定
- source変更・削除時のsnapshot/matrix invalidation
- desktop/mobile/keyboard/accessibility E2E
- C108 4 areaのdesktop/mobile smoke

Phase 5C Task 11の最終記録:

- focused navigation runtime tests: PASS
- `npm run test:webapp`: PASS
- `npm run check:webapp`: PASS
- `npm run build:webapp`: PASS
- `npm run test:e2e`: PASS（意図されたSKIPを除く）
- C108 desktop/mobile smoke: PASS
- `node scripts/audit-public-tree.mjs`: PASS
- Phase 5C branchはPR #6で`main`へ統合済み

## Phase 5Dの決定

Phase 5Dは、厳密な層別Clean Architectureの全面導入ではなく、機能別モジュラーモノリスへClean Architectureの依存方向を適用する。

```text
UI / Components
      ↓
Feature Controller / View
      ↓
Application Use Case
      ↓
Domain

Application Use Case
      ↓
Port / Repository interface
      ↑
LocalStorage / GAS / fetch / Worker
```

最終目標:

- `apps/webapp/js/app.js`削除
- `apps/webapp/js/data-manager.ts`削除
- `apps/webapp/js/ui-manager.js`削除
- `apps/webapp/js/app/app.ts`を200 physical lines以下へ縮小
- active event/day stateを`ActiveEventDaySession`へ一元化
- feature間deep import禁止
- architecture allowlistなしでimport graph check成功
- 既存LocalStorage、GAS、CSV、navigation、E2E contract維持

## Phase 5D Task一覧

1. Characterization and Architecture Guardrails
2. Composition Root and App Shell
3. Active Event Day Session
4. Circle State and Sync Extraction
5. Navigation Feature Extraction
6. Source Management Extraction
7. Event Day and Storage Controllers
8. UI View Split
9. Remove Legacy Facades
10. Phase Verification and Handoff

Taskは順番に実施し、同じlegacy facadeを触るTask 4-7を並行実装しない。

## 承認状態

- Phase 5B/5C共有設計: 承認済み
- Phase 5C ALNS追補: 承認済み
- Phase 5B: 完了
- Phase 5C: 完了
- Phase 5D architecture design: 承認済み
- Phase 5D implementation plan: 作成済み
- Phase 5D implementation: 未着手
- Phase 5E visual polish: Phase 5D完了後に計画

## 次の操作

1. Phase 5D実装開始指示を受けたら、最新`main`、remote、working treeを確認する。
2. ユーザー承認後にPhase 5D implementation branchを作成する。
3. `AGENTS.md`、Phase 5D design、architecture rules、Phase README、Task 1の順で読む。
4. Phase 5D Task 1だけをTDDで実装する。
5. Task 1の差分・検証結果・commit candidateを提示し、承認境界を守る。

## 変更禁止の継続事項

- `/maps/`の私的作業領域をGit管理へ追加しない。
- 元地図、OCR入力、Python生成コード、中間画像をWebリポジトリへ追加しない。
- 実地図を一般unit/E2E fixtureへコピーしない。
- raw CSV、GAS URL、sheet内容、外部投稿本文、credentialをartifactへ出さない。
- Phase 5DでLocalStorage schema、GAS contract、ALNS objective、timing profile、map assetを変更しない。
