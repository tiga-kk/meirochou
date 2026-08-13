# Phase 7.4 field verification

確認日: 2026-08-13

## 自動検証

| command | 結果 |
|---|---|
| `npm run verify` | PASS: webapp 113 files / 777 tests、route guidance 38、Phase 5D regression 4、architecture/typecheck/build、public bundle 26 assets、GAS 38、catalog extension 24 |
| `node scripts/audit-public-tree.mjs` | PASS |
| `npx vitest run --root . tests/purchase-flow.test.ts tests/complete-circle-visit.test.ts` | PASS: 2 files / 19 tests |
| `npx vitest run --root . tests/gallery-swipe-action.test.ts tests/purchase-flow.test.ts` | PASS: 2 files / 24 tests |
| `npx playwright test tests/e2e/navigation-mobile.spec.ts` | PASS: 1 test。priority chipを含むvisible buttonの44px操作領域を確認 |
| `npx playwright test tests/e2e/webapp.spec.ts --grep "通常画面の購入buttonが最新1件Undoへ到達する|Galleryの購入buttonが退出表示と完全Undoへ到達する"` | PASS: 2 tests |
| `npm run check:webapp` | PASS: architecture 167 files / TypeScript typecheck |
| `git diff --check` | PASS |

## CI相当E2E

`npm run test:e2e:ci`は終了コード1、74 tests中58 passed / 8 skipped / 8 failedだった。

8件の失敗のうち、次の7件は機能assertion後のvisual snapshot差分であり、今回のTask 8購入Undoとは無関係だった。

- `settings-shell-source-manager.png`
- `outbox-recovery-panel.png`
- `scoped-deletion-dialog.png`
- `navigation-map-catalog.png`
- `navigation-target-portrait-200-percent.png`
- `route-comparison.png`
- `catalog-gallery.png`

これらは既存の管理画面・Phase 7.2/7.3からのvisual baseline差分、またはPhase 7.4表示変更に対応するheaded確認前の差分である。snapshotは一括更新していない。

残る1件はpriority chipの実測幅36.8pxだったため、`apps/webapp/css/target.css`へ`min-width: 44px`を追加した。その後、`tests/e2e/navigation-mobile.spec.ts`単独実行はPASSした。

CI相当E2Eでは、通常購入Undo、Gallery購入Undo、nearby map card/leader line、任意origin、priority filter、current/candidate routeの機能assertionは通過し、失敗はsnapshot比較に到達したものだけだった。

## 手動・外部確認

| 項目 | 結果 |
|---|---|
| 390px / 200% zoomのcurrent moving cue・static candidate・priority chip・横overflow | headless E2Eの寸法/assertionは確認済み。headed目視は`DISPLAY`未設定のため未確認 |
| C108 public bundleの任意origin、priority、件数、hold切替 | public bundle構造と自動E2Eは確認済み。headedでの目視操作は未確認 |
| nearby cardとleader lineのanchor対応 | 自動E2Eでcard/leader line/data-spaceを確認済み。headed目視は未確認 |
| 通常購入/Gallery購入のUndo | headless E2EとVitestでstatus・route snapshot・GAS outbox・表示を確認済み |
| 実GASの同一space更新・既存Sheet列保持 | test deploymentのURL/credentialがないため未確認。repositoryへcredentialは追加していない |
| Phase 7.3からのmap drag遅延 | physical input可能な実機がないため未確認。証拠なしのgesture変更は行っていない |

## 終了判定

Task 1〜8の本番接続、自動検証、CI相当E2Eの機能assertion、Task 9の検証記録を完了した。headed visual、実機drag、実GASの未確認事項は上記の理由付きで残し、PASSへ読み替えていない。visual snapshotは更新していない。
