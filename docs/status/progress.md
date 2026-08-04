# Current Progress

**更新日:** 2026-08-04
**現在の段階:** Phase 5C完了。Phase 5D apps内部refactor計画をcurrent treeへ再照合し、命名とTask境界を改訂済み。implementation未着手。

## Current canonical documents

- Phase 5C plan: `docs/plans/phase-05c/README.md`
- Phase 5C handoff: `docs/reviews/phase-05c-handoff.md`
- Phase 5D design: `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md`
- Phase 5D module boundaries: `docs/architecture/webapp-module-boundaries.md`
- Phase 5D naming rules: `docs/architecture/webapp-naming-guidelines.md`
- Phase 5D plan: `docs/plans/phase-05d/README.md`

## Phase 5C completion baseline

Phase 5Cでは次をproduction applicationへ統合した。

- exclusive circle status
- arbitrary starting location and map-specific session
- weighted distance matrix Worker and LocalStorage cache
- distance-to-time conversion
- time-decayed ALNS
- 5/10/15 second search time
- fixed current leg、warm start、progress、cancel
- arrival、purchase、hold、manual destination
- route guidance snapshot、reload resume、reset start
- source/deletion snapshot and matrix invalidation
- desktop/mobile/keyboard/accessibility E2E
- C108 four-area desktop/mobile smoke

Phase 5D planning review前のfresh baseline:

- `npm run test:webapp`: 455/455 PASS
- `npm run check:webapp`: PASS
- `npm run build:webapp`: PASS
- Git working tree: clean
- implementation subagent: not started

## Resolved plan inconsistencies

implementation reviewで報告された3件をcurrent `main` treeへ照合した。

1. Task 3 move source
   - wrong: `state/event-day-key.ts`
   - correct: `data/event-day-key.ts`
2. Task 5/7 config path
   - wrong: `config.js`
   - correct: `config.ts`
3. Task 5/8 route guidance screen model
   - Task 5が`route-guidance-screen-model.ts`を新規作成
   - Task 8はold `ui/navigation-view-model.ts`をsame pathへmoveしない
   - old fileをscreen formatting、current location parsing、map pin model、image layout、safe URLへ分割して削除

Phase READMEとTask文書にexact preflightを追加し、same target pathのCreate/Move重複を禁止した。

## Naming decisions

new production namesは一目で責務が分かるものへ統一した。

- `App` → `ComiPathApplication`
- source management → Circle Data Source
- storage management → Local Data Deletion
- navigation runtime → Route Guidance
- circle state management → Circle Status
- outbox → Pending GAS Updates（persisted schema fieldを除く）
- `Config` → `MapAreaCatalog`とowner-specific storage keys
- `TspSolver` → `DevDemoNearestNeighborOrder`
- generic `Manager`/`Handler`/`Helper`/`Utils` namesはnew production codeで禁止

cross-feature public entrypointは`index.ts`ではなく`public-api.ts`を使う。

## Phase 5D tasks

1. Lock Current Behavior and Architecture Rules
2. Separate Browser Startup and Dependency Assembly
3. Centralize Active Event/Day State
4. Extract Circle Status and Pending GAS Updates
5. Extract Route Guidance
6. Extract Circle Data Source Workflows
7. Extract Event/Day Switching and Local Data Deletion
8. Split Feature-Specific DOM Views
9. Remove Legacy App, Data, UI, and Central Types
10. Verify Apps Refactor and Write Handoff

Task 4-7はsame legacy filesを段階変更するため並行実装しない。

## Final Phase 5D targets

- delete `apps/webapp/js/app.js`
- delete `apps/webapp/js/data-manager.ts`
- delete `apps/webapp/js/ui-manager.js`
- delete `apps/webapp/js/config.ts`
- delete `apps/webapp/js/types/domain.ts`
- delete `apps/webapp/js/types/boundary-parsers.ts`
- keep `comipath-application.ts` at 200 physical lines or fewer
- one active event/day state owner
- one route guidance runtime state owner
- no architecture allowlist
- no cross-feature deep import
- no vague new production names
- preserve existing storage、GAS、CSV、route guidance behavior

## Future phases

- Phase 5E: tests and docs structure refactor
- Phase 5F: broad visual polish

Phase 5Dではtests/docsの全面再配置を行わず、apps内部のpublic ownershipとarchitectureを先に確定する。

## Approval status

- Phase 5B/5C shared design: approved
- Phase 5C ALNS amendment: approved
- Phase 5B: complete
- Phase 5C: complete
- Phase 5D apps design: approved
- Phase 5D implementation plan: revised and complete
- Phase 5D implementation: Task 8 complete; Task 9 onward pending
- Phase 5E tests/docs refactor: planned after Phase 5D handoff
- Phase 5F visual polish: planned after Phase 5E

## Next action

1. Task 8のcommitを確認する。
2. Task 9のentry gateと変更可能ファイルを確認する。

## Continuing prohibitions

- `/maps/` private working areaをGit管理へ追加しない。
- original maps、OCR input、Python generator、intermediate imagesをWeb repositoryへ追加しない。
- real mapsをgeneral unit/E2E fixtureへコピーしない。
- raw CSV、GAS URL、sheet content、external post body、credentialをartifactへ出さない。
- Phase 5DでLocalStorage schema、GAS contract、ALNS objective、timing profile、map assetsを変更しない。
