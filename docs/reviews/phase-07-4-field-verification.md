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

## Task 18 自動再検証結果（2026-08-13）

### PASS

| command | 結果 |
|---|---|
| `npx vitest run --root . tests/map-viewport-center.test.ts tests/nearby-map-aspect-ratio.test.ts tests/nearby-map-origin.test.ts tests/nearby-map-view.test.ts tests/route-map-candidate-preview.test.ts tests/route-map-pin-selection.test.ts tests/route-map-viewport-layout.test.ts` | PASS: 7 files / 21 tests |
| `npm run test:route-guidance` | PASS: 6 files / 38 tests |
| `npm run test:phase-05d-regressions` | PASS: 2 files / 4 tests |
| `npm run check:webapp` | PASS: architecture 168 files / TypeScript typecheck |
| `npm run build:webapp` | PASS |
| `npm run verify:webapp:build` | PASS: 26 assets |
| `npm run verify:gas` | PASS: GAS 38 tests |
| `npm run test:catalog-extension` | PASS: 24 tests |
| `node scripts/audit-public-tree.mjs` | PASS |
| Task 17関連E2E（`--grep "表示中心|地図|ズーム"`） | 5 passed / 1既存snapshot失敗 |
| `git diff --check` | PASS |

`npm run verify`はwebapp 795件中794件がPASSした。唯一の失敗は一時worktreeの`.git`に含まれるローカル絶対パスを`tests/public-boundary.test.mjs`が検出した既存環境要因で、同じ検査は対象ツリーを直接監査する`node scripts/audit-public-tree.mjs`ではPASSした。

初回の`npm run test:e2e:ci`は52 passed / 15 failed / 8 skippedだった。ここでは「既存」と一括分類せず、15件を次のように再現比較した。

| 初回の失敗 | 分類 | 根拠 |
|---|---|---|
| management Flow 1 `settings-shell-source-manager.png` | Task 10以前からのsnapshot差分 | Task 9時点の記録にも同じ差分がある |
| management Flow 5 `outbox-recovery-panel.png` | Task 10以前からのsnapshot差分 | Task 9時点の記録にも同じ差分がある |
| management Flow 7 `scoped-deletion-dialog.png` | Task 10以前からのsnapshot差分 | Task 9時点の記録にも同じ差分がある |
| `navigation-map-catalog.png` | Task 10以前からのsnapshot差分 | Task 9時点の記録にも同じ差分がある。Task 16基準`a2e8211`でも再現 |
| `navigation-target-portrait-200-percent.png` | Task 10以前からのsnapshot差分 | Task 9時点の記録にも同じ差分がある |
| `route-comparison.png` | Task 10以前からのsnapshot差分 | Task 9時点の記録にも同じ差分がある |
| `catalog-gallery.png` | Task 10以前からのsnapshot差分 | Task 9時点の記録にも同じ差分がある |
| `confirmed route change is saved...` (desktop) | Task 17の回帰 | in-flight `pointIndexCache`を再描画へ接続しない条件変更でpinが消失。条件を復元後PASS |
| `confirmed route change is saved...` (mobile) | Task 17の回帰 | desktopと同じ原因。条件を復元後PASS |
| `デモデータで地図・ピン・経路・ボトムシートを表示する` | Task 17の回帰 | `.map-pin.todo`欠落。条件を復元後PASS |
| `390pxのcurrent経路は実画面線幅を保ちcandidateは静的経路になる` | Task 17の回帰 | pin待機失敗。条件を復元後PASS |
| `小さく描画されたmap-pinも44pxの操作領域と8pxの視認領域を保つ` | Task 17の回帰 | pin待機失敗。条件を復元後PASS |
| `320px幅・200% zoomでも候補と距離を横スクロールなしで表示する` | Task 17の回帰 | pin待機失敗。条件を復元後PASS |
| `390px幅のportraitカタログは一列で横スクロールしない` | Task 17の回帰 | pin待機失敗。条件を復元後PASS |
| `重なるピンはpointer位置に近い候補を選ぶ` | Task 17の回帰 | pin待機失敗。条件を復元後PASS |

回帰原因は`dom-route-map-view.ts`の`pointIndexCache`判定を、in-flight Promiseも再読込対象として扱う元の条件へ戻すことで修正し、専用unit assertionを追加した。修正後の`npm run test:e2e:ci`は60 passed / 7 failed / 8 skippedで、残る7件は上表の既存snapshot 7件だけだった。snapshotは更新していない。

周辺カードについては、`renderCatalogCards()`を候補・filter変更時だけ実行し、transform通知では既存cardとleader lineの座標・線端点だけを更新するよう修正した。選択カードは実寸相当の220pxを配置計算へ渡し、200% text zoomで内容がclipしないことと、pan/zoom後もcard/info DOMが接続されたままであることをunit/E2Eで確認した。

### 人間受入・外部確認

| 項目 | 結果 |
|---|---|
| headedブラウザでTask 10〜17のvisual/interaction確認 | 未確認。`$DISPLAY`/`$WAYLAND_DISPLAY`未設定でX serverがなく、Playwright headed起動が失敗 |
| current animation、route線幅、nearby card/leader、map aspect、表示中心の人間受入 | 未確認 |
| 実GASの同一space更新・既存Sheet列保持 | 未確認。credential/test deploymentなし |
| Phase 7.3からのmap drag遅延 | 未確認。physical input可能な実機なし |

したがって、Task 18の自動検証は完了したが、人間受入が未確認のためPhase 7.4の終了判定は未完了とする。
