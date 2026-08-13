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

8件の失敗のうち、次の7件は機能assertion後のvisual snapshot差分だった。

- `settings-shell-source-manager.png`
- `outbox-recovery-panel.png`
- `scoped-deletion-dialog.png`
- `navigation-map-catalog.png`
- `navigation-target-portrait-200-percent.png`
- `route-comparison.png`
- `catalog-gallery.png`

残る1件はpriority chipの実測幅36.8pxだったため、`apps/webapp/css/target.css`へ`min-width: 44px`を追加した。その後、`tests/e2e/navigation-mobile.spec.ts`単独実行はPASSした。

CI相当E2Eでは、通常購入Undo、Gallery購入Undo、nearby map card/leader line、任意origin、priority filter、current/candidate routeの機能assertionは通過し、失敗はsnapshot比較に到達したものだけだった。

## 当時の手動・外部確認状態

| 項目 | 結果 |
|---|---|
| 390px / 200% zoomのcurrent moving cue・static candidate・priority chip・横overflow | headless E2Eの寸法/assertionは確認済み。headed目視は`DISPLAY`未設定のため未確認 |
| C108 public bundleの任意origin、priority、件数、hold切替 | public bundle構造と自動E2Eは確認済み。headedでの目視操作は未確認 |
| nearby cardとleader lineのanchor対応 | 自動E2Eでcard/leader line/data-spaceを確認済み。headed目視は未確認 |
| 通常購入/Gallery購入のUndo | headless E2EとVitestでstatus・route snapshot・GAS outbox・表示を確認済み |
| 実GASの同一space更新・既存Sheet列保持 | test deploymentのURL/credentialがないため未確認 |
| Phase 7.3からのmap drag遅延 | physical input可能な実機がないため未確認 |

## 2026-08-13 人間確認による終了判定の失効

上記自動検証後、ユーザーが実画面を確認した結果、次のvisual/interaction FAILが判明した。

- 近接pinを選び分けにくい。
- candidate blue routeが途切れて見える。
- current route animationが視認できない。
- 拡大時のroute線が太すぎる。
- nearby mapにpriority/件数の操作UIと目的地actionがない。
- nearby cardが重なり、前面化できない。
- leader lineが細い。
- standalone mapのviewportが地図aspect ratioに合わない。
- purchase Undo後に現在地フォームが空欄になる。
- 拡大後にviewport中心がどの配置付近か分からない。

詳細は`docs/reviews/phase-07-4-human-acceptance-failures.md`を正本とする。

したがって、この文書のTask 9時点の「Phase 7.4終了」判断は失効した。自動検証PASS自体は過去の証拠として保持し、Phase 7.4をTask 10〜18で再オープンする。

Task 18で再受入した結果を、この文書へ追記して最終終了判定を更新する。