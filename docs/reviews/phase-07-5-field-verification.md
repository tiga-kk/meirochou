# Phase 7.5 field verification

確認日: 2026-08-14

## 自動検証

| command | 結果 |
|---|---|
| Task 8 focused Vitest 10 files | PASS: 38 tests |
| `npm run verify` | FAIL: 836 passed / 2 failed。candidate Escapeの既存経路と、worktreeの`.git`ファイルに含まれるローカル絶対パス検出 |
| `npm run test:e2e:ci` | FAIL: 62 passed / 9 failed / 8 skipped。managementの1件はretry成功 |
| `node scripts/audit-public-tree.mjs` | PASS |
| `git diff --check` | PASS |

`npm run verify`のpublic-boundary失敗は、一時worktreeの`.git`が絶対パスを含むgitfileであることによる。対象ツリーを直接監査する`node scripts/audit-public-tree.mjs`はPASSした。

Task 7の新規ALNS preview E2EはPASSし、mobile webapp E2E全体も35件中27 passed / 8 failedだった。失敗はmap-first変更後のvisual baselineまたはcatalog表示前提で、snapshotは人間確認前のため更新していない。

## CI相当E2Eの未解決FAIL

- `navigation-resume.spec.ts`: `optimizationGeneration`を期待するresume snapshot assertionが3 retryともFAIL。
- `route-map-candidate-preview.test.ts`と候補経路E2E: candidate Escapeが既存cancel pathへ到達しない。
- `webapp.spec.ts`: map-firstによる既存visual baseline差分、320px/200% target、portrait catalog、No Image/catalog image表示前提。
- `management.spec.ts`: 背景scroll固定の実測がretry前にFAILしたが、retryはPASS。

Task 8の計画にある「FAILをこのTask内で場当たり的に修正しない」「visual snapshotを無条件更新しない」に従い、これらはこの検証では修正していない。

## 人間受入

未実施。390px級Motorola Androidで次を確認できる人間確認環境が必要である。

- route/nearby mapの面積、詳細drawer、cardとleader line、natural aspect ratio。
- ALNS探索中の青〜紫previewの複数回更新、drag/pinch中のDOM保留、操作後のcatch-up。
- complete後のpreview消去、赤current route、正式best order。
- visual snapshot更新可否。

## 判定

**Phase 7.5はblocked。** 自動最終gateにFAILがあり、かつ人間/実機受入が未実施のため、`progress.md`を完了へ更新しない。再開条件は、FAILの扱いを決めて必要な修正または既存差分として独立証明し、390px級Motorola Androidで人間受入を完了することである。
